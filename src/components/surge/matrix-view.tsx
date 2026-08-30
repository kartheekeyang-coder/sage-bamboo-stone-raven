import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, RotateCcw, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DemandCurve, FactorStrip } from "@/components/surge/demand-curve";
import { FACTORS, forecastReaction, templatePayload, type ReactionBand } from "@/lib/surge/reaction";
import { selectedSignal, useSurge } from "@/lib/surge/store";
import { cn, formatNumber } from "@/lib/utils";

function sourceBadge(source: string) {
  if (source === "learned") return <Badge variant="ok">Learned</Badge>;
  if (source === "uploaded") return <Badge variant="warn">Uploaded</Badge>;
  return <Badge>Industry</Badge>;
}

export function MatrixView() {
  const state = useSurge();
  const featured = selectedSignal(state);
  const fileRef = useRef<HTMLInputElement>(null);
  const [draftBands, setDraftBands] = useState<ReactionBand[] | null>(null);
  const bands = draftBands ?? state.template.bands;

  const forecast = useMemo(() => {
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

  const onUpload = async (file: File) => {
    try {
      const text = await file.text();
      state.uploadTemplate(JSON.parse(text));
      setDraftBands(null);
      toast("Master template loaded. Forecasts now use this matrix.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not read that template.");
    }
  };

  const onDownload = () => {
    const blob = new Blob([JSON.stringify(templatePayload(state.template), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.template.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveBands = () => {
    if (!draftBands) return;
    state.setTemplate({ ...state.template, bands: draftBands });
    setDraftBands(null);
    toast("Matrix saved. The agent will use these bands.");
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:gap-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Reaction
          </p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight">Demand matrix</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Views, likes, shares, comments map to a peak lift. Demand ramps 5 days, holds 3, then
            returns to normal. Upload a master template once — the desk learns from actuals after.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUpload(file);
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="size-3.5" />
            Upload template
          </Button>
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download className="size-3.5" />
            Download
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { state.resetTemplate(); setDraftBands(null); }}>
            <RotateCcw className="size-3.5" />
            Industry default
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Template
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm font-medium">{state.template.name}</span>
              {sourceBadge(state.template.source)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Samples trained
            </div>
            <div className="mt-2 font-mono text-2xl tabular-nums">{state.template.learned.sampleCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Learned bias
            </div>
            <div className="mt-2 font-mono text-2xl tabular-nums">
              {state.template.learned.biasPct >= 0 ? "+" : ""}
              {state.template.learned.biasPct}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              MAPE
            </div>
            <div className="mt-2 font-mono text-2xl tabular-nums">
              {state.template.learned.mape ? `${state.template.learned.mape}%` : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Industry weights</CardTitle>
            <p className="text-xs text-muted-foreground">
              Shares lead. Comments are intent. Views are reach. Learned nudges sit on top.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {FACTORS.map((f) => {
              const base = state.template.weights[f.id];
              const effective = forecast?.effectiveWeights[f.id] ?? base;
              return (
                <div key={f.id}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span>{f.label}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {Math.round(base * 100)}% → {Math.round(effective * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${effective * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {forecast && featured ? (
          <Card>
            <CardHeader>
              <CardTitle>
                Live reaction · {forecast.bandLabel}
                {forecast.nextBandLabel ? ` → ${forecast.nextBandLabel}` : ""}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Industry +{forecast.industryPeakPct}%
                {forecast.learnedBiasPct
                  ? ` · learned ${forecast.learnedBiasPct >= 0 ? "+" : ""}${forecast.learnedBiasPct}`
                  : ""}{" "}
                → peak +{forecast.peakLiftPct}%
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FactorStrip factors={forecast.factors} />
              <DemandCurve
                curve={forecast.curve}
                peakLiftPct={forecast.peakLiftPct}
                rampDays={forecast.rampDays}
                holdDays={forecast.holdDays}
                decayDays={forecast.decayDays}
              />
              <p className="text-xs text-muted-foreground">
                Extra {formatNumber(forecast.extraOrders)} units over the window vs baseline run-rate.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Select a live signal on the board to see its demand curve.
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Master bands</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              If a post clears these floors, demand lifts by the peak %. Edit once, or upload JSON.
            </p>
          </div>
          {draftBands ? (
            <Button size="sm" onClick={saveBands}>
              Save matrix
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="pb-2 pr-3">Band</th>
                <th className="pb-2 pr-3">Views</th>
                <th className="pb-2 pr-3">Likes</th>
                <th className="pb-2 pr-3">Shares</th>
                <th className="pb-2 pr-3">Comments</th>
                <th className="pb-2">Peak lift</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((band, i) => (
                <tr key={band.id} className="border-t border-border">
                  <td className="py-2 pr-3 font-medium">{band.label}</td>
                  {(["minViews", "minLikes", "minShares", "minComments"] as const).map((key) => (
                    <td key={key} className="py-2 pr-3">
                      <input
                        className="h-9 w-24 rounded-md bg-secondary px-2 font-mono text-sm tabular-nums"
                        inputMode="numeric"
                        value={band[key]}
                        onChange={(e) => {
                          const next = bands.map((b, j) =>
                            j === i ? { ...b, [key]: Math.max(0, Number(e.target.value) || 0) } : b,
                          );
                          setDraftBands(next);
                        }}
                      />
                    </td>
                  ))}
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      <input
                        className="h-9 w-16 rounded-md bg-secondary px-2 font-mono text-sm tabular-nums"
                        inputMode="numeric"
                        value={band.peakLiftPct}
                        onChange={(e) => {
                          const next = bands.map((b, j) =>
                            j === i
                              ? { ...b, peakLiftPct: Math.min(80, Math.max(0, Number(e.target.value) || 0)) }
                              : b,
                          );
                          setDraftBands(next);
                        }}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Did it happen that way?</CardTitle>
          <p className="text-xs text-muted-foreground">
            Predicted vs actual peak lift. Residuals train the bias and re-weight shares vs views.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {state.samples.slice(0, 8).map((s) => {
            const err = s.actualPeakPct - s.predictedPeakPct;
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-3"
              >
                <div className="text-xs text-muted-foreground">
                  {s.platform} · {formatNumber(s.factors.views)} views · {formatNumber(s.factors.shares)}{" "}
                  shares
                </div>
                <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
                  <span>pred {s.predictedPeakPct}%</span>
                  <span>act {s.actualPeakPct}%</span>
                  <span className={cn(err >= 0 ? "text-ok" : "text-spike")}>
                    {err >= 0 ? "+" : ""}
                    {err}
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
