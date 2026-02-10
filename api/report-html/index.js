const reportGenerator = require('../../shared/report-generator');

module.exports = async function (context, req) {
  try {
    const inspectionId = parseInt(context.bindingData.inspectionId, 10);
    const html = await reportGenerator.generateOwnerReport(inspectionId);
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
      body: html,
    };
  } catch (err) {
    context.res = {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
      body: { error: err.message },
    };
  }
};
