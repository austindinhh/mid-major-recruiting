from pathlib import Path

# -- Paths ------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

PLAYER_SEASONS_PATH = DATA_DIR / "player_seasons.parquet"
TRANSFERS_PATH = DATA_DIR / "transfers.parquet"
TEAMS_PATH = DATA_DIR / "teams.parquet"

# -- API --------------------------------------------------------------------
TORVIK_BASE = "https://api.cbbref.com"  # toRvik FastAPI base; verify on Day 1

# -- Model ------------------------------------------------------------------
TARGET_METRIC = "porpag"   # primary value metric from toRvik; confirm field name
RANDOM_SEED = 42
CV_N_FOLDS = 5

# -- Board ------------------------------------------------------------------
# Conferences considered "high-major" for visibility-discount logic
HIGH_MAJOR_CONFERENCES = {
    "ACC", "Big 12", "Big East", "Big Ten", "Pac-12", "SEC",
}
