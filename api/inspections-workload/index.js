const scheduler = require('../../shared/inspection-scheduler');

module.exports = async function (context, req) {
  const months = parseInt(req.query.months, 10) || 6;
  const summary = await scheduler.getWorkloadSummary(months);
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: summary,
  };
};
