from pathlib import Path

# Paths 
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

PLAYER_SEASONS_PATH = DATA_DIR / "player_seasons.parquet"
TRANSFERS_PATH = DATA_DIR / "transfers.parquet"
TEAMS_PATH = DATA_DIR / "teams.parquet"
TRAINING_PAIRS_PATH = DATA_DIR / "training_pairs.parquet"
WEIGHT_DATA_PATH    = DATA_DIR / "weight_data.parquet"

# Data source
# The live toRvik API (api.cbbstat.com) is no longer resolving; all data is
# served as static files from the companion GitHub repo instead.
TORVIK_DATA_BASE = "https://raw.githubusercontent.com/andreweatherman/toRvik-data/main"
FIRST_SEASON = 2012   # 2011-12 season; earliest year used for training pairs
LAST_SEASON = 2026    # extended via direct BartTorvik scrape for 2024-2026

# Model
TARGET_METRIC = "porpag"
RANDOM_SEED = 1
CV_N_FOLDS = 5

MODEL_DIR = ROOT / "models"
MODEL_LGBM_PATH = MODEL_DIR / "lgbm.pkl"
MODEL_RIDGE_PATH = MODEL_DIR / "ridge.pkl"
MODEL_SCORES_PATH = MODEL_DIR / "scores.json"
MODEL_STAT_MODELS_PATH = MODEL_DIR / "stat_models.pkl"

# Board
# Actual abbreviations used in the toRvik dataset
HIGH_MAJOR_CONFERENCES = {"ACC", "B10", "B12", "BE", "P12", "SEC"}
MID_MAJOR_CONFERENCES  = {"A10", "Amer", "MWC", "WCC", "MAC", "CUSA", "MVC", "CAA", "Horz", "SB", "WAC"}
