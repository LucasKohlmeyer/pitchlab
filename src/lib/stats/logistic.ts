import { mean, normalCdf, sampleSd, sigmoid } from "./descriptive";

/**
 * Binary logistic regression fit by Newton-Raphson (iteratively reweighted
 * least squares), written from scratch so the math is inspectable.
 *
 *   P(y = 1 | x) = sigmoid(b0 + b . x)
 *
 * Each step solves  (X'WX + lambda*I) delta = X'(y - p) - lambda*b
 * where W = diag(p(1 - p)). A small ridge penalty (never applied to the
 * intercept) keeps the Hessian invertible when classes are nearly separable.
 * Standard errors come from the inverse Hessian at the solution.
 */

export type LogisticOptions = {
  /** Ridge penalty on the non-intercept coefficients. */
  l2?: number;
  maxIterations?: number;
  /** Convergence tolerance on the largest coefficient update. */
  tolerance?: number;
  /**
   * Per-feature flag: z-score this column before fitting (true, the default)
   * or leave it in raw units (false, sensible for 0/1 indicators).
   */
  standardize?: boolean[];
};

export type LogisticFit = {
  intercept: number;
  /** Coefficients on the scaled features: log-odds per +1 SD, or per unit for unscaled columns. */
  coefficients: number[];
  /** Standard errors, intercept first. */
  standardErrors: number[];
  /** Wald z scores, intercept first. */
  zScores: number[];
  /** Two-sided p-values, intercept first. */
  pValues: number[];
  /** Centering and scaling applied to each feature (0 and 1 when unscaled). */
  means: number[];
  scales: number[];
  n: number;
  positives: number;
  iterations: number;
  converged: boolean;
  /** Mean negative log-likelihood of the fitted model and of an intercept-only model. */
  logLoss: number;
  nullLogLoss: number;
  /** McFadden pseudo R-squared: 1 - logLoss / nullLogLoss. */
  pseudoR2: number;
  /** Area under the ROC curve on the training data. */
  auc: number;
};

/** Solves A x = b by Gaussian elimination with partial pivoting. Throws if A is singular. */
export function solveLinearSystem(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error("Matrix is singular");
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = col + 1; r < n; r++) {
      const f = m[r][col] / m[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n];
    for (let c = r + 1; c < n; c++) s -= m[r][c] * x[c];
    x[r] = s / m[r][r];
  }
  return x;
}

export function invertMatrix(a: number[][]): number[][] {
  const n = a.length;
  const columns = Array.from({ length: n }, (_, j) =>
    solveLinearSystem(
      a,
      Array.from({ length: n }, (_, i) => (i === j ? 1 : 0)),
    ),
  );
  return Array.from({ length: n }, (_, i) => columns.map((col) => col[i]));
}

/** Area under the ROC curve via the rank-sum identity; ties get half credit. */
export function rocAuc(scores: number[], labels: number[]): number {
  const order = scores.map((s, i) => ({ s, y: labels[i] })).sort((p, q) => p.s - q.s);
  const nPos = order.filter((o) => o.y === 1).length;
  const nNeg = order.length - nPos;
  if (nPos === 0 || nNeg === 0) return NaN;
  let rankSumPos = 0;
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j < order.length && order[j].s === order[i].s) j++;
    const avgRank = (i + 1 + j) / 2; // average of ranks i+1 .. j
    for (let k = i; k < j; k++) if (order[k].y === 1) rankSumPos += avgRank;
    i = j;
  }
  return (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

function meanLogLoss(probabilities: number[], labels: number[]): number {
  const eps = 1e-12;
  let total = 0;
  for (let i = 0; i < labels.length; i++) {
    const p = Math.min(1 - eps, Math.max(eps, probabilities[i]));
    total -= labels[i] === 1 ? Math.log(p) : Math.log(1 - p);
  }
  return total / labels.length;
}

export function fitLogistic(features: number[][], labels: number[], options: LogisticOptions = {}): LogisticFit {
  const n = features.length;
  if (n === 0 || n !== labels.length) throw new Error("features and labels must be non-empty and the same length");
  const p = features[0].length;
  const { l2 = 1e-3, maxIterations = 50, tolerance = 1e-8 } = options;

  // Scale features so coefficients are comparable and the Hessian is well conditioned.
  const means = new Array<number>(p).fill(0);
  const scales = new Array<number>(p).fill(1);
  for (let j = 0; j < p; j++) {
    if (options.standardize && options.standardize[j] === false) continue;
    const column = features.map((row) => row[j]);
    const sd = sampleSd(column);
    means[j] = mean(column);
    scales[j] = sd > 0 && Number.isFinite(sd) ? sd : 1;
  }
  // Design matrix with a leading 1 for the intercept.
  const x = features.map((row) => [1, ...row.map((v, j) => (v - means[j]) / scales[j])]);
  const d = p + 1;

  let beta = new Array<number>(d).fill(0);
  let hessian: number[][] = [];
  let iterations = 0;
  let converged = false;

  const buildHessian = (b: number[]) => {
    const h = Array.from({ length: d }, () => new Array<number>(d).fill(0));
    const g = new Array<number>(d).fill(0);
    for (let i = 0; i < n; i++) {
      let eta = 0;
      for (let j = 0; j < d; j++) eta += x[i][j] * b[j];
      const mu = sigmoid(eta);
      const w = mu * (1 - mu);
      const resid = labels[i] - mu;
      for (let j = 0; j < d; j++) {
        g[j] += x[i][j] * resid;
        const xw = x[i][j] * w;
        for (let k = j; k < d; k++) h[j][k] += xw * x[i][k];
      }
    }
    for (let j = 0; j < d; j++) {
      for (let k = 0; k < j; k++) h[j][k] = h[k][j];
      if (j > 0) {
        h[j][j] += l2;
        g[j] -= l2 * b[j];
      }
    }
    return { h, g };
  };

  for (; iterations < maxIterations; ) {
    const { h, g } = buildHessian(beta);
    const delta = solveLinearSystem(h, g);
    beta = beta.map((b, j) => b + delta[j]);
    iterations++;
    if (Math.max(...delta.map(Math.abs)) < tolerance) {
      converged = true;
      break;
    }
  }
  hessian = buildHessian(beta).h;

  const covariance = invertMatrix(hessian);
  const standardErrors = covariance.map((row, j) => Math.sqrt(Math.max(row[j], 0)));
  const zScores = beta.map((b, j) => (standardErrors[j] > 0 ? b / standardErrors[j] : 0));
  const pValues = zScores.map((z) => 2 * (1 - normalCdf(Math.abs(z))));

  const probabilities = x.map((row) => sigmoid(row.reduce((s, v, j) => s + v * beta[j], 0)));
  const positives = labels.reduce((s, y) => s + y, 0);
  const baseRate = positives / n;
  const logLoss = meanLogLoss(probabilities, labels);
  const nullLogLoss = meanLogLoss(new Array<number>(n).fill(baseRate), labels);

  return {
    intercept: beta[0],
    coefficients: beta.slice(1),
    standardErrors,
    zScores,
    pValues,
    means,
    scales,
    n,
    positives,
    iterations,
    converged,
    logLoss,
    nullLogLoss,
    pseudoR2: nullLogLoss > 0 ? 1 - logLoss / nullLogLoss : 0,
    auc: rocAuc(probabilities, labels),
  };
}

/** Predicted probability for one raw (unscaled) feature vector. */
export function predictProbability(fit: LogisticFit, row: number[]): number {
  let eta = fit.intercept;
  for (let j = 0; j < row.length; j++) eta += (fit.coefficients[j] * (row[j] - fit.means[j])) / fit.scales[j];
  return sigmoid(eta);
}
