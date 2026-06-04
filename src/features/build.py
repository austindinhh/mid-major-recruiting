"""
Constructs before/after transfer pairs and assembles the feature matrix.

Each row = one player's origin season.
Target = that player's value metric in their destination season (after transferring).
"""

import pandas as pd
import numpy as np

from ..config import TARGET_METRIC

# Origin-season features used as model inputs
# Exact column names as they appear in the toRvik-data player season parquet
FEATURE_COLS = [
    # Usage / efficiency
    "usg", "ortg", "ts", "efg",
    "ast", "to", "oreb_rate", "dreb_rate",
    "blk", "stl", "ftr", "three_pa_rate", "ft_pct",
    # Volume / context
    "min", "mpg", "g",
    # Player profile
    "exp_num",    # encoded from exp string: Fr=1, So=2, Jr=3, Sr=4, Gr=5
    "inches",
    # Team / competition context (joined from ratings table)
    "team_barthag", "team_adj_o", "team_adj_d", "team_ov_sos",
    TARGET_METRIC,
    # Competition delta (critical feature)
    "origin_level",
    "destination_level",
]


def build_transfer_pairs(
    player_seasons: pd.DataFrame,
    transfers: pd.DataFrame,
) -> pd.DataFrame:
    """
    Joins transfers with origin and destination season stats.
    Returns a DataFrame with FEATURE_COLS as X and target as y.
    """
    # Merge transfer table with origin-season stats
    origin = player_seasons.copy()
    origin.columns = [f"origin_{c}" if c not in ("player_id", "season") else c
                      for c in origin.columns]

    dest = player_seasons.copy()
    dest.columns = [f"dest_{c}" if c not in ("player_id",) else c
                    for c in dest.columns]
    dest = dest.rename(columns={"season": "dest_season"})

    pairs = transfers.merge(
        origin,
        on=["player_id", "season"],
        how="inner",
    ).merge(
        dest,
        left_on=["player_id", "dest_season"],
        right_on=["player_id", "dest_season"],
        how="inner",
    )

    # Rename for model consumption
    pairs = pairs.rename(columns={
        f"origin_{TARGET_METRIC}": TARGET_METRIC,
        f"dest_{TARGET_METRIC}": "target",
    })

    print(f"[features] Built {len(pairs):,} transfer pairs")
    return pairs


def get_feature_matrix(pairs: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    available = [c for c in FEATURE_COLS if c in pairs.columns]
    missing = set(FEATURE_COLS) - set(available)
    if missing:
        print(f"[features] Warning: missing columns {missing}")

    X = pairs[available].copy()
    y = pairs["target"]
    return X, y
