/**
 * Premises Owner Report Generator
 *
 * Generates formal inspection outcome reports suitable for sending
 * to food business operators following a food hygiene inspection.
 *
 * Report format follows FSA guidance and best practice from
 * UK local authorities including:
 *   - Formal header with council branding
 *   - Premises and operator identification
 *   - Inspection outcome with FHRS rating
 *   - Detailed findings by assessment category
 *   - Required actions with timescales
 *   - Right of appeal information
 *   - Useful contacts and next steps
 *
 * In the next phase, these reports will be auto-populated from
 * completed inspection data and sent directly to the FBO.
 */
const config = require('../config/default');
const database = require('./database');

/**
 * Generate the HTML report for a completed inspection.
 */
function generateOwnerReport(inspectionId) {
  const inspection = database.getInspection(inspectionId);
  if (!inspection) {
    throw new Error(`Inspection not found: ${inspectionId}`);
  }

  const premises = database.getPremises(inspection.premises_ref);
  if (!premises) {
    throw new Error(`Premises not found: ${inspection.premises_ref}`);
  }

  const council = config.reports.council;
  const total = (inspection.hygienic_score || 0) +
                (inspection.structure_score || 0) +
                (inspection.management_score || 0);

  const ratingLabel = getRatingLabel(inspection.fhrs_rating);
  const ratingColor = getRatingColor(inspection.fhrs_rating);

  const enforcementList = inspection.enforcement_actions
    ? inspection.enforcement_actions.split(',').map((e) => e.trim()).filter(Boolean)
    : [];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Food Hygiene Inspection Report - ${premises.business_name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #212529; line-height: 1.6; background: #f5f5f5; }
    .report { max-width: 800px; margin: 20px auto; background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .report-header { background: linear-gradient(135deg, #1a5f7a, #2c8fb0); color: white; padding: 30px; }
    .report-header h1 { font-size: 22px; margin-bottom: 5px; }
    .report-header h2 { font-size: 16px; font-weight: 400; opacity: 0.9; }
    .report-header p { font-size: 13px; opacity: 0.8; margin-top: 4px; }
    .report-body { padding: 30px; }
    .section { margin-bottom: 25px; }
    .section-title { font-size: 16px; font-weight: 700; color: #1a5f7a; border-bottom: 2px solid #2c8fb0; padding-bottom: 6px; margin-bottom: 12px; }
    .detail-grid { display: grid; grid-template-columns: 180px 1fr; gap: 6px 15px; font-size: 14px; }
    .detail-label { font-weight: 600; color: #555; }
    .detail-value { color: #212529; }
    .rating-box { text-align: center; padding: 25px; margin: 20px 0; border-radius: 8px; background: ${ratingColor}15; border: 2px solid ${ratingColor}; }
    .rating-number { font-size: 64px; font-weight: 800; color: ${ratingColor}; }
    .rating-label { font-size: 18px; font-weight: 600; color: ${ratingColor}; }
    .score-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 14px; }
    .score-table th, .score-table td { padding: 10px 12px; border: 1px solid #dee2e6; text-align: left; }
    .score-table th { background: #1a5f7a; color: white; font-weight: 600; }
    .score-table tr:nth-child(even) { background: #f8f9fa; }
    .score-table .score-cell { text-align: center; font-weight: 700; }
    .total-row { background: #e3f2fd !important; font-weight: 700; }
    .actions-box { background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 15px; margin: 10px 0; }
    .actions-box.serious { background: #f8d7da; border-color: #dc3545; }
    .enforcement-item { padding: 4px 0; font-size: 14px; }
    .appeal-box { background: #e8f4fd; border: 1px solid #2c8fb0; border-radius: 4px; padding: 15px; margin: 15px 0; font-size: 13px; }
    .contact-box { background: #f8f9fa; border-radius: 4px; padding: 15px; font-size: 13px; }
    .report-footer { padding: 20px 30px; background: #f8f9fa; border-top: 1px solid #dee2e6; font-size: 12px; color: #6c757d; text-align: center; }
    .important { color: #dc3545; font-weight: 600; }
    @media print {
      body { background: white; }
      .report { box-shadow: none; margin: 0; }
      .report-header { background: none; color: black; border-bottom: 3px solid black; }
    }
  </style>
</head>
<body>
  <div class="report">
    <div class="report-header">
      <h1>${council.name}</h1>
      <h2>${council.department}</h2>
      <p>Food Hygiene Inspection Report</p>
    </div>

    <div class="report-body">
      <!-- Date and Reference -->
      <div class="section">
        <div class="detail-grid">
          <span class="detail-label">Report Date:</span>
          <span class="detail-value">${formatDate(new Date().toISOString())}</span>
          <span class="detail-label">Inspection Date:</span>
          <span class="detail-value">${formatDate(inspection.inspection_date)}</span>
          <span class="detail-label">Reference Number:</span>
          <span class="detail-value">${inspection.reference_number}</span>
          <span class="detail-label">Inspection Type:</span>
          <span class="detail-value">${formatInspectionType(inspection.inspection_type)}</span>
        </div>
      </div>

      <!-- Business Details -->
      <div class="section">
        <div class="section-title">Business Details</div>
        <div class="detail-grid">
          <span class="detail-label">Business Name:</span>
          <span class="detail-value">${premises.trading_name || premises.business_name}</span>
          <span class="detail-label">Address:</span>
          <span class="detail-value">${[premises.address_line1, premises.address_line2, premises.town, premises.postcode].filter(Boolean).join(', ')}</span>
          <span class="detail-label">Food Business Operator:</span>
          <span class="detail-value">${premises.food_business_operator}</span>
          <span class="detail-label">Business Type:</span>
          <span class="detail-value">${premises.business_type_detail || premises.business_type}</span>
          <span class="detail-label">Premises Reference:</span>
          <span class="detail-value">${premises.premises_ref}</span>
        </div>
      </div>

      <!-- FHRS Rating -->
      <div class="section">
        <div class="section-title">Food Hygiene Rating</div>
        <div class="rating-box">
          <div class="rating-number">${inspection.fhrs_rating != null ? inspection.fhrs_rating : '-'}</div>
          <div class="rating-label">${ratingLabel}</div>
          <p style="margin-top:10px;font-size:13px;color:#555;">
            Food Hygiene Rating Scheme (FHRS) rating awarded under the Food Standards Agency Brand Standard
          </p>
        </div>
      </div>

      <!-- Score Breakdown -->
      <div class="section">
        <div class="section-title">Inspection Score Breakdown</div>
        <p style="font-size:13px;color:#555;margin-bottom:10px;">
          Scores are awarded based on the Food Law Code of Practice risk assessment scheme. Lower scores indicate better compliance.
        </p>
        <table class="score-table">
          <thead>
            <tr>
              <th>Assessment Area</th>
              <th style="text-align:center;">Score</th>
              <th style="text-align:center;">Maximum</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Hygienic Food Handling</td>
              <td class="score-cell">${inspection.hygienic_score != null ? inspection.hygienic_score : '-'}</td>
              <td class="score-cell">25</td>
            </tr>
            <tr>
              <td>Cleanliness and Condition of Facilities & Building</td>
              <td class="score-cell">${inspection.structure_score != null ? inspection.structure_score : '-'}</td>
              <td class="score-cell">25</td>
            </tr>
            <tr>
              <td>Management of Food Safety</td>
              <td class="score-cell">${inspection.management_score != null ? inspection.management_score : '-'}</td>
              <td class="score-cell">30</td>
            </tr>
            <tr class="total-row">
              <td>Total Score</td>
              <td class="score-cell">${total}</td>
              <td class="score-cell">80</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Enforcement Actions -->
      ${enforcementList.length > 0 ? `
      <div class="section">
        <div class="section-title">Enforcement Action</div>
        <div class="actions-box ${enforcementList.some((e) => e.includes('Prohibition') || e.includes('Closure')) ? 'serious' : ''}">
          ${enforcementList.map((e) => `<div class="enforcement-item">&bull; ${formatEnforcement(e)}</div>`).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Actions Required -->
      ${inspection.actions_required ? `
      <div class="section">
        <div class="section-title">Actions Required</div>
        <div class="actions-box">
          <p style="font-size:14px;">${inspection.actions_required.replace(/\n/g, '<br>')}</p>
        </div>
        ${inspection.revisit_required ? `
        <p style="margin-top:10px;font-size:14px;">
          <span class="important">A revisit inspection is required.</span>
          ${inspection.revisit_date ? ` Scheduled for: <strong>${formatDate(inspection.revisit_date)}</strong>` : ''}
        </p>
        ` : ''}
      </div>
      ` : ''}

      <!-- Additional Notes -->
      ${inspection.additional_notes ? `
      <div class="section">
        <div class="section-title">Additional Observations</div>
        <p style="font-size:14px;">${inspection.additional_notes.replace(/\n/g, '<br>')}</p>
      </div>
      ` : ''}

      <!-- Right of Appeal -->
      <div class="section">
        <div class="section-title">Your Rights</div>
        <div class="appeal-box">
          <p><strong>Right of Appeal</strong></p>
          <p>If you disagree with the food hygiene rating given, you have the right to:</p>
          <ul style="margin:8px 0 8px 20px;font-size:13px;">
            <li><strong>Appeal</strong> – You may appeal the rating within 21 days (including the day of notification) via the Food Standards Agency safeguards mechanism.</li>
            <li><strong>Request a Re-visit</strong> – If you have made improvements since the inspection, you can request a re-rating visit. There may be a charge for this service.</li>
            <li><strong>Right to Reply</strong> – You can submit a right to reply comment which will be published alongside your rating on the FSA website.</li>
          </ul>
          <p>For more information visit: <strong>food.gov.uk/hygiene-ratings</strong></p>
        </div>
      </div>

      <!-- Legal Framework -->
      <div class="section">
        <div class="section-title">Legal Framework</div>
        <p style="font-size:13px;color:#555;">
          This inspection was carried out under powers conferred by the Food Safety Act 1990,
          the Food Hygiene (England) Regulations 2013, and Regulation (EC) No 852/2004 on the
          hygiene of foodstuffs. The food hygiene rating was determined in accordance with the
          Food Hygiene Rating Scheme operated by the Food Standards Agency.
        </p>
      </div>

      <!-- Contact Information -->
      <div class="section">
        <div class="section-title">Contact Us</div>
        <div class="contact-box">
          <p><strong>${council.department}</strong></p>
          <p>${council.name}</p>
          <p>${council.address}</p>
          <p>Telephone: ${council.telephone}</p>
          <p>Email: ${council.email}</p>
          <p>Website: ${council.website}</p>
        </div>
      </div>

      <!-- Officer Details -->
      <div class="section">
        <div class="detail-grid">
          <span class="detail-label">Inspecting Officer:</span>
          <span class="detail-value">${inspection.inspector_name || 'Not recorded'}</span>
          <span class="detail-label">Officer ID:</span>
          <span class="detail-value">${inspection.inspector_id || 'Not recorded'}</span>
        </div>
      </div>
    </div>

    <div class="report-footer">
      <p>${council.name} - ${council.department}</p>
      <p>This report is issued in accordance with the Food Safety Act 1990.</p>
      <p>Reference: ${inspection.reference_number} | Generated: ${new Date().toISOString()}</p>
    </div>
  </div>
</body>
</html>`;

  return html;
}

/**
 * Generate and save a report for a completed inspection.
 */
function createAndSaveReport(inspectionId) {
  const html = generateOwnerReport(inspectionId);
  const inspection = database.getInspection(inspectionId);
  database.saveOwnerReport(inspectionId, inspection.premises_ref, html);
  return html;
}

// --- Helpers ---

function formatDate(dateStr) {
  if (!dateStr) return 'Not specified';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatInspectionType(type) {
  const labels = {
    routine: 'Routine Inspection',
    followup: 'Follow-up Inspection',
    complaint: 'Complaint Investigation',
    new_business: 'New Business Registration',
    revisit: 'Re-visit',
  };
  return labels[type] || type || 'Routine Inspection';
}

function getRatingLabel(rating) {
  const labels = {
    5: 'Very Good',
    4: 'Good',
    3: 'Generally Satisfactory',
    2: 'Improvement Necessary',
    1: 'Major Improvement Necessary',
    0: 'Urgent Improvement Required',
  };
  return labels[rating] != null ? labels[rating] : 'Not Yet Rated';
}

function getRatingColor(rating) {
  const colors = {
    5: '#1b5e20',
    4: '#33691e',
    3: '#f57f17',
    2: '#e65100',
    1: '#bf360c',
    0: '#b71c1c',
  };
  return colors[rating] || '#6c757d';
}

function formatEnforcement(action) {
  const labels = {
    written_warning: 'Written Warning Issued',
    improvement_notice: 'Hygiene Improvement Notice Served',
    emergency_prohibition: 'Emergency Prohibition Notice Served',
    voluntary_closure: 'Voluntary Closure Agreed',
    none: 'No Enforcement Action Required',
  };
  return labels[action] || action;
}

module.exports = {
  generateOwnerReport,
  createAndSaveReport,
};
