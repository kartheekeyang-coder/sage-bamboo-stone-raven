import {
  CHANNELS,
  REGIONS,
  SKUS,
  THRESHOLD_HOURS,
  THRESHOLD_VIEWS,
  influencerById,
  skuById,
} from "./catalog";
import { forecastReaction, type ReactionTemplate } from "./reaction";
import type {
  ChannelSplit,
  Plan,
  RegionId,
  Signal,
  StockLot,
  Urgency,
} from "./types";

function hoursOpen(signal: Signal, now: number): number {
  return Math.max(0.15, (now - signal.startedAt) / 3_600_000);
}

export function classifyUrgency(signal: Signal, now: number): Urgency {
  const hours = hoursOpen(signal, now);
  if (signal.views >= THRESHOLD_VIEWS && hours <= THRESHOLD_HOURS) return "immediate";
  if (signal.views >= 50_000) return "medium";
  return "watch";
}

export function peakRegion(geo: Record<RegionId, number>): RegionId {
  let best: RegionId = "delhi";
  for (const id of REGIONS) {
    if (geo[id] > geo[best]) best = id;
  }
  return best;
}

function stockForSku(lots: StockLot[], skuId: string): StockLot[] {
  return lots.filter((l) => l.skuId === skuId);
}

function shareMap(values: Record<RegionId, number>): Record<RegionId, number> {
  const total = REGIONS.reduce((s, id) => s + values[id], 0) || 1;
  const out = {} as Record<RegionId, number>;
  for (const id of REGIONS) out[id] = values[id] / total;
  return out;
}

function viralChannels(): ChannelSplit[] {
  return [
    { channel: "amazon", share: 0.42 },
    { channel: "flipkart", share: 0.28 },
    { channel: "d2c", share: 0.22 },
    { channel: "offline", share: 0.08 },
  ];
}

function templatedCopy(input: {
  skuName: string;
  city: string;
  hours: number;
  urgency: Urgency;
  peakLift: number;
  rampDays: number;
  holdDays: number;
}): { customerCopy: string; headline: string; assessment: string; mismatch: string; sopNotes: string } {
  const window = input.urgency === "immediate" ? "24–48 hours" : "this week";
  return {
    headline: `${input.skuName} is spiking in ${input.city}. Move stock now.`,
    assessment: `Engagement maps to a ${input.peakLift}% demand peak. It ramps over ${input.rampDays} days, holds ${input.holdDays} days, then fades — cover the ${window} window, do not overbuild.`,
    mismatch: `Audience heat is not where the pallets sit. Rebalance toward ${input.city} and flex safety stock in quiet hubs.`,
    customerCopy: `Limited stock on ${input.skuName}. Express dispatch from the ${input.city} hub — order in the next ${input.hours < 6 ? "few hours" : "day"} to lock delivery.`,
    sopNotes: `Parenting / South-India spikes convert fastest on Amazon + Flipkart. Pre-position Bengaluru and Kochi before the next reel, not after.`,
  };
}

export function runPlaybook(
  signal: Signal,
  lots: StockLot[],
  now: number,
  template: ReactionTemplate,
): Plan {
  const inf = influencerById(signal.influencerId);
  const sku = skuById(signal.skuId);
  const hours = hoursOpen(signal, now);
  const urgency = classifyUrgency(signal, now);
  const geo = inf.geo;
  const demandShare = shareMap(geo);
  const skuLots = stockForSku(lots, signal.skuId);
  const stockByRegion = {} as Record<RegionId, number>;
  for (const id of REGIONS) {
    stockByRegion[id] = skuLots.find((l) => l.warehouseId === id)?.onHand ?? 0;
  }
  const stockShare = shareMap(stockByRegion);
  const totalStock = REGIONS.reduce((s, id) => s + stockByRegion[id], 0);

  const reaction = forecastReaction(
    {
      views: signal.views,
      likes: signal.likes,
      shares: signal.shares,
      comments: signal.comments,
    },
    template,
    signal.skuId,
  );

  const expectedOrders = reaction.expectedOrders;
  const unitsNeeded = Math.min(totalStock, Math.max(expectedOrders, reaction.extraOrders * 2));
  const unitsAtRisk = reaction.extraOrders;

  const reallocations: Plan["reallocations"] = [];
  const remainingNeed = {} as Record<RegionId, number>;
  const surplus = {} as Record<RegionId, number>;

  for (const id of REGIONS) {
    const target = Math.round(unitsNeeded * demandShare[id]);
    const onHand = stockByRegion[id];
    const lot = skuLots.find((l) => l.warehouseId === id);
    const floor = Math.round((lot?.safety ?? 0) * (demandShare[id] > 0.18 ? 0.5 : 0.35));
    remainingNeed[id] = Math.max(0, target - onHand);
    surplus[id] = Math.max(0, onHand - Math.max(floor, Math.round(target * 0.4)));
  }

  const sinks = [...REGIONS].sort((a, b) => remainingNeed[b] - remainingNeed[a]);
  const sources = [...REGIONS].sort((a, b) => surplus[b] - surplus[a]);

  for (const to of sinks) {
    if (remainingNeed[to] <= 0) continue;
    for (const from of sources) {
      if (from === to) continue;
      if (surplus[from] <= 0 || remainingNeed[to] <= 0) continue;
      const units = Math.min(surplus[from], remainingNeed[to]);
      if (units < 40) continue;
      surplus[from] -= units;
      remainingNeed[to] -= units;
      reallocations.push({
        from,
        to,
        skuId: signal.skuId,
        units,
        lane: urgency === "immediate" ? "express" : "standard",
        reason: `${Math.round(demandShare[to] * 100)}% of audience in ${to} vs ${Math.round(stockShare[to] * 100)}% of stock`,
      });
    }
  }

  const safetyFlex: Plan["safetyFlex"] = [];
  for (const id of REGIONS) {
    if (demandShare[id] >= 0.15) continue;
    const lot = skuLots.find((l) => l.warehouseId === id);
    if (!lot) continue;
    const next = Math.max(40, Math.round(lot.safety * 0.55));
    if (next < lot.safety) {
      safetyFlex.push({ warehouseId: id, from: lot.safety, to: next });
    }
  }

  const bundleSku = sku.bundleWith ? SKUS.find((s) => s.id === sku.bundleWith) : undefined;
  const peak = peakRegion(geo);
  const copy = templatedCopy({
    skuName: sku.name,
    city: peak === "bangalore" ? "Bengaluru" : peak === "kochi" ? "Kochi" : peak,
    hours,
    urgency,
    peakLift: reaction.peakLiftPct,
    rampDays: reaction.rampDays,
    holdDays: reaction.holdDays,
  });

  const horizonHours = (reaction.rampDays + reaction.holdDays + reaction.decayDays) * 24;

  return {
    id: `plan-${signal.id}-${Math.round(now / 1000)}`,
    signalId: signal.id,
    createdAt: now,
    urgency,
    hoursOpen: hours,
    expectedOrders,
    unitsAtRisk,
    demandShareByRegion: demandShare,
    stockShareByRegion: stockShare,
    reallocations,
    safetyFlex,
    channels: viralChannels(),
    bundle: bundleSku
      ? {
          skuIds: [sku.id, bundleSku.id],
          copy: `Pair ${sku.name} with ${bundleSku.name} on the product page — the reel already did the bundling.`,
        }
      : null,
    forecastUpliftPct: reaction.peakLiftPct,
    normalizeInHours: horizonHours,
    reaction,
    customerCopy: copy.customerCopy,
    headline: copy.headline,
    assessment: copy.assessment,
    mismatch: copy.mismatch,
    sopNotes: copy.sopNotes,
    source: "rules",
    executed: false,
  };
}

export function compactSnapshot(signal: Signal, plan: Plan) {
  const inf = influencerById(signal.influencerId);
  const sku = skuById(signal.skuId);
  return {
    playbook: [
      "Detection & signal capture",
      "Rapid assessment",
      "Dynamic reallocation",
      "Agile fulfillment",
      "AI-driven forecast adjustment",
      "Post-spike review",
    ],
    principles: [
      "Speed beats accuracy: act within hours, not days.",
      "Regional agility: move stock where the hype is.",
      "Short-lived window: viral demand ramps 5 days, holds 3, then fades.",
    ],
    signal: {
      influencer: inf.name,
      handle: inf.handle,
      platform: inf.platform,
      niche: inf.niche,
      sku: sku.name,
      views: signal.views,
      likes: signal.likes,
      shares: signal.shares,
      comments: signal.comments,
      hoursOpen: Number(plan.hoursOpen.toFixed(1)),
      geo: inf.geo,
    },
    reaction: {
      band: plan.reaction.bandLabel,
      industryPeakPct: plan.reaction.industryPeakPct,
      learnedBiasPct: plan.reaction.learnedBiasPct,
      peakLiftPct: plan.reaction.peakLiftPct,
      rampDays: plan.reaction.rampDays,
      holdDays: plan.reaction.holdDays,
      decayDays: plan.reaction.decayDays,
      extraOrders: plan.reaction.extraOrders,
    },
    plan: {
      urgency: plan.urgency,
      expectedOrders: plan.expectedOrders,
      unitsAtRisk: plan.unitsAtRisk,
      reallocations: plan.reallocations,
      channels: plan.channels.map((c) => ({
        label: CHANNELS.find((x) => x.id === c.channel)?.label,
        share: c.share,
      })),
      bundle: plan.bundle,
      forecastUpliftPct: plan.forecastUpliftPct,
      normalizeInHours: plan.normalizeInHours,
    },
  };
}
