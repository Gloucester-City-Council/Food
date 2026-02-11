"""
Visit Sheet Pre-population Service

Generates pre-populated food inspection visit sheets using data from
the Idox Uniform connector and local cache.

The visit sheet is the working document an Environmental Health Officer
takes on an inspection, with business-type-specific focus areas and
temperature check templates.
"""
from datetime import datetime

import config
import database

# Business-type-specific inspection focus areas
BUSINESS_TYPE_FOCUS = {
    "restaurant": {
        "label": "Restaurant/Cafe",
        "keyRisks": [
            "Cross-contamination between raw and ready-to-eat foods",
            "Allergen management across complex menus",
            "Temperature control during multi-stage cooking",
            "Staff hand-washing compliance during service",
            "Cleaning of food contact surfaces between uses",
        ],
        "temperatureChecks": [
            {"item": "Walk-in chiller", "requiredRange": "0-5\u00b0C"},
            {"item": "Walk-in freezer", "requiredRange": "-18\u00b0C or below"},
            {"item": "Hot holding display", "requiredRange": "63\u00b0C or above"},
            {"item": "Cooked food (core temp)", "requiredRange": "75\u00b0C or above"},
            {"item": "Dessert fridge", "requiredRange": "0-5\u00b0C"},
        ],
    },
    "takeaway": {
        "label": "Takeaway/Fast Food",
        "keyRisks": [
            "Temperature abuse during holding and delivery",
            "Cross-contamination in limited preparation space",
            "Oil quality in deep fat fryers",
            "Personal hygiene with high staff turnover",
            "Allergen information at point of sale",
        ],
        "temperatureChecks": [
            {"item": "Main fridge", "requiredRange": "0-5\u00b0C"},
            {"item": "Freezer", "requiredRange": "-18\u00b0C or below"},
            {"item": "Hot holding cabinet", "requiredRange": "63\u00b0C or above"},
            {"item": "Cooked food (core temp)", "requiredRange": "75\u00b0C or above"},
            {"item": "Frying oil temperature", "requiredRange": "175-185\u00b0C"},
        ],
    },
    "pub": {
        "label": "Pub/Bar",
        "keyRisks": [
            "Food storage in cramped cellar/kitchen areas",
            "Temperature control of bar snacks and buffets",
            "Cleaning of draught beer lines and dispense equipment",
            "Separation of food and drink preparation",
            "Staff food hygiene training (mixed food/drink roles)",
        ],
        "temperatureChecks": [
            {"item": "Kitchen fridge", "requiredRange": "0-5\u00b0C"},
            {"item": "Kitchen freezer", "requiredRange": "-18\u00b0C or below"},
            {"item": "Cellar temperature", "requiredRange": "10-13\u00b0C"},
            {"item": "Sunday roast core temp", "requiredRange": "75\u00b0C or above"},
            {"item": "Hot holding (carvery)", "requiredRange": "63\u00b0C or above"},
        ],
    },
    "hotel": {
        "label": "Hotel/B&B",
        "keyRisks": [
            "Multiple food service areas (restaurant, room service, bar, conference)",
            "Breakfast buffet temperature control",
            "Allergen management across diverse menus",
            "Extended food preparation hours",
            "Pest control in older building fabric",
        ],
        "temperatureChecks": [
            {"item": "Main kitchen chiller", "requiredRange": "0-5\u00b0C"},
            {"item": "Main kitchen freezer", "requiredRange": "-18\u00b0C or below"},
            {"item": "Breakfast buffet (hot)", "requiredRange": "63\u00b0C or above"},
            {"item": "Breakfast buffet (cold)", "requiredRange": "0-8\u00b0C"},
            {"item": "Room service holding", "requiredRange": "63\u00b0C or above"},
        ],
    },
    "retail": {
        "label": "Retail Shop",
        "keyRisks": [
            "Chilled display cabinet temperatures",
            "Date coding and stock rotation",
            "Food returned to storage after display",
            "Pest control (particularly stored products)",
            "Allergen labelling on pre-packed foods",
        ],
        "temperatureChecks": [
            {"item": "Display chiller (dairy)", "requiredRange": "0-5\u00b0C"},
            {"item": "Display chiller (deli)", "requiredRange": "0-5\u00b0C"},
            {"item": "Storage freezer", "requiredRange": "-18\u00b0C or below"},
            {"item": "Back-of-house chiller", "requiredRange": "0-5\u00b0C"},
            {"item": "Ambient store temperature", "requiredRange": "Below 25\u00b0C"},
        ],
    },
    "supermarket": {
        "label": "Supermarket",
        "keyRisks": [
            "Cold chain integrity across multiple display units",
            "In-store bakery and deli cross-contamination",
            "Date coding compliance at scale",
            "Pest control across large premises",
            "Staff training across multiple departments",
        ],
        "temperatureChecks": [
            {"item": "Dairy display chiller", "requiredRange": "0-5\u00b0C"},
            {"item": "Meat display chiller", "requiredRange": "0-5\u00b0C"},
            {"item": "Frozen goods display", "requiredRange": "-18\u00b0C or below"},
            {"item": "Deli counter", "requiredRange": "0-5\u00b0C"},
            {"item": "In-store bakery ambient", "requiredRange": "Below 25\u00b0C"},
        ],
    },
    "manufacturer": {
        "label": "Food Manufacturer/Packer",
        "keyRisks": [
            "HACCP critical control points at each process step",
            "Allergen segregation and cleaning between product runs",
            "Traceability and recall procedures",
            "Water quality (where used in production)",
            "Packaging integrity and labelling accuracy",
        ],
        "temperatureChecks": [
            {"item": "Ingredient chiller", "requiredRange": "0-5\u00b0C"},
            {"item": "Blast chiller", "requiredRange": "Below 5\u00b0C within 90 mins"},
            {"item": "Finished product storage", "requiredRange": "0-5\u00b0C"},
            {"item": "Production area ambient", "requiredRange": "Below 25\u00b0C"},
            {"item": "Freezer storage", "requiredRange": "-18\u00b0C or below"},
        ],
    },
    "caterer": {
        "label": "Caterer",
        "keyRisks": [
            "Temperature control during transport",
            "Cross-contamination at temporary event sites",
            "Allergen management for large-scale catering",
            "Hand washing facilities at events",
            "Traceability across multiple suppliers",
        ],
        "temperatureChecks": [
            {"item": "Base kitchen chiller", "requiredRange": "0-5\u00b0C"},
            {"item": "Transport container (hot)", "requiredRange": "63\u00b0C or above"},
            {"item": "Transport container (cold)", "requiredRange": "0-8\u00b0C"},
            {"item": "Reheated food core temp", "requiredRange": "75\u00b0C or above"},
            {"item": "Base kitchen freezer", "requiredRange": "-18\u00b0C or below"},
        ],
    },
    "school": {
        "label": "School/Hospital/Care",
        "keyRisks": [
            "Allergen management for vulnerable populations",
            "Special dietary requirements (medical/religious)",
            "Large-scale cooking and holding temperatures",
            "Cleaning during continuous service",
            "Staff training and supervision",
        ],
        "temperatureChecks": [
            {"item": "Walk-in chiller", "requiredRange": "0-5\u00b0C"},
            {"item": "Walk-in freezer", "requiredRange": "-18\u00b0C or below"},
            {"item": "Hot holding trolley", "requiredRange": "63\u00b0C or above"},
            {"item": "Core temp (main dish)", "requiredRange": "75\u00b0C or above"},
            {"item": "Salad bar temperature", "requiredRange": "0-8\u00b0C"},
        ],
    },
    "mobile": {
        "label": "Mobile Food Unit",
        "keyRisks": [
            "Limited hand washing facilities",
            "Water supply adequacy and quality",
            "Waste water disposal",
            "Temperature control with limited refrigeration",
            "Structural condition of vehicle/unit",
        ],
        "temperatureChecks": [
            {"item": "On-board fridge", "requiredRange": "0-5\u00b0C"},
            {"item": "Cooked food core temp", "requiredRange": "75\u00b0C or above"},
            {"item": "Hot holding display", "requiredRange": "63\u00b0C or above"},
            {"item": "On-board freezer", "requiredRange": "-18\u00b0C or below"},
        ],
    },
}


def generate_visit_sheet(premises_ref, options=None):
    """Generate a pre-populated visit sheet for a premises."""
    options = options or {}
    premises = database.get_premises(premises_ref)
    if not premises:
        raise ValueError(f"Premises not found: {premises_ref}")

    previous_actions = database.get_previous_actions(premises_ref)
    previous_inspections = database.get_inspections_for_premises(premises_ref)
    business_focus = BUSINESS_TYPE_FOCUS.get(
        premises.get("business_type"), BUSINESS_TYPE_FOCUS["restaurant"]
    )
    interval_info = config.INSPECTION_INTERVALS.get(premises.get("risk_category"))

    # Determine inspection type
    inspection_type = "routine"
    if not premises.get("last_inspection_date"):
        inspection_type = "new_business"
    elif any(
        a.get("action_type") in ("Hygiene Improvement Notice", "Emergency Prohibition Notice")
        for a in previous_actions
    ):
        inspection_type = "followup"
    if options.get("inspectionType"):
        inspection_type = options["inspectionType"]

    # Build focus areas
    focus_areas = []
    if not premises.get("haccp_in_place"):
        focus_areas.append(
            "HACCP/Food Safety Management System - previously not in place, verify implementation"
        )
    if not premises.get("allergen_documentation"):
        focus_areas.append(
            "Allergen documentation - previously absent, check compliance with Regulation (EU) 1169/2011"
        )
    if previous_actions:
        focus_areas.append("Verify compliance with previous enforcement actions:")
        for action in previous_actions:
            focus_areas.append(
                f"  - {action['action_type']} ({action['action_date']}): {action['detail']}"
            )
    if (premises.get("last_hygienic_score") or 0) >= 15:
        focus_areas.append(
            "Hygienic food handling - previously scored poorly, re-assess thoroughly"
        )
    if (premises.get("last_structure_score") or 0) >= 15:
        focus_areas.append(
            "Structure and cleaning - previously scored poorly, check structural improvements"
        )
    if (premises.get("last_management_score") or 0) >= 20:
        focus_areas.append(
            "Food safety management - previously scored poorly, review documentation"
        )
    for risk in business_focus["keyRisks"]:
        focus_areas.append(f"[{business_focus['label']}] {risk}")

    type_labels = {
        "routine": "Routine Inspection",
        "followup": "Follow-up Inspection",
        "complaint": "Complaint Investigation",
        "new_business": "New Business Registration Inspection",
        "revisit": "Re-visit",
    }

    last_scores = None
    if premises.get("last_inspection_date"):
        h = premises.get("last_hygienic_score") or 0
        s = premises.get("last_structure_score") or 0
        m = premises.get("last_management_score") or 0
        last_scores = {
            "hygienicFoodHandling": premises.get("last_hygienic_score"),
            "structureAndCleaning": premises.get("last_structure_score"),
            "managementOfFoodSafety": premises.get("last_management_score"),
            "total": h + s + m,
        }

    visit_sheet = {
        "header": {
            "council": config.COUNCIL,
            "formTitle": "Food Hygiene Inspection Visit Sheet",
            "generatedAt": datetime.now().isoformat(),
            "inspectionType": inspection_type,
            "inspectionTypeLabel": type_labels.get(inspection_type, "Routine Inspection"),
        },
        "inspectionDetails": {
            "referenceNumber": None,
            "inspectionDate": options.get("inspectionDate"),
            "inspectionTime": options.get("inspectionTime"),
            "inspectionType": inspection_type,
            "inspectorName": options.get("inspectorName"),
            "inspectorId": options.get("inspectorId"),
        },
        "businessDetails": {
            "premisesRef": premises["premises_ref"],
            "uprn": premises.get("uprn"),
            "businessName": premises["business_name"],
            "tradingName": premises.get("trading_name"),
            "businessAddress": "\n".join(
                filter(None, [
                    premises.get("address_line1"),
                    premises.get("address_line2"),
                    premises.get("town"),
                    premises.get("county"),
                ])
            ),
            "postcode": premises.get("postcode"),
            "telephone": premises.get("telephone"),
            "email": premises.get("email"),
            "foodBusinessOperator": premises.get("food_business_operator"),
            "businessType": premises.get("business_type"),
            "businessTypeDetail": premises.get("business_type_detail"),
            "numberOfFoodHandlers": premises.get("number_of_food_handlers"),
            "registrationDate": premises.get("registration_date"),
            "tradingHours": premises.get("trading_hours"),
            "waterSupply": premises.get("water_supply"),
            "approvalStatus": premises.get("approval_status"),
            "primaryAuthority": premises.get("primary_authority"),
        },
        "previousInspectionSummary": {
            "lastInspectionDate": premises.get("last_inspection_date"),
            "lastScores": last_scores,
            "currentFhrsRating": premises.get("current_fhrs_rating"),
            "riskCategory": premises.get("risk_category"),
            "intervalDescription": interval_info["description"] if interval_info else "Unknown",
            "previousActions": [
                {"date": a["action_date"], "type": a["action_type"], "detail": a["detail"]}
                for a in previous_actions
            ],
            "haccpInPlace": bool(premises.get("haccp_in_place")),
            "allergenDocumentation": bool(premises.get("allergen_documentation")),
            "officerNotes": premises.get("notes"),
        },
        "inspectionFocusAreas": focus_areas,
        "hygienicFoodHandling": {
            "score": None,
            "criteria": {
                "tempCooking": None, "tempChilled": None, "tempHot": None,
                "crossContamination": None, "personalHygiene": None, "foodStorage": None,
            },
            "comments": "",
        },
        "structureAndCleaning": {
            "score": None,
            "criteria": {
                "cleanlinessStructure": None, "cleanlinessEquipment": None,
                "conditionStructure": None, "conditionEquipment": None,
                "pestControl": None, "handWashing": None,
                "ventilationLighting": None, "wasteDisposal": None,
            },
            "comments": "",
        },
        "managementOfFoodSafety": {
            "score": None,
            "criteria": {
                "haccp": None, "temperatureRecords": None, "trainingRecords": None,
                "traceability": None, "allergens": None, "cleaningSchedules": None,
            },
            "comments": "",
        },
        "temperatureReadings": [
            {"item": tc["item"], "temperature": None, "requiredRange": tc["requiredRange"], "compliant": None}
            for tc in business_focus["temperatureChecks"]
        ],
        "overallRating": {"totalScore": None, "fhrsRating": None},
        "actionsRequired": {
            "enforcementActions": [],
            "detailedActions": "",
            "revisitRequired": False,
            "revisitDate": None,
        },
        "declaration": {
            "additionalNotes": "",
            "inspectorSignature": None,
            "businessRepSignature": None,
            "businessRepName": "",
            "businessRepRole": "",
        },
        "metadata": {
            "businessTypeFocus": business_focus,
            "riskCategory": premises.get("risk_category"),
            "isNewBusiness": not premises.get("last_inspection_date"),
            "hasOutstandingActions": len(previous_actions) > 0,
            "previousInspectionCount": len(previous_inspections),
        },
    }

    return visit_sheet


def generate_batch_visit_sheets(within_months=6, options=None):
    """Generate visit sheets for all premises due inspection."""
    options = options or {}
    premises_list = database.get_premises_due_inspection(within_months)
    sheets = []
    for p in premises_list:
        sheet = generate_visit_sheet(p["premises_ref"], options)
        sheets.append(sheet)
    return sheets
