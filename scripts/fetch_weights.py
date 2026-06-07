"""
One-time (or occasional) script to fetch player weight data from Sports Reference.
Builds data/weight_data.parquet incrementally — safe to re-run; only new players
are fetched, existing entries are preserved.

Run from repo root:
    python scripts/fetch_weights.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.fetch import fetch_player_seasons, fetch_teams
from src.data.portal import fetch_player_weights
from src.features.build import enrich_player_seasons


def main() -> None:
    print("Loading enriched player data...")
    ps = fetch_player_seasons()
    teams = fetch_teams()
    enriched = enrich_player_seasons(ps, teams)
    print(f"  {len(enriched):,} player-seasons, {enriched['player'].nunique():,} unique players")

    fetch_player_weights(enriched)
    print("\nDone. Re-run generate_board.py to apply weight data to the scouting boards.")


if __name__ == "__main__":
    main()
