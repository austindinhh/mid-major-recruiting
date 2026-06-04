"""
CLI entry point: fetch → features → train.
Run from the repo root: python scripts/run_pipeline.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.fetch import fetch_player_seasons, fetch_transfers, fetch_teams
from src.features.build import build_transfer_pairs, get_feature_matrix
from src.model.train import train_ridge, train_lgbm


def main() -> None:
    print("=== Step 1: Fetch data ===")
    player_seasons = fetch_player_seasons()
    transfers = fetch_transfers()
    fetch_teams()

    print("\n=== Step 2: Build features ===")
    pairs = build_transfer_pairs(player_seasons, transfers)
    X, y = get_feature_matrix(pairs)
    groups = pairs["player_id"]

    print(f"Feature matrix: {X.shape[0]:,} rows × {X.shape[1]} cols")

    print("\n=== Step 3: Train models ===")
    train_ridge(X, y, groups)
    train_lgbm(X, y, groups)

    print("\nDone.")


if __name__ == "__main__":
    main()
