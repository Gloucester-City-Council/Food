/**
 * Inspection Scheduling and Risk Assessment Engine
 * (async/PostgreSQL version for Azure Functions)
 */
const config = require('./config');
const database = require('./database');

async function calculatePriorityScore(premises) {
  let score = 0;
  const now = new Date();

  const riskWeights = { A: 0, B: 10, C: 20, D: 30, E: 40 };
  score += riskWeights[premises.risk_category] || 25;

  if (premises.next_inspection_due) {
    const dueDate = new Date(premises.next_inspection_due);
    const daysUntilDue = Math.floor((dueDate - now) / (1000 * 60 * 60 * 24));
    if (daysUntilDue < 0) {
      score += Math.max(-50, daysUntilDue / 3);
    } else {
      score += Math.min(50, daysUntilDue / 6);
    }
  } else {
    score -= 20;
  }

  const actions = await database.getPreviousActions(premises.premises_ref);
  if (actions.length > 0) {
    score -= 10 * Math.min(actions.length, 3);
    for (const action of actions) {
      if (action.action_type === 'Emergency Prohibition Notice') score -= 20;
      else if (action.action_type === 'Hygiene Improvement Notice') score -= 15;
      else if (action.action_type === 'Written Warning') score -= 5;
    }
  }

  if (premises.current_fhrs_rating != null) {
    score += premises.current_fhrs_rating * 5;
  } else {
    score -= 10;
  }

  if (!premises.last_inspection_date) {
    score -= 30;
  }

  return { score: Math.round(score), actions };
}

async function getScheduledInspections(withinMonths = 6) {
  const premises = await database.getPremisesDueInspection(withinMonths);
  const scheduled = [];

  for (const p of premises) {
    const { score: priority, actions } = await calculatePriorityScore(p);
    const dueDate = p.next_inspection_due ? new Date(p.next_inspection_due) : null;
    const now = new Date();
    const isOverdue = dueDate && dueDate < now;
    const daysUntilDue = dueDate ? Math.floor((dueDate - now) / (1000 * 60 * 60 * 24)) : null;
    const interval = config.inspectionIntervals[p.risk_category];

    scheduled.push({
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
    });
  }

  scheduled.sort((a, b) => a.priorityScore - b.priorityScore);
  return scheduled;
}

async function getWorkloadSummary(withinMonths = 6) {
  const scheduled = await getScheduledInspections(withinMonths);

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
    const cat = p.risk_category || 'Unknown';
    summary.byRiskCategory[cat] = (summary.byRiskCategory[cat] || 0) + 1;
    const btype = p.business_type || 'Unknown';
    summary.byBusinessType[btype] = (summary.byBusinessType[btype] || 0) + 1;
    if (p.next_inspection_due) {
      const month = p.next_inspection_due.slice(0, 7);
      summary.byMonth[month] = (summary.byMonth[month] || 0) + 1;
    }
  }

  return summary;
}

module.exports = { calculatePriorityScore, getScheduledInspections, getWorkloadSummary };
