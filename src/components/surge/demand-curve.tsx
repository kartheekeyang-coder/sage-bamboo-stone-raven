import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FACTORS, type FactorSet } from "@/lib/surge/reaction";
import type { DemandPoint } from "@/lib/surge/types";
import { cn, formatNumber } from "@/lib/utils";

export function FactorStrip({
  factors,
  className,
}: {
  factors: FactorSet;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-4 gap-2", className)}>
      {FACTORS.map((f) => (
        <div key={f.id} className="rounded-lg bg-secondary/70 px-2 py-2">
          <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {f.label}
          </div>
          <div className="mt-1 font-mono text-sm tabular-nums">{formatNumber(factors[f.id])}</div>
        </div>
      ))}
    </div>
  );
}

export function DemandCurve({
  curve,
  peakLiftPct,
  rampDays = 5,
  holdDays = 3,
  decayDays = 4,
  className,
}: {
  curve: DemandPoint[];
  peakLiftPct: number;
  rampDays?: number;
  holdDays?: number;
  decayDays?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Demand curve
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          peak +{peakLiftPct}%
        </span>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="day"
              tick={{ fill: "currentColor", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval={0}
            />
            <YAxis hide domain={[0, Math.max(12, peakLiftPct * 1.15)]} />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              content={({ payload, label }) => {
                const row = payload?.[0]?.payload as DemandPoint | undefined;
                if (!row) return null;
                return (
                  <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs">
                    Day {label} · {row.phase} · +{row.liftPct}%
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="liftPct"
              stroke="var(--spike)"
              fill="color-mix(in oklab, var(--spike) 22%, transparent)"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-3 text-[11px] text-muted-foreground">
        <span>Ramp {rampDays}d</span>
        <span>Hold {holdDays}d</span>
        <span>Decay {decayDays}d to baseline</span>
      </div>
    </div>
  );
}
