const reportGenerator = require('../../shared/report-generator');

module.exports = async function (context, req) {
  try {
    const inspectionId = parseInt(context.bindingData.inspectionId, 10);
    const html = await reportGenerator.createAndSaveReport(inspectionId);
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { success: true, html },
    };
  } catch (err) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { success: false, error: err.message },
    };
  }
};
