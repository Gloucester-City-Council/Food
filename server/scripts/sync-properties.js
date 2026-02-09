#!/usr/bin/env node
/**
 * CLI script to sync commercial properties from the Idox Uniform connector.
 * Run: npm run sync-properties
 */
const database = require('../services/database');
const uniformSync = require('../services/uniform-sync');

async function main() {
  console.log('Gloucester City Council - Food Inspection System');
  console.log('Syncing commercial properties from Idox Uniform...\n');

  database.initSchema();
  const result = await uniformSync.syncPremises();

  console.log(`Source:   ${result.source}`);
  console.log(`Premises: ${result.count}`);
  console.log(`Time:     ${result.timestamp}`);

  if (result.errors.length > 0) {
    console.log('\nNotes:');
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  // Show premises due in next 6 months
  const due = database.getPremisesDueInspection(6);
  console.log(`\nPremises due for inspection (next 6 months): ${due.length}`);
  due.forEach(p => {
    console.log(`  ${p.risk_category} | ${p.business_name.padEnd(30)} | Due: ${p.next_inspection_due || 'TBD'} | FHRS: ${p.current_fhrs_rating != null ? p.current_fhrs_rating : '?'}`);
  });

  database.close();
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
