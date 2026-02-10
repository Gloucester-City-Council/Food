const database = require('../../shared/database');

module.exports = async function (context, req) {
  try {
    const id = parseInt(context.bindingData.id, 10);
    await database.completeInspection(id, req.body);
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { success: true },
    };
  } catch (err) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { success: false, error: err.message },
    };
  }
};
