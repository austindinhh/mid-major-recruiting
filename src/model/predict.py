"""
Inference: project current-season non-high-major players to a target competition level.
"""

import pandas as pd

from ..config import HIGH_MAJOR_CONFERENCES, LAST_SEASON
from ..features.build import FEATURE_COLS
from .train import load_lgbm, load_stat_models


def get_target_level(teams: pd.DataFrame, season: int) -> float:
    """Mean barthag of all high-major teams in `season`."""
    hm = teams[
        (teams["year"] == season) &
        (teams["conf"].isin(HIGH_MAJOR_CONFERENCES))
    ]
    return float(hm["barthag"].mean())


def project_players(
    players: pd.DataFrame,
    teams: pd.DataFrame,
    season: int = LAST_SEASON,
    destination_level: float | None = None,
) -> pd.DataFrame:
    """
    For every non-high-major player in `season`, project their PORPAG at
    `destination_level`. Returns the filtered DataFrame with projected_porpag added.
    """
    lgbm = load_lgbm()
    if lgbm is None:
        raise FileNotFoundError("Run scripts/run_pipeline.py to train the model first.")

    if destination_level is None:
        destination_level = get_target_level(teams, season)

    players = players[
        (players["year"] == season) &
        (~players["conf"].isin(HIGH_MAJOR_CONFERENCES))
    ].copy()

    players["origin_level"] = players["conf_barthag"]
    players["destination_level"] = destination_level

    feat_cols = [c for c in FEATURE_COLS if c in players.columns]
    players["projected_porpag"] = lgbm.predict(players[feat_cols])
    return players


def project_box_stats(players: pd.DataFrame, destination_level: float) -> pd.DataFrame:
    """
    Adds projected_ppg, projected_rpg, projected_apg, projected_spg, projected_bpg columns.
    Uses the LightGBM stat translation models trained alongside the main model.
    """
    stat_models = load_stat_models()
    if stat_models is None:
        return players
    players = players.copy()
    players["destination_level"] = destination_level
    for stat, model_info in stat_models.items():
        model = model_info["model"]
        feat_cols = model_info["feature_cols"]
        available = [f for f in feat_cols if f in players.columns]
        if not available:
            continue
        players[f"projected_{stat}"] = model.predict(players[available])
    return players
