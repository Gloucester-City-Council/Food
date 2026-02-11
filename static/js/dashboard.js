/**
 * Food Inspection Dashboard - Client-side JavaScript
 *
 * Handles all frontend interaction for the inspection management dashboard
 * including fetching data from the API, rendering tables and statistics,
 * and generating pre-populated visit sheets.
 */

// ─── State ──────────────────────────────────────────────────────────────────
let allPremises = [];
let dueInspections = [];
let workloadSummary = {};

// ─── Initialisation ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  checkStatus();
  loadOverview();
  loadDueInspections();
  loadAllPremises();

  // Set default date to today
  const dateInput = document.getElementById('vsDate');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  const timeInput = document.getElementById('vsTime');
  if (timeInput) {
    const now = new Date();
    timeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
});

// ─── Tab Navigation ─────────────────────────────────────────────────────────

function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelector(`.nav-btn[data-tab="${tab}"]`).classList.add('active');
}

// ─── System Status ──────────────────────────────────────────────────────────

async function checkStatus() {
  try {
    const resp = await fetch('/api/status');
    const data = await resp.json();
    const badge = document.getElementById('connectorStatus');
    if (data.uniformConnector && data.uniformConnector.connected) {
      badge.textContent = 'Uniform: Connected';
      badge.className = 'status-badge status-online';
    } else {
      badge.textContent = 'Uniform: Offline (Using Cache)';
      badge.className = 'status-badge status-offline';
    }
  } catch {
    const badge = document.getElementById('connectorStatus');
    badge.textContent = 'Uniform: Offline';
    badge.className = 'status-badge status-offline';
  }
}

async function syncPremises() {
  const btn = document.getElementById('syncBtn');
  btn.textContent = 'Syncing...';
  btn.disabled = true;
  try {
    const resp = await fetch('/api/sync', { method: 'POST' });
    const data = await resp.json();
    alert(`Sync complete: ${data.count} premises from ${data.source}`);
    loadOverview();
    loadDueInspections();
    loadAllPremises();
  } catch (err) {
    alert('Sync failed: ' + err.message);
  } finally {
    btn.textContent = 'Sync Premises';
    btn.disabled = false;
  }
}

// ─── Overview ───────────────────────────────────────────────────────────────

async function loadOverview() {
  try {
    const resp = await fetch('/api/inspections/due?months=6');
    const data = await resp.json();
    dueInspections = data.inspections;
    workloadSummary = data.summary;

    // Stats
    document.getElementById('statTotal').textContent = workloadSummary.totalDue;
    document.getElementById('statOverdue').textContent = workloadSummary.overdue;
    document.getElementById('statNew').textContent = workloadSummary.newBusinesses;
    document.getElementById('statRevisit').textContent = workloadSummary.requiresRevisit;

    // Risk breakdown
    renderBreakdown('riskBreakdown', workloadSummary.byRiskCategory, {
      A: 'Cat A (6-monthly)',
      B: 'Cat B (12-monthly)',
      C: 'Cat C (18-monthly)',
      D: 'Cat D (24-monthly)',
      E: 'Cat E (36-monthly)',
    });

    // Business type breakdown
    const typeLabels = {
      restaurant: 'Restaurant/Cafe',
      takeaway: 'Takeaway',
      pub: 'Pub/Bar',
      hotel: 'Hotel/B&B',
      retail: 'Retail',
      supermarket: 'Supermarket',
      manufacturer: 'Manufacturer',
      caterer: 'Caterer',
      school: 'School/Hospital',
      mobile: 'Mobile Unit',
    };
    renderBreakdown('typeBreakdown', workloadSummary.byBusinessType, typeLabels);

    // Month breakdown
    const monthLabels = {};
    Object.keys(workloadSummary.byMonth).sort().forEach(m => {
      const [y, mo] = m.split('-');
      const monthName = new Date(parseInt(y), parseInt(mo) - 1).toLocaleString('en-GB', { month: 'short', year: 'numeric' });
      monthLabels[m] = monthName;
    });
    renderBreakdown('monthBreakdown', workloadSummary.byMonth, monthLabels);

    // High priority list
    renderHighPriority(dueInspections.slice(0, 5));

  } catch (err) {
    console.error('Failed to load overview:', err);
  }
}

function renderBreakdown(containerId, data, labels) {
  const container = document.getElementById(containerId);
  if (!data || Object.keys(data).length === 0) {
    container.innerHTML = '<p style="color:#999;font-size:13px;">No data available</p>';
    return;
  }
  container.innerHTML = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `
      <div class="breakdown-item">
        <span class="label">${labels[key] || key}</span>
        <span class="count">${count}</span>
      </div>
    `).join('');
}

function renderHighPriority(items) {
  const container = document.getElementById('highPriorityList');
  if (!items || items.length === 0) {
    container.innerHTML = '<p style="color:#999;font-size:13px;">No inspections due</p>';
    return;
  }
  container.innerHTML = items.map((p, i) => {
    const urgency = p.isOverdue ? '' : (p.daysUntilDue <= 30 ? 'medium' : 'low');
    const statusText = p.isOverdue
      ? `Overdue by ${Math.abs(p.daysUntilDue)} days`
      : (p.isNewBusiness ? 'New business – first inspection' : `Due in ${p.daysUntilDue} days`);

    return `
      <div class="priority-card ${urgency}">
        <div class="priority-rank">${i + 1}</div>
        <div class="priority-info">
          <div class="name">${p.business_name}</div>
          <div class="details">${p.address_line1}, ${p.postcode} | ${p.business_type_detail || p.business_type} | ${p.food_business_operator}</div>
        </div>
        <div class="priority-meta">
          <span class="risk-badge risk-${p.risk_category}">Risk ${p.risk_category}</span>
          <div style="font-size:11px;color:${p.isOverdue ? '#dc3545' : '#6c757d'};margin-top:4px;">${statusText}</div>
        </div>
        <button class="btn btn-action btn-primary" onclick="quickVisitSheet('${p.premises_ref}')">Visit Sheet</button>
      </div>
    `;
  }).join('');
}

// ─── Due Inspections ────────────────────────────────────────────────────────

async function loadDueInspections() {
  const months = document.getElementById('monthsFilter')?.value || 6;
  try {
    const resp = await fetch(`/api/inspections/due?months=${months}`);
    const data = await resp.json();
    dueInspections = data.inspections;
    renderDueTable(dueInspections);
  } catch (err) {
    console.error('Failed to load due inspections:', err);
  }
}

function renderDueTable(items) {
  const container = document.getElementById('dueInspectionsTable');
  if (!items || items.length === 0) {
    container.innerHTML = '<p style="color:#999;font-size:13px;">No inspections due in this period</p>';
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Business Name</th>
          <th>Address</th>
          <th>Type</th>
          <th>Risk</th>
          <th>FHRS</th>
          <th>Last Inspection</th>
          <th>Next Due</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(p => {
          let statusClass, statusLabel;
          if (p.isNewBusiness) { statusClass = 'status-new'; statusLabel = 'New'; }
          else if (p.isOverdue) { statusClass = 'status-overdue'; statusLabel = 'Overdue'; }
          else if (p.daysUntilDue <= 30) { statusClass = 'status-due-soon'; statusLabel = 'Due Soon'; }
          else { statusClass = 'status-upcoming'; statusLabel = 'Upcoming'; }

          return `<tr>
            <td><strong style="cursor:pointer;color:var(--primary);" onclick="viewPremises('${p.premises_ref}')">${p.business_name}</strong></td>
            <td>${p.address_line1}, ${p.postcode}</td>
            <td>${p.business_type_detail || p.business_type}</td>
            <td><span class="risk-badge risk-${p.risk_category}">Cat ${p.risk_category}</span></td>
            <td><span class="fhrs-badge fhrs-${p.current_fhrs_rating != null ? p.current_fhrs_rating : 'null'}">${p.current_fhrs_rating != null ? p.current_fhrs_rating : '?'}</span></td>
            <td>${p.last_inspection_date || 'Never'}</td>
            <td>${p.next_inspection_due || 'TBD'}</td>
            <td><span class="status-tag ${statusClass}">${statusLabel}</span></td>
            <td>
              <button class="btn btn-action btn-primary" onclick="quickVisitSheet('${p.premises_ref}')">Visit Sheet</button>
              <button class="btn btn-action btn-secondary" onclick="viewPremises('${p.premises_ref}')">Details</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ─── All Premises ───────────────────────────────────────────────────────────

async function loadAllPremises() {
  try {
    const resp = await fetch('/api/premises');
    const data = await resp.json();
    allPremises = data.data;
    renderPremisesTable(allPremises);
    populatePremisesSelect(allPremises);
  } catch (err) {
    console.error('Failed to load premises:', err);
  }
}

function renderPremisesTable(items) {
  const container = document.getElementById('premisesTable');
  if (!items || items.length === 0) {
    container.innerHTML = '<p style="color:#999;font-size:13px;">No premises found</p>';
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Ref</th>
          <th>Business Name</th>
          <th>Operator</th>
          <th>Address</th>
          <th>Type</th>
          <th>Risk</th>
          <th>FHRS</th>
          <th>Next Due</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(p => `<tr>
          <td style="font-size:11px;">${p.premises_ref}</td>
          <td><strong style="cursor:pointer;color:var(--primary);" onclick="viewPremises('${p.premises_ref}')">${p.business_name}</strong></td>
          <td>${p.food_business_operator}</td>
          <td>${p.address_line1}, ${p.postcode}</td>
          <td>${p.business_type_detail || p.business_type}</td>
          <td><span class="risk-badge risk-${p.risk_category}">Cat ${p.risk_category}</span></td>
          <td><span class="fhrs-badge fhrs-${p.current_fhrs_rating != null ? p.current_fhrs_rating : 'null'}">${p.current_fhrs_rating != null ? p.current_fhrs_rating : '?'}</span></td>
          <td>${p.next_inspection_due || 'TBD'}</td>
          <td>
            <button class="btn btn-action btn-primary" onclick="quickVisitSheet('${p.premises_ref}')">Visit Sheet</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
}

function filterPremises() {
  const query = document.getElementById('premisesSearch').value.toLowerCase();
  const filtered = allPremises.filter(p =>
    p.business_name.toLowerCase().includes(query) ||
    p.food_business_operator.toLowerCase().includes(query) ||
    p.postcode.toLowerCase().includes(query) ||
    p.premises_ref.toLowerCase().includes(query) ||
    (p.business_type_detail || '').toLowerCase().includes(query)
  );
  renderPremisesTable(filtered);
}

function populatePremisesSelect(items) {
  const select = document.getElementById('vsSelectPremises');
  select.innerHTML = '<option value="">Choose a premises...</option>' +
    items.map(p => `<option value="${p.premises_ref}">${p.business_name} (${p.postcode}) - Risk ${p.risk_category}</option>`).join('');
}

// ─── Premises Detail Modal ──────────────────────────────────────────────────

async function viewPremises(ref) {
  try {
    const resp = await fetch(`/api/premises/${encodeURIComponent(ref)}`);
    const p = await resp.json();

    const modal = document.getElementById('premisesModal');
    const body = document.getElementById('premisesModalBody');

    const lastTotal = (p.last_hygienic_score || 0) + (p.last_structure_score || 0) + (p.last_management_score || 0);

    body.innerHTML = `
      <h2 style="color:var(--primary);margin-bottom:15px;">${p.trading_name || p.business_name}</h2>

      <div class="vs-section">
        <div class="vs-section-title">Business Details</div>
        <div class="vs-detail-grid">
          <span class="vs-detail-label">Premises Ref:</span><span class="vs-detail-value">${p.premises_ref}</span>
          <span class="vs-detail-label">UPRN:</span><span class="vs-detail-value">${p.uprn || 'N/A'}</span>
          <span class="vs-detail-label">Operator:</span><span class="vs-detail-value">${p.food_business_operator}</span>
          <span class="vs-detail-label">Business Type:</span><span class="vs-detail-value">${p.business_type_detail || p.business_type}</span>
          <span class="vs-detail-label">Address:</span><span class="vs-detail-value">${[p.address_line1, p.address_line2, p.town, p.postcode].filter(Boolean).join(', ')}</span>
          <span class="vs-detail-label">Telephone:</span><span class="vs-detail-value">${p.telephone || 'N/A'}</span>
          <span class="vs-detail-label">Email:</span><span class="vs-detail-value">${p.email || 'N/A'}</span>
          <span class="vs-detail-label">Food Handlers:</span><span class="vs-detail-value">${p.number_of_food_handlers}</span>
          <span class="vs-detail-label">Trading Hours:</span><span class="vs-detail-value">${p.trading_hours || 'N/A'}</span>
          <span class="vs-detail-label">Registered:</span><span class="vs-detail-value">${p.registration_date || 'N/A'}</span>
          <span class="vs-detail-label">Primary Authority:</span><span class="vs-detail-value">${p.primary_authority || 'None'}</span>
        </div>
      </div>

      <div class="vs-section">
        <div class="vs-section-title">Inspection History</div>
        <div class="vs-detail-grid">
          <span class="vs-detail-label">Risk Category:</span><span class="vs-detail-value"><span class="risk-badge risk-${p.risk_category}">Category ${p.risk_category}</span></span>
          <span class="vs-detail-label">Current FHRS:</span><span class="vs-detail-value"><span class="fhrs-badge fhrs-${p.current_fhrs_rating != null ? p.current_fhrs_rating : 'null'}">${p.current_fhrs_rating != null ? p.current_fhrs_rating : '?'}</span></span>
          <span class="vs-detail-label">Last Inspection:</span><span class="vs-detail-value">${p.last_inspection_date || 'Never inspected'}</span>
          <span class="vs-detail-label">Next Due:</span><span class="vs-detail-value">${p.next_inspection_due || 'TBD'}</span>
          ${p.last_inspection_date ? `
          <span class="vs-detail-label">Last Scores:</span>
          <span class="vs-detail-value">
            Hygiene: ${p.last_hygienic_score}/25 |
            Structure: ${p.last_structure_score}/25 |
            Management: ${p.last_management_score}/30 |
            <strong>Total: ${lastTotal}/80</strong>
          </span>
          ` : ''}
          <span class="vs-detail-label">HACCP:</span><span class="vs-detail-value">${p.haccp_in_place ? 'Yes' : 'No'}</span>
          <span class="vs-detail-label">Allergen Docs:</span><span class="vs-detail-value">${p.allergen_documentation ? 'Yes' : 'No'}</span>
        </div>
      </div>

      ${p.previousActions && p.previousActions.length > 0 ? `
      <div class="vs-section">
        <div class="vs-section-title">Previous Enforcement Actions</div>
        ${p.previousActions.map(a => `
          <div style="padding:8px 12px;margin-bottom:6px;background:#f8d7da;border-left:3px solid #dc3545;border-radius:0 4px 4px 0;font-size:13px;">
            <strong>${a.action_type}</strong> (${a.action_date})<br>
            ${a.detail}
          </div>
        `).join('')}
      </div>
      ` : ''}

      ${p.notes ? `
      <div class="vs-section">
        <div class="vs-section-title">Officer Notes</div>
        <p style="font-size:13px;color:var(--muted);">${p.notes}</p>
      </div>
      ` : ''}

      <div style="display:flex;gap:10px;margin-top:20px;">
        <button class="btn btn-primary" onclick="closePremisesModal();quickVisitSheet('${p.premises_ref}');">Generate Visit Sheet</button>
        <button class="btn btn-secondary" onclick="closePremisesModal();">Close</button>
      </div>
    `;

    modal.style.display = 'block';
  } catch (err) {
    alert('Failed to load premises details: ' + err.message);
  }
}

function closePremisesModal() {
  document.getElementById('premisesModal').style.display = 'none';
}

// Close modal on background click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('premisesModal');
  if (e.target === modal) {
    closePremisesModal();
  }
});

// ─── Visit Sheet Generation ─────────────────────────────────────────────────

function quickVisitSheet(premisesRef) {
  showTab('visit-sheet');
  const select = document.getElementById('vsSelectPremises');
  select.value = premisesRef;
  generateVisitSheet();
}

async function generateVisitSheet() {
  const premisesRef = document.getElementById('vsSelectPremises').value;
  if (!premisesRef) {
    alert('Please select a premises');
    return;
  }

  const params = new URLSearchParams();
  const inspectorName = document.getElementById('vsInspectorName').value;
  const inspectorId = document.getElementById('vsInspectorId').value;
  const date = document.getElementById('vsDate').value;
  const time = document.getElementById('vsTime').value;

  if (inspectorName) params.set('inspectorName', inspectorName);
  if (inspectorId) params.set('inspectorId', inspectorId);
  if (date) params.set('inspectionDate', date);
  if (time) params.set('inspectionTime', time);

  try {
    const resp = await fetch(`/api/visit-sheets/${encodeURIComponent(premisesRef)}?${params}`);
    const sheet = await resp.json();
    renderVisitSheet(sheet);
  } catch (err) {
    alert('Failed to generate visit sheet: ' + err.message);
  }
}

function renderVisitSheet(sheet) {
  const container = document.getElementById('visitSheetOutput');
  container.style.display = 'block';

  const prev = sheet.previousInspectionSummary;
  const biz = sheet.businessDetails;
  const lastTotal = prev.lastScores
    ? prev.lastScores.total
    : 'N/A';

  container.innerHTML = `
    <div class="vs-header">
      <h2>${sheet.header.council.name}</h2>
      <p>${sheet.header.council.department} - ${sheet.header.formTitle}</p>
      <p><strong>${sheet.header.inspectionTypeLabel}</strong> | Generated: ${new Date(sheet.header.generatedAt).toLocaleString('en-GB')}</p>
    </div>

    <!-- Section 1: Inspection Details -->
    <div class="vs-section">
      <div class="vs-section-title">1. Inspection Details</div>
      <div class="vs-detail-grid">
        <span class="vs-detail-label">Reference:</span><span class="vs-detail-value">${sheet.inspectionDetails.referenceNumber || 'To be assigned'}</span>
        <span class="vs-detail-label">Date:</span><span class="vs-detail-value">${sheet.inspectionDetails.inspectionDate || 'Not set'}</span>
        <span class="vs-detail-label">Time:</span><span class="vs-detail-value">${sheet.inspectionDetails.inspectionTime || 'Not set'}</span>
        <span class="vs-detail-label">Type:</span><span class="vs-detail-value">${sheet.header.inspectionTypeLabel}</span>
        <span class="vs-detail-label">Inspector:</span><span class="vs-detail-value">${sheet.inspectionDetails.inspectorName || 'Not assigned'}</span>
        <span class="vs-detail-label">Inspector ID:</span><span class="vs-detail-value">${sheet.inspectionDetails.inspectorId || 'Not assigned'}</span>
      </div>
    </div>

    <!-- Section 2: Business Details (Pre-populated from Uniform) -->
    <div class="vs-section">
      <div class="vs-section-title">2. Business Details <span style="font-size:11px;color:#2c8fb0;font-weight:400;">(Pre-populated from Idox Uniform)</span></div>
      <div class="vs-detail-grid">
        <span class="vs-detail-label">Premises Ref:</span><span class="vs-detail-value">${biz.premisesRef}</span>
        <span class="vs-detail-label">UPRN:</span><span class="vs-detail-value">${biz.uprn || 'N/A'}</span>
        <span class="vs-detail-label">Business Name:</span><span class="vs-detail-value"><strong>${biz.tradingName || biz.businessName}</strong></span>
        <span class="vs-detail-label">Address:</span><span class="vs-detail-value">${biz.businessAddress.replace(/\n/g, ', ')}</span>
        <span class="vs-detail-label">Postcode:</span><span class="vs-detail-value">${biz.postcode}</span>
        <span class="vs-detail-label">Telephone:</span><span class="vs-detail-value">${biz.telephone || 'N/A'}</span>
        <span class="vs-detail-label">Email:</span><span class="vs-detail-value">${biz.email || 'N/A'}</span>
        <span class="vs-detail-label">FBO:</span><span class="vs-detail-value">${biz.foodBusinessOperator}</span>
        <span class="vs-detail-label">Business Type:</span><span class="vs-detail-value">${biz.businessTypeDetail || biz.businessType}</span>
        <span class="vs-detail-label">Food Handlers:</span><span class="vs-detail-value">${biz.numberOfFoodHandlers}</span>
        <span class="vs-detail-label">Trading Hours:</span><span class="vs-detail-value">${biz.tradingHours || 'N/A'}</span>
        <span class="vs-detail-label">Water Supply:</span><span class="vs-detail-value">${biz.waterSupply}</span>
        <span class="vs-detail-label">Registration:</span><span class="vs-detail-value">${biz.registrationDate || 'N/A'}</span>
        <span class="vs-detail-label">Primary Authority:</span><span class="vs-detail-value">${biz.primaryAuthority || 'None'}</span>
      </div>
    </div>

    <!-- Section 3: Previous Inspection Summary -->
    <div class="vs-section">
      <div class="vs-section-title">3. Previous Inspection Summary</div>
      <div class="vs-detail-grid">
        <span class="vs-detail-label">Risk Category:</span><span class="vs-detail-value"><span class="risk-badge risk-${prev.riskCategory}">Category ${prev.riskCategory}</span> - ${prev.intervalDescription}</span>
        <span class="vs-detail-label">Current FHRS:</span><span class="vs-detail-value"><span class="fhrs-badge fhrs-${prev.currentFhrsRating != null ? prev.currentFhrsRating : 'null'}">${prev.currentFhrsRating != null ? prev.currentFhrsRating : '?'}</span></span>
        <span class="vs-detail-label">Last Inspection:</span><span class="vs-detail-value">${prev.lastInspectionDate || 'Never inspected'}</span>
        ${prev.lastScores ? `
        <span class="vs-detail-label">Last Scores:</span>
        <span class="vs-detail-value">
          Hygiene: ${prev.lastScores.hygienicFoodHandling}/25 |
          Structure: ${prev.lastScores.structureAndCleaning}/25 |
          Management: ${prev.lastScores.managementOfFoodSafety}/30 |
          <strong>Total: ${lastTotal}/80</strong>
        </span>
        ` : ''}
        <span class="vs-detail-label">HACCP:</span><span class="vs-detail-value">${prev.haccpInPlace ? 'Yes - in place' : '<span style="color:#dc3545;font-weight:600;">No - not in place</span>'}</span>
        <span class="vs-detail-label">Allergen Docs:</span><span class="vs-detail-value">${prev.allergenDocumentation ? 'Yes - documented' : '<span style="color:#dc3545;font-weight:600;">No - not documented</span>'}</span>
      </div>

      ${prev.previousActions && prev.previousActions.length > 0 ? `
      <div style="margin-top:12px;">
        <strong style="font-size:13px;color:#dc3545;">Previous Enforcement Actions:</strong>
        ${prev.previousActions.map(a => `
          <div style="padding:8px 12px;margin-top:6px;background:#f8d7da;border-left:3px solid #dc3545;border-radius:0 4px 4px 0;font-size:13px;">
            <strong>${a.type}</strong> (${a.date})<br>${a.detail}
          </div>
        `).join('')}
      </div>
      ` : '<p style="font-size:13px;color:#28a745;margin-top:8px;">No previous enforcement actions.</p>'}

      ${prev.officerNotes ? `
      <div style="margin-top:12px;padding:10px;background:#e8f4fd;border-radius:4px;font-size:13px;">
        <strong>Officer Notes:</strong> ${prev.officerNotes}
      </div>
      ` : ''}
    </div>

    <!-- Section 4: Inspection Focus Areas -->
    <div class="vs-section">
      <div class="vs-section-title">4. Inspection Focus Areas</div>
      <p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Areas requiring particular attention based on previous findings and business type risk profile.</p>
      <ul class="vs-focus-list">
        ${sheet.inspectionFocusAreas.map(f => {
          const isEnforcement = f.includes('enforcement') || f.includes('Improvement Notice') || f.includes('Prohibition');
          return `<li class="${isEnforcement ? 'enforcement' : ''}">${f}</li>`;
        }).join('')}
      </ul>
    </div>

    <!-- Section 5: Hygienic Food Handling Assessment -->
    <div class="vs-section">
      <div class="vs-section-title">5. Hygienic Food Handling Assessment</div>
      <table class="vs-checklist">
        <tr style="background:var(--primary);color:white;font-weight:600;">
          <td>Criteria</td><td>Compliant</td><td>Minor</td><td>Major</td><td>Critical</td><td>N/A</td>
        </tr>
        <tr><td>Temperature control (cooking)</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Temperature control (chilled storage)</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Temperature control (hot holding)</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Cross-contamination prevention</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Personal hygiene practices</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Food storage and labelling</td><td></td><td></td><td></td><td></td><td></td></tr>
      </table>
      <p style="margin-top:8px;font-size:13px;">Score (0-25): ______ &nbsp; Comments: _______________________________________________</p>
    </div>

    <!-- Section 6: Structure & Cleaning Assessment -->
    <div class="vs-section">
      <div class="vs-section-title">6. Cleanliness and Condition of Facilities & Building</div>
      <table class="vs-checklist">
        <tr style="background:var(--primary);color:white;font-weight:600;">
          <td>Criteria</td><td>Compliant</td><td>Minor</td><td>Major</td><td>Critical</td><td>N/A</td>
        </tr>
        <tr><td>Cleanliness of structure</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Cleanliness of equipment</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Condition of structure</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Condition of equipment</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Pest control measures</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Hand washing facilities</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Ventilation and lighting</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Waste disposal facilities</td><td></td><td></td><td></td><td></td><td></td></tr>
      </table>
      <p style="margin-top:8px;font-size:13px;">Score (0-25): ______ &nbsp; Comments: _______________________________________________</p>
    </div>

    <!-- Section 7: Food Safety Management -->
    <div class="vs-section">
      <div class="vs-section-title">7. Management of Food Safety</div>
      <table class="vs-checklist">
        <tr style="background:var(--primary);color:white;font-weight:600;">
          <td>Criteria</td><td>Compliant</td><td>Minor</td><td>Major</td><td>Critical</td><td>N/A</td>
        </tr>
        <tr><td>Food safety management system/HACCP</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Temperature monitoring records</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Staff training records</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Supplier traceability</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Allergen management</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>Cleaning schedules</td><td></td><td></td><td></td><td></td><td></td></tr>
      </table>
      <p style="margin-top:8px;font-size:13px;">Score (0-30): ______ &nbsp; Comments: _______________________________________________</p>
    </div>

    <!-- Section 8: Temperature Readings (Pre-populated for business type) -->
    <div class="vs-section">
      <div class="vs-section-title">8. Temperature Readings <span style="font-size:11px;color:#2c8fb0;font-weight:400;">(Pre-populated for ${sheet.metadata.businessTypeFocus.label})</span></div>
      <table class="vs-temp-table">
        <thead>
          <tr><th>Item/Equipment</th><th>Temperature (°C)</th><th>Required Range</th><th>Compliant</th></tr>
        </thead>
        <tbody>
          ${sheet.temperatureReadings.map(t => `
            <tr>
              <td>${t.item}</td>
              <td></td>
              <td>${t.requiredRange}</td>
              <td></td>
            </tr>
          `).join('')}
          <tr><td></td><td></td><td></td><td></td></tr>
          <tr><td></td><td></td><td></td><td></td></tr>
        </tbody>
      </table>
    </div>

    <!-- Section 9: Rating & Actions -->
    <div class="vs-section">
      <div class="vs-section-title">9. Overall Rating & Actions</div>
      <p style="font-size:13px;">
        Total Score: ____/80 &nbsp;&nbsp; FHRS Rating (0-5): ____<br><br>
        Enforcement Action: ☐ Written Warning &nbsp; ☐ Improvement Notice &nbsp; ☐ Emergency Prohibition &nbsp; ☐ Voluntary Closure &nbsp; ☐ No Action<br><br>
        Actions Required: _________________________________________________________________________<br><br>
        Revisit Required: ☐ Yes ☐ No &nbsp;&nbsp; Revisit Date: ______________
      </p>
    </div>

    <!-- Section 10: Declaration -->
    <div class="vs-section">
      <div class="vs-section-title">10. Declaration & Signatures</div>
      <p style="font-size:13px;font-style:italic;padding:10px;background:#fff3cd;border-radius:4px;margin-bottom:10px;">
        I confirm that this inspection has been carried out in accordance with the Food Safety Act 1990 and associated regulations.
        The information recorded above is accurate and complete to the best of my knowledge.
      </p>
      <p style="font-size:13px;">
        Inspector Signature: _________________________ &nbsp; Date: _______________<br><br>
        Business Representative: _________________________ &nbsp; Name: _______________ &nbsp; Role: _______________
      </p>
    </div>

    <div class="vs-actions-row">
      <button class="btn btn-primary" onclick="window.print()">Print Visit Sheet</button>
      <button class="btn btn-secondary" onclick="openInForm('${sheet.businessDetails.premisesRef}')">Open in Digital Form</button>
    </div>
  `;

  // Scroll to output
  container.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Open the digital inspection form pre-populated with premises data.
 * This passes data via URL parameters to the existing form.
 */
function openInForm(premisesRef) {
  const params = new URLSearchParams({ premises: premisesRef });
  window.open(`/form/?${params}`, '_blank');
}
