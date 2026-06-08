"""
CLI entry point: fetch -> features -> train.
Run from the repo root: python scripts/run_pipeline.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data.fetch import fetch_player_seasons, fetch_transfers, fetch_teams
from src.features.build import (
    build_player_features,
    build_transfer_pairs,
    get_feature_matrix,
    save_pairs,
    load_pairs,
)
from src.model.train import (
    score_naive,
    train_ridge,
    train_lgbm,
    shap_importance,
    save_models,
)


def main() -> None:
    print("=== Step 1: Fetch data ===")
    player_seasons = fetch_player_seasons()
    transfers = fetch_transfers()
    teams = fetch_teams()

    print("\n=== Step 2: Build features ===")
    pairs = load_pairs()
    if pairs is None:
        players = build_player_features(player_seasons, teams)
        pairs = build_transfer_pairs(players, transfers)
        save_pairs(pairs)

    X, y, groups = get_feature_matrix(pairs)

    print("\n=== Step 3: Train models ===")
    naive_scores = score_naive(X, y)
    ridge, ridge_scores = train_ridge(X, y, groups)
    lgbm, lgbm_scores = train_lgbm(X, y, groups)

    naive_mae = naive_scores["mae"]
    improvement = (naive_mae - lgbm_scores["mae"]) / naive_mae * 100
    print(f"\n  LightGBM vs naive: {improvement:+.1f}% MAE improvement")
    print(f"  LightGBM vs Ridge: {(ridge_scores['mae'] - lgbm_scores['mae']):.3f} MAE delta")

    print("\n=== SHAP feature importance ===")
    shap_importance(lgbm, X)

    all_scores = {
        "naive": naive_scores,
        "ridge": ridge_scores,
        "lgbm": lgbm_scores,
    }
    save_models(ridge, lgbm, all_scores)
    print("\nDone.")


if __name__ == "__main__":
    main()
