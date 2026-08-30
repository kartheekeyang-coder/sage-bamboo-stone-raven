import type { PlatformId } from "./types";

export type FactorId = "views" | "likes" | "shares" | "comments";

export const FACTORS: { id: FactorId; label: string }[] = [
  { id: "views", label: "Views" },
  { id: "likes", label: "Likes" },
  { id: "shares", label: "Shares" },
  { id: "comments", label: "Comments" },
];

export interface FactorSet {
  views: number;
  likes: number;
  shares: number;
  comments: number;
}

export interface ReactionBand {
  id: string;
  label: string;
  minViews: number;
  minLikes: number;
  minShares: number;
  minComments: number;
  peakLiftPct: number;
}

export interface LearnedState {
  sampleCount: number;
  biasPct: number;
  mape: number;
  weightAdjust: FactorSet;
}

export interface ReactionTemplate {
  id: string;
  name: string;
  source: "industry" | "uploaded" | "learned";
  platform: PlatformId | "all";
  weights: FactorSet;
  rampDays: number;
  holdDays: number;
  decayDays: number;
  bands: ReactionBand[];
  learned: LearnedState;
}

export interface DemandPoint {
  day: number;
  phase: "ramp" | "hold" | "decay" | "base";
  liftPct: number;
}

export interface ReactionForecast {
  bandId: string;
  bandLabel: string;
  nextBandLabel: string | null;
  progressToNext: number;
  industryPeakPct: number;
  learnedBiasPct: number;
  peakLiftPct: number;
  curve: DemandPoint[];
  extraOrders: number;
  expectedOrders: number;
  rampDays: number;
  holdDays: number;
  decayDays: number;
  factors: FactorSet;
  effectiveWeights: FactorSet;
}

export interface LearningSample {
  id: string;
  signalId: string;
  skuId: string;
  platform: PlatformId;
  factors: FactorSet;
  predictedPeakPct: number;
  actualPeakPct: number;
  loggedAt: number;
}

const ZERO: FactorSet = { views: 0, likes: 0, shares: 0, comments: 0 };

export const BASELINE_DAILY: Record<string, number> = {
  "nimbus-d4": 420,
  "aura-750": 90,
  "kite-run": 55,
  "bloom-tint": 160,
  "pulse-buds": 40,
};

export const INDUSTRY_TEMPLATE: ReactionTemplate = {
  id: "ig-cpg-in-v1",
  name: "Instagram CPG · India",
  source: "industry",
  platform: "instagram",
  weights: { views: 0.15, likes: 0.2, shares: 0.4, comments: 0.25 },
  rampDays: 5,
  holdDays: 3,
  decayDays: 4,
  bands: [
    { id: "baseline", label: "Baseline", minViews: 0, minLikes: 0, minShares: 0, minComments: 0, peakLiftPct: 0 },
    { id: "warm", label: "Warm", minViews: 20_000, minLikes: 1_500, minShares: 200, minComments: 80, peakLiftPct: 10 },
    { id: "heat", label: "Heat", minViews: 50_000, minLikes: 4_000, minShares: 800, minComments: 300, peakLiftPct: 18 },
    { id: "spike", label: "Spike", minViews: 100_000, minLikes: 8_000, minShares: 2_000, minComments: 800, peakLiftPct: 32 },
    { id: "viral", label: "Viral", minViews: 250_000, minLikes: 20_000, minShares: 6_000, minComments: 2_500, peakLiftPct: 48 },
    { id: "breakout", label: "Breakout", minViews: 500_000, minLikes: 40_000, minShares: 12_000, minComments: 6_000, peakLiftPct: 65 },
  ],
  learned: { sampleCount: 0, biasPct: 0, mape: 0, weightAdjust: { ...ZERO } },
};

export const STORAGE_KEY = "surge.reaction.v1";

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((s, n) => s + n, 0) / xs.length;
}

function pearson(xs: number[], ys: number[]): number {
  if (xs.length < 3) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  if (den < 1e-9) return 0;
  return clamp(num / den, -1, 1);
}

export function meetsBand(factors: FactorSet, band: ReactionBand): boolean {
  return (
    factors.views >= band.minViews &&
    factors.likes >= band.minLikes &&
    factors.shares >= band.minShares &&
    factors.comments >= band.minComments
  );
}

export function matchBands(factors: FactorSet, bands: ReactionBand[]) {
  const sorted = [...bands].sort((a, b) => a.peakLiftPct - b.peakLiftPct);
  let floor = sorted[0];
  let next: ReactionBand | null = sorted[1] ?? null;
  for (let i = 0; i < sorted.length; i++) {
    if (meetsBand(factors, sorted[i])) {
      floor = sorted[i];
      next = sorted[i + 1] ?? null;
    }
  }
  return { floor, next };
}

function bandProgress(factors: FactorSet, floor: ReactionBand, next: ReactionBand): number {
  const keys: FactorId[] = ["views", "likes", "shares", "comments"];
  const mins: Record<FactorId, "minViews" | "minLikes" | "minShares" | "minComments"> = {
    views: "minViews",
    likes: "minLikes",
    shares: "minShares",
    comments: "minComments",
  };
  const ratios: number[] = [];
  for (const k of keys) {
    const lo = floor[mins[k]];
    const hi = next[mins[k]];
    if (hi <= lo) continue;
    ratios.push(clamp((factors[k] - lo) / (hi - lo), 0, 1.25));
  }
  if (!ratios.length) return 1;
  return clamp(Math.min(...ratios), 0, 1);
}

export function interpolatePeak(factors: FactorSet, bands: ReactionBand[]): {
  floor: ReactionBand;
  next: ReactionBand | null;
  progress: number;
  peakLiftPct: number;
} {
  const { floor, next } = matchBands(factors, bands);
  if (!next) {
    return { floor, next: null, progress: 1, peakLiftPct: floor.peakLiftPct };
  }
  const progress = bandProgress(factors, floor, next);
  const peakLiftPct =
    floor.peakLiftPct + (next.peakLiftPct - floor.peakLiftPct) * smoothstep(progress);
  return { floor, next, progress, peakLiftPct };
}

export function liftAtDay(
  day: number,
  peak: number,
  rampDays: number,
  holdDays: number,
  decayDays: number,
): { liftPct: number; phase: DemandPoint["phase"] } {
  if (day <= 0 || peak <= 0) return { liftPct: 0, phase: "base" };
  if (day <= rampDays) {
    return { liftPct: peak * smoothstep(day / rampDays), phase: "ramp" };
  }
  if (day <= rampDays + holdDays) return { liftPct: peak, phase: "hold" };
  const intoDecay = day - rampDays - holdDays;
  if (intoDecay >= decayDays) return { liftPct: 0, phase: "base" };
  return { liftPct: peak * (1 - smoothstep(intoDecay / decayDays)), phase: "decay" };
}

export function buildCurve(
  peak: number,
  rampDays: number,
  holdDays: number,
  decayDays: number,
): DemandPoint[] {
  const last = rampDays + holdDays + decayDays;
  const out: DemandPoint[] = [];
  for (let day = 0; day <= last; day++) {
    const { liftPct, phase } = liftAtDay(day, peak, rampDays, holdDays, decayDays);
    out.push({ day, phase, liftPct: Number(liftPct.toFixed(2)) });
  }
  return out;
}

export function normalizeWeights(w: FactorSet): FactorSet {
  const sum = w.views + w.likes + w.shares + w.comments;
  if (sum <= 0) return { ...INDUSTRY_TEMPLATE.weights };
  return {
    views: w.views / sum,
    likes: w.likes / sum,
    shares: w.shares / sum,
    comments: w.comments / sum,
  };
}

export function effectiveWeights(template: ReactionTemplate): FactorSet {
  const a = template.learned.weightAdjust;
  return normalizeWeights({
    views: Math.max(0.02, template.weights.views + a.views),
    likes: Math.max(0.02, template.weights.likes + a.likes),
    shares: Math.max(0.02, template.weights.shares + a.shares),
    comments: Math.max(0.02, template.weights.comments + a.comments),
  });
}

export function forecastReaction(
  factors: FactorSet,
  template: ReactionTemplate,
  skuId: string,
): ReactionForecast {
  const matched = interpolatePeak(factors, template.bands);
  const industryPeakPct = Number(matched.peakLiftPct.toFixed(1));
  const peakLiftPct = Number(
    clamp(industryPeakPct + template.learned.biasPct, 0, 80).toFixed(1),
  );
  const curve = buildCurve(peakLiftPct, template.rampDays, template.holdDays, template.decayDays);
  const daily = BASELINE_DAILY[skuId] ?? 80;
  let extraOrders = 0;
  let expectedOrders = 0;
  for (const p of curve) {
    if (p.day === 0) continue;
    const dayOrders = daily * (1 + p.liftPct / 100);
    expectedOrders += dayOrders;
    extraOrders += daily * (p.liftPct / 100);
  }
  return {
    bandId: matched.floor.id,
    bandLabel: matched.floor.label,
    nextBandLabel: matched.next?.label ?? null,
    progressToNext: Number(matched.progress.toFixed(3)),
    industryPeakPct,
    learnedBiasPct: Number(template.learned.biasPct.toFixed(1)),
    peakLiftPct,
    curve,
    extraOrders: Math.round(extraOrders),
    expectedOrders: Math.round(expectedOrders),
    rampDays: template.rampDays,
    holdDays: template.holdDays,
    decayDays: template.decayDays,
    factors: { ...factors },
    effectiveWeights: effectiveWeights(template),
  };
}

export function trainTemplate(
  template: ReactionTemplate,
  samples: LearningSample[],
): ReactionTemplate {
  if (samples.length === 0) {
    return {
      ...template,
      source: template.source === "uploaded" ? "uploaded" : "industry",
      learned: { sampleCount: 0, biasPct: 0, mape: 0, weightAdjust: { ...ZERO } },
    };
  }
  const residuals = samples.map((s) => s.actualPeakPct - s.predictedPeakPct);
  const biasPct = clamp(mean(residuals), -12, 12);
  const mape =
    mean(
      samples.map(
        (s) => Math.abs(s.actualPeakPct - s.predictedPeakPct) / Math.max(4, Math.abs(s.actualPeakPct)),
      ),
    ) * 100;
  const keys: FactorId[] = ["views", "likes", "shares", "comments"];
  const weightAdjust = { ...ZERO };
  for (const k of keys) {
    const xs = samples.map((s) => Math.log10(1 + s.factors[k]));
    weightAdjust[k] = clamp(pearson(xs, residuals) * 0.08, -0.08, 0.08);
  }
  return {
    ...template,
    source: template.source === "uploaded" ? "uploaded" : "learned",
    learned: {
      sampleCount: samples.length,
      biasPct: Number(biasPct.toFixed(2)),
      mape: Number(mape.toFixed(1)),
      weightAdjust,
    },
  };
}

export function parseTemplateJson(raw: unknown): ReactionTemplate {
  if (!raw || typeof raw !== "object") throw new Error("Template must be a JSON object.");
  const o = raw as Record<string, unknown>;
  const bandsIn = Array.isArray(o.bands) ? o.bands : null;
  if (!bandsIn || bandsIn.length < 2) throw new Error("Template needs at least two bands.");
  const weightsIn = (o.weights ?? {}) as Record<string, unknown>;
  const bands: ReactionBand[] = bandsIn.map((b, i) => {
    const row = b as Record<string, unknown>;
    return {
      id: String(row.id ?? `band-${i}`),
      label: String(row.label ?? `Band ${i + 1}`),
      minViews: Math.max(0, Number(row.minViews) || 0),
      minLikes: Math.max(0, Number(row.minLikes) || 0),
      minShares: Math.max(0, Number(row.minShares) || 0),
      minComments: Math.max(0, Number(row.minComments) || 0),
      peakLiftPct: clamp(Number(row.peakLiftPct) || 0, 0, 80),
    };
  });
  const template: ReactionTemplate = {
    id: String(o.id ?? `uploaded-${Date.now()}`),
    name: String(o.name ?? "Uploaded template"),
    source: "uploaded",
    platform: "all",
    weights: normalizeWeights({
      views: Number(weightsIn.views) || 0.15,
      likes: Number(weightsIn.likes) || 0.2,
      shares: Number(weightsIn.shares) || 0.4,
      comments: Number(weightsIn.comments) || 0.25,
    }),
    rampDays: clamp(Math.round(Number(o.rampDays) || 5), 1, 14),
    holdDays: clamp(Math.round(Number(o.holdDays) || 3), 1, 14),
    decayDays: clamp(Math.round(Number(o.decayDays) || 4), 1, 14),
    bands,
    learned: { sampleCount: 0, biasPct: 0, mape: 0, weightAdjust: { ...ZERO } },
  };
  return template;
}

export function templatePayload(template: ReactionTemplate) {
  return {
    id: template.id,
    name: template.name,
    rampDays: template.rampDays,
    holdDays: template.holdDays,
    decayDays: template.decayDays,
    weights: template.weights,
    bands: template.bands,
  };
}

export const SEED_SAMPLES: LearningSample[] = [
  {
    id: "ls-1",
    signalId: "hist-1",
    skuId: "bloom-tint",
    platform: "tiktok",
    factors: { views: 612_000, likes: 54_000, shares: 18_400, comments: 7_200 },
    predictedPeakPct: 58,
    actualPeakPct: 51,
    loggedAt: 0,
  },
  {
    id: "ls-2",
    signalId: "hist-2",
    skuId: "pulse-buds",
    platform: "youtube",
    factors: { views: 1_420_000, likes: 41_000, shares: 6_800, comments: 9_100 },
    predictedPeakPct: 62,
    actualPeakPct: 28,
    loggedAt: 0,
  },
  {
    id: "ls-3",
    signalId: "hist-3",
    skuId: "kite-run",
    platform: "instagram",
    factors: { views: 240_000, likes: 19_200, shares: 7_400, comments: 2_100 },
    predictedPeakPct: 36,
    actualPeakPct: 44,
    loggedAt: 0,
  },
  {
    id: "ls-4",
    signalId: "hist-4",
    skuId: "nimbus-d4",
    platform: "instagram",
    factors: { views: 88_000, likes: 9_400, shares: 3_100, comments: 1_240 },
    predictedPeakPct: 22,
    actualPeakPct: 29,
    loggedAt: 0,
  },
  {
    id: "ls-5",
    signalId: "hist-5",
    skuId: "aura-750",
    platform: "instagram",
    factors: { views: 31_000, likes: 2_200, shares: 180, comments: 90 },
    predictedPeakPct: 12,
    actualPeakPct: 8,
    loggedAt: 0,
  },
  {
    id: "ls-6",
    signalId: "hist-6",
    skuId: "bloom-tint",
    platform: "instagram",
    factors: { views: 140_000, likes: 11_000, shares: 4_800, comments: 1_600 },
    predictedPeakPct: 30,
    actualPeakPct: 37,
    loggedAt: 0,
  },
];
