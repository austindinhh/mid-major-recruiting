"""
Per-player scouting math shared by the Streamlit app and the static-site export:
projection, feature contributions, comparable transfers and shot zones.
"""

import numpy as np
import pandas as pd

from ..config import (
    COMP_FEATURES,
    COMP_WEIGHTS,
    HIGH_MAJOR_CONFERENCES,
    MID_MAJOR_CONFERENCES,
)
from ..features.build import FEATURE_COLS
from .predict import add_gem_score

FEATURE_LABELS = {
    "porpag":           "Current PRPG",
    "ft_pct":           "Free throw percentage",
    "team_barthag":     "Team strength",
    "destination_level":"Size of the jump in competition",
    "origin_level":     "Current conference strength",
    "team_adj_d":       "Team adjusted defense",
    "dreb_rate":        "Defensive rebounding rate",
    "usg":              "Usage rate",
    "mpg":              "Minutes per game",
    "to":               "Turnover rate",
    "rec":              "High school recruiting rank",
    "ortg":             "Player offensive rating",
    "ts":               "True shooting percentage",
    "ast":              "Assist rate",
    "oreb_rate":        "Offensive rebounding rate",
    "dporpag":          "Defensive PRPG",
    "blk":              "Block rate",
    "stl":              "Steal rate",
    "ftr":              "Free throw rate",
    "efg":              "Effective FG percentage",
    "three_pa_rate":    "3-point attempt rate",
    "g":                "Games played",
    "min":              "Share of team minutes",
    "exp_num":          "Class year",
    "inches":           "Height",
    "team_adj_o":       "Team adjusted offense",
    "pos_num":          "Position",
    "porpag_trend":     "Improvement from last season",
    "obpm":             "Offensive BPM",
    "dbpm":             "Defensive BPM",
}

SHOT_ZONES = ("rim", "mid", "three")


def season_label(year: int) -> str:
    return f"{year - 1}-{str(year)[2:]}"


def tier_levels(season_players: pd.DataFrame, high_major_level: float) -> dict:
    # High-majors are excluded from the per-season player files, so the
    # high-major level comes from app_config rather than this season's data.
    conf_levels = season_players.groupby("conf")["conf_barthag"].first()
    mid_level = float(conf_levels[conf_levels.index.isin(MID_MAJOR_CONFERENCES)].mean())
    low_level = float(conf_levels[~conf_levels.index.isin(MID_MAJOR_CONFERENCES)].mean())
    return {
        "Low-Major":  round(low_level, 3),
        "Mid-Major":  round(mid_level, 3),
        "High-Major": round(high_major_level, 3),
    }


def conf_tier(conf: str) -> str:
    if conf in HIGH_MAJOR_CONFERENCES:
        return "high"
    if conf in MID_MAJOR_CONFERENCES:
        return "mid"
    return "low"


def project(players: pd.DataFrame, dest_level: float, model) -> pd.DataFrame:
    df = players.copy()
    df["destination_level"] = dest_level
    feat_cols = [c for c in FEATURE_COLS if c in df.columns]
    df["projected_porpag"] = model.predict(df[feat_cols])
    return add_gem_score(df)


def contributions(players: pd.DataFrame, model) -> tuple[pd.DataFrame, pd.Series]:
    """LightGBM pred_contrib for every row: (per-feature contributions, bias)."""
    feat_cols = [c for c in FEATURE_COLS if c in players.columns]
    X = players[feat_cols].astype(float)
    raw = model.predict(X, pred_contrib=True)
    contribs = pd.DataFrame(raw[:, :-1], index=players.index, columns=feat_cols)
    bias = pd.Series(raw[:, -1], index=players.index)
    return contribs, bias


def top_contributions(contrib_row: pd.Series, n: int = 10) -> pd.Series:
    # Origin PRPG dominates by design; showing what else moves the projection is more useful.
    return (
        contrib_row
        .drop(labels=["porpag"], errors="ignore")
        .sort_values(key=abs, ascending=False)
        .head(n)
    )


def comp_pool(training_pairs: pd.DataFrame, current_season: int) -> pd.DataFrame:
    """Completed moves up to a high-major whose outcomes were known before `current_season`."""
    return training_pairs[
        (training_pairs["to_conf"].isin(HIGH_MAJOR_CONFERENCES))
        & (training_pairs["dest_season"] < current_season)
    ]


def find_comps(
    player_row: pd.Series,
    pool: pd.DataFrame,
    hist_preds: pd.DataFrame | None,
    n: int = 3,
) -> pd.DataFrame:
    """
    The n most similar completed upward-to-high-major transfers by weighted L2
    distance on COMP_FEATURES, min-max normalised across the pool. A missing
    porpag_trend is imputed to 0 (no prior season = neutral trend) so first-year
    players stay in the pool.
    """
    pool = pool[pool["player"] != player_row.get("player", "")].copy()

    cols = [c for c in COMP_FEATURES if c in pool.columns and c in player_row.index]
    w = np.array([COMP_WEIGHTS[COMP_FEATURES.index(c)] for c in cols])

    non_imputable = [c for c in cols if c != "porpag_trend"]
    pool = pool.dropna(subset=non_imputable)
    pool["porpag_trend"] = pool["porpag_trend"].fillna(0)

    mins = pool[cols].min()
    maxs = pool[cols].max()
    rng = (maxs - mins).replace(0, 1)
    pool_scaled = (pool[cols] - mins) / rng

    target = pd.to_numeric(player_row[cols], errors="coerce").fillna(0)
    target_scaled = (target - mins) / rng

    pool["_dist"] = np.sqrt((w * (pool_scaled - target_scaled) ** 2).sum(axis=1))

    # One row per origin season can feed the same destination; keep the closest per transfer.
    pool = pool.sort_values("_dist").drop_duplicates(subset=["player", "dest_season"], keep="first")
    nearest = pool.nsmallest(n, "_dist")

    # projected_porpag only exists for out-of-fold predictions (dest_season >= 2020).
    nearest["actual_porpag"] = nearest["target"]
    if hist_preds is not None:
        nearest = nearest.merge(
            hist_preds[["player", "season", "dest_season", "projected_porpag"]],
            on=["player", "season", "dest_season"],
            how="left",
        )
    else:
        nearest["projected_porpag"] = np.nan

    return nearest[["id", "player", "from_team", "from_conf", "to_team", "to_conf", "season",
                    "dest_season", "porpag", "projected_porpag", "actual_porpag"]].reset_index(drop=True)


def shot_zones(player_row: pd.Series) -> dict | None:
    """Share of field-goal attempts and make rate per zone; None when zone data is missing."""
    fga = pd.to_numeric(player_row.get("fga"), errors="coerce")
    attempts = {z: pd.to_numeric(player_row.get(f"{z}_a"), errors="coerce") for z in SHOT_ZONES}
    if pd.isna(fga) or fga == 0 or any(pd.isna(a) for a in attempts.values()):
        return None
    zones = {}
    for z in SHOT_ZONES:
        pct = pd.to_numeric(player_row.get(f"{z}_pct"), errors="coerce")
        zones[z] = {
            "share": attempts[z] / fga,
            "pct": None if pd.isna(pct) else float(pct),
            "made": pd.to_numeric(player_row.get(f"{z}_m"), errors="coerce"),
            "att": attempts[z],
        }
    return zones
