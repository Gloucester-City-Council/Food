/**
 * Uniform Sync Service
 *
 * Handles synchronisation between the Idox Uniform commercial properties
 * connector and the local SQLite database cache.
 *
 * When the Uniform connector is reachable (port 445), premises data is
 * fetched from the live system. When offline, the application falls back
 * to previously cached data and the sample dataset.
 */
const UniformClient = require('../connectors/uniform-client');
const database = require('./database');
const samplePremises = require('../data/sample-premises.json');

const client = new UniformClient();

/**
 * Attempt to sync premises from the live Uniform connector.
 * Falls back to sample data if the connector is unavailable.
 */
async function syncPremises() {
  const result = {
    source: null,
    count: 0,
    timestamp: new Date().toISOString(),
    errors: [],
  };

  // Try the live Uniform connector first
  const connStatus = await client.testConnection();

  if (connStatus.connected) {
    result.source = 'uniform-live';
    try {
      const premises = await client.getAllFoodPremises();
      if (premises && Array.isArray(premises.data)) {
        result.count = database.importPremises(premises.data);
      } else if (Array.isArray(premises)) {
        result.count = database.importPremises(premises);
      }
    } catch (err) {
      result.errors.push(`Live sync error: ${err.message}`);
      // Fall back to sample data
      result.source = 'sample-data-fallback';
      result.count = database.importPremises(samplePremises);
    }
  } else {
    // Uniform connector not available – use sample/cached data
    result.source = 'sample-data';
    result.count = database.importPremises(samplePremises);
    result.errors.push(
      `Uniform connector at ${connStatus.host}:${connStatus.port} is not available: ${connStatus.error || 'connection refused'}. Using sample data.`
    );
  }

  return result;
}

/**
 * Get the current connection status of the Uniform connector.
 */
async function getConnectionStatus() {
  return client.testConnection();
}

module.exports = {
  syncPremises,
  getConnectionStatus,
};
