/**
 * Evaluator for the gradient-boosted tree models exported by ml/train.py.
 * Runs anywhere JavaScript runs; there is no Python or ONNX runtime involved.
 *
 * A model is a list of trees and its prediction is the sum of one leaf value
 * per tree. Each tree is stored as parallel arrays:
 *
 *   f[i]        index of the feature tested at internal node i
 *   t[i]        threshold: go left when value <= threshold
 *   n[i]        1 if a missing (NaN) value goes left, 0 if it goes right
 *   l[i], r[i]  children: >= 0 is another internal node, < 0 is leaf ~child
 *   v[j]        value of leaf j
 */

export type Tree = { f: number[]; t: number[]; n: number[]; l: number[]; r: number[]; v: number[] };
export type TreeModel = { group: string; trees: Tree[] };

export function predictTree(tree: Tree, x: readonly number[]): number {
  // A tree that never split is a single leaf.
  if (tree.f.length === 0) return tree.v[0];
  let node = 0;
  while (node >= 0) {
    const value = x[tree.f[node]];
    const goLeft = Number.isNaN(value) ? tree.n[node] === 1 : value <= tree.t[node];
    node = goLeft ? tree.l[node] : tree.r[node];
  }
  return tree.v[~node];
}

/** Predicted run value for one feature row (NaN marks a missing input). */
export function predict(model: TreeModel, x: readonly number[]): number {
  let sum = 0;
  for (const tree of model.trees) sum += predictTree(tree, x);
  return sum;
}

/**
 * Stuff+ scale: 100 is the MLB average prediction for the pitch group and
 * every 10 points is one standard deviation of pitch-level predictions.
 * Run value is from the batter's side, so a lower prediction is a higher grade.
 */
export function toStuffPlus(prediction: number, mean: number, sd: number): number {
  return 100 - (10 * (prediction - mean)) / sd;
}
