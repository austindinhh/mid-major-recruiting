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
    MODEL_DIR, MODEL_LGBM_PATH, MODEL_RIDGE_PATH, MODEL_SCORES_PATH,
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
