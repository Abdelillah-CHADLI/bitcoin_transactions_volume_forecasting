# Bitcoin Transaction Volume — Time-Series Analysis & Forecasting Dashboard

Individual project for the **TSAC 2025/2026** course.

A time-series analysis of **17 years of Bitcoin transaction volume** (Jan 2009 → May 2026, 1,581 observations at 4-day spacing) using classical Box–Jenkins methodology, with an interactive web dashboard that lets you re-run the model with custom parameters, refresh the dataset live from blockchain.com, and inspect the diagnostics.

## Repository layout

| Path | Stack | Purpose |
|---|---|---|
| `notebook/project.ipynb` | R · forecast · tseries | Course deliverable — the full Box-Jenkins pipeline with commentary, formal stationarity tests, residual diagnostics, baseline comparisons. |
| `notebook/n-transactions.json` | — | Latest snapshot of the blockchain.com `n-transactions` chart (refreshable from the dashboard). |
| `backend/` | Python · FastAPI · statsmodels · scipy | REST API that re-implements the notebook's ARIMA pipeline in Python. |
| `frontend/` | React · TypeScript · Vite · Tailwind · Recharts | Interactive dashboard: forecast plot with prediction intervals, holdout vs Naïve comparison, residual diagnostics, ACF/PACF correlograms, ADF/KPSS verdicts, ARIMA-order knobs. |

## Headline results

- **Selected model:** `ARIMA(2, 1, 3)` with drift on `log(transactions)`.
- **AIC** ≈ −63 (Python statsmodels), reproducing the R notebook's `auto.arima` exhaustive-search winner to 4 decimals.
- **Holdout (10 steps ≈ 40 days):** RMSE = 0.155 (log scale), **MASE = 0.73**, **28% lower RMSE than the Naïve random-walk baseline**.
- **Residual diagnostics:** Ljung-Box rejects white-noise residuals (p ≪ 0.001). The ARIMA leaves regime structure on the table; this is documented in both the notebook and the dashboard rather than glossed over.

## Quickstart

### 1. Backend (Python ≥ 3.10)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # or `source .venv/bin/activate` on Linux/Mac
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Swagger UI: <http://127.0.0.1:8000/docs>.

### 2. Frontend (Node ≥ 18)

```powershell
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api/*` to the FastAPI server, so both must be running.

Production build: `npm run build` → `frontend/dist/`.

### 3. R notebook

Open `notebook/project.ipynb` from the `notebook/` directory (so the relative path to `n-transactions.json` resolves) and run all cells. Required R packages: `jsonlite`, `dplyr`, `ggplot2`, `forecast`, `tseries`, `xts`.

## API surface

| Method & path | What it does |
|---|---|
| `GET /api/health` | Liveness probe. |
| `GET /api/data` | Full series + summary stats. |
| `POST /api/data/refresh` | Re-downloads the dataset from `api.blockchain.info/charts/n-transactions`. |
| `GET /api/diagnostics?n_lags=30` | ADF + KPSS tests and ACF/PACF for both the log level and Δlog series. |
| `POST /api/forecast` | Body: `{ p, d, q, with_trend, horizon, holdout }`. Returns AIC/BIC/parameters, Ljung-Box, holdout evaluation, and a forward forecast with 95% prediction intervals on both the log scale and the back-transformed original scale. |

## Methodology

1. **Variance stabilisation** — `Var(y) ∝ Level²`, justifying the `log` transform.
2. **Differencing order** proven by ADF (H₀: unit root) **and** KPSS (H₀: stationary), which must agree before `d = 1` is trusted.
3. **Identification** by ACF/PACF *plus* exhaustive `auto.arima` (`stepwise = FALSE`, `approximation = FALSE`).
4. **Residual diagnostics** — Ljung-Box at lags 10 and 20.
5. **Baselines** — Naïve random-walk and ETS, with MASE for scale-free comparison.
6. **Outlier sensitivity** — `tsclean()` removes 23 points; the cleaned series has *worse* holdout performance, so the original is preferred.
7. **Back-transformation** — the dashboard reports the log-normal mean (`exp(μ + σ²/2)`) and median (`exp(μ)`) separately, with a clear note that "MAPE on the log series" is **not** the same as "MAPE on transaction counts".

## Limitations & natural extensions

- **Regime-switching ARIMA** (Markov-switching or threshold) for Bitcoin's three macro-eras (cypherpunk → adoption → ETF).
- **ARIMA-GARCH** for the conditional heteroscedasticity in the residuals.
- **Non-linear / neural challengers** (Prophet, N-BEATS, LSTM).

## Stack

- **R:** `forecast`, `tseries`, `xts`, `dplyr`, `ggplot2`, `jsonlite`
- **Python:** FastAPI · statsmodels · scipy · pandas · numpy · requests
- **Frontend:** React 18 · TypeScript · Vite · TailwindCSS · Recharts · lucide-react

Data: [blockchain.com — Number of transactions chart](https://www.blockchain.com/charts/n-transactions).
