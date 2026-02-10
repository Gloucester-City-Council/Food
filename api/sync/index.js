const uniformSync = require('../../shared/uniform-sync');

module.exports = async function (context, req) {
  try {
    const result = await uniformSync.syncPremises();
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { success: true, ...result },
    };
  } catch (err) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { success: false, error: err.message },
    };
  }
};
