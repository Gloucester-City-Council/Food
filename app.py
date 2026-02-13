"""
GCC Food Inspection Management System - Python/Streamlit

Streamlit application for managing food hygiene inspections with
integration to the Idox Uniform SOAP Licensing Connector.

Architecture:
  +---------------------------------------------------+
  |          Streamlit Web App (localhost)              |
  |  +-------------------------------------------+    |
  |  | Pages (sidebar navigation):                |    |
  |  |  - Dashboard (overview & stats)            |    |
  |  |  - Due Inspections (scheduling)            |    |
  |  |  - All Premises (directory)                |    |
  |  |  - Inspection Form (digital form)          |    |
  |  |  - Visit Sheets (pre-population)           |    |
  |  |  - Reports (owner reports)                 |    |
  |  |  - System Status (Uniform connector)       |    |
  |  +-------------------------------------------+    |
  |                        |                           |
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
  |                        |                           |
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
  3. streamlit run app.py
"""
import logging
from datetime import datetime, date

import pandas as pd
import streamlit as st

import config
import database
from services import uniform_sync
from services import inspection_scheduler as scheduler
from services import visit_sheet
from services import report_generator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Page Config ──────────────────────────────────────────────────────────

st.set_page_config(
    page_title="GCC Food Inspection System",
    page_icon=":shield:",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Initialisation (runs once per session) ───────────────────────────────

if "initialised" not in st.session_state:
    database.init_schema()
    sync_result = uniform_sync.sync_premises()
    st.session_state["initialised"] = True
    st.session_state["sync_result"] = sync_result
    logger.info("Sync source: %s", sync_result["source"])
    logger.info("Premises synced: %d", sync_result["count"])


# ── Helper Functions ─────────────────────────────────────────────────────

def _rating_colour(rating):
    colours = {5: "#1b5e20", 4: "#33691e", 3: "#f57f17", 2: "#e65100", 1: "#bf360c", 0: "#b71c1c"}
    return colours.get(rating, "#6c757d")


def _rating_label(rating):
    labels = {5: "Very Good", 4: "Good", 3: "Generally Satisfactory",
              2: "Improvement Necessary", 1: "Major Improvement Necessary", 0: "Urgent Improvement Required"}
    return labels.get(rating, "Not Yet Rated")


def _risk_colour(cat):
    colours = {"A": "#b71c1c", "B": "#e65100", "C": "#f57f17", "D": "#33691e", "E": "#1b5e20"}
    return colours.get(cat, "#6c757d")


# ── Sidebar Navigation ──────────────────────────────────────────────────

st.sidebar.title("GCC Food Inspections")
st.sidebar.caption("Gloucester City Council")

page = st.sidebar.radio(
    "Navigation",
    [
        "Dashboard",
        "Due Inspections",
        "All Premises",
        "Inspection Form",
        "Visit Sheets",
        "Reports",
        "System Status",
    ],
    label_visibility="collapsed",
)

st.sidebar.divider()
sync = st.session_state.get("sync_result", {})
st.sidebar.caption(f"Premises loaded: {sync.get('count', 0)}")
st.sidebar.caption(f"Source: {sync.get('source', 'unknown')}")

if st.sidebar.button("Sync Now"):
    with st.spinner("Syncing premises..."):
        result = uniform_sync.sync_premises()
        st.session_state["sync_result"] = result
    st.sidebar.success(f"Synced {result['count']} premises")
    st.rerun()


# ══════════════════════════════════════════════════════════════════════════
# PAGES
# ══════════════════════════════════════════════════════════════════════════

# ── Dashboard ────────────────────────────────────────────────────────────

if page == "Dashboard":
    st.title("Food Inspection Dashboard")

    summary = scheduler.get_workload_summary(6)
    all_premises = database.get_all_premises()

    # KPI cards
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Total Premises", len(all_premises))
    c2.metric("Due (6 months)", summary["totalDue"])
    c3.metric("Overdue", summary["overdue"])
    c4.metric("New Businesses", summary["newBusinesses"])
    c5.metric("Revisits Needed", summary["requiresRevisit"])

    st.divider()

    col_left, col_right = st.columns(2)

    with col_left:
        st.subheader("By Risk Category")
        risk_data = summary.get("byRiskCategory", {})
        if risk_data:
            df_risk = pd.DataFrame(
                [{"Risk Category": k, "Count": v} for k, v in sorted(risk_data.items())]
            )
            st.bar_chart(df_risk.set_index("Risk Category"))
        else:
            st.info("No inspection data available yet.")

    with col_right:
        st.subheader("By Business Type")
        type_data = summary.get("byBusinessType", {})
        if type_data:
            df_type = pd.DataFrame(
                [{"Business Type": k, "Count": v} for k, v in sorted(type_data.items())]
            )
            st.bar_chart(df_type.set_index("Business Type"))
        else:
            st.info("No inspection data available yet.")

    st.divider()

    st.subheader("High Priority Inspections")
    scheduled = scheduler.get_scheduled_inspections(6)
    top_priority = scheduled[:10]

    if top_priority:
        for p in top_priority:
            risk_cat = p.get("risk_category", "?")
            colour = _risk_colour(risk_cat)
            overdue_tag = " **OVERDUE**" if p.get("isOverdue") else ""
            new_tag = " (New Business)" if p.get("isNewBusiness") else ""
            fhrs = p.get("current_fhrs_rating")
            fhrs_str = f"FHRS: {fhrs}" if fhrs is not None else "FHRS: Unrated"

            with st.container(border=True):
                cols = st.columns([3, 1, 1, 1, 1])
                cols[0].markdown(f"**{p['business_name']}**  \n{p.get('address_line1', '')}, {p.get('postcode', '')}")
                cols[1].markdown(f"Risk: **:{colour}[{risk_cat}]**")
                cols[2].markdown(f"{fhrs_str}")
                cols[3].markdown(f"Due: {p.get('next_inspection_due', 'N/A')}{overdue_tag}")
                cols[4].markdown(f"Priority: **{p.get('priorityScore', 0)}**{new_tag}")
    else:
        st.success("No inspections due in the next 6 months.")


# ── Due Inspections ──────────────────────────────────────────────────────

elif page == "Due Inspections":
    st.title("Due Inspections")

    months = st.slider("Lookahead (months)", 1, 36, 6)

    scheduled = scheduler.get_scheduled_inspections(months)
    summary = scheduler.get_workload_summary(months)

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total Due", summary["totalDue"])
    c2.metric("Overdue", summary["overdue"])
    c3.metric("New Businesses", summary["newBusinesses"])
    c4.metric("Revisits Needed", summary["requiresRevisit"])

    st.divider()

    # Filters
    filter_col1, filter_col2 = st.columns(2)
    risk_options = ["All"] + sorted(set(p.get("risk_category", "?") for p in scheduled))
    type_options = ["All"] + sorted(set(p.get("business_type", "?") for p in scheduled))

    selected_risk = filter_col1.selectbox("Filter by Risk Category", risk_options)
    selected_type = filter_col2.selectbox("Filter by Business Type", type_options)

    filtered = scheduled
    if selected_risk != "All":
        filtered = [p for p in filtered if p.get("risk_category") == selected_risk]
    if selected_type != "All":
        filtered = [p for p in filtered if p.get("business_type") == selected_type]

    if filtered:
        rows = []
        for p in filtered:
            rows.append({
                "Priority": p.get("priorityScore", 0),
                "Business Name": p.get("business_name", ""),
                "Type": p.get("business_type", ""),
                "Risk": p.get("risk_category", ""),
                "FHRS": p.get("current_fhrs_rating", "Unrated"),
                "Next Due": p.get("next_inspection_due", "N/A"),
                "Overdue": "Yes" if p.get("isOverdue") else "No",
                "New": "Yes" if p.get("isNewBusiness") else "No",
                "Ref": p.get("premises_ref", ""),
            })
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True, hide_index=True)
    else:
        st.info("No inspections match the current filters.")

    # Monthly breakdown
    st.divider()
    st.subheader("Monthly Breakdown")
    month_data = summary.get("byMonth", {})
    if month_data:
        df_month = pd.DataFrame(
            [{"Month": k, "Count": v} for k, v in sorted(month_data.items())]
        )
        st.bar_chart(df_month.set_index("Month"))


# ── All Premises ─────────────────────────────────────────────────────────

elif page == "All Premises":
    st.title("All Registered Premises")

    all_premises = database.get_all_premises()

    search = st.text_input("Search premises by name, address, or reference")

    if search:
        q = search.lower()
        all_premises = [
            p for p in all_premises
            if q in (p.get("business_name") or "").lower()
            or q in (p.get("trading_name") or "").lower()
            or q in (p.get("address_line1") or "").lower()
            or q in (p.get("postcode") or "").lower()
            or q in (p.get("premises_ref") or "").lower()
        ]

    st.caption(f"Showing {len(all_premises)} premises")

    if all_premises:
        rows = []
        for p in all_premises:
            rows.append({
                "Business Name": p.get("business_name", ""),
                "Trading Name": p.get("trading_name", ""),
                "Type": p.get("business_type", ""),
                "Risk": p.get("risk_category", ""),
                "FHRS": p.get("current_fhrs_rating") if p.get("current_fhrs_rating") is not None else "Unrated",
                "Last Inspection": p.get("last_inspection_date", "Never"),
                "Next Due": p.get("next_inspection_due", "N/A"),
                "Postcode": p.get("postcode", ""),
                "Ref": p.get("premises_ref", ""),
            })
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True, hide_index=True)

    # Premises detail view
    st.divider()
    st.subheader("Premises Detail")

    refs = [p["premises_ref"] for p in database.get_all_premises()]
    names = {p["premises_ref"]: p["business_name"] for p in database.get_all_premises()}
    options = [f"{names[r]} ({r})" for r in refs]

    if options:
        selected = st.selectbox("Select premises", options)
        selected_ref = refs[options.index(selected)]

        premises = database.get_premises(selected_ref)
        if premises:
            col1, col2 = st.columns(2)

            with col1:
                st.markdown("**Business Information**")
                st.markdown(f"**Name:** {premises.get('trading_name') or premises['business_name']}")
                st.markdown(f"**Operator:** {premises.get('food_business_operator', 'N/A')}")
                st.markdown(f"**Type:** {premises.get('business_type_detail') or premises.get('business_type', 'N/A')}")
                st.markdown(f"**Address:** {premises.get('address_line1', '')}, {premises.get('town', '')}, {premises.get('postcode', '')}")
                st.markdown(f"**Phone:** {premises.get('telephone', 'N/A')}")
                st.markdown(f"**Email:** {premises.get('email', 'N/A')}")
                st.markdown(f"**Registered:** {premises.get('registration_date', 'N/A')}")
                st.markdown(f"**Trading Hours:** {premises.get('trading_hours', 'N/A')}")

            with col2:
                st.markdown("**Inspection Status**")
                fhrs = premises.get("current_fhrs_rating")
                if fhrs is not None:
                    colour = _rating_colour(fhrs)
                    st.markdown(f"**FHRS Rating:** :{colour}[{fhrs} - {_rating_label(fhrs)}]")
                else:
                    st.markdown("**FHRS Rating:** Unrated")
                st.markdown(f"**Risk Category:** {premises.get('risk_category', 'N/A')}")
                st.markdown(f"**Last Inspection:** {premises.get('last_inspection_date', 'Never')}")
                st.markdown(f"**Next Due:** {premises.get('next_inspection_due', 'N/A')}")
                st.markdown(f"**HACCP:** {'Yes' if premises.get('haccp_in_place') else 'No'}")
                st.markdown(f"**Allergen Docs:** {'Yes' if premises.get('allergen_documentation') else 'No'}")
                if premises.get("primary_authority"):
                    st.markdown(f"**Primary Authority:** {premises['primary_authority']}")

            if premises.get("last_inspection_date"):
                st.markdown("**Last Inspection Scores**")
                sc1, sc2, sc3, sc4 = st.columns(4)
                h = premises.get("last_hygienic_score") or 0
                s = premises.get("last_structure_score") or 0
                m = premises.get("last_management_score") or 0
                sc1.metric("Hygienic", f"{h}/25")
                sc2.metric("Structure", f"{s}/25")
                sc3.metric("Management", f"{m}/30")
                sc4.metric("Total", f"{h + s + m}/80")

            # Previous actions
            actions = database.get_previous_actions(selected_ref)
            if actions:
                st.markdown("**Previous Enforcement Actions**")
                for a in actions:
                    st.warning(f"**{a['action_type']}** ({a['action_date']}): {a['detail']}")

            # Inspection history
            inspections = database.get_inspections_for_premises(selected_ref)
            if inspections:
                st.markdown("**Inspection History**")
                for insp in inspections:
                    status_icon = "white_check_mark" if insp.get("status") == "completed" else "clock"
                    st.markdown(
                        f":{status_icon}: **{insp.get('reference_number', 'N/A')}** - "
                        f"{insp.get('inspection_date', 'N/A')} - "
                        f"Status: {insp.get('status', 'unknown')} - "
                        f"Score: {insp.get('total_score', 'N/A')}"
                    )

            if premises.get("notes"):
                st.info(f"**Notes:** {premises['notes']}")


# ── Inspection Form ──────────────────────────────────────────────────────

elif page == "Inspection Form":
    st.title("Digital Inspection Form")

    refs = [p["premises_ref"] for p in database.get_all_premises()]
    names = {p["premises_ref"]: p["business_name"] for p in database.get_all_premises()}

    if not refs:
        st.warning("No premises loaded. Please sync data first.")
    else:
        options = [f"{names[r]} ({r})" for r in refs]

        with st.form("inspection_form", clear_on_submit=False):
            st.subheader("1. Inspection Details")
            col1, col2 = st.columns(2)
            selected = col1.selectbox("Premises", options)
            selected_ref = refs[options.index(selected)]

            inspection_type = col2.selectbox(
                "Inspection Type",
                ["routine", "followup", "complaint", "new_business", "revisit"],
                format_func=lambda x: {
                    "routine": "Routine Inspection",
                    "followup": "Follow-up Inspection",
                    "complaint": "Complaint Investigation",
                    "new_business": "New Business Registration",
                    "revisit": "Re-visit",
                }[x],
            )

            col3, col4 = st.columns(2)
            inspection_date = col3.date_input("Inspection Date", value=date.today())
            inspection_time = col4.time_input("Inspection Time")

            col5, col6 = st.columns(2)
            inspector_name = col5.text_input("Inspector Name")
            inspector_id = col6.text_input("Inspector ID")

            st.divider()
            st.subheader("2. Inspection Scores")
            st.caption("Lower scores indicate better compliance. Score each area based on the Food Law Code of Practice risk assessment.")

            sc1, sc2, sc3 = st.columns(3)
            hygienic_score = sc1.slider("Hygienic Food Handling (0-25)", 0, 25, 0)
            structure_score = sc2.slider("Structure & Cleaning (0-25)", 0, 25, 0)
            management_score = sc3.slider("Management of Food Safety (0-30)", 0, 30, 0)

            total = hygienic_score + structure_score + management_score
            st.metric("Total Score", f"{total}/80")

            # Determine FHRS rating from total
            fhrs_rating = 0
            for threshold in config.FHRS_THRESHOLDS:
                if total <= threshold["max_score"]:
                    fhrs_rating = threshold["rating"]
                    break

            st.markdown(f"**Calculated FHRS Rating: {fhrs_rating} - {_rating_label(fhrs_rating)}**")

            fhrs_override = st.selectbox(
                "Override FHRS Rating (optional)",
                [None, 5, 4, 3, 2, 1, 0],
                format_func=lambda x: f"{x} - {_rating_label(x)}" if x is not None else "Use calculated rating",
            )
            final_fhrs = fhrs_override if fhrs_override is not None else fhrs_rating

            st.divider()
            st.subheader("3. Enforcement & Actions")

            enforcement_options = st.multiselect(
                "Enforcement Actions Taken",
                [
                    "none",
                    "written_warning",
                    "improvement_notice",
                    "emergency_prohibition",
                    "voluntary_closure",
                ],
                default=["none"],
                format_func=lambda x: {
                    "none": "No Enforcement Action",
                    "written_warning": "Written Warning",
                    "improvement_notice": "Hygiene Improvement Notice",
                    "emergency_prohibition": "Emergency Prohibition Notice",
                    "voluntary_closure": "Voluntary Closure",
                }[x],
            )

            actions_required = st.text_area("Actions Required (details)", height=100)
            revisit_required = st.checkbox("Revisit Required")
            revisit_date = None
            if revisit_required:
                revisit_date = st.date_input("Revisit Date")

            st.divider()
            st.subheader("4. Additional Notes")
            additional_notes = st.text_area("Notes / Observations", height=100)

            submitted = st.form_submit_button("Submit Inspection", type="primary")

        if submitted:
            if not inspector_name:
                st.error("Please enter the inspector name.")
            else:
                # Create the inspection
                create_data = {
                    "premisesRef": selected_ref,
                    "inspectionDate": inspection_date.isoformat(),
                    "inspectionTime": inspection_time.strftime("%H:%M"),
                    "inspectionType": inspection_type,
                    "inspectorName": inspector_name,
                    "inspectorId": inspector_id,
                }
                result = database.create_inspection(create_data)
                inspection_id = result["id"]

                # Complete it with results
                enforcement_str = ",".join(e for e in enforcement_options if e != "none")
                results_data = {
                    "hygienicScore": hygienic_score,
                    "structureScore": structure_score,
                    "managementScore": management_score,
                    "fhrsRating": final_fhrs,
                    "enforcementActions": enforcement_str,
                    "actionsRequired": actions_required,
                    "revisitRequired": revisit_required,
                    "revisitDate": revisit_date.isoformat() if revisit_date else None,
                    "additionalNotes": additional_notes,
                }
                database.complete_inspection(inspection_id, results_data)

                st.success(
                    f"Inspection **{result['referenceNumber']}** submitted successfully. "
                    f"FHRS Rating: **{final_fhrs} - {_rating_label(final_fhrs)}**"
                )
                st.balloons()


# ── Visit Sheets ─────────────────────────────────────────────────────────

elif page == "Visit Sheets":
    st.title("Visit Sheet Generator")

    tab_single, tab_batch = st.tabs(["Single Visit Sheet", "Batch Generation"])

    with tab_single:
        refs = [p["premises_ref"] for p in database.get_all_premises()]
        names = {p["premises_ref"]: p["business_name"] for p in database.get_all_premises()}

        if not refs:
            st.warning("No premises loaded.")
        else:
            options = [f"{names[r]} ({r})" for r in refs]
            selected = st.selectbox("Select premises", options, key="vs_single")
            selected_ref = refs[options.index(selected)]

            if st.button("Generate Visit Sheet", type="primary"):
                try:
                    sheet = visit_sheet.generate_visit_sheet(selected_ref)
                    st.session_state["current_visit_sheet"] = sheet
                except ValueError as e:
                    st.error(str(e))

            if "current_visit_sheet" in st.session_state:
                sheet = st.session_state["current_visit_sheet"]

                st.divider()
                st.subheader(f"Visit Sheet: {sheet['businessDetails']['businessName']}")

                # Header info
                header = sheet["header"]
                st.caption(
                    f"{header['inspectionTypeLabel']} | Generated: {header['generatedAt'][:19]}"
                )

                # Business details
                with st.expander("Business Details", expanded=True):
                    bd = sheet["businessDetails"]
                    col1, col2 = st.columns(2)
                    col1.markdown(f"**Name:** {bd['businessName']}")
                    col1.markdown(f"**Trading As:** {bd.get('tradingName', 'N/A')}")
                    col1.markdown(f"**Operator:** {bd.get('foodBusinessOperator', 'N/A')}")
                    col1.markdown(f"**Type:** {bd.get('businessTypeDetail') or bd.get('businessType', 'N/A')}")
                    col2.markdown(f"**Address:** {bd.get('businessAddress', 'N/A')}")
                    col2.markdown(f"**Postcode:** {bd.get('postcode', 'N/A')}")
                    col2.markdown(f"**Phone:** {bd.get('telephone', 'N/A')}")
                    col2.markdown(f"**Food Handlers:** {bd.get('numberOfFoodHandlers', 'N/A')}")

                # Previous inspection summary
                with st.expander("Previous Inspection Summary", expanded=True):
                    prev = sheet["previousInspectionSummary"]
                    st.markdown(f"**Last Inspection:** {prev.get('lastInspectionDate', 'Never')}")
                    st.markdown(f"**Risk Category:** {prev.get('riskCategory', 'N/A')} - {prev.get('intervalDescription', '')}")
                    st.markdown(f"**Current FHRS:** {prev.get('currentFhrsRating', 'Unrated')}")
                    st.markdown(f"**HACCP in Place:** {'Yes' if prev.get('haccpInPlace') else 'No'}")
                    st.markdown(f"**Allergen Docs:** {'Yes' if prev.get('allergenDocumentation') else 'No'}")

                    if prev.get("lastScores"):
                        sc = prev["lastScores"]
                        cols = st.columns(4)
                        cols[0].metric("Hygienic", sc.get("hygienicFoodHandling", "N/A"))
                        cols[1].metric("Structure", sc.get("structureAndCleaning", "N/A"))
                        cols[2].metric("Management", sc.get("managementOfFoodSafety", "N/A"))
                        cols[3].metric("Total", sc.get("total", "N/A"))

                    for action in prev.get("previousActions", []):
                        st.warning(f"**{action['type']}** ({action['date']}): {action['detail']}")

                # Focus areas
                with st.expander("Inspection Focus Areas", expanded=True):
                    for area in sheet.get("inspectionFocusAreas", []):
                        st.markdown(f"- {area}")

                # Temperature checks
                with st.expander("Temperature Check Template"):
                    temps = sheet.get("temperatureReadings", [])
                    if temps:
                        df = pd.DataFrame(temps)
                        df.columns = ["Item", "Temperature", "Required Range", "Compliant"]
                        st.dataframe(df, use_container_width=True, hide_index=True)

                # Scoring sections
                with st.expander("Scoring Criteria"):
                    st.markdown("**Hygienic Food Handling (0-25)**")
                    for k, v in sheet.get("hygienicFoodHandling", {}).get("criteria", {}).items():
                        st.markdown(f"- {k}: ___")
                    st.markdown("**Structure & Cleaning (0-25)**")
                    for k, v in sheet.get("structureAndCleaning", {}).get("criteria", {}).items():
                        st.markdown(f"- {k}: ___")
                    st.markdown("**Management of Food Safety (0-30)**")
                    for k, v in sheet.get("managementOfFoodSafety", {}).get("criteria", {}).items():
                        st.markdown(f"- {k}: ___")

    with tab_batch:
        batch_months = st.slider("Batch - months ahead", 1, 36, 6, key="batch_months")
        if st.button("Generate All Due Visit Sheets"):
            with st.spinner("Generating visit sheets..."):
                sheets = visit_sheet.generate_batch_visit_sheets(batch_months)
            st.success(f"Generated {len(sheets)} visit sheets")
            for s in sheets:
                bd = s["businessDetails"]
                with st.expander(f"{bd['businessName']} ({bd['premisesRef']})"):
                    st.markdown(f"**Type:** {s['header']['inspectionTypeLabel']}")
                    st.markdown(f"**Risk:** {s['previousInspectionSummary']['riskCategory']}")
                    st.markdown(f"**Focus Areas:** {len(s.get('inspectionFocusAreas', []))}")
                    for area in s.get("inspectionFocusAreas", [])[:5]:
                        st.markdown(f"- {area}")
                    if len(s.get("inspectionFocusAreas", [])) > 5:
                        st.caption(f"... and {len(s['inspectionFocusAreas']) - 5} more")


# ── Reports ──────────────────────────────────────────────────────────────

elif page == "Reports":
    st.title("Owner Reports")

    st.subheader("Generate Report")
    st.caption("Generate a formal inspection report for a completed inspection.")

    # Find completed inspections
    all_premises = database.get_all_premises()
    completed_inspections = []
    for p in all_premises:
        inspections = database.get_inspections_for_premises(p["premises_ref"])
        for insp in inspections:
            if insp.get("status") == "completed":
                completed_inspections.append({
                    **insp,
                    "business_name": p["business_name"],
                })

    if not completed_inspections:
        st.info("No completed inspections found. Submit an inspection first using the Inspection Form.")
    else:
        options = [
            f"{ci['business_name']} - {ci.get('reference_number', 'N/A')} ({ci.get('inspection_date', 'N/A')})"
            for ci in completed_inspections
        ]
        selected = st.selectbox("Select completed inspection", options)
        selected_inspection = completed_inspections[options.index(selected)]

        col1, col2 = st.columns(2)
        col1.metric("Total Score", selected_inspection.get("total_score", "N/A"))
        fhrs = selected_inspection.get("fhrs_rating")
        col2.metric("FHRS Rating", f"{fhrs} - {_rating_label(fhrs)}" if fhrs is not None else "N/A")

        if st.button("Generate Owner Report", type="primary"):
            try:
                html = report_generator.create_and_save_report(selected_inspection["id"])
                st.session_state["current_report_html"] = html
                st.success("Report generated and saved.")
            except ValueError as e:
                st.error(str(e))

        # View existing report
        if st.button("Load Existing Report"):
            report = database.get_owner_report(selected_inspection["id"])
            if report:
                st.session_state["current_report_html"] = report["report_html"]
            else:
                st.warning("No saved report found for this inspection. Generate one first.")

        if "current_report_html" in st.session_state:
            st.divider()
            st.subheader("Report Preview")
            st.components.v1.html(
                st.session_state["current_report_html"],
                height=1200,
                scrolling=True,
            )


# ── System Status ────────────────────────────────────────────────────────

elif page == "System Status":
    st.title("System Status")

    col1, col2 = st.columns(2)

    with col1:
        st.subheader("Database")
        all_premises = database.get_all_premises()
        st.markdown(f"**Status:** Connected")
        st.markdown(f"**Path:** `{config.DB_PATH}`")
        st.markdown(f"**Premises Count:** {len(all_premises)}")

    with col2:
        st.subheader("Uniform SOAP Connector")
        st.markdown(f"**WSDL URL:** `{config.UNIFORM_WSDL_URL}`")
        st.markdown(f"**Database ID:** `{config.UNIFORM_DATABASE_ID}`")
        st.markdown(f"**State:** `{config.UNIFORM_STATE_SWITCH}`")

        if st.button("Test Connection"):
            with st.spinner("Testing SOAP connectivity..."):
                status = uniform_sync.get_connection_status()
            if status.get("connected"):
                st.success("Connected to Uniform SOAP connector")
                if status.get("databases"):
                    st.markdown("**Available databases:**")
                    for db in status["databases"]:
                        st.markdown(f"- {db['database_id']} ({db['description']})")
            else:
                st.error(f"Connection failed: {status.get('error', 'Unknown error')}")

    st.divider()
    st.subheader("Sync History")
    sync = st.session_state.get("sync_result", {})
    st.markdown(f"**Last Sync:** {sync.get('timestamp', 'Never')}")
    st.markdown(f"**Source:** {sync.get('source', 'N/A')}")
    st.markdown(f"**Premises Loaded:** {sync.get('count', 0)}")
    for err in sync.get("errors", []):
        st.warning(err)

    st.divider()
    st.subheader("Uniform SOAP Operations")

    tab_licence, tab_check, tab_fees = st.tabs(["Licence Lookup", "Licence Check", "Fee Lookup"])

    with tab_licence:
        ref_val = st.text_input("Reference value", key="licence_ref")
        if st.button("Look Up Licence", key="lookup_btn"):
            if ref_val:
                try:
                    with st.spinner("Looking up licence..."):
                        result = uniform_sync.lookup_licence(ref_val)
                    if result:
                        st.json(result)
                    else:
                        st.warning("No licence found for that reference.")
                except Exception as e:
                    st.error(f"SOAP error: {e}")

    with tab_check:
        check_ref = st.text_input("Reference value", key="check_ref")
        if st.button("Check Licence Exists", key="check_btn"):
            if check_ref:
                try:
                    with st.spinner("Checking..."):
                        result = uniform_sync.check_licence_exists(check_ref)
                    if result.get("licence_exists"):
                        st.success(f"Licence exists. Valid: {result.get('licence_valid')}")
                    else:
                        st.warning("Licence not found.")
                except Exception as e:
                    st.error(f"SOAP error: {e}")

    with tab_fees:
        licence_type = st.text_input("Licence type code", key="fee_type")
        if st.button("Look Up Fees", key="fee_btn"):
            if licence_type:
                try:
                    with st.spinner("Looking up fees..."):
                        result = uniform_sync.get_fee_lookup(licence_type)
                    if result:
                        st.json(result)
                    else:
                        st.warning("No fee data found for that licence type.")
                except Exception as e:
                    st.error(f"SOAP error: {e}")

    st.divider()
    st.subheader("Configuration")
    st.json({
        "port": config.PORT,
        "host": config.HOST,
        "uniform_server": config.UNIFORM_SERVER,
        "uniform_state": config.UNIFORM_STATE_SWITCH,
        "db_path": config.DB_PATH,
        "report_output": config.REPORT_OUTPUT,
        "inspection_intervals": config.INSPECTION_INTERVALS,
    })
