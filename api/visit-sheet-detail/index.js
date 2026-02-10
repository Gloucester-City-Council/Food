const visitSheet = require('../../shared/visit-sheet');

module.exports = async function (context, req) {
  try {
    const sheet = await visitSheet.generateVisitSheet(
      context.bindingData.premisesRef,
      req.query
    );
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: sheet,
    };
  } catch (err) {
    context.res = {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
      body: { error: err.message },
    };
  }
};
