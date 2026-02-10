const visitSheet = require('../../shared/visit-sheet');

module.exports = async function (context, req) {
  const months = parseInt(req.query.months, 10) || 6;
  const sheets = await visitSheet.generateBatchVisitSheets(months, req.query);
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { count: sheets.length, sheets },
  };
};
