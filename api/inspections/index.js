const database = require('../../shared/database');

module.exports = async function (context, req) {
  try {
    const result = await database.createInspection(req.body);
    context.res = {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: { success: true, ...result },
    };
  } catch (err) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { success: false, error: err.message },
    };
  }
};
