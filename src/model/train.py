"""
Trains a Ridge baseline and a LightGBM model to predict a player's
value-metric translation after transferring to a higher level of competition.
Uses grouped cross-validation keyed by player_id to prevent leakage.
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.model_selection import GroupKFold, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, root_mean_squared_error
import lightgbm as lgb

from ..config import CV_N_FOLDS, RANDOM_SEED


def _grouped_cv_scores(
    model,
    X: pd.DataFrame,
    y: pd.Series,
    groups: pd.Series,
) -> dict:
    cv = GroupKFold(n_splits=CV_N_FOLDS)
    mae_scores = cross_val_score(
        model, X, y, groups=groups, cv=cv,
        scoring="neg_mean_absolute_error", n_jobs=-1,
    )
    rmse_scores = cross_val_score(
        model, X, y, groups=groups, cv=cv,
        scoring="neg_root_mean_squared_error", n_jobs=-1,
    )
    return {
        "mae": -mae_scores.mean(),
        "mae_std": mae_scores.std(),
        "rmse": -rmse_scores.mean(),
        "rmse_std": rmse_scores.std(),
    }


def train_ridge(X: pd.DataFrame, y: pd.Series, groups: pd.Series) -> Pipeline:
    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("ridge", Ridge(alpha=1.0)),
    ])
    scores = _grouped_cv_scores(pipe, X, y, groups)
    print(f"[model] Ridge  MAE={scores['mae']:.3f}±{scores['mae_std']:.3f}  "
          f"RMSE={scores['rmse']:.3f}±{scores['rmse_std']:.3f}")
    pipe.fit(X, y)
    return pipe


def train_lgbm(X: pd.DataFrame, y: pd.Series, groups: pd.Series) -> lgb.LGBMRegressor:
    model = lgb.LGBMRegressor(
        n_estimators=500,
        learning_rate=0.05,
        num_leaves=31,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=RANDOM_SEED,
        n_jobs=-1,
        verbose=-1,
    )
    scores = _grouped_cv_scores(model, X, y, groups)
    print(f"[model] LightGBM  MAE={scores['mae']:.3f}±{scores['mae_std']:.3f}  "
          f"RMSE={scores['rmse']:.3f}±{scores['rmse_std']:.3f}")
    model.fit(X, y)
    return model
