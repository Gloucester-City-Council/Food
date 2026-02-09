# Food Inspection Management System

Gloucester City Council - Environmental Health Department

## Overview

A food inspection management system that integrates with the **Idox Uniform commercial properties connector** (port 445) to extract commercial premises due for food hygiene inspection and pre-populate inspection visit sheets.

The system identifies all food premises due for inspection within the next 6 months, prioritises them using the Food Law Code of Practice (England) risk rating scheme, and generates pre-populated visit sheets that Environmental Health Officers can take on inspections.

## Architecture

```
┌──────────────────────────────────────────────┐
│           Express Web Server (:3000)          │
│  ┌──────────┐  ┌──────────────────────────┐  │
│  │ Dashboard │  │       REST API           │  │
│  │ (Frontend)│  │  /api/premises           │  │
│  │           │  │  /api/inspections/due    │  │
│  │           │  │  /api/visit-sheets/:ref  │  │
│  │           │  │  /api/reports/:id        │  │
│  └──────────┘  └──────────────────────────┘  │
│                          │                    │
│  ┌───────────────────────┴─────────────────┐  │
│  │           Service Layer                  │  │
│  │  ┌──────────────┐ ┌─────────────────┐   │  │
│  │  │  Scheduler    │ │ Visit Sheet Gen │   │  │
│  │  │  (FHRS Risk)  │ │ (Prepopulation) │   │  │
│  │  └──────────────┘ └─────────────────┘   │  │
│  │  ┌──────────────┐ ┌─────────────────┐   │  │
│  │  │ Report Gen   │ │ Uniform Sync    │   │  │
│  │  │ (Owner PDF)  │ │ (Connector)     │   │  │
│  │  └──────────────┘ └─────────────────┘   │  │
│  └─────────────────────────────────────────┘  │
│                          │                    │
│  ┌──────────┐  ┌────────────────────────┐     │
│  │ SQLite   │  │ Idox Uniform Connector │     │
│  │ (Cache)  │  │ (Port 445)             │     │
│  └──────────┘  └────────────────────────┘     │
└──────────────────────────────────────────────┘
```

## Features

### Idox Uniform Integration
- Connects to the Idox Uniform commercial properties connector on port 445
- Extracts all registered food premises with full business details
- Retrieves inspection history, risk ratings, and enforcement records
- Automatic retry with exponential backoff on connection failures
- Graceful fallback to cached/sample data when offline

### Inspection Scheduling Engine
- **Risk-based prioritisation** using Food Law Code of Practice Annex 5:
  - Category A: 6-monthly inspections (high risk)
  - Category B: 12-monthly inspections
  - Category C: 18-monthly inspections
  - Category D: 24-monthly inspections
  - Category E: 36-monthly/alternative enforcement
- Composite priority scoring considering: risk category, overdue status, enforcement history, previous FHRS rating, and new business status
- Workload summary with breakdowns by risk category, business type, and month

### Visit Sheet Pre-Population
- Fully pre-populated business details from Uniform data
- Previous inspection scores and FHRS rating
- Previous enforcement actions and outstanding requirements
- **Business-type-specific inspection focus areas** (10 business types covered)
- Pre-populated temperature check lists tailored to business type
- Officer briefing notes from previous visits
- Automatic detection of follow-up vs routine inspections

### Owner Report Generation
- Formal HTML reports for premises owners/FBOs
- FHRS rating display with score breakdown
- Enforcement actions and required improvements
- Right of appeal information (FSA safeguards)
- Legal framework references (Food Safety Act 1990, EC 852/2004)
- Council contact details
- Print-ready formatting

### Dashboard
- Overview with statistics: total due, overdue, new businesses, revisits required
- Breakdowns by risk category, business type, and month
- High priority inspection list
- Full premises register with search
- One-click visit sheet generation
- Premises detail view with full history

### Digital Inspection Form
- Complete FHRS-compliant inspection form
- Auto-population from dashboard with premises data
- Pre-filled temperature checks for business type
- Digital signatures
- Save/load drafts
- Print support

## Quick Start

```bash
# Install dependencies
npm install

# Start the server (syncs premises from Uniform or uses sample data)
npm start

# Open in browser
# Dashboard:       http://localhost:3000/
# Inspection Form: http://localhost:3000/form/
# API:             http://localhost:3000/api/
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Idox Uniform connector
UNIFORM_HOST=127.0.0.1
UNIFORM_PORT=445
UNIFORM_API_KEY=your-api-key
UNIFORM_USERNAME=your-username
UNIFORM_PASSWORD=your-password
```

When the Uniform connector is unavailable, the system automatically falls back to the sample dataset of 12 Gloucester premises.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | System health and Uniform connector status |
| POST | `/api/sync` | Trigger premises sync from Uniform |
| GET | `/api/premises` | List all registered food premises |
| GET | `/api/premises/:ref` | Premises detail with history |
| GET | `/api/inspections/due?months=6` | Premises due for inspection |
| GET | `/api/inspections/workload` | Workload summary statistics |
| POST | `/api/inspections` | Schedule a new inspection |
| PUT | `/api/inspections/:id/complete` | Record inspection results |
| GET | `/api/visit-sheets/:ref` | Generate pre-populated visit sheet |
| GET | `/api/visit-sheets` | Batch generate all due visit sheets |
| POST | `/api/reports/:id` | Generate owner report |
| GET | `/api/reports/:id/html` | View owner report as HTML |

## CLI Scripts

```bash
# Sync premises from Uniform connector
npm run sync-properties

# Generate owner reports for completed inspections
npm run generate-reports
```

## Project Structure

```
├── server/
│   ├── app.js                      # Express server entry point
│   ├── config/
│   │   └── default.js              # Configuration (FHRS thresholds, intervals)
│   ├── connectors/
│   │   └── uniform-client.js       # Idox Uniform REST connector client
│   ├── services/
│   │   ├── database.js             # SQLite database layer
│   │   ├── inspection-scheduler.js # Risk-based scheduling engine
│   │   ├── visit-sheet.js          # Visit sheet pre-population
│   │   ├── report-generator.js     # Owner report HTML generation
│   │   └── uniform-sync.js         # Uniform sync orchestration
│   ├── routes/
│   │   └── api.js                  # REST API routes
│   ├── data/
│   │   └── sample-premises.json    # Sample Gloucester premises data
│   └── scripts/
│       ├── sync-properties.js      # CLI: sync premises
│       └── generate-reports.js     # CLI: generate reports
├── public/
│   ├── views/
│   │   ├── dashboard.html          # Inspection management dashboard
│   │   └── visit-sheet-viewer.html # Visit sheet viewer
│   ├── css/
│   │   └── dashboard.css           # Dashboard styles
│   └── js/
│       └── dashboard.js            # Dashboard client-side logic
├── index.html                      # Digital food hygiene inspection form
├── script.js                       # Form logic (with auto-population)
├── styles.css                      # Form styles
└── package.json
```

## Regulatory Framework

This system implements requirements from:
- **Food Safety Act 1990** - Primary legislation for food safety in England
- **Food Hygiene (England) Regulations 2013** - Registration and inspection requirements
- **Regulation (EC) No 852/2004** - Hygiene of foodstuffs
- **Food Law Code of Practice (England)** - Annex 5 risk rating scheme
- **FSA Food Hygiene Rating Scheme** - Brand Standard for FHRS ratings
- **Regulation (EU) 1169/2011** - Allergen information requirements

## Next Phase Development

The following features are planned for the next development phase:
1. **Auto-populated owner reports** - Completed inspection data flows directly into formatted reports for FBOs
2. **Email delivery** - Reports sent automatically to premises operators
3. **Digital form integration** - Two-way sync between dashboard and digital inspection form
4. **Offline capability** - Full offline support with background sync
5. **Uniform write-back** - Push completed inspection results back to Idox Uniform
