"""
CLI entry point: fetch -> features -> train.
Run from the repo root: python scripts/run_pipeline.py [--refresh | --refresh-all]
--refresh downloads the current season again to pick up new games; --refresh-all downloads every
season, which catches BartTorvik's occasional revisions to past seasons.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import FIRST_SEASON, LAST_SEASON, MODEL_LGBM_PATH
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
    train_stat_models,
    save_stat_models,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--refresh", action="store_true", help=f"download {LAST_SEASON} again")
    group.add_argument("--refresh-all", action="store_true", help="download every season again")
    args = parser.parse_args()
    years = list(range(FIRST_SEASON, LAST_SEASON + 1)) if args.refresh_all else [LAST_SEASON] if args.refresh else None
    refresh = years is not None

    print("=== Step 1: Fetch data ===")
    player_seasons = fetch_player_seasons(refresh=years)
    transfers = fetch_transfers(force=refresh)
    teams = fetch_teams(refresh=years)

    print("\n=== Step 2: Build features ===")
    saved = load_pairs()
    pairs = None if refresh else saved
    # Rebuild if box stat columns are absent (origin or destination)
    if pairs is None or "dest_ppg" not in pairs.columns or "ppg" not in pairs.columns:
        players = build_player_features(player_seasons, teams)
        pairs = build_transfer_pairs(players, transfers)
        # A refresh of a season still in progress adds no training pairs, so the saved models stand.
        if refresh and saved is not None and pairs.equals(saved) and MODEL_LGBM_PATH.exists():
            print("\nTraining pairs unchanged; keeping the saved models. Run generate_board.py for new projections.")
            return
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

    print("\n=== Step 4: Train box stat translation models ===")
    stat_models, stat_scores = train_stat_models(pairs)
    save_stat_models(stat_models)

    all_scores = {
        "naive": naive_scores,
        "ridge": ridge_scores,
        "lgbm": lgbm_scores,
        "stat_models": stat_scores,
    }
    save_models(ridge, lgbm, all_scores)
    print("\nDone.")


if __name__ == "__main__":
    main()
