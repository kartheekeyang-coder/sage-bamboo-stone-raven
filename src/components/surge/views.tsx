import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowRight,
  Clock3,
  Play,
  RotateCcw,
  Truck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { NodeMap } from "@/components/surge/node-map";
import { Sparkline } from "@/components/surge/sparkline";
import { DemandCurve, FactorStrip } from "@/components/surge/demand-curve";
import {
  CHANNELS,
  PLATFORM_LABEL,
  REGION_LABEL,
  REGIONS,
  THRESHOLD_HOURS,
  THRESHOLD_VIEWS,
  WAREHOUSES,
  influencerById,
  skuById,
} from "@/lib/surge/catalog";
import { classifyUrgency, peakRegion } from "@/lib/surge/engine";
import { forecastReaction } from "@/lib/surge/reaction";
import { briefSurgePlan, mergeBriefing } from "@/lib/surge/agent";
import { activePlan, liveKpis, selectedSignal, useSurge } from "@/lib/surge/store";
import type { Plan, RegionId, Signal, Urgency } from "@/lib/surge/types";
import { cn, formatHours, formatNumber, formatUnits } from "@/lib/utils";

function urgencyBadge(u: Urgency) {
  if (u === "immediate") return <Badge variant="spike">Immediate</Badge>;
  if (u === "medium") return <Badge variant="warn">Medium</Badge>;
  return <Badge>Watch</Badge>;
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="p-4 md:p-5">
        <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </div>
        <div className="mt-2 font-mono text-2xl tracking-tight tabular-nums md:text-3xl">
          {value}
        </div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function SignalRow({
  signal,
  now,
  selected,
  onSelect,
}: {
  signal: Signal;
  now: number;
  selected?: boolean;
  onSelect: () => void;
}) {
  const inf = influencerById(signal.influencerId);
  const sku = skuById(signal.skuId);
  const urgency = classifyUrgency(signal, now);
  const hours = (now - signal.startedAt) / 3_600_000;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors duration-150",
        selected ? "bg-secondary" : "hover:bg-secondary/50",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{inf.name}</span>
          {urgencyBadge(urgency)}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {sku.name} · {PLATFORM_LABEL[inf.platform]} · {formatHours(hours)}
        </div>
      </div>
      <div className="hidden w-24 shrink-0 sm:block">
        <Sparkline data={signal.history} className="h-8 text-foreground/70" />
      </div>
      <div className="text-right">
        <div className="font-mono text-sm tabular-nums">{formatNumber(signal.views)}</div>
        <div className="text-[11px] text-muted-foreground">views</div>
      </div>
    </button>
  );
}

export function BoardView() {
  const state = useSurge();
  const navigate = useNavigate();
  const kpis = liveKpis(state);
  const featured = kpis.featured;
  const inf = featured ? influencerById(featured.influencerId) : null;
  const sku = featured ? skuById(featured.skuId) : null;
  const urgency = featured ? classifyUrgency(featured, state.now) : "watch";
  const hours = featured ? (state.now - featured.startedAt) / 3_600_000 : 0;
  const stockShare = useMemo(() => {
    if (!featured) return {} as Record<RegionId, number>;
    const map = {} as Record<RegionId, number>;
    let total = 0;
    for (const id of REGIONS) {
      const n =
        state.lots.find((l) => l.skuId === featured.skuId && l.warehouseId === id)?.onHand ?? 0;
      map[id] = n;
      total += n;
    }
    for (const id of REGIONS) map[id] = total ? map[id] / total : 0;
    return map;
  }, [featured, state.lots]);

  const reaction = useMemo(() => {
    if (!featured) return null;
    return forecastReaction(
      {
        views: featured.views,
        likes: featured.likes,
        shares: featured.shares,
        comments: featured.comments,
      },
      state.template,
      featured.skuId,
    );
  }, [featured, state.template]);

  const runAgent = async () => {
    const plan = state.draftPlan();
    if (!plan || !featured) return;
    state.savePlan(plan);
    void navigate({ to: "/agent" });
    state.setBriefing(true);
    try {
      const res = await briefSurgePlan({
        data: { signal: featured, lots: state.lots, now: state.now, plan },
      });
      if (res.ok) {
        state.savePlan(mergeBriefing(plan, res.briefing));
      } else {
        state.setError(res.error);
        toast(res.error);
      }
    } catch {
      toast("Briefing unavailable — using the local playbook.");
    } finally {
      state.setBriefing(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:gap-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Live desk
          </p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">Situation</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" size="sm" onClick={() => state.injectSpike("sneaker")}>
            Sneaker spike
          </Button>
          <Button variant="outline" size="sm" onClick={() => state.injectSpike("tint")}>
            Beauty spike
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Active spikes" value={String(kpis.spikes)} hint={`${kpis.watching} above watch`} />
        <Kpi
          label="Peak demand"
          value={reaction ? `+${reaction.peakLiftPct}%` : "—"}
          hint="5d ramp · 3d hold"
        />
        <Kpi
          label="Units in transit"
          value={formatUnits(kpis.inTransit)}
          hint={kpis.inTransit ? "Express lanes live" : "No moves yet"}
        />
        <Kpi
          label="Comments"
          value={featured ? formatNumber(featured.comments) : "—"}
          hint={featured ? `${formatNumber(featured.shares)} shares` : "No signal"}
        />
      </div>

      {featured && inf && sku ? (
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {urgencyBadge(urgency)}
                  <Badge>{PLATFORM_LABEL[inf.platform]}</Badge>
                </div>
                <CardTitle className="mt-3 text-xl font-medium tracking-tight md:text-2xl">
                  {sku.name}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {inf.name} · @{inf.handle} · {inf.niche}
                </p>
              </div>
              <div className="text-right">
                <div className="font-mono text-2xl tabular-nums md:text-3xl">
                  {formatNumber(featured.views)}
                </div>
                <div className="text-xs text-muted-foreground">views · {formatHours(hours)} open</div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <p className="text-sm leading-relaxed text-muted-foreground">{featured.caption}</p>
              <FactorStrip
                factors={{
                  views: featured.views,
                  likes: featured.likes,
                  shares: featured.shares,
                  comments: featured.comments,
                }}
              />
              <div>
                <div className="mb-2 flex justify-between text-[11px] text-muted-foreground">
                  <span>Threshold {formatNumber(THRESHOLD_VIEWS)} / {THRESHOLD_HOURS}h</span>
                  <span className="font-mono tabular-nums">
                    {Math.min(100, Math.round((featured.views / THRESHOLD_VIEWS) * 100))}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      featured.views >= THRESHOLD_VIEWS ? "bg-spike" : "bg-primary",
                    )}
                    style={{
                      width: `${Math.min(100, (featured.views / THRESHOLD_VIEWS) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <Sparkline data={featured.history} className="h-16 text-foreground/80" />
              {reaction ? (
                <DemandCurve
                  curve={reaction.curve}
                  peakLiftPct={reaction.peakLiftPct}
                  rampDays={reaction.rampDays}
                  holdDays={reaction.holdDays}
                  decayDays={reaction.decayDays}
                  className="pt-1"
                />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button onClick={runAgent} disabled={state.briefing}>
                  <Play className="size-4" />
                  {state.briefing ? "Briefing…" : "Run Surge agent"}
                </Button>
                <Button variant="secondary" onClick={() => void navigate({ to: "/signals" })}>
                  All signals
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-[320px] flex-col">
            <CardHeader>
              <CardTitle>Demand vs stock</CardTitle>
              <p className="text-xs text-muted-foreground">
                Ring size is audience share. Warm nodes are under-stocked.
              </p>
            </CardHeader>
            <CardContent className="min-h-0 flex-1">
              <NodeMap demand={inf.geo} stock={stockShare} className="mx-auto max-h-[340px]" />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Live signals</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 p-3 md:p-4">
          {state.signals.map((s) => (
            <SignalRow
              key={s.id}
              signal={s}
              now={state.now}
              selected={s.id === state.selectedSignalId}
              onSelect={() => useSurge.setState({ selectedSignalId: s.id })}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function SignalsView() {
  const state = useSurge();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-8">
      <div>
        <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Capture
        </p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight">Signals</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Mentions, views, likes, shares, and comments. Crossing {formatNumber(THRESHOLD_VIEWS)} views
          inside {THRESHOLD_HOURS} hours raises an immediate spike.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {state.signals.map((signal) => {
          const inf = influencerById(signal.influencerId);
          const sku = skuById(signal.skuId);
          const urgency = classifyUrgency(signal, state.now);
          const hours = (state.now - signal.startedAt) / 3_600_000;
          const peak = peakRegion(inf.geo);
          const selected = signal.id === state.selectedSignalId;
          return (
            <Card
              key={signal.id}
              className={cn("cursor-pointer transition-[box-shadow] duration-150", selected && "shadow-[var(--shadow-border-hover)]")}
              onClick={() => useSurge.setState({ selectedSignalId: signal.id })}
            >
              <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{inf.name}</span>
                      {urgencyBadge(urgency)}
                      <Badge>{PLATFORM_LABEL[inf.platform]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{signal.caption}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xl tabular-nums">{formatNumber(signal.views)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatNumber(signal.likes)} likes · {formatNumber(signal.shares)} shares ·{" "}
                      {formatNumber(signal.comments)} comments
                    </div>
                  </div>
                </div>
                <Sparkline data={signal.history} className="h-14 text-foreground/75" />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {sku.name} · {formatHours(hours)} open · peak {REGION_LABEL[peak]}
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatNumber(signal.velocityPerHour)}/h
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function StockView() {
  const lots = useSurge((s) => s.lots);
  const transfers = useSurge((s) => s.transfers);
  const selected = useSurge(selectedSignal);
  const skuId = selected?.skuId ?? "nimbus-d4";
  const sku = skuById(skuId);
  const skuLots = lots.filter((l) => l.skuId === skuId);
  const max = Math.max(...skuLots.map((l) => l.onHand + l.inTransit), 1);
  const live = transfers.filter((t) => t.status !== "arrived");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Inventory
          </p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight">{sku.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{sku.variant}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WAREHOUSES.map((w) => {
          const lot = skuLots.find((l) => l.warehouseId === w.id);
          if (!lot) return null;
          const thin = lot.onHand < lot.safety;
          return (
            <Card key={w.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{w.city}</div>
                    <div className="text-xs text-muted-foreground">{w.hub} hub</div>
                  </div>
                  {thin ? <Badge variant="spike">Below safety</Badge> : <Badge variant="ok">Covered</Badge>}
                </div>
                <div className="mt-4 font-mono text-2xl tabular-nums">{formatUnits(lot.onHand)}</div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn("h-full rounded-full", thin ? "bg-spike" : "bg-primary")}
                    style={{ width: `${(lot.onHand / max) * 100}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                  <span>Safety {formatUnits(lot.safety)}</span>
                  <span>Transit {formatUnits(lot.inTransit)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lanes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {live.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No stock in motion. Run the agent on a spike to open express lanes.
            </p>
          ) : (
            live.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/60 px-3 py-3"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Truck className="size-4 text-muted-foreground" />
                  <span>{REGION_LABEL[t.from]}</span>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                  <span>{REGION_LABEL[t.to]}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums text-foreground">
                    {formatUnits(t.units)}
                  </span>
                  <Badge variant={t.lane === "express" ? "warn" : "default"}>{t.lane}</Badge>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="size-3" />
                    {formatHours(t.etaHours)}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const STEPS = [
  { n: "01", title: "Detection", body: (p: Plan, s: Signal) => `${formatNumber(s.views)} views · ${formatNumber(s.likes)} likes · ${formatNumber(s.shares)} shares · ${formatNumber(s.comments)} comments in ${formatHours(p.hoursOpen)}` },
  { n: "02", title: "Assessment", body: (p: Plan) => p.assessment },
  { n: "03", title: "Reallocation", body: (p: Plan) => p.reallocations.length ? p.reallocations.map((r) => `${formatUnits(r.units)} ${REGION_LABEL[r.from]} → ${REGION_LABEL[r.to]}`).join(" · ") : "No move required" },
  { n: "04", title: "Fulfillment", body: (p: Plan) => `${p.channels.map((c) => `${CHANNELS.find((x) => x.id === c.channel)?.label} ${Math.round(c.share * 100)}%`).join(" · ")}${p.bundle ? ` · ${p.bundle.copy}` : ""}` },
  { n: "05", title: "Forecast", body: (p: Plan) => `${p.reaction.bandLabel} band · industry +${p.reaction.industryPeakPct}% · learned ${p.reaction.learnedBiasPct >= 0 ? "+" : ""}${p.reaction.learnedBiasPct} → peak +${p.forecastUpliftPct}%. Ramps ${p.reaction.rampDays}d, holds ${p.reaction.holdDays}d, decays ${p.reaction.decayDays}d.` },
  { n: "06", title: "Review", body: (p: Plan) => p.sopNotes },
];

export function AgentView() {
  const state = useSurge();
  const plan = activePlan(state);
  const signal = plan
    ? state.signals.find((s) => s.id === plan.signalId)
    : selectedSignal(state);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const run = async () => {
    const drafted = state.draftPlan();
    const featured = selectedSignal(state);
    if (!drafted || !featured) return;
    state.savePlan(drafted);
    void navigate({ to: "/agent" });
    setBusy(true);
    state.setBriefing(true);
    try {
      const res = await briefSurgePlan({
        data: { signal: featured, lots: state.lots, now: state.now, plan: drafted },
      });
      if (res.ok) state.savePlan(mergeBriefing(drafted, res.briefing));
      else toast(res.error);
    } catch {
      toast("Briefing unavailable — using the local playbook.");
    } finally {
      setBusy(false);
      state.setBriefing(false);
    }
  };

  const execute = () => {
    if (!plan) return;
    state.executePlan(plan.id);
    toast("Lanes opened. Stock is moving.");
    void navigate({ to: "/stock" });
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Playbook
          </p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight">Surge agent</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Six steps, hours not days. Views, likes, shares, and comments map to a 5-day ramp, 3-day hold, then fade. Grok writes the briefing.
          </p>
        </div>
        <Button onClick={run} disabled={busy}>
          <Zap className="size-4" />
          {busy ? "Running…" : plan ? "Re-run agent" : "Run agent"}
        </Button>
      </div>

      {!plan || !signal ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Select a live signal on the board, then run the agent.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-3 p-5 md:p-6">
              <div className="flex flex-wrap items-center gap-2">
                {urgencyBadge(plan.urgency)}
                <Badge variant={plan.source === "grok" ? "ok" : "default"}>
                  {plan.source === "grok" ? "Grok briefing" : "Rules engine"}
                </Badge>
                {plan.executed ? <Badge variant="ok">Executed</Badge> : null}
              </div>
              <h2 className="text-xl font-medium tracking-tight md:text-2xl">{plan.headline}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{plan.mismatch}</p>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase">Orders</div>
                  <div className="font-mono text-lg tabular-nums">{formatUnits(plan.expectedOrders)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase">At risk</div>
                  <div className="font-mono text-lg tabular-nums">{formatUnits(plan.unitsAtRisk)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase">Uplift</div>
                  <div className="font-mono text-lg tabular-nums">+{plan.forecastUpliftPct}%</div>
                </div>
              </div>
              <FactorStrip factors={plan.reaction.factors} />
              <DemandCurve
                curve={plan.reaction.curve}
                peakLiftPct={plan.reaction.peakLiftPct}
                rampDays={plan.reaction.rampDays}
                holdDays={plan.reaction.holdDays}
                decayDays={plan.reaction.decayDays}
              />
            </CardContent>
          </Card>

          <div className="flex flex-col">
            {STEPS.map((step, i) => (
              <div key={step.n} className="grid grid-cols-[auto_1fr] gap-x-4">
                <div className="flex flex-col items-center">
                  <div className="relative z-10 flex size-8 items-center justify-center rounded-full bg-background font-mono text-[11px] text-muted-foreground shadow-[var(--shadow-border)]">
                    {step.n}
                  </div>
                  {i < STEPS.length - 1 ? <div className="w-px flex-1 bg-border" /> : null}
                </div>
                <div className={cn("pb-6", i === STEPS.length - 1 && "pb-0")}>
                  <div className="text-sm font-medium">{step.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.body(plan, signal)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Card>
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Customer line
              </div>
              <p className="text-sm leading-relaxed">{plan.customerCopy}</p>
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button onClick={execute} disabled={plan.executed}>
                  {plan.executed ? "Plan executed" : "Execute reallocations"}
                </Button>
                <Button variant="secondary" onClick={() => void navigate({ to: "/stock" })}>
                  View stock
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export function CasesView() {
  const cases = useSurge((s) => s.cases);
  const resetWorld = useSurge((s) => s.resetWorld);
  const logActual = useSurge((s) => s.logActual);
  const simulateActual = useSurge((s) => s.simulateActual);
  const [draft, setDraft] = useState<Record<string, string>>({});
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Library
          </p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight">Cases</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Log what actually sold. Residuals train the matrix so the next spike is closer than the last.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetWorld}>
          <RotateCcw className="size-3.5" />
          Reset desk
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {cases.map((c) => {
          const inf = influencerById(c.influencerId);
          const sku = skuById(c.skuId);
          const err =
            c.actualUpliftPct == null ? null : c.actualUpliftPct - c.predictedUpliftPct;
          return (
            <Card key={c.id}>
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                    <Badge>{PLATFORM_LABEL[c.platform]}</Badge>
                    <Badge variant="ok">pred +{c.predictedUpliftPct}%</Badge>
                    {c.actualUpliftPct != null ? (
                      <Badge variant={err && err < 0 ? "spike" : "ok"}>act +{c.actualUpliftPct}%</Badge>
                    ) : (
                      <Badge variant="warn">Awaiting actuals</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {REGION_LABEL[c.peakRegion]}
                  </span>
                </div>
                <div className="text-sm font-medium">
                  {sku.name} · {inf.name}
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{c.outcome}</p>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">{formatNumber(c.peakViews)} views</span>
                  <span className="font-mono tabular-nums">{formatNumber(c.peakShares)} shares</span>
                  <span className="font-mono tabular-nums">{formatNumber(c.peakComments)} comments</span>
                  <span className="font-mono tabular-nums">{formatUnits(c.unitsMoved)} moved</span>
                </div>
                {c.actualUpliftPct == null ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="h-9 w-24 rounded-md bg-secondary px-2 font-mono text-sm tabular-nums"
                      inputMode="numeric"
                      placeholder="actual %"
                      value={draft[c.id] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const n = Number(draft[c.id]);
                        if (!Number.isFinite(n)) {
                          toast("Enter the actual peak lift %.");
                          return;
                        }
                        logActual(c.id, n);
                        toast("Logged. Matrix retrained.");
                      }}
                    >
                      Train on actual
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => simulateActual(c.id)}>
                      Simulate close
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
