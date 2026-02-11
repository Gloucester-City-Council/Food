"""
Configuration for the GCC Food Inspection System.
Override via environment variables or a .env file.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Flask server
PORT = int(os.getenv("PORT", "5000"))
HOST = os.getenv("HOST", "127.0.0.1")
DEBUG = os.getenv("FLASK_DEBUG", "0") == "1"

# Idox Uniform SOAP Licensing Connector
UNIFORM_SERVER = os.getenv("UNIFORM_SERVER", "apphst56a.gloucester.idox")
UNIFORM_DATABASE_ID = os.getenv("UNIFORM_DATABASE_ID", "")
UNIFORM_STATE_SWITCH = os.getenv("UNIFORM_STATE_SWITCH", "_TEST")
UNIFORM_USERNAME = os.getenv("UNIFORM_USERNAME", "")
UNIFORM_PASSWORD = os.getenv("UNIFORM_PASSWORD", "")
UNIFORM_TIMEOUT = int(os.getenv("UNIFORM_TIMEOUT", "30"))

# Derived SOAP endpoint URL
UNIFORM_WSDL_URL = (
    f"http://{UNIFORM_SERVER}"
    f"/LicensingConnectorService{UNIFORM_STATE_SWITCH}"
    f"/LicensingConnectorServices.asmx?WSDL"
)

# SQLite database
DB_PATH = os.getenv("DB_PATH", "data/food_inspections.db")

# Report output directory
REPORT_OUTPUT = os.getenv("REPORT_OUTPUT", "data/reports")

# UK Food Hygiene Rating Scheme (FHRS) risk-based inspection intervals
# Food Law Code of Practice (England) Annex 5
INSPECTION_INTERVALS = {
    "A": {"months": 6, "description": "High risk - at least every 6 months"},
    "B": {"months": 12, "description": "Upper medium risk - at least every 12 months"},
    "C": {"months": 18, "description": "Medium risk - at least every 18 months"},
    "D": {"months": 24, "description": "Lower medium risk - at least every 24 months"},
    "E": {"months": 36, "description": "Low risk - alternative enforcement strategy or 3-yearly"},
}

# FHRS scoring thresholds (lower total = better rating)
FHRS_THRESHOLDS = [
    {"max_score": 15, "rating": 5, "label": "Very Good"},
    {"max_score": 20, "rating": 4, "label": "Good"},
    {"max_score": 30, "rating": 3, "label": "Generally Satisfactory"},
    {"max_score": 40, "rating": 2, "label": "Improvement Necessary"},
    {"max_score": 50, "rating": 1, "label": "Major Improvement Necessary"},
    {"max_score": 999, "rating": 0, "label": "Urgent Improvement Required"},
]

# Council contact details
COUNCIL = {
    "name": "Gloucester City Council",
    "department": "Environmental Health Department",
    "address": "Shire Hall, Westgate Street, Gloucester, GL1 2TG",
    "telephone": "01452 396396",
    "email": "environmentalhealth@gloucester.gov.uk",
    "website": "www.gloucester.gov.uk",
}
