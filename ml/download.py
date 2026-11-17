"""Download pitch-level Statcast data for the two most recent full seasons.

    python ml/download.py            # default seasons
    python ml/download.py 2024 2025  # explicit seasons

Writes one parquet file per month to ml/data/ (ignored by git). Months that
are already on disk are skipped, so the script can be re-run after a failure.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
from pybaseball import cache, statcast

DATA_DIR = Path(__file__).parent / "data"
DEFAULT_SEASONS = (2025, 2026)

# Only what the models and comps need. Keeps two seasons under ~100 MB on disk.
COLUMNS = [
    "game_date",
    "game_year",
    "game_type",
    "pitcher",
    "player_name",
    "p_throws",
    "pitch_type",
    "release_speed",
    "release_spin_rate",
    "pfx_x",
    "pfx_z",
    "release_pos_x",
    "release_pos_z",
    "release_extension",
    "delta_run_exp",
]

# Generous month windows; spring training and the postseason are removed by game_type.
MONTHS = [("03-15", "03-31"), ("04-01", "04-30"), ("05-01", "05-31"), ("06-01", "06-30"),
          ("07-01", "07-31"), ("08-01", "08-31"), ("09-01", "09-30"), ("10-01", "10-05")]


def main() -> None:
    seasons = [int(a) for a in sys.argv[1:]] or list(DEFAULT_SEASONS)
    DATA_DIR.mkdir(exist_ok=True)
    cache.enable()

    for season in seasons:
        for start, end in MONTHS:
            path = DATA_DIR / f"statcast_{season}_{start[:2]}.parquet"
            if path.exists():
                print(f"skip {path.name}", flush=True)
                continue
            print(f"fetch {season}-{start} .. {season}-{end}", flush=True)
            df = statcast(start_dt=f"{season}-{start}", end_dt=f"{season}-{end}", verbose=False)
            if df is None or df.empty:
                print("  no rows", flush=True)
                continue
            df = df[df["game_type"] == "R"][COLUMNS].copy()
            df["game_date"] = pd.to_datetime(df["game_date"])
            df.to_parquet(path, index=False)
            print(f"  {len(df):,} regular-season pitches -> {path.name}", flush=True)

    total = sum(len(pd.read_parquet(p, columns=["pitcher"])) for p in DATA_DIR.glob("statcast_*.parquet"))
    print(f"done: {total:,} pitches on disk", flush=True)


if __name__ == "__main__":
    main()
