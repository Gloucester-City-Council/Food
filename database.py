"""
SQLite database service for local caching of premises data and
management of inspection records.

Acts as a local mirror of Idox Uniform data so that officers can
work offline, and stores inspection visit sheets and generated reports.
"""
import os
import sqlite3
import json
import random
from datetime import datetime

import config

_db = None


def get_db():
    """Get or create the SQLite database connection."""
    global _db
    if _db is None:
        db_path = os.path.abspath(config.DB_PATH)
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        _db = sqlite3.connect(db_path, check_same_thread=False)
        _db.row_factory = sqlite3.Row
        _db.execute("PRAGMA journal_mode=WAL")
        _db.execute("PRAGMA foreign_keys=ON")
        init_schema()
    return _db


def init_schema():
    """Create database tables if they don't already exist."""
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS premises (
            premises_ref TEXT PRIMARY KEY,
            uprn TEXT,
            business_name TEXT NOT NULL,
            trading_name TEXT,
            business_type TEXT,
            business_type_detail TEXT,
            food_business_operator TEXT,
            address_line1 TEXT,
            address_line2 TEXT,
            town TEXT,
            county TEXT,
            postcode TEXT,
            telephone TEXT,
            email TEXT,
            number_of_food_handlers INTEGER,
            risk_category TEXT,
            current_fhrs_rating INTEGER,
            registration_date TEXT,
            last_inspection_date TEXT,
            last_hygienic_score INTEGER,
            last_structure_score INTEGER,
            last_management_score INTEGER,
            next_inspection_due TEXT,
            trading_hours TEXT,
            water_supply TEXT,
            approval_status TEXT DEFAULT 'Registered',
            allergen_documentation INTEGER DEFAULT 0,
            haccp_in_place INTEGER DEFAULT 0,
            primary_authority TEXT,
            notes TEXT,
            synced_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS previous_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            premises_ref TEXT NOT NULL,
            action_date TEXT,
            action_type TEXT,
            detail TEXT,
            FOREIGN KEY (premises_ref) REFERENCES premises(premises_ref)
        );

        CREATE TABLE IF NOT EXISTS inspections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            premises_ref TEXT NOT NULL,
            reference_number TEXT UNIQUE,
            inspection_date TEXT,
            inspection_time TEXT,
            inspection_type TEXT,
            inspector_name TEXT,
            inspector_id TEXT,
            hygienic_score INTEGER,
            structure_score INTEGER,
            management_score INTEGER,
            total_score INTEGER,
            fhrs_rating INTEGER,
            enforcement_actions TEXT,
            actions_required TEXT,
            revisit_required INTEGER DEFAULT 0,
            revisit_date TEXT,
            additional_notes TEXT,
            status TEXT DEFAULT 'scheduled',
            created_at TEXT DEFAULT (datetime('now')),
            completed_at TEXT,
            FOREIGN KEY (premises_ref) REFERENCES premises(premises_ref)
        );

        CREATE TABLE IF NOT EXISTS visit_sheets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            inspection_id INTEGER,
            premises_ref TEXT NOT NULL,
            sheet_data TEXT,
            generated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (inspection_id) REFERENCES inspections(id),
            FOREIGN KEY (premises_ref) REFERENCES premises(premises_ref)
        );

        CREATE TABLE IF NOT EXISTS owner_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            inspection_id INTEGER NOT NULL,
            premises_ref TEXT NOT NULL,
            report_html TEXT,
            generated_at TEXT DEFAULT (datetime('now')),
            sent_at TEXT,
            FOREIGN KEY (inspection_id) REFERENCES inspections(id),
            FOREIGN KEY (premises_ref) REFERENCES premises(premises_ref)
        );

        CREATE INDEX IF NOT EXISTS idx_premises_next_inspection
            ON premises(next_inspection_due);
        CREATE INDEX IF NOT EXISTS idx_premises_risk
            ON premises(risk_category);
        CREATE INDEX IF NOT EXISTS idx_inspections_premises
            ON inspections(premises_ref);
        CREATE INDEX IF NOT EXISTS idx_inspections_date
            ON inspections(inspection_date);
    """)
    db.commit()


def _row_to_dict(row):
    """Convert a sqlite3.Row to a plain dict."""
    if row is None:
        return None
    return dict(row)


def _rows_to_dicts(rows):
    """Convert a list of sqlite3.Row objects to dicts."""
    return [dict(r) for r in rows]


# ── Premises ─────────────────────────────────────────────────────────────


def import_premises(premises_list):
    """
    Import premises from Uniform connector data (or sample data) into local cache.
    Accepts a list of dicts in the sample-premises.json format.
    """
    db = get_db()

    for p in premises_list:
        scores = p.get("lastInspectionScores") or {}
        address = p.get("address") or {}

        db.execute("""
            INSERT OR REPLACE INTO premises (
                premises_ref, uprn, business_name, trading_name, business_type,
                business_type_detail, food_business_operator, address_line1,
                address_line2, town, county, postcode, telephone, email,
                number_of_food_handlers, risk_category, current_fhrs_rating,
                registration_date, last_inspection_date, last_hygienic_score,
                last_structure_score, last_management_score, next_inspection_due,
                trading_hours, water_supply, approval_status, allergen_documentation,
                haccp_in_place, primary_authority, notes, synced_at, updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
            )
        """, (
            p.get("premisesRef"),
            p.get("uprn"),
            p.get("businessName"),
            p.get("tradingName") or p.get("businessName"),
            p.get("businessType"),
            p.get("businessTypeDetail"),
            p.get("foodBusinessOperator"),
            address.get("line1", ""),
            address.get("line2", ""),
            address.get("town", "Gloucester"),
            address.get("county", "Gloucestershire"),
            address.get("postcode", ""),
            p.get("telephone"),
            p.get("email"),
            p.get("numberOfFoodHandlers", 0),
            p.get("riskCategory", "C"),
            p.get("currentFhrsRating"),
            p.get("registrationDate"),
            p.get("lastInspectionDate"),
            scores.get("hygienicFoodHandling"),
            scores.get("structureAndCleaning"),
            scores.get("managementOfFoodSafety"),
            p.get("nextInspectionDue"),
            p.get("tradingHours"),
            p.get("waterSupply", "Mains"),
            p.get("approvalStatus", "Registered"),
            1 if p.get("allergenDocumentation") else 0,
            1 if p.get("haccpInPlace") else 0,
            p.get("primaryAuthority"),
            p.get("notes"),
        ))

        # Sync previous actions
        db.execute(
            "DELETE FROM previous_actions WHERE premises_ref = ?",
            (p.get("premisesRef"),)
        )
        for action in p.get("previousActions") or []:
            db.execute(
                "INSERT INTO previous_actions (premises_ref, action_date, action_type, detail) VALUES (?, ?, ?, ?)",
                (p.get("premisesRef"), action.get("date"), action.get("type"), action.get("detail")),
            )

    db.commit()
    return len(premises_list)


def get_premises_due_inspection(within_months=6):
    """Get all premises due for inspection within the next N months."""
    db = get_db()
    now = datetime.now()
    cutoff_year = now.year
    cutoff_month = now.month + within_months
    while cutoff_month > 12:
        cutoff_month -= 12
        cutoff_year += 1
    cutoff_str = f"{cutoff_year:04d}-{cutoff_month:02d}-{now.day:02d}"

    rows = db.execute("""
        SELECT * FROM premises
        WHERE approval_status = 'Registered'
          AND (next_inspection_due <= ? OR next_inspection_due IS NULL)
        ORDER BY
          CASE risk_category
            WHEN 'A' THEN 1
            WHEN 'B' THEN 2
            WHEN 'C' THEN 3
            WHEN 'D' THEN 4
            WHEN 'E' THEN 5
            ELSE 6
          END,
          next_inspection_due ASC
    """, (cutoff_str,)).fetchall()
    return _rows_to_dicts(rows)


def get_all_premises():
    """Get all premises ordered by name."""
    db = get_db()
    rows = db.execute("SELECT * FROM premises ORDER BY business_name").fetchall()
    return _rows_to_dicts(rows)


def get_premises(premises_ref):
    """Get a single premises by reference."""
    db = get_db()
    row = db.execute(
        "SELECT * FROM premises WHERE premises_ref = ?", (premises_ref,)
    ).fetchone()
    return _row_to_dict(row)


def get_previous_actions(premises_ref):
    """Get previous enforcement actions for a premises."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM previous_actions WHERE premises_ref = ? ORDER BY action_date DESC",
        (premises_ref,),
    ).fetchall()
    return _rows_to_dicts(rows)


# ── Inspections ──────────────────────────────────────────────────────────


def create_inspection(data):
    """Create a new scheduled inspection."""
    db = get_db()
    now_str = datetime.now().strftime("%Y%m%d")
    ref_num = f"GCC-FHI-{now_str}-{random.randint(0, 9999):04d}"

    cursor = db.execute("""
        INSERT INTO inspections (
            premises_ref, reference_number, inspection_date, inspection_time,
            inspection_type, inspector_name, inspector_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')
    """, (
        data.get("premisesRef"),
        ref_num,
        data.get("inspectionDate"),
        data.get("inspectionTime"),
        data.get("inspectionType", "routine"),
        data.get("inspectorName"),
        data.get("inspectorId"),
    ))
    db.commit()
    return {"id": cursor.lastrowid, "referenceNumber": ref_num}


def get_inspection(inspection_id):
    """Get an inspection record by ID."""
    db = get_db()
    row = db.execute(
        "SELECT * FROM inspections WHERE id = ?", (inspection_id,)
    ).fetchone()
    return _row_to_dict(row)


def get_inspections_for_premises(premises_ref):
    """Get all inspections for a premises."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM inspections WHERE premises_ref = ? ORDER BY inspection_date DESC",
        (premises_ref,),
    ).fetchall()
    return _rows_to_dicts(rows)


def complete_inspection(inspection_id, results):
    """Update an inspection with completion results."""
    db = get_db()
    total = (
        (results.get("hygienicScore") or 0)
        + (results.get("structureScore") or 0)
        + (results.get("managementScore") or 0)
    )
    db.execute("""
        UPDATE inspections SET
            hygienic_score = ?,
            structure_score = ?,
            management_score = ?,
            total_score = ?,
            fhrs_rating = ?,
            enforcement_actions = ?,
            actions_required = ?,
            revisit_required = ?,
            revisit_date = ?,
            additional_notes = ?,
            status = 'completed',
            completed_at = datetime('now')
        WHERE id = ?
    """, (
        results.get("hygienicScore"),
        results.get("structureScore"),
        results.get("managementScore"),
        total,
        results.get("fhrsRating"),
        results.get("enforcementActions"),
        results.get("actionsRequired"),
        1 if results.get("revisitRequired") else 0,
        results.get("revisitDate"),
        results.get("additionalNotes"),
        inspection_id,
    ))
    db.commit()


# ── Visit Sheets & Reports ──────────────────────────────────────────────


def save_visit_sheet(inspection_id, premises_ref, sheet_data):
    """Save a generated visit sheet."""
    db = get_db()
    cursor = db.execute(
        "INSERT INTO visit_sheets (inspection_id, premises_ref, sheet_data) VALUES (?, ?, ?)",
        (inspection_id, premises_ref, json.dumps(sheet_data)),
    )
    db.commit()
    return cursor.lastrowid


def get_visit_sheet(inspection_id):
    """Get visit sheet for an inspection."""
    db = get_db()
    row = db.execute(
        "SELECT * FROM visit_sheets WHERE inspection_id = ?", (inspection_id,)
    ).fetchone()
    return _row_to_dict(row)


def save_owner_report(inspection_id, premises_ref, report_html):
    """Save a generated owner report."""
    db = get_db()
    cursor = db.execute(
        "INSERT INTO owner_reports (inspection_id, premises_ref, report_html) VALUES (?, ?, ?)",
        (inspection_id, premises_ref, report_html),
    )
    db.commit()
    return cursor.lastrowid


def get_owner_report(inspection_id):
    """Get owner report for an inspection."""
    db = get_db()
    row = db.execute(
        "SELECT * FROM owner_reports WHERE inspection_id = ?", (inspection_id,)
    ).fetchone()
    return _row_to_dict(row)


def close():
    """Close the database connection."""
    global _db
    if _db is not None:
        _db.close()
        _db = None
