/**
 * Database service for Azure Functions deployment.
 *
 * Uses PostgreSQL (via Azure Database for PostgreSQL) instead of SQLite.
 * Connection pooling is managed by the `pg` library. The connection string
 * is read from the DATABASE_URL environment variable set in Azure Static
 * Web Apps application settings.
 */
const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL !== 'false' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

/**
 * Run a single query with parameters.
 */
async function query(text, params) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

/**
 * Run multiple statements inside a transaction.
 */
async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Schema initialisation ─────────────────────────────────────────────────

async function initSchema() {
  await query(`
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

    CREATE INDEX IF NOT EXISTS idx_premises_next_inspection
      ON premises(next_inspection_due);
    CREATE INDEX IF NOT EXISTS idx_premises_risk
      ON premises(risk_category);
    CREATE INDEX IF NOT EXISTS idx_inspections_premises
      ON inspections(premises_ref);
    CREATE INDEX IF NOT EXISTS idx_inspections_date
      ON inspections(inspection_date);
  `);
}

// ─── Premises ───────────────────────────────────────────────────────────────

async function importPremises(premisesList) {
  return transaction(async (client) => {
    for (const p of premisesList) {
      const scores = p.lastInspectionScores || {};
      await client.query(
        `INSERT INTO premises (
          premises_ref, uprn, business_name, trading_name, business_type,
          business_type_detail, food_business_operator, address_line1,
          address_line2, town, county, postcode, telephone, email,
          number_of_food_handlers, risk_category, current_fhrs_rating,
          registration_date, last_inspection_date, last_hygienic_score,
          last_structure_score, last_management_score, next_inspection_due,
          trading_hours, water_supply, approval_status, allergen_documentation,
          haccp_in_place, primary_authority, notes, synced_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,NOW(),NOW()
        )
        ON CONFLICT (premises_ref) DO UPDATE SET
          uprn=EXCLUDED.uprn, business_name=EXCLUDED.business_name,
          trading_name=EXCLUDED.trading_name, business_type=EXCLUDED.business_type,
          business_type_detail=EXCLUDED.business_type_detail,
          food_business_operator=EXCLUDED.food_business_operator,
          address_line1=EXCLUDED.address_line1, address_line2=EXCLUDED.address_line2,
          town=EXCLUDED.town, county=EXCLUDED.county, postcode=EXCLUDED.postcode,
          telephone=EXCLUDED.telephone, email=EXCLUDED.email,
          number_of_food_handlers=EXCLUDED.number_of_food_handlers,
          risk_category=EXCLUDED.risk_category,
          current_fhrs_rating=EXCLUDED.current_fhrs_rating,
          registration_date=EXCLUDED.registration_date,
          last_inspection_date=EXCLUDED.last_inspection_date,
          last_hygienic_score=EXCLUDED.last_hygienic_score,
          last_structure_score=EXCLUDED.last_structure_score,
          last_management_score=EXCLUDED.last_management_score,
          next_inspection_due=EXCLUDED.next_inspection_due,
          trading_hours=EXCLUDED.trading_hours, water_supply=EXCLUDED.water_supply,
          approval_status=EXCLUDED.approval_status,
          allergen_documentation=EXCLUDED.allergen_documentation,
          haccp_in_place=EXCLUDED.haccp_in_place,
          primary_authority=EXCLUDED.primary_authority,
          notes=EXCLUDED.notes, synced_at=NOW(), updated_at=NOW()`,
        [
          p.premisesRef,
          p.uprn || null,
          p.businessName,
          p.tradingName || p.businessName,
          p.businessType,
          p.businessTypeDetail || null,
          p.foodBusinessOperator,
          p.address ? p.address.line1 : '',
          p.address ? p.address.line2 : '',
          p.address ? p.address.town : 'Gloucester',
          p.address ? p.address.county : 'Gloucestershire',
          p.address ? p.address.postcode : '',
          p.telephone || null,
          p.email || null,
          p.numberOfFoodHandlers || 0,
          p.riskCategory || 'C',
          p.currentFhrsRating != null ? p.currentFhrsRating : null,
          p.registrationDate || null,
          p.lastInspectionDate || null,
          scores.hygienicFoodHandling != null ? scores.hygienicFoodHandling : null,
          scores.structureAndCleaning != null ? scores.structureAndCleaning : null,
          scores.managementOfFoodSafety != null ? scores.managementOfFoodSafety : null,
          p.nextInspectionDue || null,
          p.tradingHours || null,
          p.waterSupply || 'Mains',
          p.approvalStatus || 'Registered',
          p.allergenDocumentation ? 1 : 0,
          p.haccpInPlace ? 1 : 0,
          p.primaryAuthority || null,
          p.notes || null,
        ]
      );

      // Sync previous actions
      await client.query('DELETE FROM previous_actions WHERE premises_ref = $1', [p.premisesRef]);
      if (p.previousActions && p.previousActions.length > 0) {
        for (const action of p.previousActions) {
          await client.query(
            'INSERT INTO previous_actions (premises_ref, action_date, action_type, detail) VALUES ($1, $2, $3, $4)',
            [p.premisesRef, action.date, action.type, action.detail]
          );
        }
      }
    }
    return premisesList.length;
  });
}

async function getAllPremises() {
  const result = await query('SELECT * FROM premises ORDER BY business_name');
  return result.rows;
}

async function getPremises(premisesRef) {
  const result = await query('SELECT * FROM premises WHERE premises_ref = $1', [premisesRef]);
  return result.rows[0] || null;
}

async function getPreviousActions(premisesRef) {
  const result = await query(
    'SELECT * FROM previous_actions WHERE premises_ref = $1 ORDER BY action_date DESC',
    [premisesRef]
  );
  return result.rows;
}

async function getPremisesDueInspection(withinMonths = 6) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() + withinMonths);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const result = await query(
    `SELECT * FROM premises
     WHERE approval_status = 'Registered'
       AND (next_inspection_due <= $1 OR next_inspection_due IS NULL)
     ORDER BY
       CASE risk_category
         WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3
         WHEN 'D' THEN 4 WHEN 'E' THEN 5 ELSE 6
       END,
       next_inspection_due ASC`,
    [cutoffStr]
  );
  return result.rows;
}

// ─── Inspections ────────────────────────────────────────────────────────────

async function createInspection(data) {
  const refNum = `GCC-FHI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

  const result = await query(
    `INSERT INTO inspections (
      premises_ref, reference_number, inspection_date, inspection_time,
      inspection_type, inspector_name, inspector_id, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled')
    RETURNING id`,
    [
      data.premisesRef,
      refNum,
      data.inspectionDate || null,
      data.inspectionTime || null,
      data.inspectionType || 'routine',
      data.inspectorName || null,
      data.inspectorId || null,
    ]
  );
  return { id: result.rows[0].id, referenceNumber: refNum };
}

async function getInspection(id) {
  const result = await query('SELECT * FROM inspections WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getInspectionsForPremises(premisesRef) {
  const result = await query(
    'SELECT * FROM inspections WHERE premises_ref = $1 ORDER BY inspection_date DESC',
    [premisesRef]
  );
  return result.rows;
}

async function completeInspection(id, results) {
  const total =
    (results.hygienicScore || 0) +
    (results.structureScore || 0) +
    (results.managementScore || 0);

  await query(
    `UPDATE inspections SET
      hygienic_score = $1, structure_score = $2, management_score = $3,
      total_score = $4, fhrs_rating = $5, enforcement_actions = $6,
      actions_required = $7, revisit_required = $8, revisit_date = $9,
      additional_notes = $10, status = 'completed', completed_at = NOW()
    WHERE id = $11`,
    [
      results.hygienicScore,
      results.structureScore,
      results.managementScore,
      total,
      results.fhrsRating,
      results.enforcementActions || null,
      results.actionsRequired || null,
      results.revisitRequired ? 1 : 0,
      results.revisitDate || null,
      results.additionalNotes || null,
      id,
    ]
  );
}

// ─── Visit Sheets & Reports ────────────────────────────────────────────────

async function saveVisitSheet(inspectionId, premisesRef, sheetData) {
  const result = await query(
    'INSERT INTO visit_sheets (inspection_id, premises_ref, sheet_data) VALUES ($1, $2, $3) RETURNING id',
    [inspectionId, premisesRef, JSON.stringify(sheetData)]
  );
  return result.rows[0].id;
}

async function getVisitSheet(inspectionId) {
  const result = await query('SELECT * FROM visit_sheets WHERE inspection_id = $1', [inspectionId]);
  return result.rows[0] || null;
}

async function saveOwnerReport(inspectionId, premisesRef, reportHtml) {
  const result = await query(
    'INSERT INTO owner_reports (inspection_id, premises_ref, report_html) VALUES ($1, $2, $3) RETURNING id',
    [inspectionId, premisesRef, reportHtml]
  );
  return result.rows[0].id;
}

async function getOwnerReport(inspectionId) {
  const result = await query('SELECT * FROM owner_reports WHERE inspection_id = $1', [inspectionId]);
  return result.rows[0] || null;
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  query,
  transaction,
  initSchema,
  importPremises,
  getAllPremises,
  getPremises,
  getPreviousActions,
  getPremisesDueInspection,
  createInspection,
  getInspection,
  getInspectionsForPremises,
  completeInspection,
  saveVisitSheet,
  getVisitSheet,
  saveOwnerReport,
  getOwnerReport,
  close,
};
