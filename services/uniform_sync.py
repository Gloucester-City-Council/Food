"""
Uniform Sync Service

Handles synchronisation between the Idox Uniform Licensing Connector
(SOAP) and the local SQLite database cache.

When the Uniform SOAP connector is reachable, licensing/premises data
is fetched from the live system. When offline, the application falls
back to previously cached data and the sample dataset.
"""
import json
import logging
import os
from datetime import datetime

from soap_client import UniformSOAPClient
import database

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = UniformSOAPClient()
    return _client


def _load_sample_data():
    """Load sample premises data from the JSON file."""
    sample_path = os.path.join(os.path.dirname(__file__), "data", "sample_premises.json")
    if os.path.exists(sample_path):
        with open(sample_path, "r") as f:
            return json.load(f)
    return []


def sync_premises():
    """
    Attempt to sync premises from the live Uniform SOAP connector.
    Falls back to sample data if the connector is unavailable.
    """
    result = {
        "source": None,
        "count": 0,
        "timestamp": datetime.now().isoformat(),
        "errors": [],
    }

    client = _get_client()
    conn_status = client.test_connection()

    if conn_status.get("connected"):
        result["source"] = "uniform-soap-live"
        try:
            with client.session():
                # The licensing connector doesn't have a direct "get all food premises"
                # endpoint like the commercial premises connector. For now, we use
                # the party search or code lookups to discover premises. If no data
                # is returned, we fall back to sample data.
                #
                # In a full integration you would:
                # 1. Use GetPartyDetailsByClient to search for food business parties
                # 2. Use GetLIApplicationDetailsByReferenceValue for specific licences
                # 3. Transform the licensing data to our premises format
                #
                # For initial deployment, we populate from sample data and the SOAP
                # client is available for individual licence lookups from the dashboard.
                logger.info("SOAP connector available; loading sample data for initial sync")
                sample_data = _load_sample_data()
                if sample_data:
                    result["count"] = database.import_premises(sample_data)
                    result["source"] = "sample-data-with-soap-available"
                else:
                    result["errors"].append("No sample data found")
        except Exception as exc:
            result["errors"].append(f"SOAP sync error: {exc}")
            result["source"] = "sample-data-fallback"
            sample_data = _load_sample_data()
            if sample_data:
                result["count"] = database.import_premises(sample_data)
    else:
        result["source"] = "sample-data"
        sample_data = _load_sample_data()
        if sample_data:
            result["count"] = database.import_premises(sample_data)
        result["errors"].append(
            f"Uniform SOAP connector at {conn_status.get('wsdl_url')} "
            f"is not available: {conn_status.get('error', 'connection refused')}. "
            f"Using sample data."
        )

    return result


def get_connection_status():
    """Get the current connection status of the Uniform SOAP connector."""
    client = _get_client()
    return client.test_connection()


def lookup_licence(reference_value):
    """
    Look up a specific licence by reference value from Uniform.
    Requires SOAP connectivity.
    """
    client = _get_client()
    with client.session():
        return client.get_application_by_reference(reference_value)


def check_licence_exists(reference_value):
    """Check if a licence exists in Uniform by reference value."""
    client = _get_client()
    with client.session():
        return client.check_application_exists(reference_value)


def get_fee_lookup(licence_type):
    """Look up fees for a licence type via Uniform."""
    client = _get_client()
    with client.session():
        return client.get_fee_lookup(licence_type)


def search_parties(query):
    """Search for parties/clients in Uniform."""
    client = _get_client()
    with client.session():
        return client.get_party_details_by_client(query)
