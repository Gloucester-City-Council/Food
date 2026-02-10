const database = require('../../shared/database');

module.exports = async function (context, req) {
  const inspectionId = parseInt(context.bindingData.inspectionId, 10);
  const report = await database.getOwnerReport(inspectionId);
  if (!report) {
    context.res = { status: 404, headers: { 'Content-Type': 'application/json' }, body: { error: 'Report not found' } };
    return;
  }
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: report,
  };
};
