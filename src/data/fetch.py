"""
Fetches player-seasons, team ratings and derived transfer pairs, all straight from BartTorvik.

  getadvstats.php?year=Y&csv=1   one row per player-season, no header (layout below)
  Y_team_results.csv             one row per team-season, with a header

Both cover every season in FIRST_SEASON..LAST_SEASON and update daily during the current one. Transfers are
reconstructed by detecting team changes for the same player id across seasons.
"""

import io
import time
import requests
import numpy as np
import pandas as pd

from ..config import (
    BARTTORVIK_BASE,
    FIRST_SEASON,
    LAST_SEASON,
    PLAYER_SEASONS_PATH,
    TRANSFERS_PATH,
    TEAMS_PATH,
    TEAM_RENAMES,
)
from .cache import load, save

_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "mid-major-recruiting-research/0.1"})
_RATE_LIMIT_DELAY = 10  # barttorvik.com robots.txt asks for Crawl-Delay: 10

# Column positions in getadvstats.php, the same for every season from 2010. The file now has
# 79 columns; 67-78 are not read.
_BT_PLAYER_COL_MAP = {
    0:  "player",
    1:  "team",
    2:  "conf",
    3:  "g",
    4:  "min",
    5:  "ortg",
    6:  "usg",
    7:  "efg",
    8:  "ts",
    9:  "oreb_rate",
    10: "dreb_rate",
    11: "ast",
    12: "to",
    13: "ftm",
    14: "fta",
    15: "ft_pct",
    16: "two_m",
    17: "two_a",
    18: "two_pct",
    19: "three_m",
    20: "three_a",
    21: "three_pct",
    22: "blk",
    23: "stl",
    24: "ftr",
    25: "exp",
    26: "hgt",
    27: "num",
    28: "porpag",
    29: "adj_oe",
    30: "pfr",
    31: "year",
    32: "id",
    # 33: hometown string — skip
    34: "rec",
    35: "ast_to",
    36: "rim_m",
    37: "rim_a",
    38: "mid_m",
    39: "mid_a",
    40: "rim_pct",
    41: "mid_pct",
    42: "dunk_m",
    43: "dunk_a",
    44: "dunk_pct",
    45: "pick",
    46: "drtg",
    47: "adj_de",
    48: "dporpag",
    49: "stops",
    # 50-52: unadjusted BPM variants — skip
    53: "bpm",
    54: "mpg",
    55: "obpm",
    56: "dbpm",
    57: "oreb",
    58: "dreb",
    59: "rpg",
    60: "apg",
    61: "spg",
    62: "bpg",
    63: "ppg",
    64: "pos",
    # 65: FTM/FGA (non-standard, not needed) — skip
    # 66: birthdate — skip
    # 67-78: newer additions — skip
}


_TEAM_COLS = {"team": "team", "conf": "conf", "barthag": "barthag", "adjoe": "adj_o",
              "adjde": "adj_d", "adjt": "adj_t", "WAB": "wab"}


def _normalize_teams(df: pd.DataFrame) -> pd.DataFrame:
    df["team"] = df["team"].replace(TEAM_RENAMES)
    return df


def _get_text(url: str) -> str:
    resp = _SESSION.get(url, timeout=60)
    resp.raise_for_status()
    time.sleep(_RATE_LIMIT_DELAY)
    return resp.text


def _hgt_to_inches(hgt_series: pd.Series) -> pd.Series:
    """Convert '6-4' height strings to integer inches (76)."""
    def _parse(h):
        try:
            parts = str(h).split("-")
            return int(parts[0]) * 12 + int(parts[1])
        except Exception:
            return np.nan
    return hgt_series.apply(_parse)


def _fetch_player_season(year: int) -> pd.DataFrame:
    text = _get_text(f"{BARTTORVIK_BASE}/getadvstats.php?year={year}&conyes=0&csv=1")
    raw = pd.read_csv(io.StringIO(text), header=None)
    if raw.shape[1] < 67:
        raise ValueError(f"Unexpected column count ({raw.shape[1]}) for year {year}")

    df = raw[list(_BT_PLAYER_COL_MAP)].rename(columns=_BT_PLAYER_COL_MAP)
    for col in df.columns:
        if col not in ("player", "team", "conf", "exp", "hgt", "pos"):
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df["inches"] = _hgt_to_inches(df["hgt"])
    df["fgm"] = df["two_m"].fillna(0) + df["three_m"].fillna(0)
    df["fga"] = df["two_a"].fillna(0) + df["three_a"].fillna(0)
    df["fg_pct"] = np.where(df["fga"] > 0, df["fgm"] / df["fga"], np.nan)
    return df


def _fetch_team_season(year: int) -> pd.DataFrame:
    text = _get_text(f"{BARTTORVIK_BASE}/{year}_team_results.csv")
    # Before 2023 the header quotes "Fun Rk, adjt" as one field, leaving it a name short of the data.
    names = [n.strip() for n in text.split("\n", 1)[0].replace('"', "").split(",")]
    names = [f"{n}_{i}" if n in names[:i] else n for i, n in enumerate(names)]  # "rank" appears twice
    raw = pd.read_csv(io.StringIO(text), header=None, skiprows=1, names=names)
    missing = set(_TEAM_COLS) - set(raw.columns)
    if missing:
        raise ValueError(f"team_results {year} is missing columns {sorted(missing)}")

    df = raw[list(_TEAM_COLS)].rename(columns=_TEAM_COLS)
    for col in ["barthag", "adj_o", "adj_d", "adj_t", "wab"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["year"] = year
    return df


def _fetch_seasons(path, fetch_one, what: str, refresh: list[int] | None) -> pd.DataFrame:
    """Cached table of every season; downloads the `refresh` years again, or all of them if nothing is cached."""
    cached = load(path)
    if cached is not None and not refresh:
        return _normalize_teams(cached)

    years = list(range(FIRST_SEASON, LAST_SEASON + 1)) if cached is None else sorted(refresh)
    span = str(years[0]) if len(years) == 1 else f"{years[0]}-{years[-1]}"
    print(f"[fetch] Downloading {what} from BartTorvik for {span}...")
    frames = [] if cached is None else [cached[~cached["year"].isin(years)]]
    for year in years:
        frame = fetch_one(year)
        frames.append(frame)
        print(f"  year {year}: {len(frame)} rows")

    df = _normalize_teams(pd.concat(frames, ignore_index=True).sort_values("year", kind="stable", ignore_index=True))
    print(f"[fetch] {len(df):,} {what} rows loaded")
    save(df, path)
    return df


def fetch_player_seasons(refresh: list[int] | None = None) -> pd.DataFrame:
    return _fetch_seasons(PLAYER_SEASONS_PATH, _fetch_player_season, "player-seasons", refresh)


def fetch_teams(refresh: list[int] | None = None) -> pd.DataFrame:
    return _fetch_seasons(TEAMS_PATH, _fetch_team_season, "team-seasons", refresh)


def fetch_transfers(force: bool = False) -> pd.DataFrame:
    """
    Reconstructs transfer pairs from player season data.
    A transfer is any instance where the same player ID appears at a different
    team in a later season (gap of 1 or 2 years to capture sit-out transfers).
    """
    if not force:
        cached = load(TRANSFERS_PATH)
        if cached is not None:
            return cached

    print("[fetch] Deriving transfer pairs from player season data...")
    seasons = fetch_player_seasons()

    slim = (
        seasons[["id", "player", "team", "conf", "year"]]
        .drop_duplicates()
        .sort_values(["id", "year"])
    )

    origin = slim.rename(columns={"team": "from_team", "conf": "from_conf", "year": "season"})
    dest = slim.rename(columns={"team": "to_team", "conf": "to_conf", "year": "dest_season"})

    pairs = origin.merge(dest, on=["id", "player"])
    pairs = pairs[
        (pairs["dest_season"] - pairs["season"]).between(1, 2)
        & (pairs["from_team"] != pairs["to_team"])
    ].reset_index(drop=True)

    pairs = (
        pairs.sort_values("dest_season")
        .drop_duplicates(subset=["id", "season"])
        .reset_index(drop=True)
    )
    # Two seasons at the origin both pair with the same destination season;
    # keep only the most recent so multi-year stays aren't double-weighted.
    pairs = (
        pairs.sort_values("season")
        .drop_duplicates(subset=["id", "dest_season"], keep="last")
        .reset_index(drop=True)
    )

    print(f"[fetch] {len(pairs):,} transfer pairs derived")
    save(pairs, TRANSFERS_PATH)
    return pairs
