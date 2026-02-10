#!/usr/bin/env node
/**
 * SQLite to PostgreSQL Migration Script
 *
 * Reads all data from the local SQLite database and inserts it into
 * Azure Database for PostgreSQL.
 *
 * Usage:
 *   DATABASE_URL="postgresql://user:pass@host:5432/food_inspections" \
 *     node scripts/migrate-sqlite-to-postgres.js [sqlite-path]
 *
 * Prerequisites:
 *   npm install better-sqlite3 pg
 *
 * The script will:
 *   1. Connect to both databases
 *   2. Create the PostgreSQL schema (if not present)
 *   3. Migrate premises, previous_actions, inspections, visit_sheets, owner_reports
 *   4. Report row counts for verification
 */
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

const SQLITE_PATH = process.argv[2] || path.join(__dirname, '..', 'server', 'data', 'food_inspections.db');
const PG_URL = process.env.DATABASE_URL;

if (!PG_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  console.error('Example: DATABASE_URL="postgresql://user:pass@host:5432/food_inspections" node scripts/migrate-sqlite-to-postgres.js');
  process.exit(1);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  SQLite → PostgreSQL Migration                      ║');
  console.log('║  GCC Food Inspection Management System              ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log();

  // ── Connect to SQLite ──
  console.log(`[SQLite] Opening: ${SQLITE_PATH}`);
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  sqlite.pragma('journal_mode = WAL');

  // ── Connect to PostgreSQL ──
  console.log(`[PG] Connecting to PostgreSQL...`);
  const pg = new Pool({
    connectionString: PG_URL,
    ssl: process.env.DB_SSL !== 'false' ? { rejectUnauthorized: false } : false,
  });
  await pg.query('SELECT 1');
  console.log('[PG] Connected successfully.');

  // ── Create schema ──
  console.log('[PG] Creating schema...');
  await pg.query(`
    CREATE TABLE IF NOT EXISTS premises (
      premises_ref TEXT PRIMARY KEY,
      uprn TEXT,
      business_name TEXT NOT NULL,
      trading_name TEXT,
      business_type TEXT,
      business_type_detail TEXT,
      food_business_operator TEXT,
      address_line1 TEXT,
      address_line2 TEXT,
      town TEXT,
      county TEXT,
      postcode TEXT,
      telephone TEXT,
      email TEXT,
      number_of_food_handlers INTEGER,
      risk_category TEXT,
      current_fhrs_rating INTEGER,
      registration_date TEXT,
      last_inspection_date TEXT,
      last_hygienic_score INTEGER,
      last_structure_score INTEGER,
      last_management_score INTEGER,
      next_inspection_due TEXT,
      trading_hours TEXT,
      water_supply TEXT,
      approval_status TEXT DEFAULT 'Registered',
      allergen_documentation INTEGER DEFAULT 0,
      haccp_in_place INTEGER DEFAULT 0,
      primary_authority TEXT,
      notes TEXT,
      synced_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS previous_actions (
      id SERIAL PRIMARY KEY,
      premises_ref TEXT NOT NULL REFERENCES premises(premises_ref),
      action_date TEXT,
      action_type TEXT,
      detail TEXT
    );

    CREATE TABLE IF NOT EXISTS inspections (
      id SERIAL PRIMARY KEY,
      premises_ref TEXT NOT NULL REFERENCES premises(premises_ref),
      reference_number TEXT UNIQUE,
      inspection_date TEXT,
      inspection_time TEXT,
      inspection_type TEXT,
      inspector_name TEXT,
      inspector_id TEXT,
      hygienic_score INTEGER,
      structure_score INTEGER,
      management_score INTEGER,
      total_score INTEGER,
      fhrs_rating INTEGER,
      enforcement_actions TEXT,
      actions_required TEXT,
      revisit_required INTEGER DEFAULT 0,
      revisit_date TEXT,
      additional_notes TEXT,
      status TEXT DEFAULT 'scheduled',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS visit_sheets (
      id SERIAL PRIMARY KEY,
      inspection_id INTEGER REFERENCES inspections(id),
      premises_ref TEXT NOT NULL REFERENCES premises(premises_ref),
      sheet_data TEXT,
      generated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS owner_reports (
      id SERIAL PRIMARY KEY,
      inspection_id INTEGER NOT NULL REFERENCES inspections(id),
      premises_ref TEXT NOT NULL REFERENCES premises(premises_ref),
      report_html TEXT,
      generated_at TIMESTAMPTZ DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_premises_next_inspection ON premises(next_inspection_due);
    CREATE INDEX IF NOT EXISTS idx_premises_risk ON premises(risk_category);
    CREATE INDEX IF NOT EXISTS idx_inspections_premises ON inspections(premises_ref);
    CREATE INDEX IF NOT EXISTS idx_inspections_date ON inspections(inspection_date);
  `);
  console.log('[PG] Schema created.');

  // ── Migrate premises ──
  const premises = sqlite.prepare('SELECT * FROM premises').all();
  console.log(`[MIGRATE] Migrating ${premises.length} premises...`);
  for (const p of premises) {
    await pg.query(
      `INSERT INTO premises (
        premises_ref, uprn, business_name, trading_name, business_type,
        business_type_detail, food_business_operator, address_line1,
        address_line2, town, county, postcode, telephone, email,
        number_of_food_handlers, risk_category, current_fhrs_rating,
        registration_date, last_inspection_date, last_hygienic_score,
        last_structure_score, last_management_score, next_inspection_due,
        trading_hours, water_supply, approval_status, allergen_documentation,
        haccp_in_place, primary_authority, notes, synced_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
      ON CONFLICT (premises_ref) DO UPDATE SET
        business_name=EXCLUDED.business_name, updated_at=NOW()`,
      [
        p.premises_ref, p.uprn, p.business_name, p.trading_name, p.business_type,
        p.business_type_detail, p.food_business_operator, p.address_line1,
        p.address_line2, p.town, p.county, p.postcode, p.telephone, p.email,
        p.number_of_food_handlers, p.risk_category, p.current_fhrs_rating,
        p.registration_date, p.last_inspection_date, p.last_hygienic_score,
        p.last_structure_score, p.last_management_score, p.next_inspection_due,
        p.trading_hours, p.water_supply, p.approval_status, p.allergen_documentation,
        p.haccp_in_place, p.primary_authority, p.notes,
        p.synced_at || new Date().toISOString(), p.updated_at || new Date().toISOString(),
      ]
    );
  }
  console.log(`[MIGRATE] Premises: ${premises.length} rows migrated.`);

  // ── Migrate previous_actions ──
  const actions = sqlite.prepare('SELECT * FROM previous_actions').all();
  console.log(`[MIGRATE] Migrating ${actions.length} previous actions...`);
  for (const a of actions) {
    await pg.query(
      'INSERT INTO previous_actions (premises_ref, action_date, action_type, detail) VALUES ($1, $2, $3, $4)',
      [a.premises_ref, a.action_date, a.action_type, a.detail]
    );
  }
  console.log(`[MIGRATE] Previous actions: ${actions.length} rows migrated.`);

  // ── Migrate inspections ──
  const inspections = sqlite.prepare('SELECT * FROM inspections').all();
  console.log(`[MIGRATE] Migrating ${inspections.length} inspections...`);
  for (const i of inspections) {
    await pg.query(
      `INSERT INTO inspections (
        premises_ref, reference_number, inspection_date, inspection_time,
        inspection_type, inspector_name, inspector_id, hygienic_score,
        structure_score, management_score, total_score, fhrs_rating,
        enforcement_actions, actions_required, revisit_required, revisit_date,
        additional_notes, status, created_at, completed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        i.premises_ref, i.reference_number, i.inspection_date, i.inspection_time,
        i.inspection_type, i.inspector_name, i.inspector_id, i.hygienic_score,
        i.structure_score, i.management_score, i.total_score, i.fhrs_rating,
        i.enforcement_actions, i.actions_required, i.revisit_required, i.revisit_date,
        i.additional_notes, i.status,
        i.created_at || new Date().toISOString(), i.completed_at || null,
      ]
    );
  }
  console.log(`[MIGRATE] Inspections: ${inspections.length} rows migrated.`);

  // ── Migrate visit_sheets ──
  const sheets = sqlite.prepare('SELECT * FROM visit_sheets').all();
  console.log(`[MIGRATE] Migrating ${sheets.length} visit sheets...`);
  for (const s of sheets) {
    await pg.query(
      'INSERT INTO visit_sheets (inspection_id, premises_ref, sheet_data, generated_at) VALUES ($1, $2, $3, $4)',
      [s.inspection_id, s.premises_ref, s.sheet_data, s.generated_at || new Date().toISOString()]
    );
  }
  console.log(`[MIGRATE] Visit sheets: ${sheets.length} rows migrated.`);

  // ── Migrate owner_reports ──
  const reports = sqlite.prepare('SELECT * FROM owner_reports').all();
  console.log(`[MIGRATE] Migrating ${reports.length} owner reports...`);
  for (const r of reports) {
    await pg.query(
      'INSERT INTO owner_reports (inspection_id, premises_ref, report_html, generated_at, sent_at) VALUES ($1, $2, $3, $4, $5)',
      [r.inspection_id, r.premises_ref, r.report_html, r.generated_at || new Date().toISOString(), r.sent_at || null]
    );
  }
  console.log(`[MIGRATE] Owner reports: ${reports.length} rows migrated.`);

  // ── Verify ──
  console.log();
  console.log('─── Verification ───');
  const pgPremises = await pg.query('SELECT COUNT(*) FROM premises');
  const pgActions = await pg.query('SELECT COUNT(*) FROM previous_actions');
  const pgInspections = await pg.query('SELECT COUNT(*) FROM inspections');
  const pgSheets = await pg.query('SELECT COUNT(*) FROM visit_sheets');
  const pgReports = await pg.query('SELECT COUNT(*) FROM owner_reports');

  console.log(`  premises:         SQLite=${premises.length}  PostgreSQL=${pgPremises.rows[0].count}`);
  console.log(`  previous_actions:  SQLite=${actions.length}  PostgreSQL=${pgActions.rows[0].count}`);
  console.log(`  inspections:       SQLite=${inspections.length}  PostgreSQL=${pgInspections.rows[0].count}`);
  console.log(`  visit_sheets:      SQLite=${sheets.length}  PostgreSQL=${pgSheets.rows[0].count}`);
  console.log(`  owner_reports:     SQLite=${reports.length}  PostgreSQL=${pgReports.rows[0].count}`);
  console.log();
  console.log('Migration complete.');

  sqlite.close();
  await pg.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
