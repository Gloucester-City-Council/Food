const uniformSync = require('../../shared/uniform-sync');

module.exports = async function (context, req) {
  const connStatus = await uniformSync.getConnectionStatus();
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      status: 'operational',
      timestamp: new Date().toISOString(),
      uniformConnector: connStatus,
      database: { connected: true },
    },
  };
};
