import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const grid = "#1f2937";
const tickColor = "#94a3b8";
const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  color: "#e2e8f0",
  fontSize: 12,
};

const compactNumber = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + "k";
  if (Math.abs(v) < 1 && v !== 0) return v.toFixed(3);
  return v.toFixed(0);
};

export type SeriesChartPoint = {
  date: string;
  actual?: number | null;
  forecast?: number | null;
  lower?: number | null;
  upper?: number | null;
};

export function SeriesChart({
  data,
  yLabel,
  logScale = false,
  forecastStartIdx,
}: {
  data: SeriesChartPoint[];
  yLabel: string;
  logScale?: boolean;
  forecastStartIdx?: number;
}) {
  return (
    <div className="h-[420px] w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 24, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f7931a" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#f7931a" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fill: tickColor, fontSize: 11 }}
            minTickGap={48}
          />
          <YAxis
            tick={{ fill: tickColor, fontSize: 11 }}
            tickFormatter={compactNumber}
            scale={logScale ? "log" : "linear"}
            domain={logScale ? ["auto", "auto"] : [0, "auto"]}
            allowDataOverflow={logScale}
            label={{
              value: yLabel,
              angle: -90,
              position: "insideLeft",
              fill: tickColor,
              style: { fontSize: 11 },
            }}
          />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => compactNumber(v)} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#cbd5e1" }} />
          <Area
            type="monotone"
            dataKey="upper"
            stroke="none"
            fill="url(#bandGrad)"
            name="95% PI upper"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="lower"
            stroke="none"
            fill="#0b1020"
            name="95% PI lower"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#38bdf8"
            strokeWidth={1.5}
            dot={false}
            name="Observed"
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#f7931a"
            strokeWidth={2}
            dot={false}
            name="Forecast"
            isAnimationActive={false}
            connectNulls={false}
          />
          {forecastStartIdx !== undefined && data[forecastStartIdx] && (
            <ReferenceLine
              x={data[forecastStartIdx].date}
              stroke="#f7931a"
              strokeDasharray="4 4"
              label={{ value: "forecast →", fill: "#f7931a", fontSize: 11 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CorrelogramChart({
  values,
  band,
  title,
}: {
  values: number[];
  band: number;
  title: string;
}) {
  const data = values.map((v, i) => ({ lag: i, value: v }));
  return (
    <div>
      <div className="mb-1 text-xs text-slate-300 font-medium">{title}</div>
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="lag" tick={{ fill: tickColor, fontSize: 11 }} />
            <YAxis
              domain={[-1, 1]}
              tick={{ fill: tickColor, fontSize: 11 }}
              tickFormatter={(v) => v.toFixed(1)}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => v.toFixed(3)}
              labelFormatter={(l) => `lag ${l}`}
            />
            <ReferenceLine y={band} stroke="#64748b" strokeDasharray="4 4" />
            <ReferenceLine y={-band} stroke="#64748b" strokeDasharray="4 4" />
            <ReferenceLine y={0} stroke="#475569" />
            <Bar dataKey="value" fill="#38bdf8" maxBarSize={6} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function HoldoutChart({
  dates,
  actual,
  forecast,
  naive,
  lower,
  upper,
}: {
  dates: string[];
  actual: number[];
  forecast: number[];
  naive: number[];
  lower: number[];
  upper: number[];
}) {
  const data = dates.map((d, i) => ({
    date: d,
    actual: actual[i],
    forecast: forecast[i],
    naive: naive[i],
    lower: lower[i],
    upper: upper[i],
  }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="holdBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f7931a" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f7931a" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fill: tickColor, fontSize: 11 }} />
          <YAxis
            tick={{ fill: tickColor, fontSize: 11 }}
            tickFormatter={compactNumber}
            domain={["auto", "auto"]}
          />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => compactNumber(v)} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#cbd5e1" }} />
          <Area
            type="monotone"
            dataKey="upper"
            stroke="none"
            fill="url(#holdBand)"
            name="95% PI"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="lower"
            stroke="none"
            fill="#0b1020"
            name=""
            isAnimationActive={false}
            legendType="none"
          />
          <Line type="monotone" dataKey="actual" stroke="#22d3ee" strokeWidth={2} dot name="Actual" isAnimationActive={false} />
          <Line type="monotone" dataKey="forecast" stroke="#f7931a" strokeWidth={2} dot name="ARIMA" isAnimationActive={false} />
          <Line type="monotone" dataKey="naive" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 4" dot name="Naïve" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ResidualLine({ values }: { values: number[] }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
          <XAxis dataKey="i" hide />
          <YAxis tick={{ fill: tickColor, fontSize: 11 }} tickFormatter={(v) => v.toFixed(2)} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => v.toFixed(4)} />
          <ReferenceLine y={0} stroke="#475569" />
          <Line type="monotone" dataKey="v" stroke="#94a3b8" strokeWidth={1} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

