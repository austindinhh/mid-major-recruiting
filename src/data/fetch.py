"""
Pulls player-seasons, transfer histories, and team metadata from the toRvik API.
Falls back to direct BartTorvik scraping if the API is unreachable.
All results are written to the local parquet cache via cache.py.
"""

import time
import requests
import pandas as pd

from ..config import TORVIK_BASE, PLAYER_SEASONS_PATH, TRANSFERS_PATH, TEAMS_PATH
from .cache import load, save

_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "mid-major-recruiting-research/0.1"})

FIRST_SEASON = 2012   # 2011-12 season
_RATE_LIMIT_DELAY = 0.5  # seconds between requests


def _get(endpoint: str, params: dict | None = None) -> dict | list:
    url = f"{TORVIK_BASE}{endpoint}"
    resp = _SESSION.get(url, params=params, timeout=15)
    resp.raise_for_status()
    time.sleep(_RATE_LIMIT_DELAY)
    return resp.json()


def fetch_player_seasons(force: bool = False) -> pd.DataFrame:
    if not force:
        cached = load(PLAYER_SEASONS_PATH)
        if cached is not None:
            return cached

    print("[fetch] Pulling player seasons from toRvik...")
    # TODO: replace with real toRvik endpoint once confirmed Day 1
    raise NotImplementedError("Verify toRvik endpoint on Day 1 before implementing")


def fetch_transfers(force: bool = False) -> pd.DataFrame:
    if not force:
        cached = load(TRANSFERS_PATH)
        if cached is not None:
            return cached

    print("[fetch] Pulling transfer histories from toRvik...")
    raise NotImplementedError("Verify toRvik endpoint on Day 1 before implementing")


def fetch_teams(force: bool = False) -> pd.DataFrame:
    if not force:
        cached = load(TEAMS_PATH)
        if cached is not None:
            return cached

    print("[fetch] Pulling team metadata from toRvik...")
    raise NotImplementedError("Verify toRvik endpoint on Day 1 before implementing")
