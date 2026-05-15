from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .data import load_dataframe, refresh_from_api, summarize
from .model import (
    acf_pacf,
    back_transform_forecast,
    evaluate_holdout,
    fit_arima_log,
    forecast_log_arima,
    residual_diagnostics,
    stationarity_tests,
)

logging.basicConfig(level=logging.INFO)
LOG = logging.getLogger(__name__)

app = FastAPI(title="Bitcoin Transactions Forecasting API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ForecastRequest(BaseModel):
    horizon: int = Field(10, ge=1, le=200)
    holdout: int = Field(10, ge=0, le=200)
    p: int = Field(2, ge=0, le=5)
    d: int = Field(1, ge=0, le=2)
    q: int = Field(3, ge=0, le=5)
    with_trend: bool = Field(True)


def _df_to_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    return [
        {"date": d.date().isoformat(), "transactions": int(t)}
        for d, t in zip(df["date"], df["transactions"])
    ]


def _future_dates(last_date: pd.Timestamp, horizon: int, step_days: int = 4) -> list[str]:
    return [
        (last_date + timedelta(days=step_days * (i + 1))).date().isoformat()
        for i in range(horizon)
    ]


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/data")
def get_data() -> dict[str, Any]:
    df = load_dataframe()
    return {"summary": summarize(df), "series": _df_to_records(df)}


@app.post("/api/data/refresh")
def refresh_data() -> dict[str, Any]:
    try:
        meta = refresh_from_api()
    except Exception as exc:
        LOG.exception("Failed to refresh data")
        raise HTTPException(status_code=502, detail=f"Refresh failed: {exc}") from exc
    return {"meta": meta, "summary": summarize(load_dataframe())}


@app.get("/api/diagnostics")
def get_diagnostics(n_lags: int = 30) -> dict[str, Any]:
    df = load_dataframe()
    log_series = np.log(df["transactions"].astype(float).values)
    diff_log = np.diff(log_series)
    return {
        "level": {
            "stationarity": stationarity_tests(log_series),
            "correlogram": acf_pacf(log_series, n_lags=n_lags),
        },
        "differenced": {
            "stationarity": stationarity_tests(diff_log),
            "correlogram": acf_pacf(diff_log, n_lags=n_lags),
        },
    }


@app.post("/api/forecast")
def forecast(req: ForecastRequest) -> dict[str, Any]:
    df = load_dataframe()
    if len(df) < 50:
        raise HTTPException(status_code=400, detail="Not enough observations to fit ARIMA.")

    log_series = np.log(df["transactions"].astype(float).values)
    order = (req.p, req.d, req.q)

    try:
        full_res, full_info = fit_arima_log(log_series, order=order, with_trend=req.with_trend)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"ARIMA fit failed: {exc}") from exc

    fc_log = forecast_log_arima(full_res, horizon=req.horizon)
    sigma2 = float(np.var(full_info.residuals[1:], ddof=1))
    fc_orig = back_transform_forecast(fc_log, sigma2=sigma2)

    future_dates = _future_dates(df["date"].iloc[-1], req.horizon)

    diag = residual_diagnostics(full_info.residuals, n_params=req.p + req.q + int(req.with_trend))

    holdout = None
    if req.holdout and req.holdout < len(log_series):
        try:
            holdout = evaluate_holdout(
                log_series, h=req.holdout, order=order, with_trend=req.with_trend
            )
            holdout["dates"] = [
                d.date().isoformat() for d in df["date"].iloc[-req.holdout :]
            ]
        except Exception as exc:
            LOG.warning("Holdout evaluation failed: %s", exc)
            holdout = {"error": str(exc)}

    return {
        "model": {
            "order": list(order),
            "with_trend": req.with_trend,
            "aic": full_info.aic,
            "bic": full_info.bic,
            "log_likelihood": full_info.log_likelihood,
            "params": full_info.params,
            "sigma2_residual": sigma2,
        },
        "diagnostics": diag,
        "forecast": {
            "dates": future_dates,
            "log": {
                "mean": fc_log["mean_log"].tolist(),
                "lower": fc_log["lower_log"].tolist(),
                "upper": fc_log["upper_log"].tolist(),
            },
            "original": {
                "mean": fc_orig["mean_orig"].tolist(),
                "median": fc_orig["median_orig"].tolist(),
                "lower": fc_orig["lower_orig"].tolist(),
                "upper": fc_orig["upper_orig"].tolist(),
            },
        },
        "holdout": holdout,
    }
