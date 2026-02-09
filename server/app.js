/**
 * GCC Food Inspection Management System
 *
 * Main application entry point. Starts the Express server, initialises
 * the database, syncs premises data from the Idox Uniform connector
 * (or sample data), and serves the inspection management dashboard.
 *
 * Architecture:
 *   ┌──────────────────────────────────────────────────┐
 *   │              Express Web Server                   │
 *   │  ┌────────────┐  ┌──────────────────────────┐   │
 *   │  │  Dashboard  │  │      REST API             │   │
 *   │  │  (Frontend) │  │  /api/premises            │   │
 *   │  │             │  │  /api/inspections          │   │
 *   │  │             │  │  /api/visit-sheets         │   │
 *   │  │             │  │  /api/reports              │   │
 *   │  └────────────┘  └──────────────────────────┘   │
 *   │                          │                       │
 *   │  ┌───────────────────────┴───────────────────┐   │
 *   │  │            Service Layer                   │   │
 *   │  │  ┌─────────────┐  ┌────────────────────┐  │   │
 *   │  │  │  Scheduler   │  │  Visit Sheet Gen   │  │   │
 *   │  │  │  (Risk/FHRS) │  │  (Prepopulation)   │  │   │
 *   │  │  └─────────────┘  └────────────────────┘  │   │
 *   │  │  ┌─────────────┐  ┌────────────────────┐  │   │
 *   │  │  │  Report Gen  │  │  Uniform Sync      │  │   │
 *   │  │  │  (Owner PDF) │  │  (Connector)       │  │   │
 *   │  │  └─────────────┘  └────────────────────┘  │   │
 *   │  └───────────────────────────────────────────┘   │
 *   │                          │                       │
 *   │  ┌───────────────────────┴───────────────────┐   │
 *   │  │  ┌──────────┐  ┌───────────────────────┐  │   │
 *   │  │  │  SQLite   │  │  Idox Uniform         │  │   │
 *   │  │  │  (Cache)  │  │  Connector (Port 445) │  │   │
 *   │  │  └──────────┘  └───────────────────────┘  │   │
 *   │  └───────────────────────────────────────────┘   │
 *   └──────────────────────────────────────────────────┘
 */
const express = require('express');
const path = require('path');
const config = require('./config/default');
const database = require('./services/database');
const uniformSync = require('./services/uniform-sync');
const apiRoutes = require('./routes/api');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files – serve the existing inspection form and new dashboard
app.use('/form', express.static(path.join(__dirname, '..')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api', apiRoutes);

// Dashboard route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'views', 'dashboard.html'));
});

// Visit sheet viewer
app.get('/visit-sheet/:premisesRef', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'views', 'visit-sheet-viewer.html'));
});

// Start server
async function start() {
  // Initialise database
  database.initSchema();
  console.log('[DB] Database initialised');

  // Sync premises from Uniform (or sample data)
  console.log('[SYNC] Syncing premises from Idox Uniform connector...');
  const syncResult = await uniformSync.syncPremises();
  console.log(`[SYNC] Source: ${syncResult.source}`);
  console.log(`[SYNC] Premises synced: ${syncResult.count}`);
  if (syncResult.errors.length > 0) {
    for (const err of syncResult.errors) {
      console.log(`[SYNC] Note: ${err}`);
    }
  }

  const { port, host } = config.server;
  app.listen(port, host, () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Gloucester City Council');
    console.log('  Food Inspection Management System');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Dashboard:     http://localhost:${port}/`);
    console.log(`  Inspection Form: http://localhost:${port}/form/`);
    console.log(`  API:           http://localhost:${port}/api/`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Uniform Connector: ${config.uniform.host}:${config.uniform.port}`);
    console.log(`  Premises loaded:   ${syncResult.count}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
