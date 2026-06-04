import pandas as pd
from pathlib import Path


def load(path: Path) -> pd.DataFrame | None:
    if path.exists():
        print(f"[cache] Loading {path.name}")
        return pd.read_parquet(path)
    return None


def save(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, index=False)
    print(f"[cache] Saved {len(df):,} rows to {path.name}")
