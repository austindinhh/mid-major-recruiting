"""
Phase 2: feature engineering and training pair construction.

Pipeline:
  enrich_player_seasons()  — joins team ratings, computes derived columns
  build_transfer_pairs()   — creates one row per transfer: origin features + target
  get_feature_matrix()     — extracts X (features) and y (target) for the model
"""

import numpy as np
import pandas as pd

from ..config import TARGET_METRIC, TRAINING_PAIRS_PATH

# Exact column names as they appear after enrichment
FEATURE_COLS = [
    # Core value metric at origin (the single most predictive feature)
    TARGET_METRIC,
    # Usage / role
    "usg", "min", "mpg", "g",
    # Offensive efficiency
    "ortg", "ts", "efg", "three_pa_rate", "ft_pct", "ftr",
    # Distributional skills
    "ast", "to",
    # Defensive contributions
    "oreb_rate", "dreb_rate", "blk", "stl",
    # Player profile
    "exp_num",    # Fr=1, So=2, Jr=3, Sr=4, Gr=5
    "inches",
    "pos_num",    # guard=1, wing=2, forward=3, post=4
    # Recruit visibility proxy (higher = less hidden)
    "rec",
    # Team-level competition context
    "team_barthag", "team_adj_o", "team_adj_d", "team_ov_sos",
    # Competition delta — the critical feature for the translation function
    "origin_level",       # mean barthag of origin conference that year
    "destination_level",  # mean barthag of destination conference that year
]

_EXP_MAP = {"Fr": 1, "So": 2, "Jr": 3, "Sr": 4, "Gr": 5}

# Position labels from BartTorvik → ordinal (center of gravity on floor)
_POS_MAP = {
    "Pure PG": 1, "Scoring PG": 1,
    "Combo G": 2, "Wing G": 2,
    "Wing F": 3,  "Stretch 4": 3,
    "PF/C": 4,    "C": 4,
}


def _conf_levels(teams: pd.DataFrame) -> pd.DataFrame:
    """
    Returns a (conf, year, conf_barthag) table: mean barthag of all teams
    in each conference per season. Used as a data-driven competition level.
    """
    return (
        teams.groupby(["conf", "year"])["barthag"]
        .mean()
        .reset_index()
        .rename(columns={"barthag": "conf_barthag"})
    )


def enrich_player_seasons(
    player_seasons: pd.DataFrame,
    teams: pd.DataFrame,
) -> pd.DataFrame:
    ps = player_seasons.copy()

    # Normalize year to int for consistent joins
    ps["year"] = ps["year"].astype(int)
    teams = teams.copy()
    teams["year"] = teams["year"].astype(int)

    # Derived shooting feature
    ps["three_pa_rate"] = ps["three_a"] / ps["fga"].replace(0, np.nan)

    # Encode experience
    ps["exp_num"] = ps["exp"].map(_EXP_MAP)

    # Encode position
    ps["pos_num"] = ps["pos"].map(_POS_MAP)

    # Join team-level ratings (barthag, adj_o, adj_d, sos)
    team_feats = teams[["team", "year", "barthag", "adj_o", "adj_d", "ov_cur_sos"]].rename(
        columns={
            "barthag": "team_barthag",
            "adj_o": "team_adj_o",
            "adj_d": "team_adj_d",
            "ov_cur_sos": "team_ov_sos",
        }
    )
    ps = ps.merge(team_feats, on=["team", "year"], how="left")

    # Attach conference competition level
    conf_lvl = _conf_levels(teams)
    ps = ps.merge(conf_lvl, on=["conf", "year"], how="left")

    print(
        f"[features] Enriched {len(ps):,} player-seasons | "
        f"team join fill rate: {ps['team_barthag'].notna().mean():.1%} | "
        f"conf level fill rate: {ps['conf_barthag'].notna().mean():.1%}"
    )
    return ps


def build_transfer_pairs(
    enriched: pd.DataFrame,
    transfers: pd.DataFrame,
) -> pd.DataFrame:
    """
    Produces one row per transfer event:
      - All FEATURE_COLS drawn from the player's origin season
      - origin_level  = conf_barthag at origin (already in enriched)
      - destination_level = conf_barthag at destination (from dest-year row)
      - target = TARGET_METRIC value in the destination season

    Includes lateral and downward transfers so the model learns the full
    competition-delta range, not just upward jumps.
    """
    transfers = transfers.copy()
    transfers["season"] = transfers["season"].astype(int)
    transfers["dest_season"] = transfers["dest_season"].astype(int)

    # Origin stats: everything except conf_barthag (renamed below)
    origin_cols = (
        ["id", "year"]
        + [c for c in FEATURE_COLS if c not in ("origin_level", "destination_level")]
        + ["conf_barthag"]
    )
    origin = enriched[[c for c in origin_cols if c in enriched.columns]].copy()
    origin = origin.rename(columns={"year": "season", "conf_barthag": "origin_level"})

    pairs = transfers.merge(origin, on=["id", "season"], how="inner")

    # Destination: target value + destination conference level
    dest = enriched[["id", "year", TARGET_METRIC, "conf_barthag"]].copy()
    dest = dest.rename(
        columns={
            "year": "dest_season",
            TARGET_METRIC: "target",
            "conf_barthag": "destination_level",
        }
    )
    pairs = pairs.merge(dest, on=["id", "dest_season"], how="inner")

    n_up = (pairs["destination_level"] > pairs["origin_level"]).sum()
    n_lat = (pairs["destination_level"] == pairs["origin_level"]).sum()
    n_down = (pairs["destination_level"] < pairs["origin_level"]).sum()

    print(
        f"[features] {len(pairs):,} transfer pairs | "
        f"up: {n_up} | lateral: {n_lat} | down: {n_down}"
    )
    return pairs


def get_feature_matrix(
    pairs: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    """
    Returns (X, y, groups) where groups is player ID for grouped cross-validation.
    """
    available = [c for c in FEATURE_COLS if c in pairs.columns]
    missing = set(FEATURE_COLS) - set(available)
    if missing:
        print(f"[features] Missing columns (will be absent from X): {sorted(missing)}")

    X = pairs[available].copy()
    y = pairs["target"]
    groups = pairs["id"]

    nan_report = X.isna().mean().sort_values(ascending=False)
    high_nan = nan_report[nan_report > 0.2]
    if not high_nan.empty:
        print("[features] Columns with >20% NaN:")
        for col, rate in high_nan.items():
            print(f"  {col}: {rate:.1%}")

    print(
        f"[features] Feature matrix: {X.shape[0]:,} rows x {X.shape[1]} cols | "
        f"target mean={y.mean():.3f} std={y.std():.3f}"
    )
    return X, y, groups


def save_pairs(pairs: pd.DataFrame) -> None:
    pairs.to_parquet(TRAINING_PAIRS_PATH, index=False)
    print(f"[features] Saved {len(pairs):,} training pairs to {TRAINING_PAIRS_PATH.name}")


def load_pairs() -> pd.DataFrame | None:
    if TRAINING_PAIRS_PATH.exists():
        print(f"[features] Loading training pairs from cache")
        return pd.read_parquet(TRAINING_PAIRS_PATH)
    return None
