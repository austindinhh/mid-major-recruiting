"""
Phase 4: generates two scouting boards for the current season.

  gems      — projected PORPAG x obscurity (players nobody is looking at)
  transfers — raw projected PORPAG (best available regardless of fame)

Run: python scripts/generate_board.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import json
import pandas as pd
from src.config import DATA_DIR, HIGH_MAJOR_CONFERENCES, LAST_SEASON
from src.data.fetch import fetch_player_seasons, fetch_teams
from src.features.build import enrich_player_seasons
from src.model.predict import project_players, add_gem_score, get_target_level

GEMS_PATH      = DATA_DIR / "board_gems.parquet"
TRANSFERS_PATH = DATA_DIR / "board_transfers.parquet"
ENRICHED_PATH  = DATA_DIR / "enriched_2023.parquet"
APP_CONFIG_PATH = DATA_DIR / "app_config.json"

DISPLAY_COLS = ["player", "pos", "team", "conf", "porpag", "projected_porpag"]


def generate_boards(season: int = LAST_SEASON) -> tuple[pd.DataFrame, pd.DataFrame]:
    ps = fetch_player_seasons()
    teams = fetch_teams()
    enriched = enrich_player_seasons(ps, teams)

    target_level = get_target_level(teams, season)
    print(f"[board] Projecting to high-major level {target_level:.4f} (avg barthag, {season})")

    players = project_players(enriched, teams, season=season, destination_level=target_level)
    players = add_gem_score(players)

    save_cols = [
        "player", "pos", "team", "conf", "year",
        "porpag", "projected_porpag",
        "usg", "ortg", "ts", "ast", "to", "blk", "stl",
        "origin_level", "destination_level",
        "rec", "obscurity", "gem_score",
        "exp", "inches", "id",
    ]
    save_cols = [c for c in save_cols if c in players.columns]

    gems = (
        players[players["projected_porpag"] > 0]
        [save_cols]
        .sort_values("gem_score", ascending=False)
        .reset_index(drop=True)
    )
    transfers = (
        players[save_cols]
        .sort_values("projected_porpag", ascending=False)
        .reset_index(drop=True)
    )

    gems.to_parquet(GEMS_PATH, index=False)
    transfers.to_parquet(TRANSFERS_PATH, index=False)

    # Save inference data for the Streamlit app: enriched 2023 non-HM players
    # with origin_level set and all feature columns present, but NO destination_level
    # or projected_porpag (those are computed at runtime from the slider).
    enriched_app = enriched[
        (enriched["year"] == season) &
        (~enriched["conf"].isin(HIGH_MAJOR_CONFERENCES))
    ].copy()
    enriched_app["origin_level"] = enriched_app["conf_barthag"]
    enriched_app.to_parquet(ENRICHED_PATH, index=False)

    app_cfg = {"default_dest_level": round(target_level, 4), "season": season}
    with open(APP_CONFIG_PATH, "w") as f:
        json.dump(app_cfg, f)

    print(f"[board] Saved {len(gems)} gems | {len(transfers)} total transfers | {len(enriched_app)} inference rows")
    return gems, transfers


def _print_board(df: pd.DataFrame, title: str, n: int = 25) -> None:
    extra = ["gem_score"] if "gem_score" in df.columns and title == "Hidden Gems" else []
    cols = DISPLAY_COLS + extra
    print(f"\n=== {title} (top {n}) ===")
    print(df[cols].head(n).to_string())


def main() -> None:
    gems, transfers = generate_boards()
    _print_board(gems, "Hidden Gems")
    _print_board(transfers, "Best Transfers (all non-high-major)")


if __name__ == "__main__":
    main()
