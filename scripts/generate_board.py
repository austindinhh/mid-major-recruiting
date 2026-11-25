"""
Generates the transfer board (ranked by projected PORPAG) and per-season player files.

Run: python scripts/generate_board.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import json
import pandas as pd
from src.config import DATA_DIR, FIRST_SEASON, HIGH_MAJOR_CONFERENCES, LAST_SEASON
from src.data.fetch import fetch_player_seasons, fetch_teams
from src.features.build import build_player_features
from src.model.predict import project_players, get_target_level, project_box_stats

TRANSFERS_PATH    = DATA_DIR / "board_transfers.parquet"
APP_CONFIG_PATH   = DATA_DIR / "app_config.json"
HIST_PREDS_PATH   = DATA_DIR / "historical_predictions.parquet"

DISPLAY_COLS = ["player", "pos", "team", "conf", "porpag", "projected_porpag"]


def _save_players(players: pd.DataFrame, season: int) -> int:
    season_players = players[
        (players["year"] == season) &
        (~players["conf"].isin(HIGH_MAJOR_CONFERENCES))
    ].copy()
    season_players["origin_level"] = season_players["conf_barthag"]
    path = DATA_DIR / f"players_{season}.parquet"
    season_players.to_parquet(path, index=False)
    return len(season_players)


def generate_boards(
    season: int = LAST_SEASON,
    players: pd.DataFrame | None = None,
    teams: pd.DataFrame | None = None,
) -> pd.DataFrame:
    if players is None or teams is None:
        ps = fetch_player_seasons()
        teams = fetch_teams()
        players = build_player_features(ps, teams)

    target_level = get_target_level(teams, season)
    print(f"[board] {season}: projecting to high-major level {target_level:.4f}")

    projected = project_players(players, teams, season=season, destination_level=target_level)

    # Remove players who have exhausted their eligibility (5+ seasons played).
    # Seniors with fewer than 5 seasons are still eligible as grad transfers.
    if "seasons_played" in projected.columns:
        before = len(projected)
        projected = projected[projected["seasons_played"] < 5]
        print(f"[board] {season}: removed {before - len(projected)} ineligible players (5+ seasons played)")

    projected = project_box_stats(projected, target_level)

    save_cols = [
        "player", "pos", "team", "conf", "year",
        "porpag", "dporpag", "projected_porpag",
        "ppg", "rpg", "apg", "spg", "bpg",
        "projected_ppg", "projected_rpg", "projected_apg", "projected_spg", "projected_bpg",
        "usg", "ortg", "ts", "ast", "to", "blk", "stl",
        "origin_level", "destination_level",
        "rec",
        "exp", "seasons_played", "inches", "id",
        "conf_barthag", "oreb_rate", "dreb_rate", "ftr",
        "rim_a", "rim_m", "rim_pct", "mid_a", "mid_m", "mid_pct",
        "three_a", "three_m", "three_pct", "fga",
        "porpag_trend", "pos_num", "exp_num", "obpm", "dbpm",
    ]
    save_cols = [c for c in save_cols if c in projected.columns]

    transfers = (
        projected[save_cols]
        .sort_values("projected_porpag", ascending=False)
        .reset_index(drop=True)
    )

    if season == LAST_SEASON:
        transfers.to_parquet(TRANSFERS_PATH, index=False)

    n_rows = _save_players(projected, season)
    print(f"[board] {season}: {len(transfers)} transfers | {n_rows} player rows")
    return transfers


def generate_historical_predictions() -> None:
    from sklearn.base import clone
    from sklearn.model_selection import GroupKFold, cross_val_predict
    from src.config import CV_N_FOLDS
    from src.features.build import FEATURE_COLS
    from src.model.train import load_lgbm

    lgbm = load_lgbm()
    if lgbm is None:
        print("[board] Skipping historical predictions: model not found.")
        return

    pairs = pd.read_parquet(DATA_DIR / "training_pairs.parquet")
    feat_cols = [c for c in FEATURE_COLS if c in pairs.columns]

    # Out-of-fold predictions on the same grouped split as training CV; the final
    # model has seen every pair, so scoring it in-sample overstates accuracy.
    pairs["projected_porpag"] = cross_val_predict(
        clone(lgbm), pairs[feat_cols], pairs["target"],
        groups=pairs["id"], cv=GroupKFold(n_splits=CV_N_FOLDS),
    )
    sub = pairs[pairs["dest_season"] >= 2020].copy()
    sub["actual_porpag"] = sub["target"]
    sub["error"] = sub["actual_porpag"] - sub["projected_porpag"]

    out = sub[[
        "player", "from_team", "from_conf", "to_team", "to_conf",
        "season", "dest_season", "projected_porpag", "actual_porpag", "error"
    ]].reset_index(drop=True)

    out.to_parquet(HIST_PREDS_PATH, index=False)
    print(
        f"[board] historical_predictions (out-of-fold): {len(out):,} rows, "
        f"MAE={out['error'].abs().mean():.3f} -> {HIST_PREDS_PATH.name}"
    )


def main() -> None:
    ps = fetch_player_seasons()
    teams = fetch_teams()
    players = build_player_features(ps, teams)

    available_seasons = sorted(
        players["year"].dropna().astype(int).unique().tolist()
    )

    for season in available_seasons:
        generate_boards(season=season, players=players, teams=teams)

    default_level = get_target_level(teams, LAST_SEASON)
    app_cfg = {
        "default_dest_level": round(default_level, 4),
        "default_season": LAST_SEASON,
        "available_seasons": available_seasons,
    }
    with open(APP_CONFIG_PATH, "w") as f:
        json.dump(app_cfg, f, indent=2)

    generate_historical_predictions()
    print(f"\n[board] Done. {len(available_seasons)} seasons | app_config.json updated")


if __name__ == "__main__":
    main()
