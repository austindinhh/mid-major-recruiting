"""
Fetches player weight (lbs) from Sports Reference CBB player pages.

Sports-Reference is used because it has height + weight for most D1 players
in a clean, parseable format (<span>230lb</span>), unlike BartTorvik which
only exposes height in its CSV exports.

Weight is keyed on player name only (not season) since a player's weight
is stable year-to-year. The cache (weight_data.parquet) accumulates entries
across runs.
"""

import re
import time
import unicodedata

import pandas as pd
import requests

from ..config import WEIGHT_DATA_PATH
from .cache import load, save

_SESSION = requests.Session()
_SESSION.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
})
_DELAY = 1.5   # polite rate limit for Sports Reference
_RETRY_WAIT = 60  # seconds to wait after a 429

# Matches: <span>6-9</span>,&nbsp;<span>230lb</span>
_PHYS_RE = re.compile(r"<span>\d-\d+</span>[^<]*<span>(\d+)lb</span>")


def _to_slug(name: str) -> str:
    """Convert 'First Last' to Sports-Reference slug 'first-last-1'."""
    normalized = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode()
    clean = re.sub(r"[^a-z\s]", "", normalized.lower())
    parts = [p for p in clean.split() if p]
    return "-".join(parts) + "-1"


def _get_with_backoff(url: str) -> requests.Response:
    """GET with automatic 60-second backoff on 429 (rate limit)."""
    for attempt in range(3):
        resp = _SESSION.get(url, timeout=20)
        time.sleep(_DELAY)
        if resp.status_code == 429:
            print(f"  [portal] Rate limited — waiting {_RETRY_WAIT}s before retry {attempt + 1}/3")
            time.sleep(_RETRY_WAIT)
            continue
        return resp
    return resp


def _fetch_weight(name: str) -> int | None:
    """
    Returns weight in lbs for a player from Sports-Reference.
    Tries the constructed slug first; on 404, tries the search page.
    Returns None if not found or page has no weight data.
    """
    slug = _to_slug(name)
    url = f"https://www.sports-reference.com/cbb/players/{slug}.html"
    resp = _get_with_backoff(url)

    if resp.status_code == 404:
        # Try search — parse the results page for a player link
        search_url = (
            "https://www.sports-reference.com/cbb/search/search.fcgi"
            f"?search={requests.utils.quote(name)}"
        )
        search_resp = _get_with_backoff(search_url)
        # Sports-Reference returns a search results page; find the first player link
        player_links = re.findall(
            r'href="(/cbb/players/[^"]+\.html)"', search_resp.text
        )
        if not player_links:
            return None
        resp = _get_with_backoff(f"https://www.sports-reference.com{player_links[0]}")

    if resp.status_code != 200:
        return None

    m = _PHYS_RE.search(resp.text)
    return int(m.group(1)) if m else None


def fetch_player_weights(enriched: pd.DataFrame, force: bool = False) -> pd.DataFrame:
    """
    Fetch weight (lbs) from Sports Reference for each unique player in `enriched`.
    Results are merged into the persistent cache at WEIGHT_DATA_PATH.
    Only fetches players not already in cache (unless force=True).
    """
    cached = None if force else load(WEIGHT_DATA_PATH)
    already: set[str] = set(cached["player"].str.lower()) if cached is not None else set()

    unique_players = enriched[["player"]].drop_duplicates()
    to_fetch = unique_players[~unique_players["player"].str.lower().isin(already)]

    print(f"[portal] Fetching weight for {len(to_fetch):,} players from Sports-Reference...")

    rows = []
    for i, (_, row) in enumerate(to_fetch.iterrows(), 1):
        weight = _fetch_weight(row["player"])
        if weight:
            rows.append({"player": row["player"], "weight_lbs": float(weight)})
        if i % 200 == 0:
            pct = i / len(to_fetch) * 100
            found = len(rows)
            print(f"  {i:,}/{len(to_fetch):,} ({pct:.0f}%) — {found} weights found so far")

    new_df = (
        pd.DataFrame(rows)
        if rows
        else pd.DataFrame(columns=["player", "weight_lbs"])
    )

    if cached is not None and not new_df.empty:
        result = (
            pd.concat([cached, new_df], ignore_index=True)
            .drop_duplicates("player")
            .reset_index(drop=True)
        )
    elif cached is not None:
        result = cached
    else:
        result = new_df

    if not result.empty:
        save(result, WEIGHT_DATA_PATH)
        fill_rate = len(rows) / max(1, len(to_fetch))
        print(
            f"[portal] Cache: {len(result):,} total entries | "
            f"{fill_rate:.0%} fill on new players"
        )

    return result


def load_weight_data() -> pd.DataFrame | None:
    """Load cached weight data, or return None if not yet fetched."""
    return load(WEIGHT_DATA_PATH)
