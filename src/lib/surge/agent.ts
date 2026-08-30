import { createServerFn } from "@tanstack/react-start";
import { compactSnapshot } from "./engine";
import type { Plan, Signal, StockLot } from "./types";
import { runPlaybook } from "./engine";

export type Briefing = {
  headline: string;
  assessment: string;
  mismatch: string;
  customerCopy: string;
  sopNotes: string;
  bundleCopy?: string;
};

const BriefingSchemaKeys = [
  "headline",
  "assessment",
  "mismatch",
  "customerCopy",
  "sopNotes",
  "bundleCopy",
] as const;

function extractJson(text: string): Briefing | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const out: Briefing = {
      headline: String(raw.headline ?? ""),
      assessment: String(raw.assessment ?? ""),
      mismatch: String(raw.mismatch ?? ""),
      customerCopy: String(raw.customerCopy ?? ""),
      sopNotes: String(raw.sopNotes ?? ""),
      bundleCopy: raw.bundleCopy ? String(raw.bundleCopy) : undefined,
    };
    if (!out.headline || !out.assessment) return null;
    for (const k of BriefingSchemaKeys) {
      if (typeof out[k] === "string" && (out[k] as string).length > 600) {
        (out as Record<string, string>)[k] = (out[k] as string).slice(0, 600);
      }
    }
    return out;
  } catch {
    return null;
  }
}

export const briefSurgePlan = createServerFn({ method: "POST" })
  .validator((input: { signal: Signal; lots: StockLot[]; now: number; plan: Plan }) => input)
  .handler(async ({ data }): Promise<{ ok: true; briefing: Briefing } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "AI briefing is unavailable in this environment." };

    const snapshot = compactSnapshot(data.signal, data.plan);
    const prompt = `You are Surge, a viral-demand response agent for an Indian D2C/CPG brand.
Write a concise ops briefing for the live spike below. Follow the playbook and principles.
The reaction matrix maps Instagram views, likes, shares, and comments to a peak demand lift.
Demand ramps over ~5 days, holds ~3 days, then decays to baseline — do not overproduce.
Return ONLY a JSON object with keys:
headline (max 110 chars, imperative, no emoji),
assessment (2 sentences, include the peak lift % and the 5+3 day shape),
mismatch (1-2 sentences on demand region vs stock location),
customerCopy (1 sentence, limited-stock urgency, no emoji),
sopNotes (1-2 sentences of reusable learning),
bundleCopy (1 sentence if a bundle exists, else empty string).
No markdown. No extra keys.

SNAPSHOT:
${JSON.stringify(snapshot)}`;

    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          max_tokens: 700,
          temperature: 0.4,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) return { ok: false, error: `xAI API error ${res.status}` };
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = body.choices?.[0]?.message?.content ?? "";
      const briefing = extractJson(text);
      if (!briefing) return { ok: false, error: "Could not parse the briefing." };
      return { ok: true, briefing };
    } catch {
      return { ok: false, error: "The briefing request failed." };
    }
  });

export function mergeBriefing(plan: Plan, briefing: Briefing): Plan {
  return {
    ...plan,
    headline: briefing.headline || plan.headline,
    assessment: briefing.assessment || plan.assessment,
    mismatch: briefing.mismatch || plan.mismatch,
    customerCopy: briefing.customerCopy || plan.customerCopy,
    sopNotes: briefing.sopNotes || plan.sopNotes,
    bundle:
      plan.bundle && briefing.bundleCopy
        ? { ...plan.bundle, copy: briefing.bundleCopy }
        : plan.bundle,
    source: "grok",
  };
}

export { runPlaybook };
