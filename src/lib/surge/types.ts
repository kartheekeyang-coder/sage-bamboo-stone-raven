export type RegionId =
  | "delhi"
  | "mumbai"
  | "bangalore"
  | "hyderabad"
  | "kochi"
  | "kolkata";

export type ChannelId = "amazon" | "flipkart" | "d2c" | "offline";
export type PlatformId = "instagram" | "youtube" | "x" | "tiktok";
export type Urgency = "watch" | "medium" | "immediate";
export type ViewId = "board" | "signals" | "stock" | "agent" | "matrix" | "cases";
export type TransferStatus = "queued" | "express" | "arrived";

export interface Sku {
  id: string;
  name: string;
  variant: string;
  category: string;
  unitCost: number;
  bundleWith?: string;
}

export interface Warehouse {
  id: RegionId;
  city: string;
  hub: string;
  x: number;
  y: number;
}

export interface Influencer {
  id: string;
  name: string;
  handle: string;
  platform: PlatformId;
  niche: string;
  followers: number;
  geo: Record<RegionId, number>;
}

export interface StockLot {
  skuId: string;
  warehouseId: RegionId;
  onHand: number;
  safety: number;
  inTransit: number;
}

export interface ViewPoint {
  t: number;
  views: number;
}

export interface Signal {
  id: string;
  influencerId: string;
  skuId: string;
  caption: string;
  startedAt: number;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  history: ViewPoint[];
  velocityPerHour: number;
  thresholdHit: boolean;
  muted: boolean;
}

export interface Reallocation {
  from: RegionId;
  to: RegionId;
  skuId: string;
  units: number;
  reason: string;
  lane: "express" | "standard";
}

export interface ChannelSplit {
  channel: ChannelId;
  share: number;
}

export interface BundleOffer {
  skuIds: string[];
  copy: string;
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
  factors: {
    views: number;
    likes: number;
    shares: number;
    comments: number;
  };
  effectiveWeights: {
    views: number;
    likes: number;
    shares: number;
    comments: number;
  };
}

export interface Plan {
  id: string;
  signalId: string;
  createdAt: number;
  urgency: Urgency;
  hoursOpen: number;
  expectedOrders: number;
  unitsAtRisk: number;
  demandShareByRegion: Record<RegionId, number>;
  stockShareByRegion: Record<RegionId, number>;
  reallocations: Reallocation[];
  safetyFlex: { warehouseId: RegionId; from: number; to: number }[];
  channels: ChannelSplit[];
  bundle: BundleOffer | null;
  forecastUpliftPct: number;
  normalizeInHours: number;
  reaction: ReactionForecast;
  customerCopy: string;
  headline: string;
  assessment: string;
  mismatch: string;
  sopNotes: string;
  source: "rules" | "grok";
  executed: boolean;
}

export interface CaseRecord {
  id: string;
  planId: string;
  signalId: string;
  influencerId: string;
  skuId: string;
  platform: PlatformId;
  peakViews: number;
  peakLikes: number;
  peakShares: number;
  peakComments: number;
  peakRegion: RegionId;
  unitsMoved: number;
  predictedUpliftPct: number;
  actualUpliftPct: number | null;
  upliftPct: number;
  outcome: string;
  closedAt: number;
}

export interface Transfer {
  id: string;
  from: RegionId;
  to: RegionId;
  skuId: string;
  units: number;
  lane: "express" | "standard";
  status: TransferStatus;
  etaHours: number;
  createdAt: number;
}
