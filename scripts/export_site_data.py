"""
Writes the precomputed JSON the static site reads, into web/public/data/:

  seasons.json                      seasons, default season, tier levels (written last)
  {season}/board.json               one row per eligible player, board columns + percentiles
  {season}/players/{id}.json        career, shot zones, drivers, comps, projected box stats
  {season}/zone_averages.json       D1 make rate and shot share by zone and position
  methodology.json                  counts, validation scores and feature list for the Methodology page

Run: python scripts/export_site_data.py [--seasons 2025 2026]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import json
import math
import os
import shutil
from concurrent.futures import ProcessPoolExecutor
from datetime import date

import numpy as np
import pandas as pd

from src.config import (
    APP_CONFIG_PATH, BOARD_EXPORT_COLS, EXPORT_WORKERS, COMP_FEATURES, METHODOLOGY_COMP_EXAMPLE, COMP_WEIGHTS, CV_N_FOLDS, DATA_DIR, HIGH_MAJOR_CONFERENCES,
    HIST_PREDS_PATH, MODEL_SCORES_PATH, LOWER_IS_BETTER, MID_MAJOR_CONFERENCES, MIN_GAMES,
    PERCENTILE_COLS, PLAYER_SEASONS_PATH, PLAYER_STAT_COLS, SITE_DATA_DIR, TRAINING_PAIRS_PATH,
)
from src.model.scouting import (
    FEATURE_LABELS, SHOT_ZONES, comp_pool, conf_tier, contributions, find_comps, find_comps_batch, project,
    season_label, shot_zones, tier_levels,
)
from src.features.build import FEATURE_COLS
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


def top_drivers(contribs: pd.DataFrame, n: int = 10) -> dict:
    # Origin PRPG dominates by design; the page shows what else moves each projection, largest first.
    c = contribs.drop(columns=["porpag"], errors="ignore")
    vals, feats = c.to_numpy(), c.columns.to_numpy()
    order = np.argsort(-np.abs(vals), axis=1, kind="stable")[:, :n]
    return {idx: list(zip(feats[o], vals[i, o])) for i, (idx, o) in enumerate(zip(c.index, order))}


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


def prediction_vs_reality(stints: set, hp: pd.DataFrame | None) -> dict | None:
    # hist_preds has no player id, so require the origin team and season to be in this player's career.
    if hp is None:
        return None
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


def comp_demo(training_pairs, hist_preds) -> dict | None:
    """The example player's comps, placed on the two stats the match weighs most, with the pool around them."""
    name, team = METHODOLOGY_COMP_EXAMPLE
    move = training_pairs[(training_pairs["player"] == name) & (training_pairs["from_team"] == team)]
    if move.empty:
        return None
    season = int(move["season"].max())
    players = pd.read_parquet(DATA_DIR / f"players_{season}.parquet")
    row = players[(players["player"] == name) & (players["team"] == team)]
    if row.empty:
        return None
    row = row.iloc[0]
    pool = comp_pool(training_pairs, season)
    comps = find_comps(row, pool, hist_preds).merge(pool[["id", "season", "dest_season", "dporpag"]],
                                                    on=["id", "season", "dest_season"], how="left")
    shown = pool.dropna(subset=["porpag", "dporpag"])
    return {
        "player": name, "x": row["porpag"], "y": row["dporpag"],
        "comps": [{"player": c["player"], "to_team": c["to_team"], "x": c["porpag"], "y": c["dporpag"]}
                  for c in comps.to_dict("records")],
        "pool": [[r.porpag, r.dporpag] for r in shown.itertuples()],
    }


def methodology(player_seasons, training_pairs, hist_preds, model, season, dest_level) -> dict:
    """Every number the Methodology page prints, read from the pipeline's own files."""
    scores = json.loads(MODEL_SCORES_PATH.read_text(encoding="utf-8"))
    moves = hist_preds.merge(training_pairs[["player", "season", "dest_season", "porpag"]],
                             on=["player", "season", "dest_season"])


    # What moving up typically does: every move to a high-major, grouped by the role he had before it.
    up = training_pairs[training_pairs["to_conf"].isin(HIGH_MAJOR_CONFERENCES)
                        & ~training_pairs["from_conf"].isin(HIGH_MAJOR_CONFERENCES)]
    before_role = pd.cut(up["porpag"], [0, 1, 2, 3, np.inf], labels=False)
    moving_up = []
    for k in range(4):
        group = up[before_role == k]
        moving_up.append({"role": k + 1, "n": len(group), "before": group["porpag"].median(),
                          "after": group["target"].median(), "after_p25": group["target"].quantile(.25),
                          "after_p75": group["target"].quantile(.75)})

    # For each projected role, the share of players who actually ended up in each role.
    edges = [-np.inf, 0, 1, 2, 3, np.inf]
    projected_role = pd.cut(moves["projected_porpag"], edges, labels=False)
    actual_role = pd.cut(moves["actual_porpag"], edges, labels=False)
    roles = [{"role": int(r), "shares": [float((actual_role[projected_role == r] == k).mean()) for k in range(5)]}
             for r in range(1, 5)]

    # How much each input moves projections: mean absolute contribution across the season's board players.
    players = pd.read_parquet(DATA_DIR / f"players_{season}.parquet")
    board = project(players, tier_levels(players, dest_level)["High-Major"], model)
    board = board[board["g"] >= MIN_GAMES]
    contribs, _ = contributions(board, model)
    weight = (contribs.abs().mean() / contribs.abs().mean().sum()).to_dict()

    return {
        "players": int(player_seasons["id"].nunique()),
        "transfer_players": int(training_pairs["id"].nunique()),
        "board_season": int(season),
        "board_players": len(board),
        "cv_folds": CV_N_FOLDS,
        "models": {k: {m: scores[k].get(m) for m in ("mae", "mae_std", "rmse")} for k in ("naive", "ridge", "lgbm")},
        "box": {stat: {"naive_mae": v["naive"]["mae"], "lgbm_mae": v["lgbm"]["mae"]} for stat, v in scores["stat_models"].items()},
        "player_seasons": len(player_seasons),
        "first_season": int(player_seasons["year"].min()),
        "transfers": len(training_pairs),
        "min_games": MIN_GAMES,
        "moving_up": moving_up,
        "roles": roles,
        "comp_demo": comp_demo(training_pairs, hist_preds),
        "features": [{"key": f, "label": FEATURE_LABELS.get(f, f), "weight": weight.get(f, 0.0)} for f in FEATURE_COLS],
        "comp_features": [{"label": FEATURE_LABELS.get(f, f), "weight": w} for f, w in zip(COMP_FEATURES, COMP_WEIGHTS)],
    }


def export_season(season, dest_level, model, player_seasons, training_pairs, hist_preds, on_board, careers, hp_by_player,
                  out_dir) -> dict:
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
    # Whole-season steps; the loop below only assembles each player's file.
    comps_by_row = find_comps_batch(board, comp_pool(training_pairs, season), hist_preds)
    drivers = top_drivers(contribs)
    player_bytes = 0
    for idx, row in zip(board.index, board.to_dict("records")):
        pid = int(row["id"])
        career, stints = careers.get(pid, ([], set()))
        top = drivers[idx]
        comps = comps_by_row[idx]
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
            "drivers": [{"feature": f, "label": FEATURE_LABELS.get(f, f), "value": v} for f, v in top],
            "zones": zones,
            "career": career,
            "comps": [
                {
                    **{k: c[k] for k in ["player", "from_team", "from_conf", "to_team", "to_conf", "dest_season",
                                         "projected_porpag", "actual_porpag"]},
                    "before_porpag": c["porpag"],
                    "season_label": season_label(int(c["dest_season"])),
                    # Comps link to their pre-transfer season's player page when that season has one.
                    "link": {"id": int(c["id"]), "season": int(c["season"])}
                    if int(c["id"]) in on_board.get(int(c["season"]), ()) else None,
                }
                for c in comps
            ],
            "prediction_vs_reality": prediction_vs_reality(stints, hp_by_player.get(row["player"])),
        })

    print(f"[export] {season}: {len(board)} players, board {board_bytes / 1024:.0f} KB, "
          f"player files {player_bytes / 1024 / 1024:.1f} MB")
    return {"season": season, "label": season_label(season), "players": len(board), "tiers": tiers,
            "board_bytes": board_bytes, "player_bytes": player_bytes}


def load_inputs(app_config: dict) -> dict:
    model = load_lgbm()
    if model is None:
        raise FileNotFoundError("Run scripts/run_pipeline.py to train the model first.")
    player_seasons = pd.read_parquet(PLAYER_SEASONS_PATH)
    hist_preds = pd.read_parquet(HIST_PREDS_PATH)

    # Which players get a page in each season, so comps only link to pages that exist.
    on_board = {}
    for s in app_config["available_seasons"]:
        p = pd.read_parquet(DATA_DIR / f"players_{s}.parquet", columns=["id", "g"])
        on_board[s] = set(p.loc[p["g"] >= MIN_GAMES, "id"].astype(int))

    # A player's career and saved predictions are the same in every season's export, so build them once.
    careers = {}
    ordered = player_seasons.sort_values("year")
    for pid, r in zip(ordered["id"].astype(int), ordered[CAREER_COLS].to_dict("records")):
        seasons_list, stints = careers.setdefault(pid, ([], set()))
        seasons_list.append({**r, "season_label": season_label(int(r["year"])), "tier": conf_tier(r["conf"])})
        stints.add((r["team"], int(r["year"])))

    return {
        "dest_level": app_config["default_dest_level"], "model": model, "player_seasons": player_seasons,
        "training_pairs": pd.read_parquet(TRAINING_PAIRS_PATH), "hist_preds": hist_preds, "on_board": on_board,
        "careers": careers, "hp_by_player": dict(tuple(hist_preds.groupby("player"))),
    }


# Seasons are independent, so each worker process loads the inputs once and exports whole seasons.
_inputs: dict = {}


def _init_worker(app_config: dict) -> None:
    _inputs.update(load_inputs(app_config))


def _export_season(season: int) -> dict:
    return export_season(season, out_dir=SITE_DATA_DIR, **_inputs)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seasons", type=int, nargs="*", help="limit to these seasons (default: all in app_config)")
    args = parser.parse_args()

    with open(APP_CONFIG_PATH) as f:
        app_config = json.load(f)
    seasons = sorted(args.seasons or app_config["available_seasons"])

    SITE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    workers = min(len(seasons), EXPORT_WORKERS, os.cpu_count() or 1)
    with ProcessPoolExecutor(workers, initializer=_init_worker, initargs=(app_config,)) as pool:
        summaries = list(pool.map(_export_season, seasons))

    inputs = load_inputs(app_config)
    player_seasons, training_pairs, hist_preds = inputs["player_seasons"], inputs["training_pairs"], inputs["hist_preds"]
    model, dest_level = inputs["model"], inputs["dest_level"]
    _write(SITE_DATA_DIR / "methodology.json",
           methodology(player_seasons, training_pairs, hist_preds, model, app_config["default_season"], dest_level))

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
