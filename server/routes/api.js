/**
 * API Routes for the Food Inspection Management System
 *
 * Provides REST endpoints for:
 *   - Premises management (from Uniform connector)
 *   - Inspection scheduling and workload management
 *   - Visit sheet generation and pre-population
 *   - Report generation for premises owners
 *   - System status and Uniform connector health
 */
const express = require('express');
const router = express.Router();

const database = require('../services/database');
const scheduler = require('../services/inspection-scheduler');
const visitSheet = require('../services/visit-sheet');
const reportGenerator = require('../services/report-generator');
const uniformSync = require('../services/uniform-sync');

// ─── System Status ──────────────────────────────────────────────────────────

/**
 * GET /api/status
 * System health check and Uniform connector status.
 */
router.get('/status', async (req, res) => {
  const connStatus = await uniformSync.getConnectionStatus();
  res.json({
    status: 'operational',
    timestamp: new Date().toISOString(),
    uniformConnector: connStatus,
    database: { connected: true },
  });
});

/**
 * POST /api/sync
 * Trigger a sync of premises data from the Uniform connector.
 */
router.post('/sync', async (req, res) => {
  try {
    const result = await uniformSync.syncPremises();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Premises ───────────────────────────────────────────────────────────────

/**
 * GET /api/premises
 * List all registered food premises.
 */
router.get('/premises', (req, res) => {
  const premises = database.getAllPremises();
  res.json({ count: premises.length, data: premises });
});

/**
 * GET /api/premises/:ref
 * Get detailed information for a single premises.
 */
router.get('/premises/:ref', (req, res) => {
  const premises = database.getPremises(req.params.ref);
  if (!premises) {
    return res.status(404).json({ error: 'Premises not found' });
  }
  const actions = database.getPreviousActions(req.params.ref);
  const inspections = database.getInspectionsForPremises(req.params.ref);
  res.json({ ...premises, previousActions: actions, inspections });
});

// ─── Inspection Scheduling ──────────────────────────────────────────────────

/**
 * GET /api/inspections/due
 * Get all premises due for inspection within the next N months.
 * Query: ?months=6 (default 6)
 */
router.get('/inspections/due', (req, res) => {
  const months = parseInt(req.query.months, 10) || 6;
  const scheduled = scheduler.getScheduledInspections(months);
  const summary = scheduler.getWorkloadSummary(months);
  res.json({ summary, inspections: scheduled });
});

/**
 * GET /api/inspections/workload
 * Get workload summary statistics.
 */
router.get('/inspections/workload', (req, res) => {
  const months = parseInt(req.query.months, 10) || 6;
  const summary = scheduler.getWorkloadSummary(months);
  res.json(summary);
});

/**
 * POST /api/inspections
 * Create a new scheduled inspection for a premises.
 */
router.post('/inspections', (req, res) => {
  try {
    const result = database.createInspection(req.body);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/inspections/:id
 * Get an inspection by ID.
 */
router.get('/inspections/:id', (req, res) => {
  const inspection = database.getInspection(parseInt(req.params.id, 10));
  if (!inspection) {
    return res.status(404).json({ error: 'Inspection not found' });
  }
  res.json(inspection);
});

/**
 * PUT /api/inspections/:id/complete
 * Complete an inspection with results.
 */
router.put('/inspections/:id/complete', (req, res) => {
  try {
    database.completeInspection(parseInt(req.params.id, 10), req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─── Visit Sheets ───────────────────────────────────────────────────────────

/**
 * GET /api/visit-sheets/:premisesRef
 * Generate a pre-populated visit sheet for a premises.
 */
router.get('/visit-sheets/:premisesRef', (req, res) => {
  try {
    const sheet = visitSheet.generateVisitSheet(
      req.params.premisesRef,
      req.query
    );
    res.json(sheet);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * GET /api/visit-sheets
 * Generate visit sheets for all premises due inspection.
 * Query: ?months=6
 */
router.get('/visit-sheets', (req, res) => {
  const months = parseInt(req.query.months, 10) || 6;
  const sheets = visitSheet.generateBatchVisitSheets(months, req.query);
  res.json({ count: sheets.length, sheets });
});

// ─── Owner Reports ──────────────────────────────────────────────────────────

/**
 * POST /api/reports/:inspectionId
 * Generate an owner report for a completed inspection.
 */
router.post('/reports/:inspectionId', (req, res) => {
  try {
    const html = reportGenerator.createAndSaveReport(
      parseInt(req.params.inspectionId, 10)
    );
    res.json({ success: true, html });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/reports/:inspectionId
 * Get a previously generated owner report.
 */
router.get('/reports/:inspectionId', (req, res) => {
  const report = database.getOwnerReport(parseInt(req.params.inspectionId, 10));
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  res.json(report);
});

/**
 * GET /api/reports/:inspectionId/html
 * Render the owner report as HTML (for printing/preview).
 */
router.get('/reports/:inspectionId/html', (req, res) => {
  try {
    const html = reportGenerator.generateOwnerReport(
      parseInt(req.params.inspectionId, 10)
    );
    res.type('html').send(html);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
