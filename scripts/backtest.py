"""
Backtest and case studies for the transfer projection model.

backtest()     — projects non-high-major players in season T, checks how many
                 of the top-25 actually transferred up in T+1 and contributed.
case_studies() — finds historical transfers the model projected well that delivered,
                 useful for illustrating model accuracy with named examples.

Run: python scripts/backtest.py

Note: the model is trained on all years including the backtest seasons, so this
is an in-sample check that demonstrates the approach rather than a true holdout.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd
from src.config import HIGH_MAJOR_CONFERENCES, TRANSFERS_PATH
from src.data.fetch import fetch_player_seasons, fetch_teams
from src.data.cache import load
from src.features.build import build_player_features
from src.model.predict import project_players, get_target_level


def backtest(origin_season: int = 2021, dest_season: int = 2022) -> dict:
    ps = fetch_player_seasons()
    teams = fetch_teams()
    transfers = load(TRANSFERS_PATH)
    players = build_player_features(ps, teams)

    target_level = get_target_level(teams, origin_season)
    projected = (
        project_players(players, teams, season=origin_season, destination_level=target_level)
        .sort_values("projected_porpag", ascending=False)
        .reset_index(drop=True)
    )
    top25 = projected.head(25).copy()
    top25["id"] = top25["id"].astype(int)

    actual_up = transfers[
        (transfers["season"] == origin_season) &
        (transfers["dest_season"] == dest_season) &
        (transfers["to_conf"].isin(HIGH_MAJOR_CONFERENCES))
    ].copy()
    actual_up["id"] = actual_up["id"].astype(int)

    hit_ids = set(actual_up["id"])
    hits = top25[top25["id"].isin(hit_ids)].copy()

    dest_stats = (
        ps[ps["year"] == dest_season][["id", "porpag", "team"]]
        .rename(columns={"porpag": "actual_porpag", "team": "dest_team"})
        .copy()
    )
    dest_stats["id"] = dest_stats["id"].astype(int)
    hits = hits.merge(dest_stats, on="id", how="left")

    print(f"\n[backtest] Origin={origin_season} -> Dest={dest_season}")
    print(f"  Top-25 projected who actually transferred up: {len(hits)}/25")

    contributors = hits[hits["actual_porpag"].fillna(0) > 0]
    print(f"  Of those, positive PORPAG contributors: {len(contributors)}")
    if not contributors.empty:
        print(contributors[
            ["player", "team", "dest_team", "porpag", "projected_porpag", "actual_porpag"]
        ].to_string(index=False))

    return {
        "n_transferred_up": len(hits),
        "n_contributors": len(contributors),
    }


def case_studies(n: int = 8) -> pd.DataFrame:
    """
    Finds the most compelling model-validated transfers: high projected PORPAG
    at high-major AND the player actually delivered after moving up.
    """
    ps = fetch_player_seasons()
    teams = fetch_teams()
    transfers = load(TRANSFERS_PATH)
    players = build_player_features(ps, teams)

    rows = []
    for origin_yr in range(2016, 2023):
        dest_yr = origin_yr + 1
        target_level = get_target_level(teams, origin_yr)
        projected = project_players(players, teams, season=origin_yr, destination_level=target_level)
        proj_lookup = projected.set_index("id")["projected_porpag"].to_dict()

        actual_up = transfers[
            (transfers["season"] == origin_yr) &
            (transfers["dest_season"] == dest_yr) &
            (transfers["to_conf"].isin(HIGH_MAJOR_CONFERENCES))
        ]
        for _, t in actual_up.iterrows():
            pid = int(t["id"])
            if pid not in proj_lookup:
                continue
            dest_row = ps[(ps["id"] == pid) & (ps["year"] == dest_yr)]
            if dest_row.empty:
                continue
            rows.append({
                "player":         t["player"],
                "from":           f"{t['from_team']} ({t['from_conf']})",
                "to":             f"{t['to_team']} ({t['to_conf']})",
                "origin_season":  int(origin_yr),
                "origin_porpag":  round(float(t.get("porpag", float("nan"))), 2)
                                  if "porpag" in t else None,
                "proj_porpag":    round(proj_lookup[pid], 2),
                "actual_porpag":  round(float(dest_row["porpag"].iloc[0]), 2),
            })

    df = pd.DataFrame(rows)
    df["proj_error"] = (df["proj_porpag"] - df["actual_porpag"]).abs()

    # Compelling = model was high on them AND they actually delivered
    strong = (
        df[(df["proj_porpag"] > 1.5) & (df["actual_porpag"] > 1.0)]
        .sort_values("actual_porpag", ascending=False)
        .reset_index(drop=True)
    )

    print(f"\n[case studies] Model projected >= 1.5, player delivered >= 1.0 PORPAG ({len(strong)} total)")
    print(f"  Showing top {n}:")
    print(strong[["player", "from", "to", "origin_season", "proj_porpag", "actual_porpag"]].head(n).to_string(index=False))
    return strong


if __name__ == "__main__":
    backtest(origin_season=2021, dest_season=2022)
    backtest(origin_season=2020, dest_season=2021)
    case_studies()
