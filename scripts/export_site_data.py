"""
Writes the precomputed JSON the static site reads, into web/public/data/:

  seasons.json                      seasons, default season, tier levels (written last)
  {season}/board.json               one row per eligible player, board columns + percentiles
  {season}/players/{id}.json        career, shot zones, drivers, comps, projected box stats
  {season}/zone_averages.json       D1 make rate and shot share by zone and position

Run: python scripts/export_site_data.py [--seasons 2025 2026]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import json
import math
import shutil
from datetime import date

import numpy as np
import pandas as pd

from src.config import (
    APP_CONFIG_PATH, BOARD_EXPORT_COLS, DATA_DIR, HIST_PREDS_PATH, LOWER_IS_BETTER, MID_MAJOR_CONFERENCES, MIN_GAMES,
    PERCENTILE_COLS, PLAYER_SEASONS_PATH, PLAYER_STAT_COLS, SITE_DATA_DIR, TRAINING_PAIRS_PATH,
)
from src.model.scouting import (
    FEATURE_LABELS, SHOT_ZONES, comp_pool, conf_tier, contributions, find_comps, project,
    season_label, shot_zones, tier_levels, top_contributions,
)
from src.model.train import load_lgbm

BOX_STATS = ["ppg", "rpg", "apg", "spg", "bpg"]
CAREER_COLS = ["year", "team", "conf", "g", "mpg", "ppg", "porpag", "dporpag", "usg", "ts", "ast"]


def _clean(v):
    """JSON-safe scalar: NaN/inf become null, numpy types become Python types, floats rounded."""
    if v is None:
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        if not math.isfinite(v):
            return None
        return round(float(v), 4)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if v is pd.NA or v is pd.NaT:
        return None
    return v


def _deep_clean(obj):
    if isinstance(obj, dict):
        return {k: _deep_clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_deep_clean(v) for v in obj]
    return _clean(obj)


def _write(path: Path, obj) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(_deep_clean(obj), separators=(",", ":"), allow_nan=False)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def position_percentiles(board: pd.DataFrame) -> pd.DataFrame:
    # Mid-rank percentile within position: ties share the average of their ranks.
    out = pd.DataFrame(index=board.index)
    for col in PERCENTILE_COLS:
        pct = board.groupby("pos")[col].rank(pct=True, method="average")
        if col in LOWER_IS_BETTER:
            pct = board.groupby("pos")[col].rank(pct=True, method="average", ascending=False)
        out[f"pct_{col}"] = (pct * 100).round()
    return out


def zone_averages(player_seasons: pd.DataFrame, season: int) -> dict:
    d1 = player_seasons[player_seasons["year"] == season]
    out = {}
    for pos, grp in list(d1.groupby("pos")) + [("all", d1)]:
        fga = grp["fga"].sum()
        out[pos] = {
            z: {
                "pct": grp[f"{z}_m"].sum() / grp[f"{z}_a"].sum() if grp[f"{z}_a"].sum() else None,
                "share": grp[f"{z}_a"].sum() / fga if fga else None,
            }
            for z in SHOT_ZONES
        }
    return out


def prediction_vs_reality(row: pd.Series, career: pd.DataFrame, hist_preds: pd.DataFrame) -> dict | None:
    # hist_preds has no player id, so require the origin team and season to be in this player's career.
    stints = set(zip(career["team"], career["year"].astype(int)))
    hp = hist_preds[hist_preds["player"] == row["player"]]
    hp = hp[[(t, int(s)) in stints for t, s in zip(hp["from_team"], hp["season"])]]
    if hp.empty:
        return None
    latest = hp.sort_values(["dest_season", "season"], ascending=[False, False]).iloc[0]
    return {
        "from_team": latest["from_team"], "from_conf": latest["from_conf"],
        "to_team": latest["to_team"], "to_conf": latest["to_conf"],
        "season": latest["season"], "dest_season": latest["dest_season"],
        "projected_porpag": latest["projected_porpag"], "actual_porpag": latest["actual_porpag"],
        "error": latest["error"],
    }


def export_season(season, dest_level, model, player_seasons, training_pairs, hist_preds, out_dir) -> dict:
    players = pd.read_parquet(DATA_DIR / f"players_{season}.parquet")
    tiers = tier_levels(players, dest_level)
    projected = project(players, tiers["High-Major"], model)

    board = projected[projected["g"] >= MIN_GAMES].sort_values("projected_porpag", ascending=False).copy()
    board["rank"] = range(1, len(board) + 1)
    board = board.join(position_percentiles(board))
    board["id"] = board["id"].astype(int)

    cols = ["rank"] + BOARD_EXPORT_COLS + [f"pct_{c}" for c in PERCENTILE_COLS]
    season_dir = out_dir / str(season)
    if season_dir.exists():
        shutil.rmtree(season_dir)
    board_bytes = _write(season_dir / "board.json", {
        "season": season,
        "columns": cols,
        "rows": board[cols].to_numpy().tolist(),
    })
    _write(season_dir / "zone_averages.json", zone_averages(player_seasons, season))

    contribs, bias = contributions(board, model)
    pool = comp_pool(training_pairs, season)
    careers = player_seasons.groupby("id")
    player_bytes = 0
    for idx, row in board.iterrows():
        pid = int(row["id"])
        career = careers.get_group(pid).sort_values("year") if pid in careers.groups else player_seasons.iloc[0:0]
        top = top_contributions(contribs.loc[idx])
        comps = find_comps(row, pool, hist_preds)
        zones = shot_zones(row)
        player_bytes += _write(season_dir / "players" / f"{pid}.json", {
            "id": pid,
            "season": season,
            "rank": row["rank"],
            "bio": {k: row.get(k) for k in ["player", "pos", "team", "conf", "exp", "inches", "g", "seasons_played"]},
            "projection": {
                "projected_porpag": row["projected_porpag"],
                "porpag": row["porpag"],
                "dporpag": row["dporpag"],
                "bias": bias.loc[idx],
                "porpag_contribution": contribs.loc[idx].get("porpag"),
            },
            "stats": {c: row.get(c) for c in PLAYER_STAT_COLS},
            "percentiles": {c: row[f"pct_{c}"] for c in PERCENTILE_COLS},
            "box": {s: {"current": row.get(s), "projected": row.get(f"projected_{s}")} for s in BOX_STATS},
            "drivers": [
                {"feature": f, "label": FEATURE_LABELS.get(f, f), "value": v} for f, v in top.items()
            ],
            "zones": zones,
            "career": [
                {**{c: r.get(c) for c in CAREER_COLS}, "season_label": season_label(int(r["year"])),
                 "tier": conf_tier(r["conf"])}
                for _, r in career.iterrows()
            ],
            "comps": [
                {**c, "season_label": season_label(int(c["dest_season"]))}
                for c in comps.to_dict("records")
            ],
            "prediction_vs_reality": prediction_vs_reality(row, career, hist_preds),
        })

    print(f"[export] {season}: {len(board)} players, board {board_bytes / 1024:.0f} KB, "
          f"player files {player_bytes / 1024 / 1024:.1f} MB")
    return {"season": season, "label": season_label(season), "players": len(board), "tiers": tiers,
            "board_bytes": board_bytes, "player_bytes": player_bytes}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seasons", type=int, nargs="*", help="limit to these seasons (default: all in app_config)")
    args = parser.parse_args()

    with open(APP_CONFIG_PATH) as f:
        app_config = json.load(f)
    seasons = args.seasons or app_config["available_seasons"]
    dest_level = app_config["default_dest_level"]

    model = load_lgbm()
    if model is None:
        raise FileNotFoundError("Run scripts/run_pipeline.py to train the model first.")
    player_seasons = pd.read_parquet(PLAYER_SEASONS_PATH)
    training_pairs = pd.read_parquet(TRAINING_PAIRS_PATH)
    hist_preds = pd.read_parquet(HIST_PREDS_PATH)

    SITE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    summaries = [
        export_season(s, dest_level, model, player_seasons, training_pairs, hist_preds, SITE_DATA_DIR)
        for s in sorted(seasons)
    ]

    # seasons.json goes last so a partial export never reaches the site.
    # A --seasons run keeps the entries for seasons it did not touch.
    seasons_path = SITE_DATA_DIR / "seasons.json"
    entries = {}
    if args.seasons and seasons_path.exists():
        entries = {e["season"]: e for e in json.loads(seasons_path.read_text(encoding="utf-8"))["seasons"]}
    entries.update({s["season"]: {k: s[k] for k in ("season", "label", "players", "tiers")} for s in summaries})
    _write(seasons_path, {
        "generated": date.today().isoformat(),
        "default_season": app_config["default_season"],
        "min_games": MIN_GAMES,
        "mid_major_conferences": sorted(MID_MAJOR_CONFERENCES),
        "seasons": [entries[k] for k in sorted(entries, reverse=True)],
    })
    total = sum(f.stat().st_size for f in SITE_DATA_DIR.rglob("*") if f.is_file())
    print(f"[export] wrote {SITE_DATA_DIR} ({total / 1024 / 1024:.1f} MB total)")


if __name__ == "__main__":
    main()
