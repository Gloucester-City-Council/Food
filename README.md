# Food Inspection Management System

Gloucester City Council - Environmental Health Department

## Overview

A local Python/Flask application for managing food hygiene inspections, integrating
with the Idox Uniform back-office system via its SOAP Licensing Connector Service.

This application runs entirely on your local machine and connects to Uniform via
SOAP web services for licence lookups, party searches, and fee calculations.

## Quick Start

### Prerequisites

- **Python 3.10+** (download from python.org)
- **Git Desktop** (or Git CLI)
- Network access to the Uniform SOAP server (council internal network)

### Installation

1. **Clone the repository** using Git Desktop or CLI:
   ```
   git clone <repository-url>
   cd Food
   ```

2. **Create a virtual environment** (recommended):
   ```
   python -m venv venv
   venv\Scripts\activate       # Windows
   source venv/bin/activate    # macOS/Linux
   ```

3. **Install dependencies:**
   ```
   pip install -r requirements.txt
   ```

4. **Configure environment:**
   ```
   copy .env.example .env      # Windows
   cp .env.example .env        # macOS/Linux
   ```
   Then edit `.env` with your Uniform credentials:
   - `UNIFORM_SERVER` - Uniform server hostname
   - `UNIFORM_DATABASE_ID` - Database alias (from GetUniformDatabaseAliases)
   - `UNIFORM_STATE_SWITCH` - `_TEST` or `_LIVE`
   - `UNIFORM_USERNAME` - Your Uniform username
   - `UNIFORM_PASSWORD` - Your Uniform password

5. **Run the application:**
   ```
   python app.py
   ```

6. **Open in browser:**
   - Dashboard: http://localhost:5000/
   - Inspection Form: http://localhost:5000/form/
   - API: http://localhost:5000/api/status

## Architecture

```
Flask Web Server (localhost:5000)
  |
  +-- Dashboard (HTML/CSS/JS frontend)
  +-- REST API (/api/*)
  |     +-- Premises management
  |     +-- Inspection scheduling
  |     +-- Visit sheet generation
  |     +-- Report generation
  |     +-- Uniform SOAP operations
  |
  +-- Service Layer
  |     +-- Inspection Scheduler (FHRS risk-based)
  |     +-- Visit Sheet Pre-population
  |     +-- Report Generator (HTML)
  |     +-- Uniform Sync (SOAP)
  |
  +-- Data Layer
        +-- SQLite (local cache)
        +-- Idox Uniform SOAP Connector (zeep)
```

## Uniform SOAP Integration

The application uses the **Licensing Connector Service** WSDL to communicate
with Idox Uniform. Key operations:

- **Authentication:** `LogonToConnector` / `LogoffFromConnector` (session-based)
- **Licence Lookups:** `GetLIApplicationDetailsByReferenceValue`
- **Licence Verification:** `CheckLIApplicationExistsByReferenceValue`
- **Fee Calculations:** `GetLIApplicationFeeLookUp` / `GetLIFeeCalculate`
- **Party Search:** `GetPartyDetailsByClient`
- **Code Lookups:** `GetCnCodeList`, `GetCnCodeListByFieldName`
- **Submissions:** `SubmittedNewLicensingApplication`, renewals, transfers

The SOAP endpoint URL follows the pattern:
```
http://{server}/LicensingConnectorService{_TEST|_LIVE}/LicensingConnectorServices.asmx
```

## Project Structure

```
Food/
  app.py                    # Main Flask application
  config.py                 # Configuration (from .env)
  database.py               # SQLite database layer
  soap_client.py            # Uniform SOAP client (zeep)
  requirements.txt          # Python dependencies
  .env.example              # Environment template
  services/
    inspection_scheduler.py # Risk-based scheduling
    visit_sheet.py          # Visit sheet pre-population
    report_generator.py     # Owner report HTML generation
    uniform_sync.py         # Uniform sync orchestration
  routes/
    api.py                  # Flask API endpoints
  templates/
    dashboard.html          # Main dashboard
    inspection_form.html    # Digital inspection form
    visit_sheet_viewer.html # Visit sheet viewer
  static/
    css/                    # Stylesheets
    js/                     # Client-side JavaScript
  data/
    sample_premises.json    # Sample test data
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | System health check |
| POST | `/api/sync` | Sync premises from Uniform |
| GET | `/api/premises` | List all premises |
| GET | `/api/premises/<ref>` | Premises detail |
| GET | `/api/inspections/due` | Due inspections |
| GET | `/api/inspections/workload` | Workload summary |
| POST | `/api/inspections` | Create inspection |
| PUT | `/api/inspections/<id>/complete` | Complete inspection |
| GET | `/api/visit-sheets/<ref>` | Generate visit sheet |
| POST | `/api/reports/<id>` | Generate owner report |
| GET | `/api/uniform/licence/<ref>` | SOAP licence lookup |
| GET | `/api/uniform/licence-check/<ref>` | Check licence exists |
| GET | `/api/uniform/fees/<type>` | Fee lookup |
