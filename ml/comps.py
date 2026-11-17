"""Build the MLB comps file: left-handed pitcher-season averages by pitch type.

    python ml/comps.py      (run after ml/train.py)

Writes src/lib/stuff/mlb-lhp-comps.json. Values are in PitchLab conventions
(pitcher's view, inches for break, feet for release), not handedness-mirrored,
so a left-handed PitchLab user's numbers compare directly.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import lightgbm as lgb

from conventions import GROUPS
from features import add_fastball_differentials, feature_matrix, load_statcast

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "lib" / "stuff" / "mlb-lhp-comps.json"
MODEL_DIR = ROOT / "src" / "lib" / "stuff" / "models"
ARTIFACT_DIR = Path(__file__).parent / "artifacts"
MIN_PITCHES = 100

COLUMNS = ["name", "season", "pitchType", "pitches", "velo", "spin", "hb", "ivb", "relHeight", "extension", "stuffPlus"]


def display_name(statcast_name: str) -> str:
    """Statcast gives "Last, First"; show "First Last"."""
    last, _, first = statcast_name.partition(", ")
    return f"{first} {last}".strip()


def main() -> None:
    df = add_fastball_differentials(load_statcast())
    meta = json.loads((MODEL_DIR / "meta.json").read_text())

    # Grade every pitch with the trained models so each comp carries a Stuff+.
    df["stuff"] = float("nan")
    for group in GROUPS:
        booster = lgb.Booster(model_file=str(ARTIFACT_DIR / f"{group}.txt"))
        rows = df["group"] == group
        pred = booster.predict(feature_matrix(df[rows]))
        scale = meta["groups"][group]
        df.loc[rows, "stuff"] = 100 - 10 * (pred - scale["mean"]) / scale["sd"]

    lhp = df[df["throws"] == "L"]
    agg = (
        lhp.groupby(["pitcher", "player_name", "season", "pitch_type"])
        .agg(
            pitches=("velo", "size"),
            velo=("velo", "mean"),
            spin=("spin", "mean"),
            hb=("hb", "mean"),
            ivb=("ivb", "mean"),
            relHeight=("rel_height", "mean"),
            extension=("extension", "mean"),
            stuffPlus=("stuff", "mean"),
        )
        .reset_index()
    )
    agg = agg[agg["pitches"] >= MIN_PITCHES].dropna(subset=["velo", "spin", "hb", "ivb", "relHeight", "extension"])
    agg = agg.sort_values(["pitch_type", "player_name", "season"])

    rows = [
        [
            display_name(r.player_name), int(r.season), r.pitch_type, int(r.pitches),
            round(r.velo, 1), int(round(r.spin)), round(r.hb, 1), round(r.ivb, 1),
            round(r.relHeight, 2), round(r.extension, 2), int(round(r.stuffPlus)),
        ]
        for r in agg.itertuples()
    ]
    payload = {
        "generated": date.today().isoformat(),
        "source": "MLB Statcast via pybaseball, regular season",
        "seasons": sorted(int(s) for s in agg["season"].unique()),
        "throws": "L",
        "minPitches": MIN_PITCHES,
        "columns": COLUMNS,
        "rows": rows,
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"{len(rows)} pitcher-season pitch types from {agg['pitcher'].nunique()} left-handers -> {OUT.name} ({OUT.stat().st_size / 1024:.0f} KB)")
    print(agg.groupby("pitch_type").size().to_dict())


if __name__ == "__main__":
    main()
