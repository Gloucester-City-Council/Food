/**
 * Default configuration for the GCC Food Inspection System.
 * Override via environment variables or a .env file.
 */
module.exports = {
  // Express server
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    host: process.env.HOST || '0.0.0.0',
  },

  // Idox Uniform commercial properties connector
  uniform: {
    host: process.env.UNIFORM_HOST || '127.0.0.1',
    port: parseInt(process.env.UNIFORM_PORT, 10) || 445,
    // Authentication – these should be set via environment variables in production
    apiKey: process.env.UNIFORM_API_KEY || '',
    username: process.env.UNIFORM_USERNAME || '',
    password: process.env.UNIFORM_PASSWORD || '',
    // Connection settings
    timeout: parseInt(process.env.UNIFORM_TIMEOUT, 10) || 30000,
    retryAttempts: 3,
    retryDelay: 2000,
    // Endpoints (Idox Uniform REST connector paths)
    endpoints: {
      premises: '/api/v1/premises',
      premisesSearch: '/api/v1/premises/search',
      inspections: '/api/v1/inspections',
      inspectionHistory: '/api/v1/inspections/history',
      riskRatings: '/api/v1/premises/risk-ratings',
      registrations: '/api/v1/registrations',
      officers: '/api/v1/officers',
    },
  },

  // SQLite database for local caching and inspection management
  database: {
    path: process.env.DB_PATH || './server/data/food_inspections.db',
  },

  // UK Food Hygiene Rating Scheme (FHRS) risk-based inspection intervals
  // Based on Food Law Code of Practice (England) Annex 5 risk rating scheme
  inspectionIntervals: {
    A: { months: 6, description: 'High risk – at least every 6 months' },
    B: { months: 12, description: 'Upper medium risk – at least every 12 months' },
    C: { months: 18, description: 'Medium risk – at least every 18 months' },
    D: { months: 24, description: 'Lower medium risk – at least every 24 months' },
    E: { months: 36, description: 'Low risk – alternative enforcement strategy or 3-yearly' },
  },

  // FHRS scoring thresholds (lower total = better rating)
  fhrsThresholds: [
    { maxScore: 15, rating: 5, label: 'Very Good' },
    { maxScore: 20, rating: 4, label: 'Good' },
    { maxScore: 30, rating: 3, label: 'Generally Satisfactory' },
    { maxScore: 40, rating: 2, label: 'Improvement Necessary' },
    { maxScore: 50, rating: 1, label: 'Major Improvement Necessary' },
    { maxScore: Infinity, rating: 0, label: 'Urgent Improvement Required' },
  ],

  // Report generation
  reports: {
    outputDir: process.env.REPORT_OUTPUT || './server/data/reports',
    council: {
      name: 'Gloucester City Council',
      department: 'Environmental Health Department',
      address: 'Shire Hall, Westgate Street, Gloucester, GL1 2TG',
      telephone: '01452 396396',
      email: 'environmentalhealth@gloucester.gov.uk',
      website: 'www.gloucester.gov.uk',
    },
  },
};
