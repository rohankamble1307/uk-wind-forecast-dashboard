# GridWatt — UK Wind Forecast Dashboard

A full-stack dashboard for analysing UK wind generation and evaluating day-ahead wind power forecasts using data from the official Elexon BMRS API.

## Overview

GridWatt helps users explore UK wind generation data, inspect wind forecasts, and evaluate forecast performance over a selected delivery period. The dashboard presents key metrics and visual comparisons to make forecast errors easier to understand.

## Features

- **Wind Generation Monitoring** — Explore actual UK wind generation data.
- **Day-Ahead Forecasts** — View wind generation forecasts for selected dates.
- **Forecast Accuracy Analysis** — Calculate Mean Absolute Error (MAE), Root Mean Squared Error (RMSE), and mean forecast error.
- **Interactive Date Filters** — Select a delivery period for analysis.
- **Data Visualisation** — Compare actual generation against forecast values.
- **REST API** — Retrieve data and metrics through a FastAPI backend.
- **Containerisation** — Docker configuration for running the frontend and backend services.

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | React, Vite |
| Backend | Python, FastAPI |
| HTTP Client | HTTPX |
| Data Source | Elexon BMRS API |
| Charts | Recharts |
| Icons | Lucide React |
| Deployment | Vercel, Render |
| Containerisation | Docker, Docker Compose |

## Architecture

```text
                  ┌──────────────────────┐
                  │       User           │
                  └──────────┬───────────┘
                             │
                  ┌──────────▼───────────┐
                  │  React + Vite        │
                  │  Dashboard           │
                  └──────────┬───────────┘
                             │ HTTP Requests
                  ┌──────────▼───────────┐
                  │  FastAPI Backend     │
                  │  Data & Metrics      │
                  └──────────┬───────────┘
                             │
                  ┌──────────▼───────────┐
                  │  Elexon BMRS API     │
                  │  UK Energy Data      │
                  └──────────────────────┘
```

## Data Source

GridWatt uses the official [Elexon BMRS API](https://data.elexon.co.uk/bmrs/api/v1) to retrieve UK electricity market data.

The backend uses:

- `FUELHH` — Half-hourly fuel generation data, filtered for wind generation.
- `WINDFOR` — Wind generation forecast data.

Forecast accuracy is evaluated by matching forecast and actual generation values for corresponding delivery intervals. Forecast publication times are considered when selecting eligible day-ahead forecasts.

## Forecast Accuracy Metrics

| Metric | Description |
|---|---|
| MAE | Average absolute difference between forecast and actual generation |
| RMSE | Square root of the mean squared forecast error; penalises larger errors |
| Mean Error | Average signed difference between forecast and actual generation |

Lower MAE and RMSE values generally indicate better forecast performance. The sign convention used for Mean Error depends on the backend calculation.

## Project Structure

```text
uk-wind-forecast-dashboard/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   └── App.jsx
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- npm
- Git

Docker is optional for running the application locally without containers.

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/uk-wind-forecast-dashboard.git
cd uk-wind-forecast-dashboard
```

Replace `YOUR_USERNAME` with your GitHub username.

### 2. Start the Backend

Open a terminal:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment on Windows:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the API:

```bash
uvicorn main:app --reload --port 8000
```

Backend URLs:

- API: `http://127.0.0.1:8000`
- Interactive API documentation: `http://127.0.0.1:8000/docs`

### 3. Start the Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL displayed by Vite, usually `http://localhost:5173`.

Ensure the frontend API base URL points to the running backend. For local development, the default backend URL is `http://127.0.0.1:8000`.

## Docker

The project includes Docker configuration for the frontend and backend.

Once Docker Desktop is running and the Docker Compose file is in the repository root, build and start the services with:

```bash
docker compose up --build
```

Stop the services with:

```bash
docker compose down
```

Verify the port mappings in `docker-compose.yml` before running the application.

## Deployment

The planned deployment setup is:

- **Frontend:** Vercel
- **Backend:** Render

After deploying the backend, configure the frontend's `VITE_API_URL` environment variable with the public backend URL. Make sure the backend CORS configuration allows the deployed frontend origin.

Deployment URLs will be added here after successful deployment.

## Limitations

- Forecast accuracy depends on the availability and quality of the source data.
- Forecasts and actual generation must be aligned to the same delivery intervals for valid comparisons.
- Metrics depend on the selected analysis period and the forecast publication cutoff.
- API availability and response times depend on the upstream data service.

## Future Improvements

- Add additional forecast performance visualisations.
- Compare forecast errors across different periods.
- Improve error handling and API response caching.
- Add automated tests for data processing and metric calculations.
- Improve deployment monitoring and documentation.

## Responsible Use

This dashboard is intended for data analysis and educational purposes. Its metrics should not be treated as a guarantee of future wind generation or electricity market outcomes.

## Author

Developed as a full-stack renewable energy analytics project.

## Acknowledgements

- [Elexon](https://www.elexon.co.uk/) — UK electricity market data.
- [Elexon BMRS API](https://data.elexon.co.uk/bmrs/api/v1) — Data access.
