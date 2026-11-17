"""Unit and sign-convention tests. Cases are shared with the TypeScript suite."""

import json
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from conventions import (  # noqa: E402
    FEATURES,
    PITCH_GROUPS,
    arm_side_positive,
    statcast_hb_to_pitchlab,
    statcast_ivb_to_pitchlab,
    statcast_release_side_to_pitchlab,
    to_pitchlab,
)
from features import add_fastball_differentials, primary_fastball  # noqa: E402

CASES = json.loads((Path(__file__).parent / "convention_cases.json").read_text())


@pytest.mark.parametrize("case", CASES["statcast_to_pitchlab"], ids=lambda c: c["name"])
def test_statcast_to_pitchlab(case):
    s, p = case["statcast"], case["pitchlab"]
    assert statcast_hb_to_pitchlab(s["pfx_x"]) == pytest.approx(p["hb"])
    assert statcast_ivb_to_pitchlab(s["pfx_z"]) == pytest.approx(p["ivb"])
    assert statcast_release_side_to_pitchlab(s["release_pos_x"]) == pytest.approx(p["release_side"])


@pytest.mark.parametrize("case", CASES["arm_side_positive"], ids=lambda c: c["name"])
def test_arm_side_positive(case):
    assert float(arm_side_positive(case["value"], case["throws"])) == pytest.approx(case["expected"])


@pytest.mark.parametrize("case", CASES["mirror_pairs"], ids=lambda c: c["name"])
def test_mirror_pairs(case):
    left, right = case["left"], case["right"]
    for key in ("hb", "release_side"):
        assert float(arm_side_positive(left[key], "L")) == pytest.approx(float(arm_side_positive(right[key], "R")))


def _frame(rows):
    base = {
        "game_date": "2026-05-01", "game_year": 2026, "pitcher": 1, "player_name": "Test, Pitcher", "p_throws": "R",
        "pitch_type": "FF", "release_speed": 95.0, "release_spin_rate": 2300.0, "pfx_x": -0.7, "pfx_z": 1.3,
        "release_pos_x": -1.8, "release_pos_z": 5.9, "release_extension": 6.5, "delta_run_exp": 0.0,
    }
    return pd.DataFrame([{**base, **r} for r in rows])


def test_to_pitchlab_columns_and_groups():
    df = to_pitchlab(_frame([{}, {"pitch_type": "ST"}, {"pitch_type": "KN"}]))
    assert df.loc[0, "hb"] == pytest.approx(8.4)
    assert df.loc[0, "ivb"] == pytest.approx(15.6)
    assert df.loc[0, "rel_side"] == pytest.approx(1.8)
    assert list(df["group"][:2]) == ["fastball", "breaking"]
    assert pd.isna(df.loc[2, "group"])  # knuckleballs are not modeled
    assert set(PITCH_GROUPS.values()) == {"fastball", "breaking", "offspeed"}


def test_primary_fastball_is_most_thrown_fastball_per_pitcher_season():
    df = to_pitchlab(_frame([
        {"pitch_type": "SI", "release_speed": 93.0}, {"pitch_type": "SI", "release_speed": 94.0},
        {"pitch_type": "FF", "release_speed": 96.0},
        {"pitch_type": "SL", "release_speed": 85.0},
    ]))
    ref = primary_fastball(df)
    assert ref.loc[(1, 2026), "fb_type"] == "SI"
    assert ref.loc[(1, 2026), "fb_velo"] == pytest.approx(93.5)


def test_differentials_are_relative_to_primary_fastball_and_arm_side_positive():
    rows = [{"pitch_type": "FF"}] * 3 + [{"pitch_type": "SL", "release_speed": 86.0, "pfx_x": 0.4, "pfx_z": 0.1}]
    righty = add_fastball_differentials(to_pitchlab(_frame(rows)))
    slider = righty.iloc[3]
    assert slider["velo_diff"] == pytest.approx(-9.0)
    assert slider["hb_arm"] == pytest.approx(-4.8)          # glove side for a righty
    assert slider["hb_diff"] == pytest.approx(-4.8 - 8.4)   # relative to arm-side fastball
    assert slider["ivb_diff"] == pytest.approx(1.2 - 15.6)

    # The mirror-image lefty must get exactly the same model inputs.
    mirrored = [{**r, "p_throws": "L", "pfx_x": -r.get("pfx_x", -0.7), "release_pos_x": 1.8} for r in rows]
    lefty = add_fastball_differentials(to_pitchlab(_frame(mirrored)))
    for feature in FEATURES:
        assert lefty.iloc[3][feature] == pytest.approx(righty.iloc[3][feature]), feature


def test_pitcher_without_a_fastball_gets_missing_differentials():
    df = add_fastball_differentials(to_pitchlab(_frame([{"pitch_type": "SL"}])))
    assert pd.isna(df.loc[0, "velo_diff"])
