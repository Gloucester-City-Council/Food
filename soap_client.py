"""
Idox Uniform Licensing Connector SOAP Client

Connects to the Idox Uniform system via its SOAP web service connector
to interact with the licensing back-office system used by Gloucester
City Council.

Authentication uses session-based cookies:
  1. Call GetUniformDatabaseAliases to verify connectivity
  2. Call LogonToConnector with DatabaseID, UniformUserName, UniformPassword
  3. Subsequent calls use the session cookie automatically
  4. Call LogoffFromConnector when finished

The WSDL endpoint follows the pattern:
  http://{server}/LicensingConnectorService{_TEST|_LIVE}/LicensingConnectorServices.asmx
"""
import logging
from contextlib import contextmanager

import requests
from requests import Session
from zeep import Client
from zeep.transports import Transport
from zeep.exceptions import Fault, TransportError

import config

logger = logging.getLogger(__name__)


class UniformSOAPClient:
    """SOAP client for the Idox Uniform Licensing Connector Service."""

    def __init__(
        self,
        wsdl_url=None,
        database_id=None,
        username=None,
        password=None,
        timeout=None,
    ):
        self.wsdl_url = wsdl_url or config.UNIFORM_WSDL_URL
        self.database_id = database_id or config.UNIFORM_DATABASE_ID
        self.username = username or config.UNIFORM_USERNAME
        self.password = password or config.UNIFORM_PASSWORD
        self.timeout = timeout or config.UNIFORM_TIMEOUT

        self._session = Session()
        self._client = None
        self._logged_in = False

    def _get_client(self):
        """Lazily initialise the zeep SOAP client."""
        if self._client is None:
            transport = Transport(
                session=self._session,
                timeout=self.timeout,
                operation_timeout=self.timeout,
            )
            self._client = Client(self.wsdl_url, transport=transport)
        return self._client

    # ── Authentication ───────────────────────────────────────────────────

    def get_database_aliases(self):
        """
        Retrieve the list of Uniform database aliases available on this host.
        Useful for verifying connectivity and discovering the correct DatabaseID.
        """
        client = self._get_client()
        result = client.service.GetUniformDatabaseAliases()
        aliases = []
        if result and hasattr(result, "UniformDatabaseAlias"):
            for alias in result.UniformDatabaseAlias:
                aliases.append({
                    "database_id": alias.DatabaseID,
                    "description": alias.Description,
                    "is_active": alias.IsActive,
                    "url": alias.UniformWSURL,
                })
        return aliases

    def logon(self, database_id=None, username=None, password=None):
        """
        Authenticate with the Uniform Licensing Connector.
        Returns True on success, raises on failure.
        """
        client = self._get_client()
        creds = {
            "DatabaseID": database_id or self.database_id,
            "UniformUserName": username or self.username,
            "UniformPassword": password or self.password,
        }
        result = client.service.LogonToConnector(UniformLoginCredentials=creds)
        if result.LogonSuccessful:
            self._logged_in = True
            logger.info("Logged on to Uniform connector: %s", result.Message or "OK")
            return True
        else:
            self._logged_in = False
            msg = result.Message or "Login failed"
            logger.error("Uniform login failed: %s", msg)
            raise ConnectionError(f"Uniform login failed: {msg}")

    def logoff(self):
        """Log off the current session from the connector."""
        if not self._logged_in:
            return
        try:
            client = self._get_client()
            client.service.LogoffFromConnector()
            self._logged_in = False
            logger.info("Logged off from Uniform connector")
        except Exception as exc:
            logger.warning("Error during logoff: %s", exc)

    def get_login_status(self):
        """Check whether the current session is logged in."""
        try:
            client = self._get_client()
            result = client.service.GetConnectorLoginStatus()
            return result
        except Exception:
            return False

    @contextmanager
    def session(self):
        """
        Context manager that handles logon/logoff automatically.

        Usage:
            with client.session():
                details = client.get_application_by_reference("REF123")
        """
        self.logon()
        try:
            yield self
        finally:
            self.logoff()

    # ── Licensing Application Operations ─────────────────────────────────

    def get_application_by_reference(self, reference_value):
        """
        Get licensing application details by reference value.
        Returns a GeneralLicensingApplication object.
        """
        client = self._get_client()
        result = client.service.GetLIApplicationDetailsByReferenceValue(
            ReferenceValue=reference_value
        )
        return self._serialize_application(result)

    def get_application_by_key(self, key_value):
        """Get licensing application details by key value."""
        client = self._get_client()
        result = client.service.GetLIApplicationDetailsByKeyValue(
            KeyVal=key_value
        )
        return self._serialize_application(result)

    def check_application_exists(self, reference_value):
        """
        Check if a licensing application exists by reference value.
        Returns dict with LicenceExists and LicenceValid booleans.
        """
        client = self._get_client()
        result = client.service.CheckLIApplicationExistsByReferenceValue(
            ReferenceValue=reference_value
        )
        if result is None:
            return {"licence_exists": False, "licence_valid": False}
        return {
            "licence_exists": result.LicenceExists,
            "licence_valid": result.LicenceValid,
        }

    def get_issued_application_by_reference(self, initial_reference_value):
        """Get issued application details by the initial reference value."""
        client = self._get_client()
        result = client.service.GetLIIssuedApplicationDetailsByReferenceValue(
            InitialReferenceValue=initial_reference_value
        )
        return self._serialize_application(result)

    # ── Fee Operations ───────────────────────────────────────────────────

    def get_fee_lookup(self, licence_type):
        """Look up fees for a given licence type."""
        client = self._get_client()
        result = client.service.GetLIApplicationFeeLookUp(
            LicenceType=licence_type
        )
        if result is None:
            return None
        fees = []
        if hasattr(result, "LicenceFees") and result.LicenceFees:
            for detail in result.LicenceFees.LicenceFeeDetail or []:
                fees.append({"fee_type": detail.FeeType, "fee": float(detail.Fee)})
        return {
            "licence_type_code": result.LicenceTypeCode,
            "licence_type_text": result.LicenceTypeCodeText,
            "fees": fees,
            "validation_date": str(result.ValidationDate) if result.ValidationDate else None,
        }

    def calculate_fee(self, licence_type, li_xtras=None):
        """Calculate fee for a licence type with optional extras."""
        client = self._get_client()
        result = client.service.GetLIFeeCalculate(
            LicenceType=licence_type,
            LiXtras=li_xtras,
        )
        if result is None:
            return None
        fees = []
        if hasattr(result, "LicenceFees") and result.LicenceFees:
            for detail in result.LicenceFees.LicenceFeeDetail or []:
                fees.append({"fee_type": detail.FeeType, "fee": float(detail.Fee)})
        return {
            "licence_type_code": result.LicenceTypeCode,
            "licence_type_text": result.LicenceTypeCodeText,
            "fees": fees,
        }

    # ── Code Lookups ─────────────────────────────────────────────────────

    def get_xtra_code_lookup(self, licence_type):
        """Get LiXtra code lookups for a licence type."""
        client = self._get_client()
        result = client.service.GetLIXTRACodeLookUp(LicenceType=licence_type)
        items = []
        if result:
            for xtra in (result if isinstance(result, list) else [result]):
                items.append({
                    "field_description": getattr(xtra, "FieldDescription", None),
                    "field_name": getattr(xtra, "FieldName", None),
                    "field_type": getattr(xtra, "FieldType", None),
                    "field_value": getattr(xtra, "FieldValue", None),
                    "row_no": float(xtra.RowNo) if xtra.RowNo is not None else None,
                })
        return items

    def get_cn_code_list(self, list_name):
        """Get a CNCODE lookup list by list name."""
        client = self._get_client()
        result = client.service.GetCnCodeList(ListName=list_name)
        return self._serialize_code_list(result)

    def get_cn_code_list_by_field(self, field_name):
        """Get CNCODE lookup values by field name."""
        client = self._get_client()
        result = client.service.GetCnCodeListByFieldName(FieldName=field_name)
        return self._serialize_code_list(result)

    def get_cn_address_list_by_field(self, field_name):
        """Get CNADDRESS lookup values by field name."""
        client = self._get_client()
        result = client.service.GetCnAddressListByFieldName(FieldName=field_name)
        if result is None:
            return None
        addresses = []
        if hasattr(result, "CodeList") and result.CodeList:
            for addr in result.CodeList.CnAddress or []:
                addresses.append({
                    "code": addr.Code,
                    "full_name": addr.FullName,
                    "surname": addr.Surname,
                    "forenames": addr.ForeNames,
                    "title": addr.Title,
                    "address": addr.Address,
                    "phone": addr.PhoneNumber,
                    "email": addr.EmailAddress,
                    "trading_as": addr.TradingAs,
                })
        return {
            "list_name": result.ListName,
            "list_text": result.ListText,
            "addresses": addresses,
        }

    def get_cn_code_list_by_category(self, list_name, category):
        """Get CNCODE lookup filtered by category."""
        client = self._get_client()
        result = client.service.GetCnCodeListByCategory(
            ListName=list_name, Category=category
        )
        return self._serialize_code_list(result)

    def get_cn_code_categories(self, category_list_name):
        """Get available categories for a code list."""
        client = self._get_client()
        result = client.service.GetCnCodeCategories(
            CategoryListName=category_list_name
        )
        return self._serialize_code_list(result)

    def get_cn_code_list_mapped(self, list_name):
        """Get CNCODE lookup values with mapped values."""
        client = self._get_client()
        result = client.service.GetCnCodeListMappedValues(ListName=list_name)
        return self._serialize_code_list(result)

    # ── Application Submissions ──────────────────────────────────────────

    def submit_new_application(self, application_data):
        """
        Submit a new licensing application.
        Returns ApplicationIdentification with KeyValue and ReferenceValue.
        """
        client = self._get_client()
        result = client.service.SubmittedNewLicensingApplication(
            SubmittedNewLicensingApplication=application_data
        )
        return self._serialize_app_id(result)

    def submit_renewal(self, application_data):
        """Submit a licensing application for renewal."""
        client = self._get_client()
        result = client.service.SubmittedLicensingApplicationForRenewal(
            SubmittedLicensingApplicationForRenewal=application_data
        )
        return self._serialize_app_id(result)

    def submit_transfer(self, application_data):
        """Submit a licensing application for transfer."""
        client = self._get_client()
        result = client.service.SubmittedLicensingApplicationForTransfer(
            SubmittedLicensingApplicationForTransfer=application_data
        )
        return self._serialize_app_id(result)

    # ── Party / Photo Operations ─────────────────────────────────────────

    def get_photo_by_client_reference(self, client_reference):
        """Get a photo (base64-encoded) by client reference."""
        client = self._get_client()
        result = client.service.GetPhotoByClientReference(
            ClientReference=client_reference
        )
        return result  # base64 bytes

    def get_party_details_by_client(self, client_query):
        """
        Search for party details by client criteria.
        client_query should be a dict with keys like FullName, Address, etc.
        """
        client = self._get_client()
        result = client.service.GetPartyDetailsByClient(Client=client_query)
        parties = []
        if result:
            for party in (result if isinstance(result, list) else [result]):
                parties.append(self._serialize_party(party))
        return parties

    # ── Connection Test ──────────────────────────────────────────────────

    def test_connection(self):
        """
        Test connectivity to the Uniform SOAP connector.
        Returns dict with connected status and details.
        """
        try:
            aliases = self.get_database_aliases()
            return {
                "connected": True,
                "wsdl_url": self.wsdl_url,
                "databases": aliases,
            }
        except Exception as exc:
            return {
                "connected": False,
                "wsdl_url": self.wsdl_url,
                "error": str(exc),
            }

    def test_login(self):
        """
        Test full login/logoff cycle.
        Returns dict with login success status.
        """
        try:
            self.logon()
            status = self.get_login_status()
            self.logoff()
            return {"connected": True, "login_successful": True, "status": status}
        except Exception as exc:
            return {"connected": False, "login_successful": False, "error": str(exc)}

    # ── Serialisation Helpers ────────────────────────────────────────────

    def _serialize_application(self, app):
        """Convert a GeneralLicensingApplication SOAP object to a dict."""
        if app is None:
            return None

        result = {}

        # Application Identification
        if hasattr(app, "ApplicationIdentification") and app.ApplicationIdentification:
            ai = app.ApplicationIdentification
            result["application_identification"] = {
                "key_value": ai.ApplicationKeyValue,
                "reference_value": ai.ReferenceValue,
                "alternative_reference": ai.AlternativeReference,
                "applicant_reference": ai.ApplicantReference,
                "agent_reference": ai.AgentReference,
                "warning_message": ai.WarningMessage,
            }

        # Applicants
        if hasattr(app, "Applicants") and app.Applicants:
            result["applicants"] = []
            for a in app.Applicants.Applicant or []:
                result["applicants"].append(self._serialize_applicant(a))

        # Site Location
        if hasattr(app, "SubmittedSiteLocation") and app.SubmittedSiteLocation:
            loc = app.SubmittedSiteLocation
            result["site_location"] = {
                "uprn": loc.UPRN,
                "address": loc.Address,
                "map_east": loc.MapEast,
                "map_north": loc.MapNorth,
                "occupier": loc.Occuiper,
                "trading_as": loc.TradingAs,
                "ward": loc.Ward,
            }

        # Application type
        result["application_type"] = getattr(app, "ApplicationType", None)

        # Licence
        if hasattr(app, "Licence") and app.Licence:
            lic = app.Licence
            result["licence"] = {
                "licence_type": lic.LicenceType,
                "licence_case_type": lic.LicenceCaseType,
                "licence_details": lic.LicenceDetails,
                "licence_status": lic.LicenceStatus,
                "date_received": str(lic.DateReceived) if lic.DateReceived else None,
                "application_date": str(lic.ApplicationDate) if lic.ApplicationDate else None,
                "total_cost": float(lic.TotalCost) if lic.TotalCost is not None else None,
                "from_date": str(lic.FromDate) if lic.FromDate else None,
                "to_date": str(lic.ToDate) if lic.ToDate else None,
                "valid_from": str(lic.ValidFrom) if lic.ValidFrom else None,
                "issued": str(lic.Issued) if lic.Issued else None,
                "renewal_date": str(lic.RenewalDate) if lic.RenewalDate else None,
            }

        # Activities
        if hasattr(app, "Activities") and app.Activities:
            result["activities"] = []
            for act in app.Activities.Activity or []:
                result["activities"].append({
                    "activity_type": act.ActivityType,
                    "time_period": act.TimePeriod,
                    "start_date": str(act.StartDate) if act.StartDate else None,
                    "end_date": str(act.EndDate) if act.EndDate else None,
                    "start_time": act.StartTime,
                    "end_time": act.EndTime,
                    "capacity": float(act.Capacity) if act.Capacity else None,
                    "location": act.Location,
                    "comments": act.Comments,
                })

        # Payments
        if hasattr(app, "Payments") and app.Payments:
            result["payments"] = []
            for pay in app.Payments.Payment or []:
                result["payments"].append({
                    "receipt_number": pay.ReceiptNumber,
                    "payment_type": pay.PaymentType,
                    "description": pay.Description,
                    "payment_due": float(pay.PaymentDue) if pay.PaymentDue is not None else None,
                    "paid": float(pay.Paid) if pay.Paid is not None else None,
                    "payment_date": str(pay.PaymentDate) if pay.PaymentDate else None,
                })

        # LiXtras
        if hasattr(app, "LiXtras") and app.LiXtras:
            result["li_xtras"] = []
            for x in app.LiXtras.LiXtra or []:
                result["li_xtras"].append({
                    "field_description": x.FieldDescription,
                    "field_name": x.FieldName,
                    "field_type": x.FieldType,
                    "field_value": x.FieldValue,
                    "row_no": float(x.RowNo) if x.RowNo is not None else None,
                })

        return result

    def _serialize_applicant(self, a):
        """Convert an Applicant SOAP object to a dict."""
        contacts = []
        if hasattr(a, "ContactDetails") and a.ContactDetails:
            for c in a.ContactDetails.ContactDetail or []:
                contacts.append({
                    "type_code": c.ContactTypeCode,
                    "type_text": c.ContactTypeText,
                    "address": c.ContactAddress,
                })
        return {
            "key_value": a.KeyValue,
            "full_name": a.FullName,
            "title": a.Title,
            "surname": a.Surname,
            "forename": a.Forename,
            "address": a.Address,
            "dob": str(a.DOB) if a.DOB else None,
            "organisation": a.Organisation,
            "trading_name": a.TradingName,
            "job_title": a.JobTitle,
            "alternative_ref": a.AlternativeRef,
            "contact_details": contacts,
        }

    def _serialize_party(self, party):
        """Convert a PartyDetails SOAP object to a dict."""
        base = self._serialize_applicant(party)
        base["li_party_type_code"] = getattr(party, "LiPartyTypeCode", None)
        base["li_party_type_text"] = getattr(party, "LiPartyTypeText", None)
        if hasattr(party, "Licence") and party.Licence:
            lic = party.Licence
            base["licence"] = {
                "key_value": getattr(lic, "KeyValue", None),
                "reference_value": getattr(lic, "ReferenceValue", None),
                "licence_type": lic.LicenceType,
                "licence_status": lic.LicenceStatus,
                "from_date": str(lic.FromDate) if lic.FromDate else None,
                "to_date": str(lic.ToDate) if lic.ToDate else None,
            }
        return base

    def _serialize_app_id(self, app_id):
        """Convert ApplicationIdentification response to dict."""
        if app_id is None:
            return None
        return {
            "key_value": getattr(app_id, "ApplicationKeyValue", None),
            "reference_value": getattr(app_id, "ReferenceValue", None),
            "alternative_reference": getattr(app_id, "AlternativeReference", None),
            "applicant_reference": getattr(app_id, "ApplicantReference", None),
            "agent_reference": getattr(app_id, "AgentReference", None),
            "warning_message": getattr(app_id, "WarningMessage", None),
        }

    def _serialize_code_list(self, result):
        """Convert a CnCodeList SOAP object to a dict."""
        if result is None:
            return None
        codes = []
        code_list = getattr(result, "CodeList", None)
        if code_list:
            items = getattr(code_list, "CnCode", None) or []
            for c in items:
                codes.append({
                    "code_value": c.CodeValue,
                    "code_text": c.CodeText,
                    "extra_text": getattr(c, "ExtraText", None),
                })
        return {
            "list_name": getattr(result, "ListName", None),
            "list_text": getattr(result, "ListText", None),
            "codes": codes,
        }
