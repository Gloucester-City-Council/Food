/**
 * SQLite database service for local caching of premises data and
 * management of inspection records.
 *
 * Acts as a local mirror of Idox Uniform data so that officers can
 * work offline, and stores inspection visit sheets and generated reports.
 */
const Database = require('better-sqlite3');
const path = require('path');
const config = require('../config/default');

let db;

function getDb() {
  if (!db) {
    const dbPath = path.resolve(config.database.path);
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  const d = getDb();

  d.exec(`
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
      synced_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS previous_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      premises_ref TEXT NOT NULL,
      action_date TEXT,
      action_type TEXT,
      detail TEXT,
      FOREIGN KEY (premises_ref) REFERENCES premises(premises_ref)
    );

    CREATE TABLE IF NOT EXISTS inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      premises_ref TEXT NOT NULL,
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
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (premises_ref) REFERENCES premises(premises_ref)
    );

    CREATE TABLE IF NOT EXISTS visit_sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inspection_id INTEGER,
      premises_ref TEXT NOT NULL,
      sheet_data TEXT,
      generated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (inspection_id) REFERENCES inspections(id),
      FOREIGN KEY (premises_ref) REFERENCES premises(premises_ref)
    );

    CREATE TABLE IF NOT EXISTS owner_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inspection_id INTEGER NOT NULL,
      premises_ref TEXT NOT NULL,
      report_html TEXT,
      generated_at TEXT DEFAULT (datetime('now')),
      sent_at TEXT,
      FOREIGN KEY (inspection_id) REFERENCES inspections(id),
      FOREIGN KEY (premises_ref) REFERENCES premises(premises_ref)
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

/**
 * Import premises from Uniform connector data (or sample data) into local cache.
 */
function importPremises(premisesList) {
  const d = getDb();

  const upsert = d.prepare(`
    INSERT OR REPLACE INTO premises (
      premises_ref, uprn, business_name, trading_name, business_type,
      business_type_detail, food_business_operator, address_line1,
      address_line2, town, county, postcode, telephone, email,
      number_of_food_handlers, risk_category, current_fhrs_rating,
      registration_date, last_inspection_date, last_hygienic_score,
      last_structure_score, last_management_score, next_inspection_due,
      trading_hours, water_supply, approval_status, allergen_documentation,
      haccp_in_place, primary_authority, notes, synced_at, updated_at
    ) VALUES (
      @premisesRef, @uprn, @businessName, @tradingName, @businessType,
      @businessTypeDetail, @foodBusinessOperator, @addressLine1,
      @addressLine2, @town, @county, @postcode, @telephone, @email,
      @numberOfFoodHandlers, @riskCategory, @currentFhrsRating,
      @registrationDate, @lastInspectionDate, @lastHygienicScore,
      @lastStructureScore, @lastManagementScore, @nextInspectionDue,
      @tradingHours, @waterSupply, @approvalStatus, @allergenDocumentation,
      @haccpInPlace, @primaryAuthority, @notes, datetime('now'), datetime('now')
    )
  `);

  const insertAction = d.prepare(`
    INSERT INTO previous_actions (premises_ref, action_date, action_type, detail)
    VALUES (@premisesRef, @actionDate, @actionType, @detail)
  `);

  const clearActions = d.prepare('DELETE FROM previous_actions WHERE premises_ref = ?');

  const importMany = d.transaction((items) => {
    for (const p of items) {
      const scores = p.lastInspectionScores || {};
      upsert.run({
        premisesRef: p.premisesRef,
        uprn: p.uprn || null,
        businessName: p.businessName,
        tradingName: p.tradingName || p.businessName,
        businessType: p.businessType,
        businessTypeDetail: p.businessTypeDetail || null,
        foodBusinessOperator: p.foodBusinessOperator,
        addressLine1: p.address ? p.address.line1 : '',
        addressLine2: p.address ? p.address.line2 : '',
        town: p.address ? p.address.town : 'Gloucester',
        county: p.address ? p.address.county : 'Gloucestershire',
        postcode: p.address ? p.address.postcode : '',
        telephone: p.telephone || null,
        email: p.email || null,
        numberOfFoodHandlers: p.numberOfFoodHandlers || 0,
        riskCategory: p.riskCategory || 'C',
        currentFhrsRating: p.currentFhrsRating != null ? p.currentFhrsRating : null,
        registrationDate: p.registrationDate || null,
        lastInspectionDate: p.lastInspectionDate || null,
        lastHygienicScore: scores.hygienicFoodHandling != null ? scores.hygienicFoodHandling : null,
        lastStructureScore: scores.structureAndCleaning != null ? scores.structureAndCleaning : null,
        lastManagementScore: scores.managementOfFoodSafety != null ? scores.managementOfFoodSafety : null,
        nextInspectionDue: p.nextInspectionDue || null,
        tradingHours: p.tradingHours || null,
        waterSupply: p.waterSupply || 'Mains',
        approvalStatus: p.approvalStatus || 'Registered',
        allergenDocumentation: p.allergenDocumentation ? 1 : 0,
        haccpInPlace: p.haccpInPlace ? 1 : 0,
        primaryAuthority: p.primaryAuthority || null,
        notes: p.notes || null,
      });

      // Sync previous actions
      clearActions.run(p.premisesRef);
      if (p.previousActions && p.previousActions.length > 0) {
        for (const action of p.previousActions) {
          insertAction.run({
            premisesRef: p.premisesRef,
            actionDate: action.date,
            actionType: action.type,
            detail: action.detail,
          });
        }
      }
    }
  });

  importMany(premisesList);
  return premisesList.length;
}

/**
 * Get all premises due for inspection within the next N months.
 */
function getPremisesDueInspection(withinMonths = 6) {
  const d = getDb();
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() + withinMonths);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const nowStr = now.toISOString().split('T')[0];

  return d.prepare(`
    SELECT * FROM premises
    WHERE approval_status = 'Registered'
      AND (next_inspection_due <= ? OR next_inspection_due IS NULL)
    ORDER BY
      CASE risk_category
        WHEN 'A' THEN 1
        WHEN 'B' THEN 2
        WHEN 'C' THEN 3
        WHEN 'D' THEN 4
        WHEN 'E' THEN 5
        ELSE 6
      END,
      next_inspection_due ASC
  `).all(cutoffStr);
}

/**
 * Get all premises.
 */
function getAllPremises() {
  const d = getDb();
  return d.prepare('SELECT * FROM premises ORDER BY business_name').all();
}

/**
 * Get a single premises by reference.
 */
function getPremises(premisesRef) {
  const d = getDb();
  return d.prepare('SELECT * FROM premises WHERE premises_ref = ?').get(premisesRef);
}

/**
 * Get previous actions for a premises.
 */
function getPreviousActions(premisesRef) {
  const d = getDb();
  return d.prepare(
    'SELECT * FROM previous_actions WHERE premises_ref = ? ORDER BY action_date DESC'
  ).all(premisesRef);
}

/**
 * Create a new scheduled inspection.
 */
function createInspection(data) {
  const d = getDb();
  const refNum = `GCC-FHI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

  const result = d.prepare(`
    INSERT INTO inspections (
      premises_ref, reference_number, inspection_date, inspection_time,
      inspection_type, inspector_name, inspector_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')
  `).run(
    data.premisesRef,
    refNum,
    data.inspectionDate || null,
    data.inspectionTime || null,
    data.inspectionType || 'routine',
    data.inspectorName || null,
    data.inspectorId || null
  );

  return { id: result.lastInsertRowid, referenceNumber: refNum };
}

/**
 * Get inspection by ID.
 */
function getInspection(id) {
  const d = getDb();
  return d.prepare('SELECT * FROM inspections WHERE id = ?').get(id);
}

/**
 * Get inspections for a premises.
 */
function getInspectionsForPremises(premisesRef) {
  const d = getDb();
  return d.prepare(
    'SELECT * FROM inspections WHERE premises_ref = ? ORDER BY inspection_date DESC'
  ).all(premisesRef);
}

/**
 * Update inspection with results.
 */
function completeInspection(id, results) {
  const d = getDb();
  const total = (results.hygienicScore || 0) + (results.structureScore || 0) + (results.managementScore || 0);

  d.prepare(`
    UPDATE inspections SET
      hygienic_score = ?,
      structure_score = ?,
      management_score = ?,
      total_score = ?,
      fhrs_rating = ?,
      enforcement_actions = ?,
      actions_required = ?,
      revisit_required = ?,
      revisit_date = ?,
      additional_notes = ?,
      status = 'completed',
      completed_at = datetime('now')
    WHERE id = ?
  `).run(
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
    id
  );
}

/**
 * Save a generated visit sheet.
 */
function saveVisitSheet(inspectionId, premisesRef, sheetData) {
  const d = getDb();
  const result = d.prepare(`
    INSERT INTO visit_sheets (inspection_id, premises_ref, sheet_data)
    VALUES (?, ?, ?)
  `).run(inspectionId, premisesRef, JSON.stringify(sheetData));
  return result.lastInsertRowid;
}

/**
 * Save a generated owner report.
 */
function saveOwnerReport(inspectionId, premisesRef, reportHtml) {
  const d = getDb();
  const result = d.prepare(`
    INSERT INTO owner_reports (inspection_id, premises_ref, report_html)
    VALUES (?, ?, ?)
  `).run(inspectionId, premisesRef, reportHtml);
  return result.lastInsertRowid;
}

/**
 * Get visit sheet for an inspection.
 */
function getVisitSheet(inspectionId) {
  const d = getDb();
  return d.prepare('SELECT * FROM visit_sheets WHERE inspection_id = ?').get(inspectionId);
}

/**
 * Get owner report for an inspection.
 */
function getOwnerReport(inspectionId) {
  const d = getDb();
  return d.prepare('SELECT * FROM owner_reports WHERE inspection_id = ?').get(inspectionId);
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  initSchema,
  importPremises,
  getPremisesDueInspection,
  getAllPremises,
  getPremises,
  getPreviousActions,
  createInspection,
  getInspection,
  getInspectionsForPremises,
  completeInspection,
  saveVisitSheet,
  saveOwnerReport,
  getVisitSheet,
  getOwnerReport,
  close,
};
