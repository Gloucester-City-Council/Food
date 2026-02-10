/**
 * Uniform Sync Service (async/PostgreSQL version for Azure Functions)
 */
const UniformClient = require('./uniform-client');
const database = require('./database');
const samplePremises = require('../server/data/sample-premises.json');

const client = new UniformClient();

async function syncPremises() {
  const result = { source: null, count: 0, timestamp: new Date().toISOString(), errors: [] };

  const connStatus = await client.testConnection();

  if (connStatus.connected) {
    result.source = 'uniform-live';
    try {
      const premises = await client.getAllFoodPremises();
      if (premises && Array.isArray(premises.data)) {
        result.count = await database.importPremises(premises.data);
      } else if (Array.isArray(premises)) {
        result.count = await database.importPremises(premises);
      }
    } catch (err) {
      result.errors.push(`Live sync error: ${err.message}`);
      result.source = 'sample-data-fallback';
      result.count = await database.importPremises(samplePremises);
    }
  } else {
    result.source = 'sample-data';
    result.count = await database.importPremises(samplePremises);
    result.errors.push(
      `Uniform connector at ${connStatus.host}:${connStatus.port} is not available: ${connStatus.error || 'connection refused'}. Using sample data.`
    );
  }

  return result;
}

async function getConnectionStatus() {
  return client.testConnection();
}

module.exports = { syncPremises, getConnectionStatus };
