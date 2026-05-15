from __future__ import annotations

import math
import warnings
from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy import stats
from statsmodels.stats.diagnostic import acorr_ljungbox
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.stattools import acf, adfuller, kpss, pacf


def stationarity_tests(series: np.ndarray) -> dict[str, Any]:
    adf_stat, adf_p, *_ = adfuller(series, autolag="AIC")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        kpss_stat, kpss_p, *_ = kpss(series, regression="c", nlags="auto")
    return {
        "adf_statistic": float(adf_stat),
        "adf_pvalue": float(adf_p),
        "adf_stationary": bool(adf_p < 0.05),
        "kpss_statistic": float(kpss_stat),
        "kpss_pvalue": float(kpss_p),
        "kpss_stationary": bool(kpss_p > 0.05),
    }


def acf_pacf(series: np.ndarray, n_lags: int = 30) -> dict[str, Any]:
    n = len(series)
    n_lags = min(n_lags, n - 1)
    acf_vals = acf(series, nlags=n_lags, fft=True)
    pacf_vals = pacf(series, nlags=n_lags, method="ywm")
    band = 1.96 / math.sqrt(n)
    return {
        "lags": list(range(len(acf_vals))),
        "acf": acf_vals.tolist(),
        "pacf": pacf_vals.tolist(),
        "confidence_band": float(band),
    }


@dataclass
class FitResult:
    order: tuple[int, int, int]
    with_trend: bool
    aic: float
    bic: float
    log_likelihood: float
    params: dict[str, float]
    fitted_log: np.ndarray
    residuals: np.ndarray


def fit_arima_log(
    log_series: np.ndarray,
    order: tuple[int, int, int] = (2, 1, 3),
    with_trend: bool = True,
) -> tuple[Any, FitResult]:
    trend = "t" if with_trend and order[1] >= 1 else ("c" if with_trend else None)
    res = ARIMA(log_series, order=order, trend=trend).fit()

    info = FitResult(
        order=order,
        with_trend=with_trend,
        aic=float(res.aic),
        bic=float(res.bic),
        log_likelihood=float(res.llf),
        params={k: float(v) for k, v in zip(res.param_names, res.params)},
        fitted_log=np.asarray(res.fittedvalues, dtype=float),
        residuals=np.asarray(res.resid, dtype=float),
    )
    return res, info


def residual_diagnostics(residuals: np.ndarray, n_params: int) -> dict[str, Any]:
    r = np.asarray(residuals, dtype=float)
    r = r[~np.isnan(r)]
    if len(r) > 1 and abs(r[0]) < 1e-12:
        r = r[1:]
    lb10 = acorr_ljungbox(r, lags=[10], return_df=True).iloc[0]
    lb20 = acorr_ljungbox(r, lags=[20], return_df=True).iloc[0]
    return {
        "ljung_box_10": {"statistic": float(lb10["lb_stat"]), "pvalue": float(lb10["lb_pvalue"])},
        "ljung_box_20": {"statistic": float(lb20["lb_stat"]), "pvalue": float(lb20["lb_pvalue"])},
        "white_noise_at_lag_10": bool(lb10["lb_pvalue"] > 0.05),
        "white_noise_at_lag_20": bool(lb20["lb_pvalue"] > 0.05),
        "residual_mean": float(np.mean(r)),
        "residual_std": float(np.std(r, ddof=1)),
        "residual_skew": float(stats.skew(r)),
        "residual_kurtosis": float(stats.kurtosis(r, fisher=True)),
        "n_residuals": int(len(r)),
    }


def forecast_log_arima(res: Any, horizon: int, alpha: float = 0.05) -> dict[str, np.ndarray]:
    fc = res.get_forecast(steps=horizon)
    ci = fc.conf_int(alpha=alpha)
    if hasattr(ci, "values"):
        ci = ci.values
    return {
        "mean_log": np.asarray(fc.predicted_mean, dtype=float),
        "lower_log": ci[:, 0],
        "upper_log": ci[:, 1],
    }


def back_transform_forecast(
    fc: dict[str, np.ndarray], sigma2: float
) -> dict[str, np.ndarray]:
    mean_log = fc["mean_log"]
    return {
        "median_orig": np.exp(mean_log),
        "mean_orig": np.exp(mean_log + sigma2 / 2.0),
        "lower_orig": np.exp(fc["lower_log"]),
        "upper_orig": np.exp(fc["upper_log"]),
    }


def evaluate_holdout(
    log_series: np.ndarray,
    h: int = 10,
    order: tuple[int, int, int] = (2, 1, 3),
    with_trend: bool = True,
) -> dict[str, Any]:
    if h <= 0 or h >= len(log_series):
        raise ValueError("h must be between 1 and len(series)-1")

    train = log_series[:-h]
    test = log_series[-h:]

    res, _ = fit_arima_log(train, order=order, with_trend=with_trend)
    fc = forecast_log_arima(res, horizon=h)
    err_log = test - fc["mean_log"]

    naive_fc_log = np.full(h, train[-1])
    err_naive = test - naive_fc_log

    rmse_log = float(np.sqrt(np.mean(err_log ** 2)))
    mae_log = float(np.mean(np.abs(err_log)))
    mape_log = float(np.mean(np.abs(err_log) / np.abs(test)) * 100.0)

    scale = float(np.mean(np.abs(np.diff(train))))
    mase = float(np.mean(np.abs(err_log)) / scale) if scale > 0 else float("nan")

    rmse_naive = float(np.sqrt(np.mean(err_naive ** 2)))

    sigma2 = float(np.var(res.resid[1:], ddof=1))
    fc_orig = back_transform_forecast(fc, sigma2=sigma2)
    test_orig = np.exp(test)
    err_orig = test_orig - fc_orig["mean_orig"]
    rmse_orig = float(np.sqrt(np.mean(err_orig ** 2)))
    mape_orig = float(np.mean(np.abs(err_orig) / np.abs(test_orig)) * 100.0)

    return {
        "horizon": int(h),
        "log_scale": {
            "rmse": rmse_log,
            "mae": mae_log,
            "mape_pct": mape_log,
            "mase": mase,
            "rmse_naive": rmse_naive,
            "rmse_ratio_vs_naive": rmse_log / rmse_naive if rmse_naive > 0 else None,
        },
        "original_scale": {"rmse": rmse_orig, "mape_pct": mape_orig},
        "forecast_log": fc["mean_log"].tolist(),
        "forecast_lower_log": fc["lower_log"].tolist(),
        "forecast_upper_log": fc["upper_log"].tolist(),
        "actual_log": test.tolist(),
        "naive_log": naive_fc_log.tolist(),
        "forecast_orig": fc_orig["mean_orig"].tolist(),
        "forecast_lower_orig": fc_orig["lower_orig"].tolist(),
        "forecast_upper_orig": fc_orig["upper_orig"].tolist(),
        "actual_orig": test_orig.tolist(),
    }
