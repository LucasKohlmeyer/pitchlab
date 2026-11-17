"""Compare a few LightGBM settings using validation data only.

    python ml/tune.py

Trains on 2025, validates on 2026 before the test period. The held-out test
period is dropped before anything else happens, so choosing settings here
does not contaminate the reported test metrics.
"""

import warnings

import lightgbm as lgb
import numpy as np

from conventions import GROUPS
from features import add_fastball_differentials, feature_matrix, load_statcast
from train import TEST_START, mask_inputs, pitcher_level_r, rmse

warnings.filterwarnings("ignore")
df = add_fastball_differentials(load_statcast())
df = df[df["game_date"] < TEST_START]  # the test period is never touched here
is_valid = df["game_date"] >= "2026-03-01"  # validate on 2026 pre-test, train on 2025

configs = {
    "current": dict(learning_rate=0.05, num_leaves=15, min_child_samples=400, reg_lambda=10.0),
    "slow": dict(learning_rate=0.02, num_leaves=15, min_child_samples=400, reg_lambda=10.0),
    "big-leaf": dict(learning_rate=0.02, num_leaves=15, min_child_samples=2000, reg_lambda=20.0),
    "small-tree": dict(learning_rate=0.02, num_leaves=7, min_child_samples=2000, reg_lambda=20.0),
    "wide": dict(learning_rate=0.02, num_leaves=31, min_child_samples=3000, reg_lambda=50.0),
}
for group in GROUPS:
    g = df[df["group"] == group]
    tr, va = g[~is_valid.loc[g.index]], g[is_valid.loc[g.index]]
    xtr, xva = feature_matrix(tr), feature_matrix(va)
    base = rmse(va["run_value"], np.full(len(va), tr["run_value"].mean()))
    for name, cfg in configs.items():
        rng = np.random.default_rng(7)
        m = lgb.LGBMRegressor(objective="regression", subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
                              n_estimators=2000, random_state=7, verbose=-1, **cfg)
        m.fit(mask_inputs(xtr, rng), tr["run_value"], eval_set=[(xva, va["run_value"])],
              callbacks=[lgb.early_stopping(100, verbose=False)])
        p = m.booster_.predict(xva)
        r, n = pitcher_level_r(va, p)
        print(f"{group:9s} {name:10s} trees={m.booster_.num_trees():4d} R2={1 - (rmse(va['run_value'], p) / base) ** 2:.4%} pitcher r={r:.3f} (n={n})", flush=True)
