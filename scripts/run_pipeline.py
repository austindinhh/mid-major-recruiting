"""
CLI entry point: fetch -> features -> train.
Run from the repo root: python scripts/run_pipeline.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.fetch import fetch_player_seasons, fetch_transfers, fetch_teams
from src.features.build import (
    enrich_player_seasons,
    build_transfer_pairs,
    get_feature_matrix,
    save_pairs,
    load_pairs,
)
from src.model.train import train_ridge, train_lgbm


def main() -> None:
    print("=== Step 1: Fetch data ===")
    player_seasons = fetch_player_seasons()
    transfers = fetch_transfers()
    teams = fetch_teams()

    print("\n=== Step 2: Build features ===")
    pairs = load_pairs()
    if pairs is None:
        enriched = enrich_player_seasons(player_seasons, teams)
        pairs = build_transfer_pairs(enriched, transfers)
        save_pairs(pairs)

    X, y, groups = get_feature_matrix(pairs)

    print("\n=== Step 3: Train models ===")
    train_ridge(X, y, groups)
    train_lgbm(X, y, groups)

    print("\nDone.")


if __name__ == "__main__":
    main()
