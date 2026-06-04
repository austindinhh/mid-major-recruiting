"""
Sanity-check each pipeline phase.
Run from the repo root: python scripts/validate_phase.py --phase N

Phase 1: data cache files exist with expected shapes and key columns
Phase 2: training pairs have expected coverage, NaN rates, and competition-delta variance
Phase 3: model artifacts exist and beat the naive baseline (not yet implemented)
"""

import sys
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _check(label: str, passed: bool) -> bool:
    status = "PASS" if passed else "FAIL"
    print(f"  [{status}] {label}")
    return passed


def validate_phase1() -> bool:
    from src.data.cache import load
    from src.config import PLAYER_SEASONS_PATH, TEAMS_PATH, TRANSFERS_PATH

    print("Phase 1: data cache")
    ok = True

    ps = load(PLAYER_SEASONS_PATH)
    ok &= _check("player_seasons.parquet exists", ps is not None)
    if ps is not None:
        ok &= _check("player_seasons >= 50k rows", len(ps) >= 50_000)
        ok &= _check("player_seasons has porpag", "porpag" in ps.columns)
        ok &= _check("player_seasons has usg", "usg" in ps.columns)
        years = set(ps["year"].dropna().astype(int).unique())
        ok &= _check("years 2012-2023 present", set(range(2012, 2024)).issubset(years))

    teams = load(TEAMS_PATH)
    ok &= _check("teams.parquet exists", teams is not None)
    if teams is not None:
        ok &= _check("teams has team column", "team" in teams.columns)
        ok &= _check("teams.team has no NaN", teams["team"].notna().all())
        ok &= _check("teams >= 4000 rows", len(teams) >= 4_000)

    transfers = load(TRANSFERS_PATH)
    ok &= _check("transfers.parquet exists", transfers is not None)
    if transfers is not None:
        ok &= _check("transfers >= 5000 pairs", len(transfers) >= 5_000)
        ok &= _check("transfers has dest_season", "dest_season" in transfers.columns)

    return ok


def validate_phase2() -> bool:
    import pandas as pd
    from src.config import TRAINING_PAIRS_PATH, TARGET_METRIC

    print("Phase 2: training pairs")
    ok = True

    ok &= _check("training_pairs.parquet exists", TRAINING_PAIRS_PATH.exists())
    if not TRAINING_PAIRS_PATH.exists():
        return ok

    pairs = pd.read_parquet(TRAINING_PAIRS_PATH)
    ok &= _check("training pairs >= 5000 rows", len(pairs) >= 5_000)
    ok &= _check("has target column", "target" in pairs.columns)
    ok &= _check("target not all NaN", pairs["target"].notna().mean() > 0.8)

    # Key feature columns
    for col in [TARGET_METRIC, "usg", "ortg", "origin_level", "destination_level"]:
        if col in pairs.columns:
            pct = pairs[col].notna().mean()
            ok &= _check(f"{col} fill rate > 70% (got {pct:.0%})", pct > 0.70)
        else:
            ok &= _check(f"{col} present", False)

    # Competition delta has real variance (model can learn from it)
    if "origin_level" in pairs.columns and "destination_level" in pairs.columns:
        delta = pairs["destination_level"] - pairs["origin_level"]
        ok &= _check("competition delta has variance", delta.std() > 0.01)
        n_up = (delta > 0.01).sum()
        n_down = (delta < -0.01).sum()
        ok &= _check(f"upward transfers present (n={n_up})", n_up >= 500)
        ok &= _check(f"downward transfers present (n={n_down})", n_down >= 500)

    # Target distribution sanity
    target = pairs["target"].dropna()
    ok &= _check(
        f"target range plausible ({target.min():.1f} to {target.max():.1f})",
        -5 < target.min() and target.max() < 15,
    )

    print(f"\n  Pairs: {len(pairs):,} | Target mean: {pairs['target'].mean():.3f} | std: {pairs['target'].std():.3f}")
    return ok


def validate_phase3() -> bool:
    import json
    from src.config import MODEL_LGBM_PATH, MODEL_RIDGE_PATH, MODEL_SCORES_PATH

    print("Phase 3: models")
    ok = True

    ok &= _check("lgbm.pkl exists", MODEL_LGBM_PATH.exists())
    ok &= _check("ridge.pkl exists", MODEL_RIDGE_PATH.exists())
    ok &= _check("scores.json exists", MODEL_SCORES_PATH.exists())

    if not MODEL_SCORES_PATH.exists():
        return ok

    with open(MODEL_SCORES_PATH) as f:
        scores = json.load(f)

    naive_mae = scores["naive"]["mae"]
    ridge_mae = scores["ridge"]["mae"]
    lgbm_mae  = scores["lgbm"]["mae"]

    ok &= _check(f"LightGBM beats naive (lgbm={lgbm_mae:.3f} < naive={naive_mae:.3f})", lgbm_mae < naive_mae)
    ok &= _check(f"Ridge beats naive   (ridge={ridge_mae:.3f} < naive={naive_mae:.3f})", ridge_mae < naive_mae)
    # LightGBM should be within 5% of Ridge (they can tie on small datasets)
    ok &= _check(
        f"LightGBM within 5% of Ridge MAE (got {abs(lgbm_mae - ridge_mae) / ridge_mae:.1%})",
        abs(lgbm_mae - ridge_mae) / ridge_mae < 0.05,
    )
    ok &= _check(f"LightGBM MAE < 0.95 (got {lgbm_mae:.3f})", lgbm_mae < 0.95)

    print(f"\n  Naive MAE={naive_mae:.3f} | Ridge MAE={ridge_mae:.3f} | LightGBM MAE={lgbm_mae:.3f}")
    return ok


PHASES = {1: validate_phase1, 2: validate_phase2, 3: validate_phase3}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", type=int, required=True, choices=[1, 2, 3])
    args = parser.parse_args()

    passed = PHASES[args.phase]()
    print()
    if passed:
        print(f"Phase {args.phase}: all checks passed.")
    else:
        print(f"Phase {args.phase}: some checks FAILED — review output above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
