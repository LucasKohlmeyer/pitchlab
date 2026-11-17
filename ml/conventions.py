"""Units and sign conventions shared by the whole pipeline.

PitchLab stores every pitch in the TrackMan convention, so that is the
convention the models are trained in. Statcast is converted on the way in.

    Quantity            Statcast column      Statcast unit / sign                PitchLab (TrackMan) unit / sign       Conversion
    ------------------  -------------------  ----------------------------------  ------------------------------------  ---------------
    velocity            release_speed        mph                                 mph                                   as is
    spin rate           release_spin_rate    rpm                                 rpm                                   as is
    horizontal break    pfx_x                feet, catcher's view (+ = 1B side)  inches, pitcher's view (+ = right)    hb  = -12 * pfx_x
    induced vert break  pfx_z                feet, + = up                        inches, + = up                        ivb =  12 * pfx_z
    release height      release_pos_z        feet                                feet                                  as is
    release side        release_pos_x        feet, catcher's view (+ = 1B side)  feet, pitcher's view (+ = right)      side = -release_pos_x
    extension           release_extension    feet                                feet                                  as is

Why the sign flips: the catcher and the pitcher face each other, so "right"
for one is "left" for the other. A right-hander's four-seam runs toward his
arm side, which is his right (positive in TrackMan) and the catcher's left
(negative pfx_x in Statcast).

Handedness: the models use "arm-side positive" features so that a lefty and a
righty with mirror-image pitches get identical inputs. For a right-hander the
PitchLab value is already arm-side positive; for a left-hander it is negated.

The TypeScript twin of this file is src/lib/stuff/conventions.ts. The two are
tested against the same cases.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

INCHES_PER_FOOT = 12.0

# Statcast pitch_type -> model group. Anything not listed is dropped
# (knuckleballs, eephus, pitch-outs, position players' "FA", unknowns).
PITCH_GROUPS: dict[str, str] = {
    "FF": "fastball",
    "SI": "fastball",
    "FC": "fastball",
    "SL": "breaking",
    "ST": "breaking",
    "SV": "breaking",
    "CU": "breaking",
    "KC": "breaking",
    "CH": "offspeed",
    "FS": "offspeed",
    "FO": "offspeed",
}
GROUPS = ("fastball", "breaking", "offspeed")
FASTBALL_TYPES = ("FF", "SI", "FC")

# Order matters: this is the column order the exported models expect.
FEATURES = (
    "velo",
    "spin",
    "hb_arm",
    "ivb",
    "rel_height",
    "rel_side_arm",
    "extension",
    "velo_diff",
    "hb_diff",
    "ivb_diff",
)


def statcast_hb_to_pitchlab(pfx_x_ft):
    """Horizontal break: Statcast feet, catcher's view -> inches, pitcher's view."""
    return -INCHES_PER_FOOT * pfx_x_ft


def statcast_ivb_to_pitchlab(pfx_z_ft):
    """Induced vertical break: feet -> inches. Up is positive in both."""
    return INCHES_PER_FOOT * pfx_z_ft


def statcast_release_side_to_pitchlab(release_pos_x_ft):
    """Release side: Statcast catcher's view -> pitcher's view. Feet in both."""
    return -release_pos_x_ft


def arm_side_positive(value, throws):
    """Mirror a pitcher's-view horizontal quantity so + always means arm side.

    `throws` is "R" or "L" (scalar or array-like).
    """
    sign = np.where(np.asarray(throws) == "L", -1.0, 1.0)
    return np.asarray(value, dtype=float) * sign


def to_pitchlab(df: pd.DataFrame) -> pd.DataFrame:
    """Statcast frame -> PitchLab-convention columns (not yet handedness-normalized)."""
    out = pd.DataFrame(
        {
            "game_date": pd.to_datetime(df["game_date"]),
            "season": df["game_year"].astype(int),
            "pitcher": df["pitcher"].astype(int),
            "player_name": df["player_name"],
            "throws": df["p_throws"],
            "pitch_type": df["pitch_type"],
            "velo": df["release_speed"].astype(float),
            "spin": df["release_spin_rate"].astype(float),
            "hb": statcast_hb_to_pitchlab(df["pfx_x"].astype(float)),
            "ivb": statcast_ivb_to_pitchlab(df["pfx_z"].astype(float)),
            "rel_height": df["release_pos_z"].astype(float),
            "rel_side": statcast_release_side_to_pitchlab(df["release_pos_x"].astype(float)),
            "extension": df["release_extension"].astype(float),
            "run_value": df["delta_run_exp"].astype(float),
        }
    )
    out["group"] = out["pitch_type"].map(PITCH_GROUPS)
    return out
