"""Train, evaluate, and export the PitchLab Stuff+ models.

    python ml/train.py

One gradient-boosted model per pitch group predicts a pitch's run value
(Statcast delta_run_exp, from the batter's side: lower is better for the
pitcher) from its physical characteristics only. No location, count, or
batter information.

Outputs
    src/lib/stuff/models/<group>.json   compact tree dump read by the TypeScript evaluator
    src/lib/stuff/models/meta.json      feature order, Stuff+ scaling, split dates, test metrics
    src/lib/stuff/__tests__/fixtures/parity.json   rows + Python predictions for the parity test
    ml/artifacts/                       LightGBM text models and a metrics report (ignored by git)
"""

from __future__ import annotations

import json
import warnings
from datetime import date
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from conventions import FEATURES, GROUPS
from features import add_fastball_differentials, feature_matrix, load_statcast

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "src" / "lib" / "stuff" / "models"
FIXTURE_DIR = ROOT / "src" / "lib" / "stuff" / "__tests__" / "fixtures"
ARTIFACT_DIR = Path(__file__).parent / "artifacts"

# Date split. Everything on or after TEST_START is held out and never seen in training.
VALID_START = "2026-05-15"  # early-stopping set: the last weeks before the test period
TEST_START = "2026-07-01"

SEED = 7
MIN_PITCHER_PITCHES = 200  # for pitcher-level test metrics

RELEASE_FEATURES = ["rel_height", "rel_side_arm", "extension"]
DIFF_FEATURES = ["velo_diff", "hb_diff", "ivb_diff"]

# Chosen with ml/tune.py, which compares settings on validation data only.
# Small, heavily regularized trees won in every pitch group: per-pitch run value is
# mostly noise, and release-point features let bigger trees memorize individual pitchers.
PARAMS = dict(
    objective="regression",
    learning_rate=0.02,
    num_leaves=7,
    min_child_samples=2000,
    subsample=0.8,
    subsample_freq=1,
    colsample_bytree=0.8,
    reg_lambda=20.0,
    n_estimators=2000,
    random_state=SEED,
    verbose=-1,
)


def mask_inputs(x: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """Randomly blank out inputs that PitchLab users often do not have.

    Rapsodo exports and hand-logged pitches frequently lack release point,
    extension, or spin. Training on some rows with those inputs missing teaches
    each tree a sensible default branch, so partial pitches still get a grade.
    """
    x = x.copy()
    n = len(x)
    x.loc[rng.random(n) < 0.15, RELEASE_FEATURES] = np.nan
    x.loc[rng.random(n) < 0.08, "spin"] = np.nan
    x.loc[rng.random(n) < 0.04, DIFF_FEATURES] = np.nan
    return x


def rmse(y, pred) -> float:
    return float(np.sqrt(np.mean((np.asarray(y) - np.asarray(pred)) ** 2)))


def pitcher_level_r(df: pd.DataFrame, pred: np.ndarray) -> tuple[float, int]:
    """Correlation between a pitcher's mean predicted and mean actual run value on the test set."""
    g = df.assign(pred=pred).groupby("pitcher").agg(n=("pred", "size"), pred=("pred", "mean"), actual=("run_value", "mean"))
    g = g[g["n"] >= MIN_PITCHER_PITCHES]
    return float(np.corrcoef(g["pred"], g["actual"])[0, 1]), int(len(g))


def export_trees(booster: lgb.Booster) -> list[dict]:
    """Flatten LightGBM's nested dump into arrays the TypeScript evaluator can walk.

    Per tree:
      f[i]  feature index tested at internal node i
      t[i]  threshold; go left when value <= threshold
      n[i]  1 if a missing (NaN) value goes left, else 0
      l[i], r[i]  child: >= 0 is an internal node index, < 0 is leaf ~child (-(leaf) - 1)
      v[j]  value of leaf j
    """
    trees = []
    for info in booster.dump_model()["tree_info"]:
        f, t, n, l, r, v = [], [], [], [], [], []

        def walk(node) -> int:
            if "leaf_value" in node and "split_feature" not in node:
                v.append(node["leaf_value"])
                return -len(v)  # ~index
            assert node["decision_type"] == "<=", node["decision_type"]
            assert node["missing_type"] in ("NaN", "None"), node["missing_type"]
            i = len(f)
            f.append(node["split_feature"])
            t.append(node["threshold"])
            # LightGBM: with missing_type NaN a NaN follows default_left; otherwise NaN is read as 0.
            n.append(int(node["default_left"]) if node["missing_type"] == "NaN" else int(0.0 <= node["threshold"]))
            l.append(0)
            r.append(0)
            l[i] = walk(node["left_child"])
            r[i] = walk(node["right_child"])
            return i

        walk(info["tree_structure"])
        trees.append({"f": f, "t": t, "n": n, "l": l, "r": r, "v": v})
    return trees


def main() -> None:
    rng = np.random.default_rng(SEED)
    df = add_fastball_differentials(load_statcast())
    print(f"{len(df):,} modeled pitches, {df['game_date'].min().date()} to {df['game_date'].max().date()}")

    is_test = df["game_date"] >= TEST_START
    is_valid = (df["game_date"] >= VALID_START) & ~is_test
    is_train = ~is_test & ~is_valid

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    ARTIFACT_DIR.mkdir(exist_ok=True)

    meta = {
        "features": list(FEATURES),
        "target": "delta_run_exp (runs per pitch, batter's perspective; lower is better for the pitcher)",
        "seasons": sorted(int(s) for s in df["season"].unique()),
        "split": {
            "train": f"{df.loc[is_train, 'game_date'].min().date()} to {df.loc[is_train, 'game_date'].max().date()}",
            "validation": f"{df.loc[is_valid, 'game_date'].min().date()} to {df.loc[is_valid, 'game_date'].max().date()}",
            "test": f"{df.loc[is_test, 'game_date'].min().date()} to {df.loc[is_test, 'game_date'].max().date()}",
        },
        "trainedOn": date.today().isoformat(),
        "library": f"lightgbm {lgb.__version__}",
        "params": {k: v for k, v in PARAMS.items() if k not in ("verbose", "random_state")},
        "minPitcherPitches": MIN_PITCHER_PITCHES,
        "groups": {},
    }
    fixtures = {"features": list(FEATURES), "groups": {}}

    for group in GROUPS:
        g = df[df["group"] == group]
        train, valid, test = g[is_train.loc[g.index]], g[is_valid.loc[g.index]], g[is_test.loc[g.index]]
        x_train, x_valid, x_test = feature_matrix(train), feature_matrix(valid), feature_matrix(test)
        y_train, y_valid, y_test = train["run_value"], valid["run_value"], test["run_value"]

        model = lgb.LGBMRegressor(**PARAMS)
        model.fit(
            mask_inputs(x_train, rng),
            y_train,
            eval_set=[(mask_inputs(x_valid, rng), y_valid)],
            callbacks=[lgb.early_stopping(100, verbose=False)],
        )
        booster = model.booster_
        pred_test = booster.predict(x_test)

        # Baselines, fit on the same training rows.
        constant = np.full(len(test), y_train.mean())
        type_means = train.groupby("pitch_type")["run_value"].mean()
        by_type = test["pitch_type"].map(type_means).fillna(y_train.mean()).to_numpy()
        linear = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), Ridge(alpha=1.0)).fit(x_train, y_train)
        pred_linear = linear.predict(x_test)

        # What a pitch with no release data or spin would get.
        x_partial = x_test.copy()
        x_partial[RELEASE_FEATURES + ["spin"]] = np.nan
        pred_partial = booster.predict(x_partial)

        base = rmse(y_test, constant)
        r_model, n_pitchers = pitcher_level_r(test, pred_test)
        r_linear, _ = pitcher_level_r(test, pred_linear)
        r_partial, _ = pitcher_level_r(test, pred_partial)

        # Stuff+ scale: 100 = mean prediction, 10 points = 1 SD of pitch-level predictions,
        # both measured on the pitches the model was fit to (train + validation).
        fit_pred = booster.predict(pd.concat([x_train, x_valid]))
        mu, sigma = float(fit_pred.mean()), float(fit_pred.std())
        stuff_test = 100 - 10 * (pred_test - mu) / sigma

        # Spread of Stuff+ across pitcher-seasons, to help read a grade.
        ps = test.assign(stuff=stuff_test).groupby(["pitcher", "pitch_type"]).agg(n=("stuff", "size"), stuff=("stuff", "mean"))
        ps = ps[ps["n"] >= 100]["stuff"]

        importance = booster.feature_importance(importance_type="gain")
        metrics = {
            "rows": {"train": int(len(train)), "validation": int(len(valid)), "test": int(len(test))},
            "trees": int(booster.num_trees()),
            "rmse": {
                "model": rmse(y_test, pred_test),
                "constant": base,
                "pitchTypeMean": rmse(y_test, by_type),
                "linear": rmse(y_test, pred_linear),
                "modelPartialInputs": rmse(y_test, pred_partial),
            },
            "r2": {
                "model": 1 - (rmse(y_test, pred_test) / base) ** 2,
                "linear": 1 - (rmse(y_test, pred_linear) / base) ** 2,
                "modelPartialInputs": 1 - (rmse(y_test, pred_partial) / base) ** 2,
            },
            "pitcherLevel": {"pitchers": n_pitchers, "rModel": r_model, "rLinear": r_linear, "rModelPartialInputs": r_partial},
            "stuffByPitcher": {
                "sd": float(ps.std()),
                "p10": float(ps.quantile(0.10)),
                "p50": float(ps.quantile(0.50)),
                "p90": float(ps.quantile(0.90)),
                "count": int(len(ps)),
            },
            "importance": {name: float(v / importance.sum()) for name, v in zip(FEATURES, importance)},
        }
        meta["groups"][group] = {"mean": mu, "sd": sigma, **metrics}

        (MODEL_DIR / f"{group}.json").write_text(json.dumps({"group": group, "trees": export_trees(booster)}, separators=(",", ":")))
        booster.save_model(str(ARTIFACT_DIR / f"{group}.txt"))

        # Parity fixtures: real test rows, some with inputs blanked, plus Python's answers.
        sample = x_test.sample(40, random_state=SEED)
        sample = pd.concat([sample.iloc[:25], mask_inputs(sample.iloc[25:35], np.random.default_rng(1)), x_partial.loc[sample.index[35:]]])
        sample.iloc[25, sample.columns.get_loc("spin")] = np.nan
        sample.iloc[26, [sample.columns.get_loc(c) for c in RELEASE_FEATURES]] = np.nan
        sample.iloc[27, [sample.columns.get_loc(c) for c in DIFF_FEATURES]] = np.nan
        preds = booster.predict(sample)
        fixtures["groups"][group] = {
            "rows": [[None if np.isnan(v) else float(v) for v in row] for row in sample.to_numpy()],
            "predictions": [float(p) for p in preds],
            "stuffPlus": [float(100 - 10 * (p - mu) / sigma) for p in preds],
        }

        print(
            f"{group:9s} trees={metrics['trees']:3d} test rows={len(test):,}  "
            f"RMSE model={metrics['rmse']['model']:.5f} const={base:.5f} linear={metrics['rmse']['linear']:.5f}  "
            f"R2={metrics['r2']['model']:.4%} (linear {metrics['r2']['linear']:.4%})  "
            f"pitcher r={r_model:.3f} (linear {r_linear:.3f}, partial {r_partial:.3f}, n={n_pitchers})  "
            f"Stuff+ pitcher sd={metrics['stuffByPitcher']['sd']:.1f}"
        )

    (MODEL_DIR / "meta.json").write_text(json.dumps(meta, indent=2))
    (FIXTURE_DIR / "parity.json").write_text(json.dumps(fixtures, separators=(",", ":")))
    (ARTIFACT_DIR / "metrics.json").write_text(json.dumps(meta, indent=2))
    sizes = {p.name: f"{p.stat().st_size / 1024:.0f} KB" for p in sorted(MODEL_DIR.glob("*.json"))}
    print("wrote", sizes)


if __name__ == "__main__":
    main()
