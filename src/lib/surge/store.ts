import { create } from "zustand";
import {
  REGIONS,
  THRESHOLD_HOURS,
  THRESHOLD_VIEWS,
  influencerById,
  seedLots,
  skuById,
} from "./catalog";
import { classifyUrgency, peakRegion, runPlaybook } from "./engine";
import {
  INDUSTRY_TEMPLATE,
  SEED_SAMPLES,
  STORAGE_KEY,
  parseTemplateJson,
  templatePayload,
  trainTemplate,
  type LearningSample,
  type ReactionTemplate,
} from "./reaction";
import type {
  CaseRecord,
  Plan,
  Signal,
  StockLot,
  Transfer,
  ViewPoint,
} from "./types";

const T0 = Date.UTC(2026, 7, 23, 10, 0, 0);

function history(startViews: number, nowViews: number, startedAt: number, now: number): ViewPoint[] {
  const points = 10;
  const out: ViewPoint[] = [];
  for (let i = 0; i < points; i++) {
    const t = startedAt + ((now - startedAt) * i) / (points - 1);
    const p = i / (points - 1);
    const eased = p * p;
    out.push({ t, views: Math.round(startViews + (nowViews - startViews) * eased) });
  }
  return out;
}

function seedSignals(now: number): Signal[] {
  const meeraStart = now - 4.2 * 3_600_000;
  const sanaStart = now - 1.1 * 3_600_000;
  const arjunStart = now - 8.4 * 3_600_000;
  const dadStart = now - 2.6 * 3_600_000;
  return [
    {
      id: "sig-meera-nimbus",
      influencerId: "meera",
      skuId: "nimbus-d4",
      caption: "The only diaper that survived a Kochi monsoon picnic — size 4 restocked in my stories.",
      startedAt: meeraStart,
      views: 186_420,
      likes: 14_280,
      shares: 3_910,
      comments: 2_140,
      velocityPerHour: 38_400,
      thresholdHit: true,
      muted: false,
      history: history(12_000, 186_420, meeraStart, now),
    },
    {
      id: "sig-sana-bloom",
      influencerId: "sana",
      skuId: "bloom-tint",
      caption: "Guava tint on humid skin. No filter, 14-hour wear.",
      startedAt: sanaStart,
      views: 41_600,
      likes: 6_120,
      shares: 880,
      comments: 420,
      velocityPerHour: 36_200,
      thresholdHit: false,
      muted: false,
      history: history(2_400, 41_600, sanaStart, now),
    },
    {
      id: "sig-arjun-pulse",
      influencerId: "arjun",
      skuId: "pulse-buds",
      caption: "Clip buds vs the commute. Battery test, unedited.",
      startedAt: arjunStart,
      views: 94_800,
      likes: 4_050,
      shares: 1_120,
      comments: 1_860,
      velocityPerHour: 4_200,
      thresholdHit: false,
      muted: false,
      history: history(8_000, 94_800, arjunStart, now),
    },
    {
      id: "sig-dad-aura",
      influencerId: "weekend",
      skuId: "aura-750",
      caption: "Park-day bottle that actually stays cold. Linked in bio.",
      startedAt: dadStart,
      views: 12_480,
      likes: 940,
      shares: 120,
      comments: 86,
      velocityPerHour: 4_100,
      thresholdHit: false,
      muted: false,
      history: history(800, 12_480, dadStart, now),
    },
  ];
}

function seedCases(now: number): CaseRecord[] {
  return [
    {
      id: "case-011",
      planId: "plan-historic-1",
      signalId: "hist-1",
      influencerId: "sana",
      skuId: "bloom-tint",
      platform: "tiktok",
      peakViews: 612_000,
      peakLikes: 54_000,
      peakShares: 18_400,
      peakComments: 7_200,
      peakRegion: "mumbai",
      unitsMoved: 1840,
      predictedUpliftPct: 58,
      actualUpliftPct: 51,
      upliftPct: 51,
      outcome: "Captured 38h of lift. Mumbai hub ran dry at hour 11 — next time pre-position 1.2k units.",
      closedAt: now - 12 * 86_400_000,
    },
    {
      id: "case-012",
      planId: "plan-historic-2",
      signalId: "hist-2",
      influencerId: "arjun",
      skuId: "pulse-buds",
      platform: "youtube",
      peakViews: 1_420_000,
      peakLikes: 41_000,
      peakShares: 6_800,
      peakComments: 9_100,
      peakRegion: "bangalore",
      unitsMoved: 960,
      predictedUpliftPct: 62,
      actualUpliftPct: 28,
      upliftPct: 28,
      outcome: "YouTube converted slower but longer. Standard lanes were enough; express was wasted cost.",
      closedAt: now - 26 * 86_400_000,
    },
    {
      id: "case-013",
      planId: "plan-historic-3",
      signalId: "hist-3",
      influencerId: "ria",
      skuId: "kite-run",
      platform: "instagram",
      peakViews: 240_000,
      peakLikes: 19_200,
      peakShares: 7_400,
      peakComments: 2_100,
      peakRegion: "mumbai",
      unitsMoved: 410,
      predictedUpliftPct: 36,
      actualUpliftPct: 44,
      upliftPct: 44,
      outcome: "Size-run mismatch in West. Viral demand is SKU-specific — move the featured colourway first.",
      closedAt: now - 5 * 86_400_000,
    },
  ];
}

function persistReaction(template: ReactionTemplate, samples: LearningSample[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ template: templatePayload(template), learned: template.learned, samples }),
    );
  } catch {
    /* ignore quota */
  }
}

export interface SurgeState {
  now: number;
  signals: Signal[];
  lots: StockLot[];
  plans: Plan[];
  cases: CaseRecord[];
  transfers: Transfer[];
  selectedSignalId: string;
  activePlanId: string | null;
  briefing: boolean;
  lastError: string | null;
  template: ReactionTemplate;
  samples: LearningSample[];
  hydrated: boolean;
  selectSignal: (id: string) => void;
  tick: () => void;
  injectSpike: (kind: "sneaker" | "tint") => void;
  draftPlan: () => Plan | null;
  savePlan: (plan: Plan) => void;
  executePlan: (planId: string) => void;
  setBriefing: (v: boolean) => void;
  setError: (msg: string | null) => void;
  resetWorld: () => void;
  hydrateReaction: () => void;
  setTemplate: (template: ReactionTemplate) => void;
  uploadTemplate: (raw: unknown) => void;
  resetTemplate: () => void;
  logActual: (caseId: string, actualPeakPct: number) => void;
  simulateActual: (caseId: string) => void;
}

function freshWorld() {
  const now = T0;
  const samples = SEED_SAMPLES.map((s) => ({ ...s, loggedAt: now - 20 * 86_400_000 }));
  const template = trainTemplate({ ...INDUSTRY_TEMPLATE, learned: INDUSTRY_TEMPLATE.learned }, samples);
  const signals = seedSignals(now);
  return {
    now,
    signals,
    lots: seedLots(),
    plans: [] as Plan[],
    cases: seedCases(now),
    transfers: [] as Transfer[],
    selectedSignalId: "sig-meera-nimbus",
    activePlanId: null as string | null,
    briefing: false,
    lastError: null as string | null,
    template,
    samples,
    hydrated: false,
  };
}

export const useSurge = create<SurgeState>()((set, get) => ({
  ...freshWorld(),
  selectSignal: (id) => set({ selectedSignalId: id }),
  setBriefing: (briefing) => set({ briefing }),
  setError: (lastError) => set({ lastError }),
  hydrateReaction: () => {
    if (get().hydrated || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ hydrated: true });
        return;
      }
      const parsed = JSON.parse(raw) as {
        template?: unknown;
        learned?: ReactionTemplate["learned"];
        samples?: LearningSample[];
      };
      const uploaded = parseTemplateJson(parsed.template);
      const samples = Array.isArray(parsed.samples) && parsed.samples.length ? parsed.samples : get().samples;
      const source = uploaded.id === INDUSTRY_TEMPLATE.id ? "industry" : "uploaded";
      const withLearned = {
        ...uploaded,
        source,
        learned: parsed.learned ?? uploaded.learned,
      } as ReactionTemplate;
      const template = trainTemplate(withLearned, samples);
      set({ template, samples, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  setTemplate: (template) => {
    const trained = trainTemplate(template, get().samples);
    persistReaction(trained, get().samples);
    set({ template: trained });
  },
  uploadTemplate: (raw) => {
    const uploaded = parseTemplateJson(raw);
    const trained = trainTemplate(uploaded, get().samples);
    persistReaction(trained, get().samples);
    set({ template: trained });
  },
  resetTemplate: () => {
    const samples = get().samples;
    const template = trainTemplate({ ...INDUSTRY_TEMPLATE }, samples);
    persistReaction(template, samples);
    set({ template });
  },
  logActual: (caseId, actualPeakPct) => {
    const { cases, samples, template, now } = get();
    const row = cases.find((c) => c.id === caseId);
    if (!row) return;
    const actual = Math.round(Math.min(80, Math.max(0, actualPeakPct)));
    const sample: LearningSample = {
      id: `ls-${caseId}`,
      signalId: row.signalId,
      skuId: row.skuId,
      platform: row.platform,
      factors: {
        views: row.peakViews,
        likes: row.peakLikes,
        shares: row.peakShares,
        comments: row.peakComments,
      },
      predictedPeakPct: row.predictedUpliftPct,
      actualPeakPct: actual,
      loggedAt: now,
    };
    const nextSamples = [sample, ...samples.filter((s) => s.id !== sample.id)];
    const nextTemplate = trainTemplate(template, nextSamples);
    persistReaction(nextTemplate, nextSamples);
    set({
      samples: nextSamples,
      template: nextTemplate,
      cases: cases.map((c) =>
        c.id === caseId ? { ...c, actualUpliftPct: actual, upliftPct: actual } : c,
      ),
    });
  },
  simulateActual: (caseId) => {
    const row = get().cases.find((c) => c.id === caseId);
    if (!row) return;
    const shareBoost = row.peakShares / Math.max(1, row.peakViews) > 0.02 ? 1.12 : 0.88;
    const noise = 0.9 + ((row.peakViews % 17) / 17) * 0.2;
    const actual = Math.round(row.predictedUpliftPct * shareBoost * noise);
    get().logActual(caseId, actual);
  },
  tick: () => {
    const { now, signals, transfers, lots } = get();
    const nextNow = now + 8_000;
    const dtHours = 8_000 / 3_600_000;
    const nextSignals = signals.map((s) => {
      if (s.muted) return s;
      const hours = (nextNow - s.startedAt) / 3_600_000;
      const cooling = hours > THRESHOLD_HOURS ? 0.35 : 1;
      const jitter = 0.92 + ((Math.round(nextNow / 8000) + s.id.length) % 7) * 0.02;
      const gained = Math.round(s.velocityPerHour * dtHours * cooling * jitter);
      const views = s.views + Math.max(0, gained);
      const likes = s.likes + Math.round(gained * 0.07);
      const shares = s.shares + Math.round(gained * 0.018);
      const comments = s.comments + Math.round(gained * 0.011);
      const history = [...s.history, { t: nextNow, views }].slice(-16);
      const thresholdHit = views >= THRESHOLD_VIEWS && hours <= THRESHOLD_HOURS;
      return { ...s, views, likes, shares, comments, history, thresholdHit };
    });

    const nextTransfers = transfers.map((tr) => {
      if (tr.status === "arrived") return tr;
      const eta = tr.etaHours - dtHours * 48;
      if (eta <= 0) return { ...tr, etaHours: 0, status: "arrived" as const };
      return { ...tr, etaHours: eta };
    });

    let nextLots = lots;
    const justArrived = nextTransfers.filter(
      (t, i) => t.status === "arrived" && transfers[i]?.status !== "arrived",
    );
    if (justArrived.length) {
      nextLots = lots.map((lot) => {
        let onHand = lot.onHand;
        let inTransit = lot.inTransit;
        for (const tr of justArrived) {
          if (tr.skuId === lot.skuId && tr.to === lot.warehouseId) {
            onHand += tr.units;
            inTransit = Math.max(0, inTransit - tr.units);
          }
        }
        return { ...lot, onHand, inTransit };
      });
    }

    set({ now: nextNow, signals: nextSignals, transfers: nextTransfers, lots: nextLots });
  },
  injectSpike: (kind) => {
    const { now, signals } = get();
    if (kind === "sneaker") {
      const startedAt = now - 0.8 * 3_600_000;
      const signal: Signal = {
        id: `sig-ria-${Math.round(now / 1000)}`,
        influencerId: "ria",
        skuId: "kite-run",
        caption: "White/Ink runner sold out in my size — this is the pair from the reel.",
        startedAt,
        views: 128_600,
        likes: 9_440,
        shares: 2_210,
        comments: 1_080,
        velocityPerHour: 92_000,
        thresholdHit: true,
        muted: false,
        history: history(6_000, 128_600, startedAt, now),
      };
      set({
        signals: [signal, ...signals],
        selectedSignalId: signal.id,
      });
      return;
    }
    const startedAt = now - 3.1 * 3_600_000;
    const signal: Signal = {
      id: `sig-sana-hot-${Math.round(now / 1000)}`,
      influencerId: "sana",
      skuId: "bloom-tint",
      caption: "Guava just hit 400k. Shade match in the comments is feral.",
      startedAt,
      views: 412_000,
      likes: 38_200,
      shares: 11_400,
      comments: 4_860,
      velocityPerHour: 110_000,
      thresholdHit: true,
      muted: false,
      history: history(20_000, 412_000, startedAt, now),
    };
    set({
      signals: [signal, ...signals],
      selectedSignalId: signal.id,
    });
  },
  draftPlan: () => {
    const { selectedSignalId, signals, lots, now, template } = get();
    const signal = signals.find((s) => s.id === selectedSignalId);
    if (!signal) return null;
    return runPlaybook(signal, lots, now, template);
  },
  savePlan: (plan) => {
    const { plans } = get();
    const rest = plans.filter((p) => p.signalId !== plan.signalId || p.executed);
    set({ plans: [plan, ...rest], activePlanId: plan.id, lastError: null });
  },
  executePlan: (planId) => {
    const { plans, lots, transfers, now, signals, cases } = get();
    const plan = plans.find((p) => p.id === planId);
    if (!plan || plan.executed) return;
    const signal = signals.find((s) => s.id === plan.signalId);
    if (!signal) return;

    let nextLots = lots.map((l) => ({ ...l }));
    const nextTransfers: Transfer[] = [];

    for (const [i, rec] of plan.reallocations.entries()) {
      const from = nextLots.find((l) => l.skuId === rec.skuId && l.warehouseId === rec.from);
      const to = nextLots.find((l) => l.skuId === rec.skuId && l.warehouseId === rec.to);
      if (!from || !to) continue;
      const units = Math.min(rec.units, Math.max(0, from.onHand - 20));
      if (units <= 0) continue;
      from.onHand -= units;
      to.inTransit += units;
      nextTransfers.push({
        id: `tr-${plan.id}-${i}`,
        from: rec.from,
        to: rec.to,
        skuId: rec.skuId,
        units,
        lane: rec.lane,
        status: rec.lane === "express" ? "express" : "queued",
        etaHours: rec.lane === "express" ? 0.9 : 2.4,
        createdAt: now,
      });
    }

    for (const flex of plan.safetyFlex) {
      for (const lot of nextLots) {
        if (lot.warehouseId === flex.warehouseId && lot.skuId === signal.skuId) {
          lot.safety = flex.to;
        }
      }
    }

    const inf = influencerById(signal.influencerId);
    const caseRow: CaseRecord = {
      id: `case-${plan.id}`,
      planId: plan.id,
      signalId: signal.id,
      influencerId: signal.influencerId,
      skuId: signal.skuId,
      platform: inf.platform,
      peakViews: signal.views,
      peakLikes: signal.likes,
      peakShares: signal.shares,
      peakComments: signal.comments,
      peakRegion: peakRegion(inf.geo),
      unitsMoved: nextTransfers.reduce((s, t) => s + t.units, 0),
      predictedUpliftPct: plan.forecastUpliftPct,
      actualUpliftPct: null,
      upliftPct: plan.forecastUpliftPct,
      outcome: plan.sopNotes,
      closedAt: now,
    };

    set({
      lots: nextLots,
      transfers: [...nextTransfers, ...transfers],
      plans: plans.map((p) => (p.id === planId ? { ...p, executed: true } : p)),
      cases: [caseRow, ...cases],
    });
  },
  resetWorld: () => {
    const world = freshWorld();
    persistReaction(world.template, world.samples);
    set(world);
  },
}));

export function selectedSignal(state: SurgeState): Signal | undefined {
  return state.signals.find((s) => s.id === state.selectedSignalId);
}

export function activePlan(state: SurgeState): Plan | undefined {
  return state.plans.find((p) => p.id === state.activePlanId) ?? state.plans[0];
}

export function liveKpis(state: SurgeState) {
  const spikes = state.signals.filter((s) => classifyUrgency(s, state.now) === "immediate");
  const watching = state.signals.filter((s) => classifyUrgency(s, state.now) !== "watch");
  const inTransit = state.transfers
    .filter((t) => t.status !== "arrived")
    .reduce((s, t) => s + t.units, 0);
  const featured = selectedSignal(state);
  const hoursLeft = featured
    ? Math.max(0, THRESHOLD_HOURS - (state.now - featured.startedAt) / 3_600_000)
    : 0;
  const inf = featured ? influencerById(featured.influencerId) : null;
  const southShare = inf ? inf.geo.bangalore + inf.geo.kochi + inf.geo.hyderabad : 0;
  return {
    spikes: spikes.length,
    watching: watching.length,
    inTransit,
    hoursLeft,
    southShare,
    featured,
  };
}

export { skuById, influencerById, REGIONS };
