#!/usr/bin/env node
/**
 * CLI script to generate owner reports for completed inspections.
 * Run: npm run generate-reports
 *
 * In the next development phase, this will auto-send reports to premises owners.
 */
const database = require('../services/database');
const reportGenerator = require('../services/report-generator');

function main() {
  console.log('Gloucester City Council - Food Inspection System');
  console.log('Generating premises owner reports...\n');

  database.initSchema();

  // Find completed inspections without reports
  const db = database.getDb();
  const inspections = db.prepare(`
    SELECT i.* FROM inspections i
    LEFT JOIN owner_reports r ON i.id = r.inspection_id
    WHERE i.status = 'completed' AND r.id IS NULL
  `).all();

  if (inspections.length === 0) {
    console.log('No completed inspections pending report generation.');
    database.close();
    return;
  }

  console.log(`Found ${inspections.length} inspection(s) needing reports.\n`);

  for (const insp of inspections) {
    try {
      reportGenerator.createAndSaveReport(insp.id);
      console.log(`  Generated report for inspection ${insp.reference_number} (${insp.premises_ref})`);
    } catch (err) {
      console.error(`  Failed for ${insp.reference_number}: ${err.message}`);
    }
  }

  console.log('\nDone.');
  database.close();
}

main();
