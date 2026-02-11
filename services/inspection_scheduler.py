"""
Inspection Scheduling and Risk Assessment Engine

Implements the Food Law Code of Practice (England) Annex 5 risk rating
scheme to determine inspection frequency and priority.

Risk categories A-E drive the inspection interval:
  A = 6 months   (high risk)
  B = 12 months  (upper medium)
  C = 18 months  (medium)
  D = 24 months  (lower medium)
  E = 36+ months (low - alternative enforcement)

Premises are ranked by a composite priority score that considers:
  1. Risk category (A premises first)
  2. How overdue the inspection is
  3. Previous enforcement history
  4. Previous FHRS rating (lower rated premises get higher priority)
  5. Whether the business is newly registered (first inspection)
"""
from datetime import datetime

import config
import database


def calculate_priority_score(premises):
    """
    Calculate a numeric priority score for a premises.
    Lower numbers = higher priority (should be inspected sooner).
    """
    score = 0
    now = datetime.now()

    # 1. Risk category weighting (0-50 points)
    risk_weights = {"A": 0, "B": 10, "C": 20, "D": 30, "E": 40}
    score += risk_weights.get(premises.get("risk_category"), 25)

    # 2. Overdue penalty
    next_due = premises.get("next_inspection_due")
    if next_due:
        due_date = datetime.strptime(next_due, "%Y-%m-%d")
        days_until_due = (due_date - now).days
        if days_until_due < 0:
            score += max(-50, days_until_due / 3)
        else:
            score += min(50, days_until_due / 6)
    else:
        score -= 20

    # 3. Previous enforcement history
    actions = database.get_previous_actions(premises["premises_ref"])
    if actions:
        score -= 10 * min(len(actions), 3)
        for action in actions:
            atype = action.get("action_type", "")
            if atype == "Emergency Prohibition Notice":
                score -= 20
            elif atype == "Hygiene Improvement Notice":
                score -= 15
            elif atype == "Written Warning":
                score -= 5

    # 4. Previous FHRS rating (lower rating = higher priority)
    fhrs = premises.get("current_fhrs_rating")
    if fhrs is not None:
        score += fhrs * 5
    else:
        score -= 10

    # 5. Never inspected bonus
    if not premises.get("last_inspection_date"):
        score -= 30

    return round(score)


def get_scheduled_inspections(within_months=6):
    """
    Get premises due for inspection within the next N months,
    sorted by priority.
    """
    premises_list = database.get_premises_due_inspection(within_months)
    scheduled = []

    now = datetime.now()
    for p in premises_list:
        priority = calculate_priority_score(p)
        actions = database.get_previous_actions(p["premises_ref"])
        due_date_str = p.get("next_inspection_due")
        due_date = datetime.strptime(due_date_str, "%Y-%m-%d") if due_date_str else None
        is_overdue = due_date is not None and due_date < now
        days_until_due = (due_date - now).days if due_date else None

        interval = config.INSPECTION_INTERVALS.get(p.get("risk_category"))

        item = dict(p)
        item.update({
            "priorityScore": priority,
            "isOverdue": is_overdue,
            "daysUntilDue": days_until_due,
            "previousActions": actions,
            "intervalDescription": interval["description"] if interval else "Unknown",
            "inspectionIntervalMonths": interval["months"] if interval else 18,
            "isNewBusiness": not p.get("last_inspection_date"),
            "requiresRevisit": any(
                a.get("action_type") in ("Hygiene Improvement Notice", "Emergency Prohibition Notice")
                for a in actions
            ),
        })
        scheduled.append(item)

    scheduled.sort(key=lambda x: x["priorityScore"])
    return scheduled


def get_workload_summary(within_months=6):
    """Get a summary of the inspection workload."""
    scheduled = get_scheduled_inspections(within_months)

    summary = {
        "totalDue": len(scheduled),
        "overdue": sum(1 for p in scheduled if p["isOverdue"]),
        "newBusinesses": sum(1 for p in scheduled if p["isNewBusiness"]),
        "requiresRevisit": sum(1 for p in scheduled if p["requiresRevisit"]),
        "byRiskCategory": {},
        "byBusinessType": {},
        "byMonth": {},
    }

    for p in scheduled:
        cat = p.get("risk_category") or "Unknown"
        summary["byRiskCategory"][cat] = summary["byRiskCategory"].get(cat, 0) + 1

        btype = p.get("business_type") or "Unknown"
        summary["byBusinessType"][btype] = summary["byBusinessType"].get(btype, 0) + 1

        next_due = p.get("next_inspection_due")
        if next_due:
            month = next_due[:7]  # YYYY-MM
            summary["byMonth"][month] = summary["byMonth"].get(month, 0) + 1

    return summary
