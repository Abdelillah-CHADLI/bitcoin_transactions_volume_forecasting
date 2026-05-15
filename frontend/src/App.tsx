import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bitcoin,
  CheckCircle2,
  GitCompare,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { api, type DataResponse, type DiagnosticsResponse, type ForecastResponse } from "./api";
import { Card, Stat } from "./components/Card";
import {
  CorrelogramChart,
  HoldoutChart,
  ResidualLine,
  SeriesChart,
  type SeriesChartPoint,
} from "./components/Charts";

const formatNumber = (n: number, digits = 0) =>
  n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });

const formatCompact = (n: number) =>
  n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });

export default function App() {
  const [data, setData] = useState<DataResponse | null>(null);
  const [diag, setDiag] = useState<DiagnosticsResponse | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);

  const [loadingData, setLoadingData] = useState(false);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [p, setP] = useState(2);
  const [d, setD] = useState(1);
  const [q, setQ] = useState(3);
  const [withTrend, setWithTrend] = useState(true);
  const [horizon, setHorizon] = useState(20);
  const [holdout, setHoldout] = useState(10);

  const [scale, setScale] = useState<"linear" | "log">("linear");
  const [zoom, setZoom] = useState<"all" | "5y" | "1y" | "6m">("1y");

  useEffect(() => {
    void loadData();
    void loadDiagnostics();
  }, []);

  async function loadData() {
    setLoadingData(true);
    setError(null);
    try {
      setData(await api.getData());
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoadingData(false);
    }
  }

  async function loadDiagnostics() {
    setLoadingDiag(true);
    try {
      setDiag(await api.getDiagnostics(30));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoadingDiag(false);
    }
  }

  async function refreshFromApi() {
    setRefreshing(true);
    setError(null);
    try {
      await api.refresh();
      await Promise.all([loadData(), loadDiagnostics()]);
      setForecast(null);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  async function runForecast() {
    setLoadingForecast(true);
    setError(null);
    try {
      const res = await api.forecast({ horizon, holdout, p, d, q, with_trend: withTrend });
      setForecast(res);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoadingForecast(false);
    }
  }

  const chartData: SeriesChartPoint[] = useMemo(() => {
    if (!data) return [];

    let series = data.series;
    if (zoom !== "all") {
      const stepsBack = { "5y": 5 * 365 / 4, "1y": 365 / 4, "6m": 183 / 4 }[zoom];
      const start = Math.max(0, series.length - Math.floor(stepsBack));
      series = series.slice(start);
    }

    const points: SeriesChartPoint[] = series.map((p) => ({
      date: p.date,
      actual: p.transactions,
      forecast: null,
      lower: null,
      upper: null,
    }));

    if (forecast) {
      const fLast = points.length - 1;
      points[fLast] = {
        ...points[fLast],
        forecast: points[fLast].actual ?? null,
        lower: points[fLast].actual ?? null,
        upper: points[fLast].actual ?? null,
      };
      const f = forecast.forecast;
      for (let i = 0; i < f.dates.length; i++) {
        points.push({
          date: f.dates[i],
          actual: null,
          forecast: f.original.mean[i],
          lower: f.original.lower[i],
          upper: f.original.upper[i],
        });
      }
    }
    return points;
  }, [data, forecast, zoom]);

  const forecastStartIdx = useMemo(() => {
    if (!forecast || !data) return undefined;
    return chartData.findIndex((p) => p.actual === null && p.forecast !== null) - 1;
  }, [chartData, forecast, data]);

  return (
    <div className="min-h-full">
      <Header onRefresh={refreshFromApi} refreshing={refreshing} />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
        {error && (
          <div className="card card-pad border-rose-500/30 bg-rose-500/10 text-rose-200 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Summary stats */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {data ? (
            <>
              <Stat label="Observations" value={formatNumber(data.summary.n_observations)} />
              <Stat
                label="Date range"
                value={`${data.summary.first_date.slice(0, 7)} → ${data.summary.last_date.slice(0, 7)}`}
                hint={`spacing: ${data.summary.spacing_days_mode ?? "-"} days`}
              />
              <Stat
                label="Latest tx volume"
                value={formatCompact(data.series[data.series.length - 1].transactions)}
                hint={`peak: ${formatCompact(data.summary.max_transactions)}`}
              />
              <Stat
                label="Median tx volume"
                value={formatCompact(data.summary.median_transactions)}
                hint={`mean: ${formatCompact(data.summary.mean_transactions)}`}
              />
            </>
          ) : (
            <SkeletonStats />
          )}
        </section>

        {/* Series + forecast chart */}
        <Card
          title="Transaction Volume — Observed & Forecast"
          subtitle={
            forecast
              ? `ARIMA(${forecast.model.order.join(",")})${
                  forecast.model.with_trend ? " with drift" : ""
                } — forecast on the original (back-transformed) scale with a 95% prediction interval.`
              : "Run the model from the panel below to overlay an ARIMA forecast on the historical series."
          }
          right={
            <div className="flex flex-wrap items-center gap-2">
              <SegButtons
                value={zoom}
                onChange={(v) => setZoom(v as typeof zoom)}
                options={[
                  { v: "6m", label: "6M" },
                  { v: "1y", label: "1Y" },
                  { v: "5y", label: "5Y" },
                  { v: "all", label: "All" },
                ]}
              />
              <SegButtons
                value={scale}
                onChange={(v) => setScale(v as typeof scale)}
                options={[
                  { v: "linear", label: "Linear" },
                  { v: "log", label: "Log" },
                ]}
              />
            </div>
          }
        >
          {loadingData && !data ? (
            <Loading label="Loading series…" />
          ) : (
            <SeriesChart
              data={chartData}
              yLabel="transactions / 4d"
              logScale={scale === "log"}
              forecastStartIdx={forecastStartIdx ?? undefined}
            />
          )}
        </Card>

        {/* Model controls + outputs */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ModelPanel
            p={p}
            d={d}
            q={q}
            withTrend={withTrend}
            horizon={horizon}
            holdout={holdout}
            setP={setP}
            setD={setD}
            setQ={setQ}
            setWithTrend={setWithTrend}
            setHorizon={setHorizon}
            setHoldout={setHoldout}
            onRun={runForecast}
            running={loadingForecast}
          />

          <Card
            title="Model Fit"
            subtitle="Information criteria and estimated parameters from the full-sample fit."
            className="lg:col-span-2"
          >
            {forecast ? (
              <FitDetails f={forecast} />
            ) : (
              <EmptyHint icon={<BarChart3 className="h-5 w-5" />}>
                Run the model to see AIC, BIC, parameter estimates, and residual diagnostics.
              </EmptyHint>
            )}
          </Card>
        </section>

        {/* Holdout + residuals */}
        {forecast?.holdout && !("error" in forecast.holdout) && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card
              title="Holdout Evaluation"
              subtitle={`Out-of-sample comparison on the last ${forecast.holdout.horizon} observations vs a Naïve random-walk baseline.`}
            >
              <HoldoutChart
                dates={forecast.holdout.dates}
                actual={forecast.holdout.actual_orig}
                forecast={forecast.holdout.forecast_orig}
                naive={forecast.holdout.actual_orig.map(
                  (_, i) => Math.exp(forecast.holdout!.naive_log[i])
                )}
                lower={forecast.holdout.forecast_lower_orig}
                upper={forecast.holdout.forecast_upper_orig}
              />
              <HoldoutMetrics h={forecast.holdout} />
            </Card>

            <Card
              title="Residual Diagnostics"
              subtitle="If the residuals are white noise, the Ljung-Box p-value should be > 0.05."
            >
              <ResidualLine values={[]} />
              <DiagBlock f={forecast} />
            </Card>
          </section>
        )}

        {/* Stationarity + correlograms */}
        <Card
          title="Stationarity & Correlograms"
          subtitle="ADF and KPSS have opposite null hypotheses; both must agree before you trust the differencing order."
        >
          {loadingDiag && !diag ? (
            <Loading label="Loading diagnostics…" />
          ) : diag ? (
            <DiagnosticsBlock d={diag} />
          ) : null}
        </Card>

        <Footer />
      </main>
    </div>
  );
}

function Header({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  return (
    <header className="sticky top-0 z-20 backdrop-blur bg-ink-900/70 border-b border-white/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-bitcoin/15 border border-bitcoin/30">
            <Bitcoin className="h-5 w-5 text-bitcoin" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-semibold tracking-tight">
              Bitcoin Transaction Volume — ARIMA Forecasting
            </h1>
            <p className="text-xs text-slate-400">
              17-year time-series analysis · classical Box-Jenkins · interactive ARIMA
            </p>
          </div>
        </div>
        <button onClick={onRefresh} disabled={refreshing} className="btn-ghost">
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh data
        </button>
      </div>
    </header>
  );
}

function SegButtons<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg bg-white/5 border border-white/10 p-1">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-2.5 py-1 text-xs rounded-md transition ${
            value === o.v ? "bg-bitcoin text-black font-medium" : "text-slate-300 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ModelPanel(props: {
  p: number;
  d: number;
  q: number;
  withTrend: boolean;
  horizon: number;
  holdout: number;
  setP: (n: number) => void;
  setD: (n: number) => void;
  setQ: (n: number) => void;
  setWithTrend: (b: boolean) => void;
  setHorizon: (n: number) => void;
  setHoldout: (n: number) => void;
  onRun: () => void;
  running: boolean;
}) {
  const { p, d, q, withTrend, horizon, holdout, setP, setD, setQ, setWithTrend, setHorizon, setHoldout, onRun, running } = props;
  return (
    <Card title="ARIMA(p, d, q)" subtitle="Tune the order, drift, forecast horizon, and holdout size, then run.">
      <div className="grid grid-cols-3 gap-3">
        <NumField label="p (AR)" value={p} setValue={setP} min={0} max={5} />
        <NumField label="d (diff)" value={d} setValue={setD} min={0} max={2} />
        <NumField label="q (MA)" value={q} setValue={setQ} min={0} max={5} />
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
        <div>
          <div className="text-sm font-medium">Drift term</div>
          <div className="text-xs text-slate-400">Long-run growth rate (recommended on)</div>
        </div>
        <button
          onClick={() => setWithTrend(!withTrend)}
          className={`relative h-6 w-11 rounded-full transition ${
            withTrend ? "bg-bitcoin" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
              withTrend ? "left-5" : "left-0.5"
            }`}
          />
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <NumField label="Forecast horizon" value={horizon} setValue={setHorizon} min={1} max={200} hint="steps × 4 days" />
        <NumField label="Holdout size" value={holdout} setValue={setHoldout} min={0} max={200} hint="0 = disable" />
      </div>
      <button onClick={onRun} disabled={running} className="btn-primary w-full mt-5">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        Run model
      </button>
      <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
        Notebook reference: <span className="font-mono">ARIMA(2,1,3) with drift</span>, selected by{" "}
        <span className="font-mono">auto.arima</span> with exhaustive AIC search.
      </p>
    </Card>
  );
}

function NumField({
  label,
  value,
  setValue,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  setValue: (n: number) => void;
  min: number;
  max: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="stat-label">{label}</span>
      <input
        type="number"
        className="input mt-1 font-mono"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) setValue(Math.max(min, Math.min(max, n)));
        }}
      />
      {hint && <span className="text-[11px] text-slate-500 mt-1 block">{hint}</span>}
    </label>
  );
}

function FitDetails({ f }: { f: ForecastResponse }) {
  const params = Object.entries(f.model.params);
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="AIC" value={f.model.aic.toFixed(2)} />
        <MiniStat label="BIC" value={f.model.bic.toFixed(2)} />
        <MiniStat label="log-likelihood" value={f.model.log_likelihood.toFixed(2)} />
        <MiniStat label="σ² residual" value={f.model.sigma2_residual.toFixed(4)} />
      </div>
      <div className="mt-4">
        <div className="stat-label mb-2">Estimated parameters (log scale)</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {params.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between rounded-md bg-white/5 border border-white/10 px-3 py-1.5 text-xs"
            >
              <span className="font-mono text-slate-300">{k}</span>
              <span className="font-mono text-slate-50 tabular-nums">{v.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
      <div className="stat-label">{label}</div>
      <div className="font-mono text-base text-slate-50 mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function HoldoutMetrics({ h }: { h: NonNullable<ForecastResponse["holdout"]> & { error?: never } }) {
  const beats = h.log_scale.rmse_ratio_vs_naive !== null && h.log_scale.rmse_ratio_vs_naive < 1;
  return (
    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
      <MiniStat label="RMSE (log)" value={h.log_scale.rmse.toFixed(4)} />
      <MiniStat label="MAPE (log) %" value={h.log_scale.mape_pct.toFixed(3)} />
      <MiniStat label="MASE" value={h.log_scale.mase.toFixed(3)} />
      <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
        <div className="stat-label">vs Naïve</div>
        <div className="mt-0.5">
          {beats ? (
            <span className="badge-good">
              <CheckCircle2 className="h-3 w-3" />
              {(100 - h.log_scale.rmse_ratio_vs_naive! * 100).toFixed(1)}% better RMSE
            </span>
          ) : (
            <span className="badge-bad">
              <XCircle className="h-3 w-3" />
              underperforms
            </span>
          )}
        </div>
      </div>
      <div className="sm:col-span-4 text-[11px] text-slate-400 leading-relaxed">
        <strong className="text-slate-300">Note on MAPE:</strong> the MAPE here is computed on the{" "}
        <em>log</em> series (matching the R notebook). On the original transaction-count scale, this
        holdout RMSE is approximately{" "}
        <span className="font-mono">{formatCompact(h.original_scale.rmse)}</span> transactions and{" "}
        <span className="font-mono">{h.original_scale.mape_pct.toFixed(2)}%</span> MAPE.
      </div>
    </div>
  );
}

function DiagBlock({ f }: { f: ForecastResponse }) {
  const lb10 = f.diagnostics.ljung_box_10;
  const lb20 = f.diagnostics.ljung_box_20;
  const wn10 = f.diagnostics.white_noise_at_lag_10;
  const wn20 = f.diagnostics.white_noise_at_lag_20;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <DiagRow
          label="Ljung-Box at lag 10"
          stat={lb10.statistic}
          pvalue={lb10.pvalue}
          ok={wn10}
        />
        <DiagRow
          label="Ljung-Box at lag 20"
          stat={lb20.statistic}
          pvalue={lb20.pvalue}
          ok={wn20}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Residual mean" value={f.diagnostics.residual_mean.toExponential(2)} />
        <MiniStat label="Residual std" value={f.diagnostics.residual_std.toFixed(4)} />
        <MiniStat label="Skewness" value={f.diagnostics.residual_skew.toFixed(3)} />
        <MiniStat label="Excess kurtosis" value={f.diagnostics.residual_kurtosis.toFixed(3)} />
      </div>
      {!wn10 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-relaxed">
          <strong>Honest finding:</strong> Ljung-Box rejects white-noise residuals. ARIMA leaves some
          autocorrelation un-modeled — likely due to Bitcoin's regime shifts (cypherpunk → adoption →
          ETF era). Short-horizon point forecasts are still empirically strong.
        </div>
      )}
    </div>
  );
}

function DiagRow({
  label,
  stat,
  pvalue,
  ok,
}: {
  label: string;
  stat: number;
  pvalue: number;
  ok: boolean;
}) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
      <div className="stat-label">{label}</div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="font-mono text-sm text-slate-100">Q = {stat.toFixed(2)}</span>
        <span className="font-mono text-xs text-slate-400">
          p = {pvalue < 1e-4 ? pvalue.toExponential(2) : pvalue.toFixed(4)}
        </span>
      </div>
      <div className="mt-1.5">
        {ok ? (
          <span className="badge-good">
            <CheckCircle2 className="h-3 w-3" /> white noise
          </span>
        ) : (
          <span className="badge-warn">
            <GitCompare className="h-3 w-3" /> residual structure
          </span>
        )}
      </div>
    </div>
  );
}

function DiagnosticsBlock({ d }: { d: DiagnosticsResponse }) {
  return (
    <div className="space-y-6">
      <StationarityRow
        label="Log level series"
        s={d.level.stationarity}
        verdict={
          d.level.stationarity.kpss_stationary && d.level.stationarity.adf_stationary
            ? "stationary"
            : "non-stationary"
        }
      />
      <StationarityRow
        label="First-differenced log series (Δ log y)"
        s={d.differenced.stationarity}
        verdict={
          d.differenced.stationarity.kpss_stationary && d.differenced.stationarity.adf_stationary
            ? "stationary"
            : "non-stationary"
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CorrelogramChart
          values={d.level.correlogram.acf}
          band={d.level.correlogram.confidence_band}
          title="ACF — log level"
        />
        <CorrelogramChart
          values={d.level.correlogram.pacf}
          band={d.level.correlogram.confidence_band}
          title="PACF — log level"
        />
        <CorrelogramChart
          values={d.differenced.correlogram.acf}
          band={d.differenced.correlogram.confidence_band}
          title="ACF — Δ log series"
        />
        <CorrelogramChart
          values={d.differenced.correlogram.pacf}
          band={d.differenced.correlogram.confidence_band}
          title="PACF — Δ log series"
        />
      </div>
    </div>
  );
}

function StationarityRow({
  label,
  s,
  verdict,
}: {
  label: string;
  s: DiagnosticsResponse["level"]["stationarity"];
  verdict: "stationary" | "non-stationary";
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-slate-100">{label}</div>
        {verdict === "stationary" ? (
          <span className="badge-good">
            <CheckCircle2 className="h-3 w-3" /> stationary
          </span>
        ) : (
          <span className="badge-bad">
            <XCircle className="h-3 w-3" /> non-stationary
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
          <div className="flex items-baseline justify-between">
            <span className="text-slate-300">ADF</span>
            <span className="text-slate-400">H₀: unit root</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono">stat = {s.adf_statistic.toFixed(2)}</span>
            <span className="font-mono">
              p = {s.adf_pvalue < 1e-4 ? s.adf_pvalue.toExponential(2) : s.adf_pvalue.toFixed(4)}
            </span>
          </div>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
          <div className="flex items-baseline justify-between">
            <span className="text-slate-300">KPSS</span>
            <span className="text-slate-400">H₀: stationary</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono">stat = {s.kpss_statistic.toFixed(2)}</span>
            <span className="font-mono">
              p = {s.kpss_pvalue < 1e-4 ? s.kpss_pvalue.toExponential(2) : s.kpss_pvalue.toFixed(4)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="h-[420px] grid place-items-center text-slate-400">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}

function EmptyHint({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="grid place-items-center py-10 text-slate-400 text-sm">
      <div className="flex items-center gap-2">
        {icon}
        <span>{children}</span>
      </div>
    </div>
  );
}

function SkeletonStats() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card card-pad animate-pulse">
          <div className="h-3 w-20 bg-white/10 rounded" />
          <div className="mt-3 h-7 w-32 bg-white/10 rounded" />
        </div>
      ))}
    </>
  );
}

function Footer() {
  return (
    <footer className="pt-8 pb-12 text-center text-xs text-slate-500">
      Built with FastAPI · statsmodels · React · Recharts ·{" "}
      <a
        className="underline hover:text-slate-300"
        href="https://www.blockchain.com/charts/n-transactions"
        target="_blank"
        rel="noreferrer"
      >
        data: blockchain.com
      </a>
    </footer>
  );
}
