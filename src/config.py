from pathlib import Path

# Paths 
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

PLAYER_SEASONS_PATH = DATA_DIR / "player_seasons.parquet"
TRANSFERS_PATH = DATA_DIR / "transfers.parquet"
TEAMS_PATH = DATA_DIR / "teams.parquet"
TRAINING_PAIRS_PATH = DATA_DIR / "training_pairs.parquet"

# Data source
# The live toRvik API (api.cbbstat.com) is no longer resolving; all data is
# served as static files from the companion GitHub repo instead.
TORVIK_DATA_BASE = "https://raw.githubusercontent.com/andreweatherman/toRvik-data/main"
FIRST_SEASON = 2012   # 2011-12 season; earliest year used for training pairs
LAST_SEASON = 2023    # most recent year in the GitHub data repo

# Model 
TARGET_METRIC = "porpag"   # primary value metric from toRvik; confirm field name
RANDOM_SEED = 1
CV_N_FOLDS = 5

# Board
# Conferences considered "high-major" for visibility-discount logic
HIGH_MAJOR_CONFERENCES = {
    "ACC", "Big 12", "Big East", "Big Ten", "Pac-12", "SEC",
}
