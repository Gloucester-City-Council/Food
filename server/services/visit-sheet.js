/**
 * Visit Sheet Prepopulation Service
 *
 * Generates pre-populated food inspection visit sheets using data from
 * the Idox Uniform commercial properties connector and local cache.
 *
 * The visit sheet is the working document an Environmental Health Officer
 * takes on an inspection. It contains:
 *
 *   - Business identification and contact details (from Uniform)
 *   - Previous inspection history and scores
 *   - Previous enforcement actions and outstanding requirements
 *   - Risk category and current FHRS rating
 *   - Pre-filled checklist items based on business type
 *   - Specific focus areas derived from previous findings
 *   - Officer briefing notes
 *
 * This aligns with the Food Standards Agency FHRS Brand Standard and
 * the Food Law Code of Practice (England) inspection requirements.
 */
const config = require('../config/default');
const database = require('./database');

/**
 * Business-type-specific inspection focus areas based on FSA guidance
 * and common findings across UK local authorities.
 */
const BUSINESS_TYPE_FOCUS = {
  restaurant: {
    label: 'Restaurant/Cafe',
    keyRisks: [
      'Cross-contamination between raw and ready-to-eat foods',
      'Allergen management across complex menus',
      'Temperature control during multi-stage cooking',
      'Staff hand-washing compliance during service',
      'Cleaning of food contact surfaces between uses',
    ],
    typicalEquipment: [
      'Walk-in chiller/freezer',
      'Hot holding units (bain-marie)',
      'Commercial dishwasher',
      'Preparation surfaces',
      'Cooking range',
    ],
    temperatureChecks: [
      { item: 'Walk-in chiller', requiredRange: '0-5°C' },
      { item: 'Walk-in freezer', requiredRange: '-18°C or below' },
      { item: 'Hot holding display', requiredRange: '63°C or above' },
      { item: 'Cooked food (core temp)', requiredRange: '75°C or above' },
      { item: 'Dessert fridge', requiredRange: '0-5°C' },
    ],
  },
  takeaway: {
    label: 'Takeaway/Fast Food',
    keyRisks: [
      'Temperature abuse during holding and delivery',
      'Cross-contamination in limited preparation space',
      'Oil quality in deep fat fryers',
      'Personal hygiene with high staff turnover',
      'Allergen information at point of sale',
    ],
    typicalEquipment: [
      'Under-counter fridge/freezer',
      'Deep fat fryer',
      'Hot holding cabinet',
      'Microwave',
      'Preparation counter',
    ],
    temperatureChecks: [
      { item: 'Main fridge', requiredRange: '0-5°C' },
      { item: 'Freezer', requiredRange: '-18°C or below' },
      { item: 'Hot holding cabinet', requiredRange: '63°C or above' },
      { item: 'Cooked food (core temp)', requiredRange: '75°C or above' },
      { item: 'Frying oil temperature', requiredRange: '175-185°C' },
    ],
  },
  pub: {
    label: 'Pub/Bar',
    keyRisks: [
      'Food storage in cramped cellar/kitchen areas',
      'Temperature control of bar snacks and buffets',
      'Cleaning of draught beer lines and dispense equipment',
      'Separation of food and drink preparation',
      'Staff food hygiene training (mixed food/drink roles)',
    ],
    typicalEquipment: [
      'Kitchen chiller/freezer',
      'Cellar cooler',
      'Glass washer',
      'Hot holding (carvery/servery)',
      'Bar preparation area',
    ],
    temperatureChecks: [
      { item: 'Kitchen fridge', requiredRange: '0-5°C' },
      { item: 'Kitchen freezer', requiredRange: '-18°C or below' },
      { item: 'Cellar temperature', requiredRange: '10-13°C' },
      { item: 'Sunday roast core temp', requiredRange: '75°C or above' },
      { item: 'Hot holding (carvery)', requiredRange: '63°C or above' },
    ],
  },
  hotel: {
    label: 'Hotel/B&B',
    keyRisks: [
      'Multiple food service areas (restaurant, room service, bar, conference)',
      'Breakfast buffet temperature control',
      'Allergen management across diverse menus',
      'Extended food preparation hours',
      'Pest control in older building fabric',
    ],
    typicalEquipment: [
      'Main kitchen refrigeration',
      'Breakfast bar chiller',
      'Room service holding equipment',
      'Multiple preparation areas',
      'Conference catering facilities',
    ],
    temperatureChecks: [
      { item: 'Main kitchen chiller', requiredRange: '0-5°C' },
      { item: 'Main kitchen freezer', requiredRange: '-18°C or below' },
      { item: 'Breakfast buffet (hot)', requiredRange: '63°C or above' },
      { item: 'Breakfast buffet (cold)', requiredRange: '0-8°C' },
      { item: 'Room service holding', requiredRange: '63°C or above' },
    ],
  },
  retail: {
    label: 'Retail Shop',
    keyRisks: [
      'Chilled display cabinet temperatures',
      'Date coding and stock rotation',
      'Food returned to storage after display',
      'Pest control (particularly stored products)',
      'Allergen labelling on pre-packed foods',
    ],
    typicalEquipment: [
      'Display chillers',
      'Storage freezer',
      'Back-of-house chiller',
      'Self-service counter',
      'Storage racking',
    ],
    temperatureChecks: [
      { item: 'Display chiller (dairy)', requiredRange: '0-5°C' },
      { item: 'Display chiller (deli)', requiredRange: '0-5°C' },
      { item: 'Storage freezer', requiredRange: '-18°C or below' },
      { item: 'Back-of-house chiller', requiredRange: '0-5°C' },
      { item: 'Ambient store temperature', requiredRange: 'Below 25°C' },
    ],
  },
  supermarket: {
    label: 'Supermarket',
    keyRisks: [
      'Cold chain integrity across multiple display units',
      'In-store bakery and deli cross-contamination',
      'Date coding compliance at scale',
      'Pest control across large premises',
      'Staff training across multiple departments',
    ],
    typicalEquipment: [
      'Multiple display chillers/freezers',
      'In-store bakery oven',
      'Deli counter/slicer',
      'Loading bay',
      'Warehouse storage',
    ],
    temperatureChecks: [
      { item: 'Dairy display chiller', requiredRange: '0-5°C' },
      { item: 'Meat display chiller', requiredRange: '0-5°C' },
      { item: 'Frozen goods display', requiredRange: '-18°C or below' },
      { item: 'Deli counter', requiredRange: '0-5°C' },
      { item: 'In-store bakery ambient', requiredRange: 'Below 25°C' },
    ],
  },
  manufacturer: {
    label: 'Food Manufacturer/Packer',
    keyRisks: [
      'HACCP critical control points at each process step',
      'Allergen segregation and cleaning between product runs',
      'Traceability and recall procedures',
      'Water quality (where used in production)',
      'Packaging integrity and labelling accuracy',
    ],
    typicalEquipment: [
      'Production line equipment',
      'Blast chiller/freezer',
      'Ingredient storage chillers',
      'Packaging machinery',
      'Temperature probes and data loggers',
    ],
    temperatureChecks: [
      { item: 'Ingredient chiller', requiredRange: '0-5°C' },
      { item: 'Blast chiller', requiredRange: 'Below 5°C within 90 mins' },
      { item: 'Finished product storage', requiredRange: '0-5°C' },
      { item: 'Production area ambient', requiredRange: 'Below 25°C' },
      { item: 'Freezer storage', requiredRange: '-18°C or below' },
    ],
  },
  caterer: {
    label: 'Caterer',
    keyRisks: [
      'Temperature control during transport',
      'Cross-contamination at temporary event sites',
      'Allergen management for large-scale catering',
      'Hand washing facilities at events',
      'Traceability across multiple suppliers',
    ],
    typicalEquipment: [
      'Commercial kitchen refrigeration',
      'Hot boxes/insulated containers',
      'Transport vehicle',
      'Temporary service equipment',
      'Probe thermometers',
    ],
    temperatureChecks: [
      { item: 'Base kitchen chiller', requiredRange: '0-5°C' },
      { item: 'Transport container (hot)', requiredRange: '63°C or above' },
      { item: 'Transport container (cold)', requiredRange: '0-8°C' },
      { item: 'Reheated food core temp', requiredRange: '75°C or above' },
      { item: 'Base kitchen freezer', requiredRange: '-18°C or below' },
    ],
  },
  school: {
    label: 'School/Hospital/Care',
    keyRisks: [
      'Allergen management for vulnerable populations',
      'Special dietary requirements (medical/religious)',
      'Large-scale cooking and holding temperatures',
      'Cleaning during continuous service',
      'Staff training and supervision',
    ],
    typicalEquipment: [
      'Commercial kitchen refrigeration',
      'Combination oven',
      'Bain-marie/hot holding',
      'Dishwasher',
      'Trolley service equipment',
    ],
    temperatureChecks: [
      { item: 'Walk-in chiller', requiredRange: '0-5°C' },
      { item: 'Walk-in freezer', requiredRange: '-18°C or below' },
      { item: 'Hot holding trolley', requiredRange: '63°C or above' },
      { item: 'Core temp (main dish)', requiredRange: '75°C or above' },
      { item: 'Salad bar temperature', requiredRange: '0-8°C' },
    ],
  },
  mobile: {
    label: 'Mobile Food Unit',
    keyRisks: [
      'Limited hand washing facilities',
      'Water supply adequacy and quality',
      'Waste water disposal',
      'Temperature control with limited refrigeration',
      'Structural condition of vehicle/unit',
    ],
    typicalEquipment: [
      'Under-counter fridge',
      'Griddle/hotplate',
      'Deep fat fryer (if fitted)',
      'Hand wash basin',
      'Fresh water tank',
    ],
    temperatureChecks: [
      { item: 'On-board fridge', requiredRange: '0-5°C' },
      { item: 'Cooked food core temp', requiredRange: '75°C or above' },
      { item: 'Hot holding display', requiredRange: '63°C or above' },
      { item: 'On-board freezer', requiredRange: '-18°C or below' },
    ],
  },
};

/**
 * Generate a pre-populated visit sheet for a premises.
 */
function generateVisitSheet(premisesRef, options = {}) {
  const premises = database.getPremises(premisesRef);
  if (!premises) {
    throw new Error(`Premises not found: ${premisesRef}`);
  }

  const previousActions = database.getPreviousActions(premisesRef);
  const previousInspections = database.getInspectionsForPremises(premisesRef);
  const businessFocus = BUSINESS_TYPE_FOCUS[premises.business_type] || BUSINESS_TYPE_FOCUS.restaurant;
  const intervalInfo = config.inspectionIntervals[premises.risk_category];

  // Determine inspection type
  let inspectionType = 'routine';
  if (!premises.last_inspection_date) {
    inspectionType = 'new_business';
  } else if (previousActions.some((a) =>
    a.action_type === 'Hygiene Improvement Notice' || a.action_type === 'Emergency Prohibition Notice'
  )) {
    inspectionType = 'followup';
  }
  if (options.inspectionType) {
    inspectionType = options.inspectionType;
  }

  // Build focus areas from previous findings
  const focusAreas = [];
  if (!premises.haccp_in_place) {
    focusAreas.push('HACCP/Food Safety Management System – previously not in place, verify implementation');
  }
  if (!premises.allergen_documentation) {
    focusAreas.push('Allergen documentation – previously absent, check compliance with Regulation (EU) 1169/2011');
  }
  if (previousActions.length > 0) {
    focusAreas.push('Verify compliance with previous enforcement actions:');
    for (const action of previousActions) {
      focusAreas.push(`  - ${action.action_type} (${action.action_date}): ${action.detail}`);
    }
  }
  if (premises.last_hygienic_score != null && premises.last_hygienic_score >= 15) {
    focusAreas.push('Hygienic food handling – previously scored poorly, re-assess thoroughly');
  }
  if (premises.last_structure_score != null && premises.last_structure_score >= 15) {
    focusAreas.push('Structure and cleaning – previously scored poorly, check structural improvements');
  }
  if (premises.last_management_score != null && premises.last_management_score >= 20) {
    focusAreas.push('Food safety management – previously scored poorly, review documentation');
  }
  // Always add business-type key risks
  focusAreas.push(...businessFocus.keyRisks.map((r) => `[${businessFocus.label}] ${r}`));

  // Build the visit sheet data structure
  const visitSheet = {
    // Header information
    header: {
      council: config.reports.council,
      formTitle: 'Food Hygiene Inspection Visit Sheet',
      generatedAt: new Date().toISOString(),
      inspectionType: inspectionType,
      inspectionTypeLabel: {
        routine: 'Routine Inspection',
        followup: 'Follow-up Inspection',
        complaint: 'Complaint Investigation',
        new_business: 'New Business Registration Inspection',
        revisit: 'Re-visit',
      }[inspectionType] || 'Routine Inspection',
    },

    // Section 1: Inspection details (partially pre-filled)
    inspectionDetails: {
      referenceNumber: null, // Generated on creation
      inspectionDate: options.inspectionDate || null,
      inspectionTime: options.inspectionTime || null,
      inspectionType: inspectionType,
      inspectorName: options.inspectorName || null,
      inspectorId: options.inspectorId || null,
    },

    // Section 2: Business details (fully pre-populated from Uniform)
    businessDetails: {
      premisesRef: premises.premises_ref,
      uprn: premises.uprn,
      businessName: premises.business_name,
      tradingName: premises.trading_name,
      businessAddress: [
        premises.address_line1,
        premises.address_line2,
        premises.town,
        premises.county,
      ].filter(Boolean).join('\n'),
      postcode: premises.postcode,
      telephone: premises.telephone,
      email: premises.email,
      foodBusinessOperator: premises.food_business_operator,
      businessType: premises.business_type,
      businessTypeDetail: premises.business_type_detail,
      numberOfFoodHandlers: premises.number_of_food_handlers,
      registrationDate: premises.registration_date,
      tradingHours: premises.trading_hours,
      waterSupply: premises.water_supply,
      approvalStatus: premises.approval_status,
      primaryAuthority: premises.primary_authority,
    },

    // Section 3: Previous inspection summary (pre-populated from history)
    previousInspectionSummary: {
      lastInspectionDate: premises.last_inspection_date,
      lastScores: premises.last_inspection_date ? {
        hygienicFoodHandling: premises.last_hygienic_score,
        structureAndCleaning: premises.last_structure_score,
        managementOfFoodSafety: premises.last_management_score,
        total: (premises.last_hygienic_score || 0) +
               (premises.last_structure_score || 0) +
               (premises.last_management_score || 0),
      } : null,
      currentFhrsRating: premises.current_fhrs_rating,
      riskCategory: premises.risk_category,
      intervalDescription: intervalInfo ? intervalInfo.description : 'Unknown',
      previousActions: previousActions.map((a) => ({
        date: a.action_date,
        type: a.action_type,
        detail: a.detail,
      })),
      haccpInPlace: Boolean(premises.haccp_in_place),
      allergenDocumentation: Boolean(premises.allergen_documentation),
      officerNotes: premises.notes,
    },

    // Section 4: Pre-populated inspection focus areas
    inspectionFocusAreas: focusAreas,

    // Section 5: Assessment checklists (blank for officer to complete)
    hygienicFoodHandling: {
      score: null,
      criteria: {
        tempCooking: null,
        tempChilled: null,
        tempHot: null,
        crossContamination: null,
        personalHygiene: null,
        foodStorage: null,
      },
      comments: '',
    },

    structureAndCleaning: {
      score: null,
      criteria: {
        cleanlinessStructure: null,
        cleanlinessEquipment: null,
        conditionStructure: null,
        conditionEquipment: null,
        pestControl: null,
        handWashing: null,
        ventilationLighting: null,
        wasteDisposal: null,
      },
      comments: '',
    },

    managementOfFoodSafety: {
      score: null,
      criteria: {
        haccp: null,
        temperatureRecords: null,
        trainingRecords: null,
        traceability: null,
        allergens: null,
        cleaningSchedules: null,
      },
      comments: '',
    },

    // Section 6: Pre-populated temperature checks based on business type
    temperatureReadings: businessFocus.temperatureChecks.map((tc) => ({
      item: tc.item,
      temperature: null,
      requiredRange: tc.requiredRange,
      compliant: null,
    })),

    // Section 7: Rating (blank)
    overallRating: {
      totalScore: null,
      fhrsRating: null,
    },

    // Section 8: Actions (blank)
    actionsRequired: {
      enforcementActions: [],
      detailedActions: '',
      revisitRequired: false,
      revisitDate: null,
    },

    // Section 9: Declaration (blank)
    declaration: {
      additionalNotes: '',
      inspectorSignature: null,
      businessRepSignature: null,
      businessRepName: '',
      businessRepRole: '',
    },

    // Metadata for report generation phase
    metadata: {
      businessTypeFocus: businessFocus,
      riskCategory: premises.risk_category,
      isNewBusiness: !premises.last_inspection_date,
      hasOutstandingActions: previousActions.length > 0,
      previousInspectionCount: previousInspections.length,
    },
  };

  return visitSheet;
}

/**
 * Generate visit sheets for all premises due inspection.
 */
function generateBatchVisitSheets(withinMonths = 6, options = {}) {
  const premises = database.getPremisesDueInspection(withinMonths);
  const sheets = [];

  for (const p of premises) {
    const sheet = generateVisitSheet(p.premises_ref, options);
    sheets.push(sheet);
  }

  return sheets;
}

module.exports = {
  generateVisitSheet,
  generateBatchVisitSheets,
  BUSINESS_TYPE_FOCUS,
};
