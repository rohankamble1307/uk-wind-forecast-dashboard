
from datetime import date, datetime, time, timedelta, timezone
from math import sqrt, isfinite
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware


# ============================================================
# CONFIGURATION
# ============================================================

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
TIMEOUT = 60.0

app = FastAPI(
    title="GridWatt Wind Forecast API",
    description="UK wind generation forecast accuracy dashboard",
    version="1.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://uk-wind-forecast-dashboard-iota.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DATE HELPERS
# ============================================================

def utc_datetime(value: date, end_of_day: bool = False) -> str:
    if end_of_day:
        dt = datetime.combine(value, time(23, 59, 59))
    else:
        dt = datetime.combine(value, time.min)

    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None

    try:
        normalized = value.strip().replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)

        return parsed.astimezone(timezone.utc)

    except (ValueError, TypeError):
        return None


def timestamp_key(value: Any) -> str | None:
    parsed = parse_timestamp(value)

    if parsed is None:
        return None

    return parsed.strftime("%Y-%m-%dT%H:%M:%SZ")


def date_bounds(
    start_date: date,
    end_date: date,
) -> tuple[datetime, datetime]:
    start_bound = datetime.combine(
        start_date,
        time.min,
        tzinfo=timezone.utc,
    )
    end_bound = datetime.combine(
        end_date,
        time.max,
        tzinfo=timezone.utc,
    )

    return start_bound, end_bound


def validate_dates(
    start_date: date,
    end_date: date,
) -> None:
    if start_date > end_date:
        raise HTTPException(
            status_code=400,
            detail="start_date must be before or equal to end_date",
        )

    if (end_date - start_date).days > 92:
        raise HTTPException(
            status_code=400,
            detail="Maximum supported date range is 93 calendar days.",
        )


def is_target_interval(
    row: dict,
    start_bound: datetime,
    end_bound: datetime,
) -> bool:
    start_time = parse_timestamp(row.get("startTime"))

    return (
        start_time is not None
        and start_bound <= start_time <= end_bound
    )


# ============================================================
# API RESPONSE HELPERS
# ============================================================

def rows_from_payload(payload: Any) -> list[dict]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]

    if isinstance(payload, dict):
        for key in ("data", "result", "results", "items"):
            value = payload.get(key)

            if isinstance(value, list):
                return [
                    row for row in value
                    if isinstance(row, dict)
                ]

        if "startTime" in payload:
            return [payload]

    return []


async def fetch_json(
    path: str,
    params: dict[str, Any] | None = None,
) -> Any:
    url = f"{BASE_URL}/{path.lstrip('/')}"

    try:
        async with httpx.AsyncClient(
            timeout=TIMEOUT,
            follow_redirects=True,
        ) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()

    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Elexon API returned HTTP "
                f"{exc.response.status_code}: "
                f"{exc.response.text[:300]}"
            ),
        ) from exc

    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not connect to Elexon API: {exc}",
        ) from exc

    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="Elexon API returned invalid JSON.",
        ) from exc


def generation_value(row: dict) -> float | None:
    for key in ("generation", "quantity", "value"):
        value = row.get(key)

        if value is None:
            continue

        try:
            number = float(value)

            if isfinite(number):
                return number

        except (ValueError, TypeError):
            continue

    return None


def row_publish_time(row: dict) -> datetime | None:
    return parse_timestamp(
        row.get("publishTime")
        or row.get("publishDateTime")
        or row.get("publicationTime")
    )


# ============================================================
# FETCH ACTUAL WIND GENERATION
# Dataset: FUELHH
# ============================================================

async def get_actual_rows(
    start_date: date,
    end_date: date,
) -> list[dict]:
    start_bound, end_bound = date_bounds(start_date, end_date)

    publication_start = start_date
    publication_end = end_date + timedelta(days=3)

    payload = await fetch_json(
        "datasets/FUELHH/stream",
        {
            "publishDateTimeFrom": utc_datetime(publication_start),
            "publishDateTimeTo": utc_datetime(
                publication_end,
                end_of_day=True,
            ),
            "fuelType": "WIND",
        },
    )

    rows = rows_from_payload(payload)
    filtered = []

    for row in rows:
        if str(row.get("fuelType", "")).upper() != "WIND":
            continue

        if not is_target_interval(row, start_bound, end_bound):
            continue

        if generation_value(row) is None:
            continue

        filtered.append(row)

    return filtered


# ============================================================
# FETCH WIND FORECASTS
# Dataset: WINDFOR
# ============================================================

async def get_forecast_rows(
    start_date: date,
    end_date: date,
) -> list[dict]:
    start_bound, end_bound = date_bounds(start_date, end_date)

    # Include publications before the first requested delivery date.
    publication_start = start_date - timedelta(days=2)
    publication_end = end_date + timedelta(days=1)

    payload = await fetch_json(
        "datasets/WINDFOR/stream",
        {
            "publishDateTimeFrom": utc_datetime(publication_start),
            "publishDateTimeTo": utc_datetime(
                publication_end,
                end_of_day=True,
            ),
        },
    )

    rows = rows_from_payload(payload)
    filtered = []

    for row in rows:
        if not is_target_interval(row, start_bound, end_bound):
            continue

        if generation_value(row) is None:
            continue

        if row_publish_time(row) is None:
            continue

        filtered.append(row)

    return filtered


# ============================================================
# NORMALIZE ACTUALS TO HOURLY AVERAGES
# ============================================================

def build_actuals_map(rows: list[dict]) -> dict[str, dict]:
    """
    Deduplicate original actual intervals, then aggregate their
    generation values into hourly average MW.
    """
    interval_map: dict[str, dict] = {}

    for row in rows:
        original_key = timestamp_key(row.get("startTime"))
        value = generation_value(row)

        if original_key is None or value is None:
            continue

        publish_time = row_publish_time(row)
        existing = interval_map.get(original_key)

        if existing is None:
            interval_map[original_key] = {
                "value": value,
                "publish_time": publish_time,
            }
            continue

        old_publish = existing["publish_time"]

        if (
            publish_time is not None
            and (
                old_publish is None
                or publish_time > old_publish
            )
        ):
            interval_map[original_key] = {
                "value": value,
                "publish_time": publish_time,
            }

    hourly_groups: dict[str, list[float]] = {}

    for original_key, record in interval_map.items():
        timestamp = parse_timestamp(original_key)

        if timestamp is None:
            continue

        hour = timestamp.replace(
            minute=0,
            second=0,
            microsecond=0,
        )
        hour_key = hour.strftime("%Y-%m-%dT%H:%M:%SZ")

        hourly_groups.setdefault(hour_key, []).append(
            record["value"]
        )

    result: dict[str, dict] = {}

    for hour_key, values in hourly_groups.items():
        result[hour_key] = {
            "start_time": hour_key,
            "actual_generation": sum(values) / len(values),
            "intervals_aggregated": len(values),
        }

    return result


# ============================================================
# SELECT ELIGIBLE DAY-AHEAD FORECASTS
# ============================================================

def latest_eligible_forecasts(
    rows: list[dict],
) -> dict[str, dict]:
    """
    Keep the latest forecast published no later than 23:59:59 UTC
    on the day before the target interval.
    """
    result: dict[str, dict] = {}

    for row in rows:
        target_key = timestamp_key(row.get("startTime"))
        publish_time = row_publish_time(row)
        forecast_value = generation_value(row)

        if (
            target_key is None
            or publish_time is None
            or forecast_value is None
        ):
            continue

        target_time = parse_timestamp(target_key)

        if target_time is None:
            continue

        cutoff = datetime.combine(
            target_time.date() - timedelta(days=1),
            time(23, 59, 59),
            tzinfo=timezone.utc,
        )

        if publish_time > cutoff:
            continue

        existing = result.get(target_key)

        if existing is None:
            result[target_key] = {
                "start_time": target_key,
                "forecast_generation": forecast_value,
                "publish_time": publish_time.isoformat(),
            }
            continue

        existing_publish = parse_timestamp(
            existing["publish_time"]
        )

        if (
            existing_publish is None
            or publish_time > existing_publish
        ):
            result[target_key] = {
                "start_time": target_key,
                "forecast_generation": forecast_value,
                "publish_time": publish_time.isoformat(),
            }

    return result


# ============================================================
# MAE / RMSE CALCULATIONS
# ============================================================

def calculate_metrics(comparisons: list[dict]) -> dict:
    if not comparisons:
        return {
            "mae_mw": None,
            "rmse_mw": None,
            "mean_error_mw": None,
        }

    errors = []

    for row in comparisons:
        actual = float(row["actual_generation"])
        forecast = float(row["forecast_generation"])
        errors.append(forecast - actual)

    count = len(errors)

    mae = sum(abs(error) for error in errors) / count

    rmse = sqrt(
        sum(error ** 2 for error in errors) / count
    )

    mean_error = sum(errors) / count

    return {
        "mae_mw": round(mae, 3),
        "rmse_mw": round(rmse, 3),
        "mean_error_mw": round(mean_error, 3),
    }


# ============================================================
# API ROUTES
# ============================================================

@app.get("/")
async def root():
    return {
        "name": "GridWatt Wind Forecast API",
        "version": "1.3.0",
        "status": "running",
        "docs": "/docs",
        "endpoints": [
            "/health",
            "/api/actuals",
            "/api/forecasts",
            "/api/accuracy",
        ],
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "GridWatt Wind Forecast API",
    }


@app.get("/api/actuals")
async def actuals(
    start_date: date = Query(...),
    end_date: date = Query(...),
):
    validate_dates(start_date, end_date)

    rows = await get_actual_rows(start_date, end_date)
    actual_map = build_actuals_map(rows)

    data = sorted(
        actual_map.values(),
        key=lambda item: item["start_time"],
    )

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "count": len(data),
        "actuals": data,
    }


@app.get("/api/forecasts")
async def forecasts(
    start_date: date = Query(...),
    end_date: date = Query(...),
):
    validate_dates(start_date, end_date)

    rows = await get_forecast_rows(start_date, end_date)
    forecast_map = latest_eligible_forecasts(rows)

    data = sorted(
        forecast_map.values(),
        key=lambda item: item["start_time"],
    )

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "count": len(data),
        "forecasts": data,
    }


@app.get("/api/accuracy")
async def accuracy(
    start_date: date = Query(...),
    end_date: date = Query(...),
):
    validate_dates(start_date, end_date)

    actual_rows = await get_actual_rows(start_date, end_date)
    forecast_rows = await get_forecast_rows(start_date, end_date)

    actual_map = build_actuals_map(actual_rows)
    forecast_map = latest_eligible_forecasts(forecast_rows)

    comparisons = []

    for key in sorted(set(actual_map) & set(forecast_map)):
        actual_record = actual_map[key]
        forecast_record = forecast_map[key]

        actual_value = actual_record["actual_generation"]
        forecast_value = forecast_record["forecast_generation"]
        error = forecast_value - actual_value

        comparisons.append({
            "start_time": key,
            "actual_generation": round(actual_value, 3),
            "forecast_generation": round(forecast_value, 3),
            "absolute_error": round(abs(error), 3),
            "error_mw": round(error, 3),
        })

    metrics = calculate_metrics(comparisons)

    actual_count = len(actual_map)
    forecast_count = len(forecast_map)
    matched_count = len(comparisons)

    missing_count = max(actual_count - matched_count, 0)

    match_rate = (
        round(matched_count / actual_count * 100, 2)
        if actual_count
        else 0
    )

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "actual_intervals": actual_count,
        "forecast_records": forecast_count,
        "eligible_forecast_intervals": forecast_count,
        "matched_intervals": matched_count,
        "missing_forecasts": missing_count,
        "match_rate_percent": match_rate,
        "mae_mw": metrics["mae_mw"],
        "rmse_mw": metrics["rmse_mw"],
        "mean_error_mw": metrics["mean_error_mw"],
        "comparisons": comparisons,
    }

