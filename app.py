"""
GCC Food Inspection Management System - Python/Flask

Main application entry point. Starts the Flask server, initialises
the database, syncs premises data from the Idox Uniform SOAP Licensing
Connector (or sample data), and serves the inspection management dashboard.

Architecture:
  +---------------------------------------------------+
  |            Flask Web Server (localhost)             |
  |  +-----------+  +----------------------------+    |
  |  | Dashboard  |  |       REST API             |    |
  |  | (Frontend) |  |  /api/premises             |    |
  |  |            |  |  /api/inspections           |    |
  |  |            |  |  /api/visit-sheets          |    |
  |  |            |  |  /api/reports               |    |
  |  |            |  |  /api/uniform/*             |    |
  |  +-----------+  +----------------------------+    |
  |                        |                          |
  |  +---------------------+------------------------+ |
  |  |           Service Layer                       | |
  |  |  +------------+  +---------------------+     | |
  |  |  | Scheduler   |  | Visit Sheet Gen     |     | |
  |  |  | (Risk/FHRS) |  | (Prepopulation)     |     | |
  |  |  +------------+  +---------------------+     | |
  |  |  +------------+  +---------------------+     | |
  |  |  | Report Gen  |  | Uniform Sync        |     | |
  |  |  | (Owner HTML)|  | (SOAP Connector)    |     | |
  |  |  +------------+  +---------------------+     | |
  |  +----------------------------------------------+ |
  |                        |                          |
  |  +---------------------+------------------------+ |
  |  |  +----------+  +---------------------------+  | |
  |  |  | SQLite    |  | Idox Uniform SOAP         |  | |
  |  |  | (Cache)   |  | Licensing Connector       |  | |
  |  |  +----------+  +---------------------------+  | |
  |  +----------------------------------------------+ |
  +---------------------------------------------------+

To run locally:
  1. Copy .env.example to .env and configure credentials
  2. pip install -r requirements.txt
  3. python app.py
"""
import logging
import os

from flask import Flask, send_from_directory

import config
import database
from services import uniform_sync
from routes.api import api

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(
    __name__,
    static_folder="static",
    template_folder="templates",
)

# Register API blueprint
app.register_blueprint(api, url_prefix="/api")


# -- Frontend Routes -------------------------------------------------------

@app.route("/")
def dashboard():
    """Serve the main dashboard."""
    return send_from_directory("templates", "dashboard.html")


@app.route("/form/")
@app.route("/form/<path:subpath>")
def inspection_form(subpath=None):
    """Serve the digital inspection form."""
    return send_from_directory("templates", "inspection_form.html")


@app.route("/visit-sheet/<path:premises_ref>")
def visit_sheet_viewer(premises_ref):
    """Serve the visit sheet viewer."""
    return send_from_directory("templates", "visit_sheet_viewer.html")


# -- Startup ---------------------------------------------------------------

def initialise():
    """Initialise database and sync premises data."""
    database.init_schema()
    logger.info("Database initialised")

    logger.info("Syncing premises from Idox Uniform SOAP connector...")
    sync_result = uniform_sync.sync_premises()
    logger.info("Sync source: %s", sync_result["source"])
    logger.info("Premises synced: %d", sync_result["count"])
    for err in sync_result.get("errors", []):
        logger.warning("Sync note: %s", err)

    return sync_result


if __name__ == "__main__":
    sync_result = initialise()

    print()
    print("=" * 60)
    print("  Gloucester City Council")
    print("  Food Inspection Management System")
    print("  (Python/Flask + Uniform SOAP Connector)")
    print("=" * 60)
    print(f"  Dashboard:       http://localhost:{config.PORT}/")
    print(f"  Inspection Form: http://localhost:{config.PORT}/form/")
    print(f"  API:             http://localhost:{config.PORT}/api/")
    print("=" * 60)
    print(f"  Uniform SOAP:    {config.UNIFORM_WSDL_URL}")
    print(f"  Database ID:     {config.UNIFORM_DATABASE_ID}")
    print(f"  State:           {config.UNIFORM_STATE_SWITCH}")
    print(f"  Premises loaded: {sync_result['count']}")
    print("=" * 60)
    print()

    app.run(
        host=config.HOST,
        port=config.PORT,
        debug=config.DEBUG,
    )
