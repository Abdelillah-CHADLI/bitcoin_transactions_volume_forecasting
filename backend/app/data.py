from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import requests

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_FILE = PROJECT_ROOT / "notebook" / "n-transactions.json"

BLOCKCHAIN_URL = (
    "https://api.blockchain.info/charts/n-transactions"
    "?timespan=all&format=json&sampled=true"
)


def _normalize_records(raw: dict[str, Any]) -> list[dict[str, Any]]:
    if "values" in raw:
        records = [
            {"x": int(p["x"]) * 1000, "y": int(p["y"])} for p in raw["values"]
        ]
    elif "n-transactions" in raw:
        records = [
            {"x": int(p["x"]), "y": int(p["y"])} for p in raw["n-transactions"]
        ]
    else:
        raise ValueError("Unexpected JSON schema: missing 'values' or 'n-transactions'")
    records.sort(key=lambda r: r["x"])
    return records


def load_dataframe() -> pd.DataFrame:
    if not DATA_FILE.exists():
        raise FileNotFoundError(
            f"Data file not found at {DATA_FILE}. Call refresh_from_api() first."
        )
    with DATA_FILE.open("r", encoding="utf-8") as f:
        raw = json.load(f)
    records = _normalize_records(raw)
    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["x"], unit="ms", utc=True).dt.tz_convert(None).dt.normalize()
    df = df.rename(columns={"y": "transactions"}).drop(columns=["x"])
    df = df.sort_values("date").drop_duplicates("date").reset_index(drop=True)
    return df[["date", "transactions"]]


def refresh_from_api(timeout: int = 30) -> dict[str, Any]:
    resp = requests.get(BLOCKCHAIN_URL, timeout=timeout)
    resp.raise_for_status()
    records = _normalize_records(resp.json())

    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(
        json.dumps({"n-transactions": records}, separators=(",", ":")),
        encoding="utf-8",
    )

    first = datetime.fromtimestamp(records[0]["x"] / 1000, tz=timezone.utc)
    last = datetime.fromtimestamp(records[-1]["x"] / 1000, tz=timezone.utc)
    return {
        "n_observations": len(records),
        "first_date": first.date().isoformat(),
        "last_date": last.date().isoformat(),
        "source": BLOCKCHAIN_URL,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def summarize(df: pd.DataFrame) -> dict[str, Any]:
    diffs = df["date"].diff().dt.days.dropna()
    spacing_mode = int(diffs.mode().iloc[0]) if not diffs.empty else None
    return {
        "n_observations": int(len(df)),
        "first_date": df["date"].iloc[0].date().isoformat(),
        "last_date": df["date"].iloc[-1].date().isoformat(),
        "min_transactions": int(df["transactions"].min()),
        "max_transactions": int(df["transactions"].max()),
        "mean_transactions": float(df["transactions"].mean()),
        "median_transactions": float(df["transactions"].median()),
        "spacing_days_mode": spacing_mode,
        "n_missing": int(df["transactions"].isna().sum()),
    }
