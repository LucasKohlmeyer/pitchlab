"""Feature engineering shared by training and the comps build."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from conventions import FASTBALL_TYPES, FEATURES, arm_side_positive, to_pitchlab

DATA_DIR = Path(__file__).parent / "data"


def load_statcast() -> pd.DataFrame:
    """All downloaded regular-season pitches, in PitchLab conventions."""
    files = sorted(DATA_DIR.glob("statcast_*.parquet"))
    if not files:
        raise SystemExit("No data in ml/data. Run `python ml/download.py` first.")
    raw = pd.concat((pd.read_parquet(f) for f in files), ignore_index=True)
    df = to_pitchlab(raw)
    # A pitch needs a type we model, an outcome, and at least velocity and movement.
    df = df.dropna(subset=["group", "run_value", "velo", "hb", "ivb", "throws"]).reset_index(drop=True)
    return df


def primary_fastball(df: pd.DataFrame) -> pd.DataFrame:
    """Per pitcher-season: the most-thrown fastball type and its average shape."""
    fb = df[df["pitch_type"].isin(FASTBALL_TYPES)].copy()
    fb["hb_arm"] = arm_side_positive(fb["hb"], fb["throws"])
    stats = (
        fb.groupby(["pitcher", "season", "pitch_type"])
        .agg(n=("velo", "size"), fb_velo=("velo", "mean"), fb_hb_arm=("hb_arm", "mean"), fb_ivb=("ivb", "mean"))
        .reset_index()
        .sort_values(["pitcher", "season", "n"], ascending=[True, True, False])
        .drop_duplicates(["pitcher", "season"])
        .rename(columns={"pitch_type": "fb_type"})
        .set_index(["pitcher", "season"])
    )
    return stats[["fb_type", "fb_velo", "fb_hb_arm", "fb_ivb"]]


def add_fastball_differentials(df: pd.DataFrame) -> pd.DataFrame:
    """Adds handedness-normalized columns and differentials vs. the primary fastball."""
    out = df.copy()
    out["hb_arm"] = arm_side_positive(out["hb"], out["throws"])
    out["rel_side_arm"] = arm_side_positive(out["rel_side"], out["throws"])
    ref = primary_fastball(out)
    out = out.join(ref, on=["pitcher", "season"])
    out["velo_diff"] = out["velo"] - out["fb_velo"]
    out["hb_diff"] = out["hb_arm"] - out["fb_hb_arm"]
    out["ivb_diff"] = out["ivb"] - out["fb_ivb"]
    return out


def feature_matrix(df: pd.DataFrame) -> pd.DataFrame:
    return df[list(FEATURES)].astype(float)
