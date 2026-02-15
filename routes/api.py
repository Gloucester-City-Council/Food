"""
API Routes for the Food Inspection Management System

Provides REST endpoints for:
  - Premises management (from Uniform connector)
  - Inspection scheduling and workload management
  - Visit sheet generation and pre-population
  - Report generation for premises owners
  - System status and Uniform connector health
  - SOAP licence lookups
  - Ad-hoc SOAP connectivity testing
"""
from flask import Blueprint, request, jsonify

import database
from soap_client import UniformSOAPClient
from services import inspection_scheduler as scheduler
from services import visit_sheet
from services import report_generator
from services import uniform_sync

api = Blueprint("api", __name__)


# -- System Status ---------------------------------------------------------

@api.route("/status")
def status():
    """System health check and Uniform SOAP connector status."""
    conn_status = uniform_sync.get_connection_status()
    return jsonify({
        "status": "operational",
        "uniformConnector": conn_status,
        "database": {"connected": True},
    })


@api.route("/sync", methods=["POST"])
def sync():
    """Trigger a sync of premises data from the Uniform connector."""
    try:
        result = uniform_sync.sync_premises()
        return jsonify({"success": True, **result})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# -- Premises --------------------------------------------------------------

@api.route("/premises")
def list_premises():
    """List all registered food premises."""
    premises = database.get_all_premises()
    return jsonify({"count": len(premises), "data": premises})


@api.route("/premises/<path:ref>")
def get_premises(ref):
    """Get detailed information for a single premises."""
    premises = database.get_premises(ref)
    if not premises:
        return jsonify({"error": "Premises not found"}), 404
    actions = database.get_previous_actions(ref)
    inspections = database.get_inspections_for_premises(ref)
    return jsonify({**premises, "previousActions": actions, "inspections": inspections})


# -- Inspection Scheduling -------------------------------------------------

@api.route("/inspections/due")
def inspections_due():
    """Get all premises due for inspection within the next N months."""
    months = request.args.get("months", 6, type=int)
    scheduled = scheduler.get_scheduled_inspections(months)
    summary = scheduler.get_workload_summary(months)
    return jsonify({"summary": summary, "inspections": scheduled})


@api.route("/inspections/workload")
def inspections_workload():
    """Get workload summary statistics."""
    months = request.args.get("months", 6, type=int)
    summary = scheduler.get_workload_summary(months)
    return jsonify(summary)


@api.route("/inspections", methods=["POST"])
def create_inspection():
    """Create a new scheduled inspection for a premises."""
    try:
        result = database.create_inspection(request.json)
        return jsonify({"success": True, **result}), 201
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 400


@api.route("/inspections/<int:inspection_id>")
def get_inspection(inspection_id):
    """Get an inspection by ID."""
    inspection = database.get_inspection(inspection_id)
    if not inspection:
        return jsonify({"error": "Inspection not found"}), 404
    return jsonify(inspection)


@api.route("/inspections/<int:inspection_id>/complete", methods=["PUT"])
def complete_inspection(inspection_id):
    """Complete an inspection with results."""
    try:
        database.complete_inspection(inspection_id, request.json)
        return jsonify({"success": True})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 400


# -- Visit Sheets ----------------------------------------------------------

@api.route("/visit-sheets/<path:premises_ref>")
def get_visit_sheet(premises_ref):
    """Generate a pre-populated visit sheet for a premises."""
    try:
        options = dict(request.args)
        sheet = visit_sheet.generate_visit_sheet(premises_ref, options)
        return jsonify(sheet)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404


@api.route("/visit-sheets")
def batch_visit_sheets():
    """Generate visit sheets for all premises due inspection."""
    months = request.args.get("months", 6, type=int)
    options = dict(request.args)
    sheets = visit_sheet.generate_batch_visit_sheets(months, options)
    return jsonify({"count": len(sheets), "sheets": sheets})


# -- Owner Reports ---------------------------------------------------------

@api.route("/reports/<int:inspection_id>", methods=["POST"])
def create_report(inspection_id):
    """Generate an owner report for a completed inspection."""
    try:
        html = report_generator.create_and_save_report(inspection_id)
        return jsonify({"success": True, "html": html})
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400


@api.route("/reports/<int:inspection_id>")
def get_report(inspection_id):
    """Get a previously generated owner report."""
    report = database.get_owner_report(inspection_id)
    if not report:
        return jsonify({"error": "Report not found"}), 404
    return jsonify(report)


@api.route("/reports/<int:inspection_id>/html")
def get_report_html(inspection_id):
    """Render the owner report as HTML (for printing/preview)."""
    try:
        html = report_generator.generate_owner_report(inspection_id)
        return html, 200, {"Content-Type": "text/html"}
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404


# -- Uniform SOAP Operations -----------------------------------------------

@api.route("/uniform/licence/<path:reference>")
def lookup_licence(reference):
    """Look up a licence in Uniform by reference value."""
    try:
        result = uniform_sync.lookup_licence(reference)
        return jsonify({"success": True, "data": result})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@api.route("/uniform/licence-check/<path:reference>")
def check_licence(reference):
    """Check if a licence exists in Uniform."""
    try:
        result = uniform_sync.check_licence_exists(reference)
        return jsonify({"success": True, **result})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@api.route("/uniform/fees/<path:licence_type>")
def fee_lookup(licence_type):
    """Look up fees for a licence type."""
    try:
        result = uniform_sync.get_fee_lookup(licence_type)
        return jsonify({"success": True, "data": result})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# -- Ad-hoc SOAP Connectivity Test ----------------------------------------

@api.route("/uniform/test-connection", methods=["POST"])
def test_soap_connection():
    """
    Test SOAP connectivity using user-supplied credentials.

    Runs three sequential checks:
      1. WSDL reachability - can we download and parse the WSDL?
      2. Database aliases  - call GetUniformDatabaseAliases
      3. Login cycle       - LogonToConnector / LogoffFromConnector

    Expects JSON body with: server, state_switch, database_id, username, password, timeout
    """
    data = request.get_json(force=True)
    server = (data.get("server") or "").strip()
    state_switch = (data.get("state_switch") or "_TEST").strip()
    database_id = (data.get("database_id") or "").strip()
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    timeout = int(data.get("timeout") or 30)

    if not server:
        return jsonify({"success": False, "error": "Server hostname is required"}), 400

    wsdl_url = (
        f"http://{server}"
        f"/LicensingConnectorService{state_switch}"
        f"/LicensingConnectorServices.asmx?WSDL"
    )

    results = {
        "wsdl_url": wsdl_url,
        "steps": [],
    }

    # Step 1 - WSDL reachability + parse
    client = UniformSOAPClient(
        wsdl_url=wsdl_url,
        database_id=database_id or "N/A",
        username=username or "N/A",
        password=password or "N/A",
        timeout=timeout,
    )
    try:
        client._get_client()  # forces WSDL download + parse
        results["steps"].append({
            "name": "WSDL Reachability",
            "passed": True,
            "detail": f"Successfully downloaded and parsed WSDL from {wsdl_url}",
        })
    except Exception as exc:
        results["steps"].append({
            "name": "WSDL Reachability",
            "passed": False,
            "detail": str(exc),
        })
        results["success"] = False
        return jsonify(results)

    # Step 2 - GetUniformDatabaseAliases
    try:
        aliases = client.get_database_aliases()
        results["steps"].append({
            "name": "Database Aliases",
            "passed": True,
            "detail": f"Found {len(aliases)} database alias(es)",
            "aliases": aliases,
        })
    except Exception as exc:
        results["steps"].append({
            "name": "Database Aliases",
            "passed": False,
            "detail": str(exc),
        })
        results["success"] = False
        return jsonify(results)

    # Step 3 - Login/Logoff cycle (only if credentials provided)
    if database_id and username and password:
        try:
            client.logon(
                database_id=database_id,
                username=username,
                password=password,
            )
            login_status = client.get_login_status()
            client.logoff()
            results["steps"].append({
                "name": "Authentication",
                "passed": True,
                "detail": f"Login successful. Status: {login_status}",
            })
        except Exception as exc:
            results["steps"].append({
                "name": "Authentication",
                "passed": False,
                "detail": str(exc),
            })
            results["success"] = False
            return jsonify(results)
    else:
        results["steps"].append({
            "name": "Authentication",
            "passed": None,
            "detail": "Skipped - provide Database ID, Username & Password to test login",
        })

    results["success"] = all(
        s["passed"] is True for s in results["steps"] if s["passed"] is not None
    )
    return jsonify(results)
