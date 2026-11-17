import { describe, expect, it } from "vitest";
import { createRng } from "../../seed/generate";
import { normalCdf, sigmoid } from "../descriptive";
import { fitLogistic, invertMatrix, predictProbability, rocAuc, solveLinearSystem } from "../logistic";

describe("solveLinearSystem", () => {
  it("solves a 3x3 system that needs pivoting", () => {
    const a = [
      [0, 2, 1],
      [1, -2, -3],
      [-1, 1, 2],
    ];
    const x = solveLinearSystem(a, [-8, 0, 3]);
    expect(x[0]).toBeCloseTo(-4, 10);
    expect(x[1]).toBeCloseTo(-5, 10);
    expect(x[2]).toBeCloseTo(2, 10);
  });

  it("throws on a singular matrix", () => {
    expect(() =>
      solveLinearSystem(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toThrow(/singular/i);
  });

  it("inverts a matrix", () => {
    const inv = invertMatrix([
      [4, 7],
      [2, 6],
    ]);
    expect(inv[0][0]).toBeCloseTo(0.6, 10);
    expect(inv[0][1]).toBeCloseTo(-0.7, 10);
    expect(inv[1][0]).toBeCloseTo(-0.2, 10);
    expect(inv[1][1]).toBeCloseTo(0.4, 10);
  });
});

describe("helpers", () => {
  it("normalCdf matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 4);
  });

  it("sigmoid is stable for large inputs", () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(800)).toBe(1);
    expect(sigmoid(-800)).toBe(0);
  });
});

describe("rocAuc", () => {
  it("is 1 for perfect ranking, 0 for reversed, 0.5 for all ties", () => {
    expect(rocAuc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1);
    expect(rocAuc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1])).toBe(0);
    expect(rocAuc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1])).toBe(0.5);
  });

  it("matches a hand-computed value", () => {
    // Positives 0.8, 0.4; negatives 0.6, 0.2. Concordant pairs: 3 of 4.
    expect(rocAuc([0.8, 0.4, 0.6, 0.2], [1, 1, 0, 0])).toBe(0.75);
  });
});

describe("fitLogistic", () => {
  it("with no informative features, the intercept is the logit of the base rate", () => {
    const labels = [1, 0, 0, 0, 1, 0, 0, 0, 0, 0];
    const fit = fitLogistic(
      labels.map(() => [0]),
      labels,
    );
    expect(fit.intercept).toBeCloseTo(Math.log(0.2 / 0.8), 6);
    expect(fit.coefficients[0]).toBeCloseTo(0, 6);
    expect(fit.logLoss).toBeCloseTo(fit.nullLogLoss, 8);
  });

  it("recovers known coefficients from simulated data", () => {
    const rng = createRng(7);
    const truth = { intercept: -0.5, b1: 1.2, b2: -0.8 };
    const features: number[][] = [];
    const labels: number[] = [];
    for (let i = 0; i < 6000; i++) {
      const x1 = rng.normal();
      const x2 = rng.normal();
      features.push([x1, x2]);
      labels.push(rng.uniform() < sigmoid(truth.intercept + truth.b1 * x1 + truth.b2 * x2) ? 1 : 0);
    }
    const fit = fitLogistic(features, labels, { l2: 0 });
    expect(fit.converged).toBe(true);
    // Features are ~N(0, 1), so standardized and raw coefficients nearly coincide.
    expect(fit.intercept).toBeCloseTo(truth.intercept, 0);
    expect(Math.abs(fit.coefficients[0] - truth.b1)).toBeLessThan(0.12);
    expect(Math.abs(fit.coefficients[1] - truth.b2)).toBeLessThan(0.12);
    // Every truth value should sit within ~3 standard errors of its estimate.
    expect(Math.abs(fit.coefficients[0] - truth.b1) / fit.standardErrors[1]).toBeLessThan(3);
    expect(Math.abs(fit.coefficients[1] - truth.b2) / fit.standardErrors[2]).toBeLessThan(3);
    expect(fit.pValues[1]).toBeLessThan(1e-6);
    expect(fit.auc).toBeGreaterThan(0.75);
    expect(fit.pseudoR2).toBeGreaterThan(0.1);
  });

  it("at the solution the score equations hold: mean prediction equals the base rate", () => {
    const rng = createRng(11);
    const features: number[][] = [];
    const labels: number[] = [];
    for (let i = 0; i < 500; i++) {
      const x = rng.normal(3, 2);
      features.push([x]);
      labels.push(rng.uniform() < sigmoid(-2 + 0.6 * x) ? 1 : 0);
    }
    const fit = fitLogistic(features, labels, { l2: 0 });
    const meanPrediction = features.reduce((s, row) => s + predictProbability(fit, row), 0) / features.length;
    expect(meanPrediction).toBeCloseTo(fit.positives / fit.n, 6);
  });

  it("rescales correctly: predictions do not depend on feature units", () => {
    const rng = createRng(3);
    const mph: number[][] = [];
    const kph: number[][] = [];
    const labels: number[] = [];
    for (let i = 0; i < 400; i++) {
      const v = rng.normal(89, 1.5);
      mph.push([v]);
      kph.push([v * 1.609344]);
      labels.push(rng.uniform() < sigmoid(0.5 * (v - 89)) ? 1 : 0);
    }
    const a = fitLogistic(mph, labels);
    const b = fitLogistic(kph, labels);
    expect(a.coefficients[0]).toBeCloseTo(b.coefficients[0], 6);
    expect(predictProbability(a, [90])).toBeCloseTo(predictProbability(b, [90 * 1.609344]), 6);
  });

  it("leaves unscaled columns in raw units", () => {
    const rng = createRng(5);
    const features: number[][] = [];
    const labels: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const flag = rng.uniform() < 0.3 ? 1 : 0;
      features.push([flag]);
      labels.push(rng.uniform() < sigmoid(-1 + 1.5 * flag) ? 1 : 0);
    }
    const fit = fitLogistic(features, labels, { l2: 0, standardize: [false] });
    expect(fit.scales[0]).toBe(1);
    expect(fit.means[0]).toBe(0);
    expect(Math.abs(fit.coefficients[0] - 1.5)).toBeLessThan(0.25);
    expect(Math.abs(fit.intercept - -1)).toBeLessThan(0.15);
  });

  it("stays finite on perfectly separable data thanks to the ridge penalty", () => {
    const features = [[1], [2], [3], [4], [5], [6]];
    const labels = [0, 0, 0, 1, 1, 1];
    const fit = fitLogistic(features, labels, { l2: 0.1 });
    expect(Number.isFinite(fit.coefficients[0])).toBe(true);
    expect(fit.coefficients[0]).toBeGreaterThan(0);
    expect(fit.auc).toBe(1);
  });

  it("rejects mismatched inputs", () => {
    expect(() => fitLogistic([[1]], [1, 0])).toThrow();
    expect(() => fitLogistic([], [])).toThrow();
  });
});
