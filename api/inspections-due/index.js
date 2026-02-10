const scheduler = require('../../shared/inspection-scheduler');

module.exports = async function (context, req) {
  const months = parseInt(req.query.months, 10) || 6;
  const scheduled = await scheduler.getScheduledInspections(months);
  const summary = await scheduler.getWorkloadSummary(months);
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { summary, inspections: scheduled },
  };
};
