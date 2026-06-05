"""
Fetches player-seasons, derived transfer pairs, and team ratings.

Primary source: toRvik-data GitHub repository (static parquet/CSV files,
current through 2023). For years 2024+, falls back to direct BartTorvik
scrape using the public CSV endpoints.

The live toRvik API (api.cbbstat.com) is no longer resolving.
Transfers are reconstructed by detecting year-over-year team changes for
the same player ID in the player season table.
"""

import io
import time
import requests
import numpy as np
import pandas as pd

from ..config import (
    TORVIK_DATA_BASE,
    FIRST_SEASON,
    LAST_SEASON,
    PLAYER_SEASONS_PATH,
    TRANSFERS_PATH,
    TEAMS_PATH,
)
from .cache import load, save

_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "mid-major-recruiting-research/0.1"})
_RATE_LIMIT_DELAY = 0.3

# ---------------------------------------------------------------------------
# Column mapping: BartTorvik getadvstats.php CSV (67 cols, no header)
# Verified by cross-correlation against the toRvik-data 2023 parquet.
# ---------------------------------------------------------------------------
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
}


def _get_bytes(url: str) -> bytes:
    resp = _SESSION.get(url, timeout=30)
    resp.raise_for_status()
    time.sleep(_RATE_LIMIT_DELAY)
    return resp.content


def _hgt_to_inches(hgt_series: pd.Series) -> pd.Series:
    """Convert '6-4' height strings to integer inches (76)."""
    def _parse(h):
        try:
            parts = str(h).split("-")
            return int(parts[0]) * 12 + int(parts[1])
        except Exception:
            return np.nan
    return hgt_series.apply(_parse)


def _fetch_player_season_direct(year: int) -> pd.DataFrame:
    """
    Scrapes one season of player stats from BartTorvik's public CSV endpoint.
    Returns a DataFrame matching the schema of player_seasons.parquet.
    """
    url = f"https://barttorvik.com/getadvstats.php?year={year}&conyes=0&csv=1"
    resp = _SESSION.get(url, timeout=30)
    resp.raise_for_status()
    time.sleep(_RATE_LIMIT_DELAY)

    raw = pd.read_csv(io.StringIO(resp.text), header=None)
    if raw.shape[1] < 65:
        raise ValueError(f"Unexpected column count ({raw.shape[1]}) for year {year}")

    # Select and rename mapped columns
    keep = {k: v for k, v in _BT_PLAYER_COL_MAP.items() if k < raw.shape[1]}
    df = raw[list(keep.keys())].rename(columns=keep)

    # Derived columns
    df["inches"] = _hgt_to_inches(df["hgt"])
    df["fgm"] = pd.to_numeric(df["two_m"], errors="coerce").fillna(0) + \
                pd.to_numeric(df["three_m"], errors="coerce").fillna(0)
    df["fga"] = pd.to_numeric(df["two_a"], errors="coerce").fillna(0) + \
                pd.to_numeric(df["three_a"], errors="coerce").fillna(0)
    df["fg_pct"] = np.where(df["fga"] > 0, df["fgm"] / df["fga"], np.nan)

    # Coerce numeric columns
    for col in df.columns:
        if col not in ("player", "team", "conf", "exp", "hgt", "pos"):
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Fill any parquet columns missing from this endpoint with NaN
    for col in ["tov"]:
        if col not in df.columns:
            df[col] = np.nan

    return df


def _bypass_js_and_get(url: str) -> str:
    """
    BartTorvik serves some pages behind a trivial JS challenge.
    POST with js_test_submitted=1 sets the bypass cookie; the session
    retains it for the subsequent GET.
    """
    _SESSION.post(url, data={"js_test_submitted": "1"}, timeout=30)
    time.sleep(_RATE_LIMIT_DELAY)
    resp = _SESSION.get(url, timeout=30)
    resp.raise_for_status()
    time.sleep(_RATE_LIMIT_DELAY)
    return resp.text


def _fetch_team_season_direct(year: int, player_seasons: pd.DataFrame | None = None) -> pd.DataFrame:
    """
    Scrapes one season of team ratings from BartTorvik's trank page.
    Returns a DataFrame matching the schema of teams.parquet.

    Conference assignments are derived from player_seasons when provided
    (each player row has team + conf), since trank CSV doesn't include conf.
    """
    url = f"https://barttorvik.com/trank.php?year={year}&csv=1"
    text = _bypass_js_and_get(url)

    raw = pd.read_csv(io.StringIO(text), header=None)
    if raw.shape[1] < 35:
        raise ValueError(f"Unexpected column count ({raw.shape[1]}) in trank for year {year}")

    df = raw[[0, 1, 2, 3, 15, 34]].rename(columns={
        0:  "team",
        1:  "adj_o",
        2:  "adj_d",
        3:  "barthag",
        15: "adj_t",
        34: "wab",
    })
    df["year"] = year

    # Conference: derive from player_seasons if available, else NaN
    if player_seasons is not None:
        ps_year = player_seasons[player_seasons["year"] == year]
        team_conf = (
            ps_year.groupby("team")["conf"]
            .agg(lambda s: s.mode().iloc[0] if not s.empty else np.nan)
            .reset_index()
        )
        df = df.merge(team_conf, on="team", how="left")
    else:
        df["conf"] = np.nan

    # ov_cur_sos: not available in trank CSV; set NaN so LightGBM handles it
    df["ov_cur_sos"] = np.nan

    # Coerce numeric columns
    for col in ["adj_o", "adj_d", "barthag", "adj_t", "wab"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Add rank columns expected by parquet schema (filled with NaN)
    for col in ["barthag_rk", "adj_o_rk", "adj_d_rk", "adj_t_rk",
                "nc_elite_sos", "nc_fut_sos", "nc_cur_sos",
                "ov_elite_sos", "ov_fut_sos", "seed"]:
        df[col] = np.nan

    return df


def fetch_player_seasons(force: bool = False) -> pd.DataFrame:
    if not force:
        cached = load(PLAYER_SEASONS_PATH)
        if cached is not None:
            return cached

    print("[fetch] Downloading player season stats from toRvik-data...")
    url = f"{TORVIK_DATA_BASE}/player_season/all.parquet"
    raw = _get_bytes(url)
    df = pd.read_parquet(io.BytesIO(raw))

    # The combined all.parquet may lag a season; fetch any missing years
    latest = int(df["year"].max())
    for year in range(latest + 1, LAST_SEASON + 1):
        url_year = f"{TORVIK_DATA_BASE}/player_season/{year}/all_{year}.parquet"
        try:
            raw_year = _get_bytes(url_year)
            frame = pd.read_parquet(io.BytesIO(raw_year))
            df = pd.concat([df, frame], ignore_index=True)
            print(f"  appended year {year} from GitHub: {len(frame)} players")
        except requests.HTTPError:
            # GitHub doesn't have this year — fall back to direct BartTorvik scrape
            try:
                frame = _fetch_player_season_direct(year)
                df = pd.concat([df, frame], ignore_index=True)
                print(f"  appended year {year} from BartTorvik: {len(frame)} players")
            except Exception as exc:
                print(f"  year {year}: skipped ({exc})")
                break

    df = df[df["year"] >= FIRST_SEASON].reset_index(drop=True)
    print(f"[fetch] {len(df):,} player-seasons loaded (years {FIRST_SEASON}-{int(df['year'].max())})")

    save(df, PLAYER_SEASONS_PATH)
    return df


def fetch_teams(force: bool = False) -> pd.DataFrame:
    if not force:
        cached = load(TEAMS_PATH)
        if cached is not None:
            return cached

    print("[fetch] Downloading team ratings from toRvik-data...")
    frames = []
    for year in range(FIRST_SEASON, LAST_SEASON + 1):
        url = f"{TORVIK_DATA_BASE}/ratings/ratings_{year}.csv"
        try:
            raw = _get_bytes(url)
            frame = pd.read_csv(io.BytesIO(raw))
            if frame.columns[0].startswith("Unnamed") or frame.columns[0] == "":
                frame = frame.drop(columns=frame.columns[0])
            frames.append(frame)
            print(f"  year {year}: {len(frame)} teams")
        except requests.HTTPError as exc:
            # GitHub doesn't have this year — fall back to direct BartTorvik scrape
            try:
                # Load player seasons from cache to derive conference assignments
                ps_cached = load(PLAYER_SEASONS_PATH)
                frame = _fetch_team_season_direct(year, player_seasons=ps_cached)
                frames.append(frame)
                print(f"  year {year}: {len(frame)} teams (BartTorvik direct)")
            except Exception as e2:
                print(f"  year {year}: skipped ({exc}; then {e2})")

    df = pd.concat(frames, ignore_index=True)
    print(f"[fetch] {len(df):,} team-seasons loaded")
    save(df, TEAMS_PATH)
    return df


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

    print(f"[fetch] {len(pairs):,} transfer pairs derived")
    save(pairs, TRANSFERS_PATH)
    return pairs
