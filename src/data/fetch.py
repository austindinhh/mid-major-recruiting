"""
Fetches player-seasons, derived transfer pairs, and team ratings from the
toRvik-data GitHub repository (static parquet/CSV files).

The live toRvik API (api.cbbstat.com) is no longer resolving; all data is
served as static files instead. Transfers are reconstructed by detecting
year-over-year team changes for the same player ID in the player season table.
"""

import io
import time
import requests
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


def _get_bytes(url: str) -> bytes:
    resp = _SESSION.get(url, timeout=30)
    resp.raise_for_status()
    time.sleep(_RATE_LIMIT_DELAY)
    return resp.content


def fetch_player_seasons(force: bool = False) -> pd.DataFrame:
    if not force:
        cached = load(PLAYER_SEASONS_PATH)
        if cached is not None:
            return cached

    print("[fetch] Downloading player season stats from toRvik-data...")
    url = f"{TORVIK_DATA_BASE}/player_season/all.parquet"
    raw = _get_bytes(url)
    df = pd.read_parquet(io.BytesIO(raw))

    # The combined all.parquet may lag a season; fetch any missing years individually
    latest = int(df["year"].max())
    for year in range(latest + 1, LAST_SEASON + 1):
        url_year = f"{TORVIK_DATA_BASE}/player_season/{year}/all_{year}.parquet"
        try:
            raw_year = _get_bytes(url_year)
            frame = pd.read_parquet(io.BytesIO(raw_year))
            df = pd.concat([df, frame], ignore_index=True)
            print(f"  appended year {year}: {len(frame)} players")
        except requests.HTTPError:
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
            # Some year CSVs have a leading unnamed row-number column; drop it
            if frame.columns[0].startswith("Unnamed") or frame.columns[0] == "":
                frame = frame.drop(columns=frame.columns[0])
            frames.append(frame)
            print(f"  year {year}: {len(frame)} teams")
        except requests.HTTPError as exc:
            print(f"  year {year}: skipped ({exc})")

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

    # Keep only the columns needed for the join
    slim = (
        seasons[["id", "player", "team", "conf", "year"]]
        .drop_duplicates()
        .sort_values(["id", "year"])
    )

    # Self-join: each season paired with later seasons for the same player
    origin = slim.rename(columns={"team": "from_team", "conf": "from_conf", "year": "season"})
    dest = slim.rename(columns={"team": "to_team", "conf": "to_conf", "year": "dest_season"})

    pairs = origin.merge(dest, on=["id", "player"])
    pairs = pairs[
        (pairs["dest_season"] - pairs["season"]).between(1, 2)
        & (pairs["from_team"] != pairs["to_team"])
    ].reset_index(drop=True)

    # Keep only the earliest destination per (id, season) to avoid duplicates
    pairs = (
        pairs.sort_values("dest_season")
        .drop_duplicates(subset=["id", "season"])
        .reset_index(drop=True)
    )

    print(f"[fetch] {len(pairs):,} transfer pairs derived")
    save(pairs, TRANSFERS_PATH)
    return pairs
