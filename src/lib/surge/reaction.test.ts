import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INDUSTRY_TEMPLATE,
  buildCurve,
  forecastReaction,
  interpolatePeak,
  liftAtDay,
  meetsBand,
  parseTemplateJson,
  trainTemplate,
} from "./reaction.ts";

const meera = { views: 186_420, likes: 14_280, shares: 3_910, comments: 2_140 };

describe("reaction matrix", () => {
  it("places a 186k Instagram reel in Spike, interpolating toward Viral", () => {
    const m = interpolatePeak(meera, INDUSTRY_TEMPLATE.bands);
    assert.equal(m.floor.id, "spike");
    assert.equal(m.next?.id, "viral");
    assert.ok(m.peakLiftPct > 32);
    assert.ok(m.peakLiftPct < 48);
    assert.ok(m.progress > 0.4 && m.progress < 0.9);
  });

  it("maps the Warm band to a 10% peak when mins are met and the next band is not", () => {
    const warm = { views: 22_000, likes: 1_600, shares: 210, comments: 90 };
    assert.equal(meetsBand(warm, INDUSTRY_TEMPLATE.bands[1]), true);
    const m = interpolatePeak(warm, INDUSTRY_TEMPLATE.bands);
    assert.equal(m.floor.id, "warm");
    assert.ok(m.peakLiftPct >= 10);
    assert.ok(m.peakLiftPct < 18);
  });

  it("ramps for 5 days, holds 3, then decays to baseline", () => {
    const peak = 10;
    assert.equal(liftAtDay(0, peak, 5, 3, 4).liftPct, 0);
    const d5 = liftAtDay(5, peak, 5, 3, 4);
    assert.equal(d5.phase, "ramp");
    assert.ok(Math.abs(d5.liftPct - 10) < 0.01);
    const d7 = liftAtDay(7, peak, 5, 3, 4);
    assert.equal(d7.phase, "hold");
    assert.equal(d7.liftPct, 10);
    const d8 = liftAtDay(8, peak, 5, 3, 4);
    assert.equal(d8.phase, "hold");
    const d9 = liftAtDay(9, peak, 5, 3, 4);
    assert.equal(d9.phase, "decay");
    assert.ok(d9.liftPct < 10);
    const end = liftAtDay(12, peak, 5, 3, 4);
    assert.equal(end.phase, "base");
    assert.equal(end.liftPct, 0);
  });

  it("builds a 12-day accumulated curve (5+3+4)", () => {
    const curve = buildCurve(10, 5, 3, 4);
    assert.equal(curve[0].liftPct, 0);
    assert.equal(curve[5].liftPct, 10);
    assert.equal(curve[8].liftPct, 10);
    assert.ok(curve[9].liftPct < 10);
    assert.equal(curve[12].liftPct, 0);
    assert.equal(curve.length, 13);
  });

  it("forecasts extra orders from the curve, not a one-shot spike", () => {
    const f = forecastReaction(meera, INDUSTRY_TEMPLATE, "nimbus-d4");
    assert.ok(f.peakLiftPct > 30);
    assert.ok(f.extraOrders > 0);
    assert.ok(f.expectedOrders > f.extraOrders);
    assert.equal(f.rampDays, 5);
    assert.equal(f.holdDays, 3);
  });

  it("learns a negative bias when actuals come in below the matrix", () => {
    const trained = trainTemplate(INDUSTRY_TEMPLATE, [
      {
        id: "a",
        signalId: "s",
        skuId: "nimbus-d4",
        platform: "instagram",
        factors: meera,
        predictedPeakPct: 40,
        actualPeakPct: 28,
        loggedAt: 1,
      },
      {
        id: "b",
        signalId: "s2",
        skuId: "nimbus-d4",
        platform: "instagram",
        factors: { views: 120_000, likes: 9_000, shares: 2_200, comments: 900 },
        predictedPeakPct: 34,
        actualPeakPct: 22,
        loggedAt: 1,
      },
      {
        id: "c",
        signalId: "s3",
        skuId: "bloom-tint",
        platform: "instagram",
        factors: { views: 80_000, likes: 5_000, shares: 900, comments: 400 },
        predictedPeakPct: 20,
        actualPeakPct: 11,
        loggedAt: 1,
      },
    ]);
    assert.ok(trained.learned.biasPct < 0);
    assert.equal(trained.learned.sampleCount, 3);
    const before = forecastReaction(meera, INDUSTRY_TEMPLATE, "nimbus-d4").peakLiftPct;
    const after = forecastReaction(meera, trained, "nimbus-d4").peakLiftPct;
    assert.ok(after < before);
  });

  it("parses an uploaded master template", () => {
    const t = parseTemplateJson({
      name: "Custom",
      rampDays: 5,
      holdDays: 3,
      decayDays: 4,
      weights: { views: 1, likes: 1, shares: 2, comments: 1 },
      bands: [
        { label: "Low", peakLiftPct: 0 },
        { label: "Ten", minViews: 10_000, minShares: 100, peakLiftPct: 10 },
      ],
    });
    assert.equal(t.source, "uploaded");
    assert.equal(t.bands.length, 2);
    assert.ok(Math.abs(t.weights.shares - 0.4) < 0.01);
  });

  it("rejects a template without bands", () => {
    assert.throws(() => parseTemplateJson({ name: "x" }));
  });
});
