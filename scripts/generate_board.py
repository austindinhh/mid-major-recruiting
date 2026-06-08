"""
Generates scouting boards and per-season enriched inference files for the app.

  gems      — projected PORPAG x obscurity (players nobody is looking at)
  transfers — raw projected PORPAG (best available regardless of fame)

Run: python scripts/generate_board.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import json
import pandas as pd
from src.config import DATA_DIR, FIRST_SEASON, HIGH_MAJOR_CONFERENCES, LAST_SEASON
from src.data.fetch import fetch_player_seasons, fetch_teams
from src.features.build import enrich_player_seasons
from src.model.predict import project_players, add_gem_score, get_target_level

GEMS_PATH         = DATA_DIR / "board_gems.parquet"
TRANSFERS_PATH    = DATA_DIR / "board_transfers.parquet"
APP_CONFIG_PATH   = DATA_DIR / "app_config.json"
HIST_PREDS_PATH   = DATA_DIR / "historical_predictions.parquet"

DISPLAY_COLS = ["player", "pos", "team", "conf", "porpag", "projected_porpag"]


def _save_enriched(enriched: pd.DataFrame, season: int) -> int:
    enriched_app = enriched[
        (enriched["year"] == season) &
        (~enriched["conf"].isin(HIGH_MAJOR_CONFERENCES))
    ].copy()
    enriched_app["origin_level"] = enriched_app["conf_barthag"]
    path = DATA_DIR / f"enriched_{season}.parquet"
    enriched_app.to_parquet(path, index=False)
    return len(enriched_app)


def generate_boards(
    season: int = LAST_SEASON,
    enriched: pd.DataFrame | None = None,
    teams: pd.DataFrame | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    if enriched is None or teams is None:
        ps = fetch_player_seasons()
        teams = fetch_teams()
        enriched = enrich_player_seasons(ps, teams)

    target_level = get_target_level(teams, season)
    print(f"[board] {season}: projecting to high-major level {target_level:.4f}")

    players = project_players(enriched, teams, season=season, destination_level=target_level)
    players = add_gem_score(players)

    # Remove players who have exhausted their eligibility (5+ seasons played).
    # Seniors with fewer than 5 seasons are still eligible as grad transfers.
    if "seasons_played" in players.columns:
        before = len(players)
        players = players[players["seasons_played"] < 5]
        print(f"[board] {season}: removed {before - len(players)} ineligible players (5+ seasons played)")

    save_cols = [
        "player", "pos", "team", "conf", "year",
        "porpag", "projected_porpag",
        "usg", "ortg", "ts", "ast", "to", "blk", "stl",
        "origin_level", "destination_level",
        "rec", "obscurity", "gem_score",
        "exp", "seasons_played", "inches", "id",
    ]
    save_cols = [c for c in save_cols if c in players.columns]

    gems = (
        players[players["projected_porpag"] > 0][save_cols]
        .sort_values("gem_score", ascending=False)
        .reset_index(drop=True)
    )
    transfers = (
        players[save_cols]
        .sort_values("projected_porpag", ascending=False)
        .reset_index(drop=True)
    )

    if season == LAST_SEASON:
        gems.to_parquet(GEMS_PATH, index=False)
        transfers.to_parquet(TRANSFERS_PATH, index=False)

    n_rows = _save_enriched(enriched, season)
    print(f"[board] {season}: {len(gems)} gems | {len(transfers)} transfers | {n_rows} inference rows")
    return gems, transfers


def generate_historical_predictions() -> None:
    from src.features.build import FEATURE_COLS
    from src.model.train import load_lgbm

    lgbm = load_lgbm()
    if lgbm is None:
        print("[board] Skipping historical predictions: model not found.")
        return

    pairs = pd.read_parquet(DATA_DIR / "training_pairs.parquet")
    sub = pairs[pairs["dest_season"] >= 2020].copy()

    feat_cols = [c for c in FEATURE_COLS if c in sub.columns]
    sub["projected_porpag"] = lgbm.predict(sub[feat_cols])
    sub["actual_porpag"] = sub["target"]
    sub["error"] = sub["actual_porpag"] - sub["projected_porpag"]

    out = sub[[
        "player", "from_team", "from_conf", "to_team", "to_conf",
        "season", "dest_season", "projected_porpag", "actual_porpag", "error"
    ]].reset_index(drop=True)

    out.to_parquet(HIST_PREDS_PATH, index=False)
    print(f"[board] historical_predictions: {len(out):,} rows -> {HIST_PREDS_PATH.name}")


def main() -> None:
    ps = fetch_player_seasons()
    teams = fetch_teams()
    enriched = enrich_player_seasons(ps, teams)

    available_seasons = sorted(
        enriched["year"].dropna().astype(int).unique().tolist()
    )

    for season in available_seasons:
        generate_boards(season=season, enriched=enriched, teams=teams)

    # High-major level for the default (most recent) season
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
