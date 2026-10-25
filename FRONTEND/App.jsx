
import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  CalendarDays,
  CheckCircle2,
  Cloud,
  RefreshCw,
  Wind,
  Zap,
  LayoutDashboard,
  Target,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./App.css";

const API_BASE =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const INITIAL_START = "2026-01-01";
const INITIAL_END = "2026-01-31";

function formatNumber(value, digits = 1) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  return Number(value).toLocaleString("en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function MetricCard({
  title,
  value,
  unit,
  subtitle,
  icon: Icon,
  tone,
}) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}>
        <Icon size={21} strokeWidth={1.8} />
      </div>

      <p className="metric-title">{title}</p>

      <div className="metric-value-row">
        <h3>{value}</h3>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>

      <p className="metric-subtitle">{subtitle}</p>
    </article>
  );
}

function App() {
  const [activePage, setActivePage] = useState("overview");

  const [startDate, setStartDate] = useState(INITIAL_START);
  const [endDate, setEndDate] = useState(INITIAL_END);

  const [appliedDates, setAppliedDates] = useState({
    start: INITIAL_START,
    end: INITIAL_END,
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  async function loadData(
    start = appliedDates.start,
    end = appliedDates.end
  ) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        start_date: start,
        end_date: end,
      });

      const response = await fetch(
        `${API_BASE}/api/accuracy?${params.toString()}`
      );

      if (!response.ok) {
        const details = await response.json().catch(() => ({}));

        throw new Error(
          typeof details.detail === "string"
            ? details.detail
            : `API request failed (${response.status})`
        );
      }

      const data = await response.json();

      const comparisons = (data.comparisons || []).map((item) => ({
        startTime: item.start_time ?? item.startTime,
        publishTime: item.publish_time ?? item.publishTime ?? null,
        actualGeneration:
          item.actual_generation ?? item.actualGeneration,
        forecastGeneration:
          item.forecast_generation ?? item.forecastGeneration,
        absoluteError:
          item.absolute_error ?? item.absoluteError,
        error: item.error_mw ?? item.error,
      }));

      setResult({
        metrics: {
          MAE: data.mae_mw ?? data.MAE ?? null,
          RMSE: data.rmse_mw ?? data.RMSE ?? null,
          actual_intervals: data.actual_intervals ?? 0,
          matched_intervals: data.matched_intervals ?? 0,
          missing_forecasts: data.missing_forecasts ?? 0,
          match_rate_percent: data.match_rate_percent ?? 0,
          forecast_records: data.forecast_records ?? 0,
        },
        comparisons,
      });

      setLastUpdated(new Date());
    } catch (err) {
      setError(
        `${err.message}. Make sure the FastAPI backend is running at ${API_BASE}.`
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(INITIAL_START, INITIAL_END);
    // Load initial data only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(event) {
    event.preventDefault();

    if (startDate > endDate) {
      setError("Start date must be on or before end date.");
      return;
    }

    setAppliedDates({
      start: startDate,
      end: endDate,
    });

    loadData(startDate, endDate);
  }

  const metrics = result?.metrics;
  const comparisons = result?.comparisons || [];

  const chartData = comparisons.map((item) => ({
    ...item,
    chartTime: item.startTime
      ? item.startTime.slice(5, 16).replace("T", " ")
      : "",
  }));

  const averageActual =
    comparisons.length > 0
      ? comparisons.reduce(
          (sum, item) =>
            sum + Number(item.actualGeneration || 0),
          0
        ) / comparisons.length
      : null;

  const accuracyCoverage =
    metrics?.actual_intervals > 0
      ? (metrics.matched_intervals /
          metrics.actual_intervals) *
        100
      : 0;

  const pageDetails = {
    overview: {
      title: "UK Wind Forecast Dashboard",
      breadcrumb: "Wind overview",
      description:
        "Understand forecast performance and wind generation for day-ahead electricity purchasing decisions.",
    },
    forecasts: {
      title: "Wind forecasts",
      breadcrumb: "Wind forecasts",
      description:
        "Compare forecasted wind generation with observed generation across delivery intervals.",
    },
    accuracy: {
      title: "Forecast accuracy",
      breadcrumb: "Forecast accuracy",
      description:
        "Evaluate day-ahead forecast errors using MAE, RMSE and interval-level comparisons.",
    },
  };

  const currentPage = pageDetails[activePage];

  function navigateTo(page) {
    setActivePage(page);
    setError("");
  }

  function renderFilters() {
    return (
      <section className="filter-panel">
        <div className="filter-heading">
          <div className="filter-symbol">
            <CalendarDays size={19} />
          </div>

          <div>
            <h2>Analysis period</h2>
            <p>Select the delivery dates to analyse</p>
          </div>
        </div>

        <form className="filter-form" onSubmit={handleSubmit}>
          <label>
            <span>FROM</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
          </label>

          <label>
            <span>TO</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              required
            />
          </label>

          <button
            type="submit"
            className="apply-button"
            disabled={loading}
          >
            {loading ? "Loading..." : "Apply filters"}
          </button>
        </form>
      </section>
    );
  }

  function renderMetrics() {
    return (
      <>
        <section className="section-header">
          <div>
            <h2>Performance overview</h2>
            <p>Metrics returned by the connected Python backend</p>
          </div>

          <span className="period-pill">
            {appliedDates.start} — {appliedDates.end}
          </span>
        </section>

        <section className="metrics-grid">
          <MetricCard
            title="Mean absolute error"
            value={formatNumber(metrics?.MAE)}
            unit="MW"
            subtitle="Average absolute forecast error"
            icon={Activity}
            tone="blue"
          />

          <MetricCard
            title="Root mean squared error"
            value={formatNumber(metrics?.RMSE)}
            unit="MW"
            subtitle="Penalises larger errors"
            icon={ArrowDownRight}
            tone="purple"
          />

          <MetricCard
            title="Matched intervals"
            value={formatNumber(metrics?.matched_intervals, 0)}
            subtitle={`${formatNumber(accuracyCoverage)}% of actual intervals matched`}
            icon={CheckCircle2}
            tone="green"
          />

          <MetricCard
            title="Missing forecasts"
            value={formatNumber(metrics?.missing_forecasts, 0)}
            subtitle="Actual intervals without eligible forecast"
            icon={AlertCircle}
            tone="orange"
          />
        </section>
      </>
    );
  }

  function renderChart() {
    return (
      <section className="chart-panel">
        <div className="panel-heading">
          <div>
            <h2>Actual vs forecast generation</h2>
            <p>Generation in MW across matched delivery intervals</p>
          </div>

          <div className="chart-legend-note">
            <span className="legend-dot actual-dot" /> Actual
            <span className="legend-dot forecast-dot" /> Forecast
          </div>
        </div>

        {chartData.length > 0 ? (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{
                  top: 12,
                  right: 12,
                  left: 4,
                  bottom: 8,
                }}
              >
                <defs>
                  <linearGradient
                    id="actualFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#2878f0"
                      stopOpacity={0.2}
                    />
                    <stop
                      offset="95%"
                      stopColor="#2878f0"
                      stopOpacity={0.01}
                    />
                  </linearGradient>

                  <linearGradient
                    id="forecastFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#16a37a"
                      stopOpacity={0.15}
                    />
                    <stop
                      offset="95%"
                      stopColor="#16a37a"
                      stopOpacity={0.01}
                    />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  stroke="#e9edf4"
                  strokeDasharray="4 5"
                />

                <XAxis
                  dataKey="chartTime"
                  tick={{ fill: "#778198", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={35}
                />

                <YAxis
                  tick={{ fill: "#778198", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={62}
                  tickFormatter={(value) =>
                    `${Math.round(value / 1000)}k`
                  }
                />

                <Tooltip
                  contentStyle={{
                    border: "1px solid #e4eaf2",
                    borderRadius: 12,
                    boxShadow: "0 8px 24px #15274412",
                  }}
                  formatter={(value, name) => [
                    `${formatNumber(value)} MW`,
                    name === "actualGeneration"
                      ? "Actual generation"
                      : "Forecast generation",
                  ]}
                  labelFormatter={(label) =>
                    `Delivery: ${label} UTC`
                  }
                />

                <Legend
                  formatter={(value) =>
                    value === "actualGeneration"
                      ? "Actual generation"
                      : "Forecast generation"
                  }
                />

                <Area
                  type="monotone"
                  dataKey="actualGeneration"
                  name="actualGeneration"
                  stroke="#2878f0"
                  strokeWidth={2}
                  fill="url(#actualFill)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />

                <Area
                  type="monotone"
                  dataKey="forecastGeneration"
                  name="forecastGeneration"
                  stroke="#16a37a"
                  strokeWidth={2}
                  fill="url(#forecastFill)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="empty-chart">
            <Activity size={32} />
            <h3>No matched data to plot</h3>
            <p>
              The backend returned no matching actual and forecast
              intervals for this period.
            </p>
          </div>
        )}

        <div className="chart-footer">
          <span>
            <span className="footer-dot" />
            {chartData.length.toLocaleString("en-GB")} matched data points
          </span>

          <span>
            Average actual generation:{" "}
            <strong>
              {averageActual === null
                ? "—"
                : `${formatNumber(averageActual)} MW`}
            </strong>
          </span>
        </div>
      </section>
    );
  }

  function renderTable() {
    return (
      <section className="table-panel">
        <div className="panel-heading">
          <div>
            <h2>Interval-level comparison</h2>
            <p>
              Actual values compared with selected day-ahead forecasts
            </p>
          </div>

          <span className="table-count">
            {comparisons.length.toLocaleString("en-GB")} records
          </span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>DELIVERY INTERVAL (UTC)</th>
                <th>FORECAST PUBLISHED (UTC)</th>
                <th>ACTUAL (MW)</th>
                <th>FORECAST (MW)</th>
                <th>ABS. ERROR (MW)</th>
              </tr>
            </thead>

            <tbody>
              {comparisons.slice(0, 12).map((row, index) => (
                <tr key={`${row.startTime}-${index}`}>
                  <td className="date-cell">
                    {formatDateTime(row.startTime)}
                  </td>

                  <td>{formatDateTime(row.publishTime)}</td>

                  <td>{formatNumber(row.actualGeneration)}</td>

                  <td>{formatNumber(row.forecastGeneration)}</td>

                  <td>
                    <span className="error-value">
                      {formatNumber(row.absoluteError)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {comparisons.length === 0 && (
            <div className="table-empty">
              No interval comparisons available for the selected dates.
            </div>
          )}
        </div>

        {comparisons.length > 12 && (
          <div className="table-footer">
            Showing the first 12 of{" "}
            {comparisons.length.toLocaleString("en-GB")} records.
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Wind size={25} />
          </div>

          <div>
            <h2>
              Grid<span>Watt</span>
            </h2>
            <p>ENERGY INTELLIGENCE</p>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <button
          type="button"
          className={`nav-item ${activePage === "overview" ? "active" : ""}`}
          onClick={() => navigateTo("overview")}
        >
          <LayoutDashboard size={18} />
          <span>Overview</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activePage === "forecasts" ? "active" : ""}`}
          onClick={() => navigateTo("forecasts")}
        >
          <Cloud size={18} />
          <span>Wind forecasts</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activePage === "accuracy" ? "active" : ""}`}
          onClick={() => navigateTo("accuracy")}
        >
          <Target size={18} />
          <span>Forecast accuracy</span>
        </button>

        <div className="sidebar-bottom">
          <div className="status-dot" />
          <div>
            <strong>BMRS data source</strong>
            <p>Official Elexon API</p>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>{currentPage.breadcrumb}</strong>
          </div>

          <div className="topbar-right">
            <span className="live-indicator" />
            <span>UK National Grid</span>
            <div className="avatar">UK</div>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              RENEWABLE ENERGY ANALYTICS
            </div>

            <h1>{currentPage.title}</h1>
            <p>{currentPage.description}</p>
          </div>

          <button
            type="button"
            className="refresh-button"
            onClick={() => loadData()}
            disabled={loading}
          >
            <RefreshCw
              size={16}
              className={loading ? "spin" : ""}
            />
            Refresh data
          </button>
        </section>

        {renderFilters()}

        {error && (
          <div className="error-banner">
            <AlertCircle size={20} />

            <div>
              <strong>Unable to load dashboard data</strong>
              <p>{String(error)}</p>
            </div>

            <button
              type="button"
              onClick={() => loadData()}
              aria-label="Retry"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        )}

        {loading && (
          <div className="loading-panel">
            <div className="loader" />
            <p>Fetching wind data and calculating metrics...</p>
          </div>
        )}

        {activePage === "overview" && (
          <>
            {renderMetrics()}
            {renderChart()}
            {renderTable()}
          </>
        )}

        {activePage === "forecasts" && (
          <>
            <section className="section-header">
              <div>
                <h2>Wind generation forecasts</h2>
                <p>
                  Forecast values and actual generation for the selected
                  delivery period
                </p>
              </div>

              <span className="period-pill">
                {appliedDates.start} — {appliedDates.end}
              </span>
            </section>

            {renderChart()}
            {renderTable()}
          </>
        )}

        {activePage === "accuracy" && (
          <>
            {renderMetrics()}
            {renderTable()}
          </>
        )}

        <footer className="page-footer">
          <div className="footer-brand">
            <Wind size={17} />
            GridWatt <span>· Wind analytics prototype</span>
          </div>

          <div>
            {lastUpdated
              ? `Last updated ${lastUpdated.toLocaleTimeString("en-GB")}`
              : "Waiting for data"}
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;
