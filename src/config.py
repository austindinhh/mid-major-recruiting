from pathlib import Path

# Paths 
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

PLAYER_SEASONS_PATH = DATA_DIR / "player_seasons.parquet"
TRANSFERS_PATH = DATA_DIR / "transfers.parquet"
TEAMS_PATH = DATA_DIR / "teams.parquet"
TRAINING_PAIRS_PATH = DATA_DIR / "training_pairs.parquet"
APP_CONFIG_PATH = DATA_DIR / "app_config.json"
HIST_PREDS_PATH = DATA_DIR / "historical_predictions.parquet"

# Data source
BARTTORVIK_BASE = "https://barttorvik.com"
FIRST_SEASON = 2012   # 2011-12 season; earliest year used for training pairs
LAST_SEASON = 2027    # 2026-27 season
# True while LAST_SEASON is still being played. Its stats then stay out of training (a transfer isn't
# judged on a handful of games) and the site opens on the season before. Set False once it's final.
SEASON_IN_PROGRESS = True
DEFAULT_SEASON = LAST_SEASON - 1 if SEASON_IN_PROGRESS else LAST_SEASON

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
MIN_GAMES = 10   # players below this are hidden from the board

# Comparable-transfer matching: production and physical profile weigh more than peripheral stats.
COMP_FEATURES = ["porpag", "dporpag", "usg", "ts", "inches", "pos_num", "origin_level", "porpag_trend"]
COMP_WEIGHTS  = [  2.0,      2.0,      1.0,  1.0,    1.5,     1.5,        1.0,            1.0          ]

# Seasons the site export builds at once. Each worker loads every library and the full dataset, so this is capped
# rather than one per core; GitHub's runners have 4 cores.
EXPORT_WORKERS = 4

# The player the Methodology page uses to show how comps are picked: a mid-major star who moved up to Illinois.
METHODOLOGY_COMP_EXAMPLE = ("Marcus Domask", "Southern Illinois")

# Static site export
SITE_DATA_DIR = ROOT / "web" / "public" / "data"
BOARD_EXPORT_COLS = [
    "id", "player", "pos", "team", "conf", "exp", "inches", "g", "mpg", "fga",
    "porpag", "dporpag", "projected_porpag",
    "usg", "ortg", "ts", "ast", "to", "ftr",
]
# Stats ranked within position each season; TO% is ranked so fewer turnovers scores higher.
PERCENTILE_COLS = [
    "porpag", "dporpag", "projected_porpag", "ppg", "usg", "ortg", "ts",
    "ast", "to", "ftr", "stl", "blk", "oreb_rate", "dreb_rate",
]
LOWER_IS_BETTER = {"to"}
PLAYER_STAT_COLS = [
    "ppg", "rpg", "apg", "spg", "bpg", "mpg", "usg", "ortg", "ts", "efg",
    "ast", "to", "ftr", "oreb_rate", "dreb_rate", "stl", "blk", "ft_pct",
]

# Conference codes as BartTorvik writes them
HIGH_MAJOR_CONFERENCES = {"ACC", "B10", "B12", "BE", "P12", "SEC"}
MID_MAJOR_CONFERENCES  = {"A10", "Amer", "MWC", "WCC", "MAC", "CUSA", "MVC", "CAA", "Horz", "SB", "WAC"}

# School renames mapped to current names. Without this, a rename looks like a
# transfer with no real change in competition.
TEAM_RENAMES = {
    "IUPUI": "IU Indy",
    "Arkansas Little Rock": "Little Rock",
    "IPFW": "Purdue Fort Wayne",
    "Fort Wayne": "Purdue Fort Wayne",
    "Dixie St.": "Utah Tech",
    "College of Charleston": "Charleston",
    "North Carolina St.": "N.C. State",
    "Houston Baptist": "Houston Christian",
    "Texas A&M Commerce": "East Texas A&M",
    "Detroit": "Detroit Mercy",
    "Louisiana Lafayette": "Louisiana",
    "LIU Brooklyn": "LIU",
    "St. Francis PA": "Saint Francis",
}
