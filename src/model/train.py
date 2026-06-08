"""
Model training: naive baseline, Ridge, and LightGBM scored via 5-fold grouped CV.

  naive  — flat projection (origin PORPAG unchanged)
  ridge  — Ridge regression with median imputation + standard scaling
  lgbm   — LightGBM (handles NaN natively, captures non-linear interactions)

Fitted models and CV scores are persisted to models/ for use in board generation.
"""

import json
import numpy as np
import pandas as pd
import joblib
import shap
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, root_mean_squared_error
from sklearn.model_selection import GroupKFold, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
import lightgbm as lgb

from ..config import (
    CV_N_FOLDS, RANDOM_SEED, TARGET_METRIC,
    MODEL_DIR, MODEL_LGBM_PATH, MODEL_RIDGE_PATH, MODEL_SCORES_PATH, MODEL_STAT_MODELS_PATH,
)


def _cv_scores(model, X: pd.DataFrame, y: pd.Series, groups: pd.Series) -> dict:
    cv = GroupKFold(n_splits=CV_N_FOLDS)
    results = cross_validate(
        model, X, y, groups=groups, cv=cv,
        scoring=["neg_mean_absolute_error", "neg_root_mean_squared_error"],
        n_jobs=1,
    )
    mae = -results["test_neg_mean_absolute_error"]
    rmse = -results["test_neg_root_mean_squared_error"]
    return {
        "mae": float(mae.mean()), "mae_std": float(mae.std()),
        "rmse": float(rmse.mean()), "rmse_std": float(rmse.std()),
    }


def score_naive(X: pd.DataFrame, y: pd.Series) -> dict:
    y_hat = X[TARGET_METRIC].dropna()
    y_true = y.loc[y_hat.index]
    mae = float(mean_absolute_error(y_true, y_hat))
    rmse = float(root_mean_squared_error(y_true, y_hat))
    print(f"[model] Naive    MAE={mae:.3f}          RMSE={rmse:.3f}")
    return {"mae": mae, "rmse": rmse}


def train_ridge(
    X: pd.DataFrame, y: pd.Series, groups: pd.Series
) -> tuple[Pipeline, dict]:
    pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("ridge", Ridge(alpha=1.0)),
    ])
    scores = _cv_scores(pipe, X, y, groups)
    print(
        f"[model] Ridge    MAE={scores['mae']:.3f}+/-{scores['mae_std']:.3f}  "
        f"RMSE={scores['rmse']:.3f}+/-{scores['rmse_std']:.3f}"
    )
    pipe.fit(X, y)
    return pipe, scores


def train_lgbm(
    X: pd.DataFrame, y: pd.Series, groups: pd.Series
) -> tuple[lgb.LGBMRegressor, dict]:
    model = lgb.LGBMRegressor(
        n_estimators=1000,
        learning_rate=0.02,
        num_leaves=15,
        min_child_samples=20,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_lambda=1.0,
        random_state=RANDOM_SEED,
        n_jobs=1,
        verbose=-1,
    )
    scores = _cv_scores(model, X, y, groups)
    print(
        f"[model] LightGBM MAE={scores['mae']:.3f}+/-{scores['mae_std']:.3f}  "
        f"RMSE={scores['rmse']:.3f}+/-{scores['rmse_std']:.3f}"
    )
    model.fit(X, y)
    return model, scores


def shap_importance(
    model: lgb.LGBMRegressor, X: pd.DataFrame, top_n: int = 12
) -> pd.Series:
    explainer = shap.TreeExplainer(model)
    shap_vals = explainer.shap_values(X)
    importance = pd.Series(
        np.abs(shap_vals).mean(axis=0),
        index=X.columns,
    ).sort_values(ascending=False)
    print(f"[model] SHAP feature importance (top {top_n}):")
    for feat, val in importance.head(top_n).items():
        print(f"  {feat:<25s} {val:.4f}")
    return importance


def save_models(ridge: Pipeline, lgbm_model: lgb.LGBMRegressor, scores: dict) -> None:
    MODEL_DIR.mkdir(exist_ok=True)
    joblib.dump(ridge, MODEL_RIDGE_PATH)
    joblib.dump(lgbm_model, MODEL_LGBM_PATH)
    with open(MODEL_SCORES_PATH, "w") as f:
        json.dump(scores, f, indent=2)
    print(f"[model] Saved ridge, lgbm, and scores to {MODEL_DIR.name}/")


def load_lgbm() -> lgb.LGBMRegressor | None:
    if MODEL_LGBM_PATH.exists():
        return joblib.load(MODEL_LGBM_PATH)
    return None


# Box stats to translate across competition levels (scoring, rebounding, playmaking, defense)
_BOX_STATS = ["ppg", "rpg", "apg", "spg", "bpg"]
# Context features shared across all per-stat Ridge models
_STAT_CONTEXT_FEATS = ["origin_level", "destination_level", "usg", "porpag", "exp_num", "inches", "pos_num"]


def train_stat_models(pairs: pd.DataFrame) -> dict:
    """
    Trains one Ridge pipeline per box stat (ppg, rpg, apg, spg, bpg) to translate
    a player's origin stats to what they'd produce at the destination competition level.
    Returns a dict keyed by stat name: {"model": Pipeline, "feature_cols": [...]}.
    """
    models = {}
    for stat in _BOX_STATS:
        dest_col = f"dest_{stat}"
        if dest_col not in pairs.columns or stat not in pairs.columns:
            print(f"[model] Stat model {stat}: skipped (missing column {dest_col})")
            continue
        context = [f for f in _STAT_CONTEXT_FEATS if f in pairs.columns]
        feat_cols = [stat] + context
        sub = pairs[feat_cols + [dest_col]].dropna()
        if len(sub) < 100:
            print(f"[model] Stat model {stat}: skipped (only {len(sub)} complete rows)")
            continue
        X = sub[feat_cols]
        y = sub[dest_col]
        pipe = Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("ridge", Ridge(alpha=1.0)),
        ])
        pipe.fit(X, y)
        train_mae = float(mean_absolute_error(y, pipe.predict(X)))
        print(f"[model] Stat model {stat:<5s}: train MAE={train_mae:.3f}  n={len(sub):,}")
        models[stat] = {"model": pipe, "feature_cols": feat_cols}
    return models


def save_stat_models(models: dict) -> None:
    MODEL_DIR.mkdir(exist_ok=True)
    joblib.dump(models, MODEL_STAT_MODELS_PATH)
    print(f"[model] Saved {len(models)} stat models to {MODEL_STAT_MODELS_PATH.name}")


def load_stat_models() -> dict | None:
    if MODEL_STAT_MODELS_PATH.exists():
        return joblib.load(MODEL_STAT_MODELS_PATH)
    return None
