export type SeriesPoint = { date: string; transactions: number };

export type DataSummary = {
  n_observations: number;
  first_date: string;
  last_date: string;
  min_transactions: number;
  max_transactions: number;
  mean_transactions: number;
  median_transactions: number;
  spacing_days_mode: number | null;
  n_missing: number;
};

export type DataResponse = { summary: DataSummary; series: SeriesPoint[] };

export type RefreshResponse = {
  meta: {
    n_observations: number;
    first_date: string;
    last_date: string;
    source: string;
    fetched_at: string;
  };
  summary: DataSummary;
};

export type Correlogram = {
  lags: number[];
  acf: number[];
  pacf: number[];
  confidence_band: number;
};

export type StationarityTests = {
  adf_statistic: number;
  adf_pvalue: number;
  adf_stationary: boolean;
  kpss_statistic: number;
  kpss_pvalue: number;
  kpss_stationary: boolean;
};

export type DiagnosticsResponse = {
  level: { stationarity: StationarityTests; correlogram: Correlogram };
  differenced: { stationarity: StationarityTests; correlogram: Correlogram };
};

export type ForecastRequest = {
  horizon: number;
  holdout: number;
  p: number;
  d: number;
  q: number;
  with_trend: boolean;
};

export type ForecastResponse = {
  model: {
    order: [number, number, number];
    with_trend: boolean;
    aic: number;
    bic: number;
    log_likelihood: number;
    params: Record<string, number>;
    sigma2_residual: number;
  };
  diagnostics: {
    ljung_box_10: { statistic: number; pvalue: number };
    ljung_box_20: { statistic: number; pvalue: number };
    white_noise_at_lag_10: boolean;
    white_noise_at_lag_20: boolean;
    residual_mean: number;
    residual_std: number;
    residual_skew: number;
    residual_kurtosis: number;
    n_residuals: number;
  };
  forecast: {
    dates: string[];
    log: { mean: number[]; lower: number[]; upper: number[] };
    original: {
      mean: number[];
      median: number[];
      lower: number[];
      upper: number[];
    };
  };
  holdout: null | {
    horizon: number;
    log_scale: {
      rmse: number;
      mae: number;
      mape_pct: number;
      mase: number;
      rmse_naive: number;
      rmse_ratio_vs_naive: number | null;
    };
    original_scale: { rmse: number; mape_pct: number };
    forecast_log: number[];
    forecast_lower_log: number[];
    forecast_upper_log: number[];
    actual_log: number[];
    naive_log: number[];
    forecast_orig: number[];
    forecast_lower_orig: number[];
    forecast_upper_orig: number[];
    actual_orig: number[];
    dates: string[];
  };
};

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      detail = null;
    }
    throw new Error(
      `${res.status} ${res.statusText}: ${
        typeof detail === "object" && detail && "detail" in detail
          ? (detail as { detail: string }).detail
          : res.statusText
      }`
    );
  }
  return res.json() as Promise<T>;
}

export const api = {
  getData: () => jfetch<DataResponse>("/api/data"),
  refresh: () => jfetch<RefreshResponse>("/api/data/refresh", { method: "POST" }),
  getDiagnostics: (n_lags = 30) =>
    jfetch<DiagnosticsResponse>(`/api/diagnostics?n_lags=${n_lags}`),
  forecast: (req: ForecastRequest) =>
    jfetch<ForecastResponse>("/api/forecast", {
      method: "POST",
      body: JSON.stringify(req),
    }),
};
