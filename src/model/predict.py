"""
Inference: project current-season non-high-major players to a target competition level.
"""

import pandas as pd

from ..config import HIGH_MAJOR_CONFERENCES, MID_MAJOR_CONFERENCES, LAST_SEASON
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
    Uses the stat translation Ridge models trained alongside the main LightGBM.
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


def add_gem_score(players: pd.DataFrame) -> pd.DataFrame:
    """
    Adds obscurity (0–1) and gem_score = projected_porpag × obscurity.
    Obscurity is high when a player is unrecruited AND in an unscouted conference.
    """
    # Recruit obscurity: NaN (unranked) → 1.0, rec=100 → 0.0
    rec_norm = players["rec"].fillna(0).clip(0, 100) / 100
    recruit_obs = 1 - rec_norm

    def _conf_obs(conf: str) -> float:
        if conf in HIGH_MAJOR_CONFERENCES:
            return 0.2
        if conf in MID_MAJOR_CONFERENCES:
            return 0.6
        return 1.0

    conf_obs = players["conf"].map(_conf_obs)

    players["obscurity"] = (0.5 * recruit_obs + 0.5 * conf_obs).round(3)
    players["gem_score"] = (
        players["projected_porpag"].clip(lower=0) * players["obscurity"]
    ).round(3)
    return players
