/**
 * Inspection Scheduling and Risk Assessment Engine
 *
 * Implements the Food Law Code of Practice (England) Annex 5 risk rating
 * scheme to determine inspection frequency and priority.
 *
 * Risk categories A-E drive the inspection interval:
 *   A = 6 months   (high risk)
 *   B = 12 months  (upper medium)
 *   C = 18 months  (medium)
 *   D = 24 months  (lower medium)
 *   E = 36+ months (low – alternative enforcement)
 *
 * The scheduler identifies premises that are:
 *   - Overdue for inspection (past their next inspection due date)
 *   - Due within a configurable look-ahead window (default 6 months)
 *   - Newly registered and awaiting first inspection
 *   - Subject to enforcement action requiring revisit
 *
 * Premises are ranked by a composite priority score that considers:
 *   1. Risk category (A premises first)
 *   2. How overdue the inspection is
 *   3. Previous enforcement history
 *   4. Previous FHRS rating (lower rated premises get higher priority)
 *   5. Whether the business is newly registered (first inspection)
 */
const config = require('../config/default');
const database = require('./database');

/**
 * Calculate a numeric priority score for a premises.
 * Lower numbers = higher priority (should be inspected sooner).
 */
function calculatePriorityScore(premises) {
  let score = 0;
  const now = new Date();

  // 1. Risk category weighting (0-50 points)
  const riskWeights = { A: 0, B: 10, C: 20, D: 30, E: 40 };
  score += riskWeights[premises.risk_category] || 25;

  // 2. Overdue penalty – days past due (0-50 points)
  if (premises.next_inspection_due) {
    const dueDate = new Date(premises.next_inspection_due);
    const daysUntilDue = Math.floor((dueDate - now) / (1000 * 60 * 60 * 24));
    if (daysUntilDue < 0) {
      // Overdue: more overdue = lower score = higher priority
      score += Math.max(-50, daysUntilDue / 3);
    } else {
      score += Math.min(50, daysUntilDue / 6);
    }
  } else {
    // No due date – treat as high priority (possibly never inspected)
    score -= 20;
  }

  // 3. Previous enforcement history (reduces score = higher priority)
  const actions = database.getPreviousActions(premises.premises_ref);
  if (actions.length > 0) {
    score -= 10 * Math.min(actions.length, 3);
    // Severity weighting
    for (const action of actions) {
      if (action.action_type === 'Emergency Prohibition Notice') score -= 20;
      else if (action.action_type === 'Hygiene Improvement Notice') score -= 15;
      else if (action.action_type === 'Written Warning') score -= 5;
    }
  }

  // 4. Previous FHRS rating (lower rating = higher priority)
  if (premises.current_fhrs_rating != null) {
    score += premises.current_fhrs_rating * 5;
  } else {
    // Never rated (new business) – prioritise
    score -= 10;
  }

  // 5. Never inspected bonus
  if (!premises.last_inspection_date) {
    score -= 30;
  }

  return Math.round(score);
}

/**
 * Get premises due for inspection within the next N months,
 * sorted by priority.
 */
function getScheduledInspections(withinMonths = 6) {
  const premises = database.getPremisesDueInspection(withinMonths);

  const scheduled = premises.map((p) => {
    const priority = calculatePriorityScore(p);
    const actions = database.getPreviousActions(p.premises_ref);
    const dueDate = p.next_inspection_due ? new Date(p.next_inspection_due) : null;
    const now = new Date();
    const isOverdue = dueDate && dueDate < now;
    const daysUntilDue = dueDate
      ? Math.floor((dueDate - now) / (1000 * 60 * 60 * 24))
      : null;

    const interval = config.inspectionIntervals[p.risk_category];

    return {
      ...p,
      priorityScore: priority,
      isOverdue,
      daysUntilDue,
      previousActions: actions,
      intervalDescription: interval ? interval.description : 'Unknown',
      inspectionIntervalMonths: interval ? interval.months : 18,
      isNewBusiness: !p.last_inspection_date,
      requiresRevisit: actions.some(
        (a) => a.action_type === 'Hygiene Improvement Notice' || a.action_type === 'Emergency Prohibition Notice'
      ),
    };
  });

  // Sort by priority score ascending (lower = higher priority)
  scheduled.sort((a, b) => a.priorityScore - b.priorityScore);

  return scheduled;
}

/**
 * Get a summary of the inspection workload.
 */
function getWorkloadSummary(withinMonths = 6) {
  const scheduled = getScheduledInspections(withinMonths);

  const summary = {
    totalDue: scheduled.length,
    overdue: scheduled.filter((p) => p.isOverdue).length,
    newBusinesses: scheduled.filter((p) => p.isNewBusiness).length,
    requiresRevisit: scheduled.filter((p) => p.requiresRevisit).length,
    byRiskCategory: {},
    byBusinessType: {},
    byMonth: {},
  };

  for (const p of scheduled) {
    // By risk category
    const cat = p.risk_category || 'Unknown';
    summary.byRiskCategory[cat] = (summary.byRiskCategory[cat] || 0) + 1;

    // By business type
    const btype = p.business_type || 'Unknown';
    summary.byBusinessType[btype] = (summary.byBusinessType[btype] || 0) + 1;

    // By month
    if (p.next_inspection_due) {
      const month = p.next_inspection_due.slice(0, 7); // YYYY-MM
      summary.byMonth[month] = (summary.byMonth[month] || 0) + 1;
    }
  }

  return summary;
}

module.exports = {
  calculatePriorityScore,
  getScheduledInspections,
  getWorkloadSummary,
};
