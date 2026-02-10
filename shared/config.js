/**
 * Configuration for Azure Functions deployment.
 * All secrets are read from Azure Static Web Apps application settings
 * (environment variables), not hard-coded.
 */
module.exports = {
  uniform: {
    host: process.env.UNIFORM_HOST || '127.0.0.1',
    port: parseInt(process.env.UNIFORM_PORT, 10) || 445,
    apiKey: process.env.UNIFORM_API_KEY || '',
    username: process.env.UNIFORM_USERNAME || '',
    password: process.env.UNIFORM_PASSWORD || '',
    timeout: parseInt(process.env.UNIFORM_TIMEOUT, 10) || 30000,
    retryAttempts: 3,
    retryDelay: 2000,
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

  inspectionIntervals: {
    A: { months: 6, description: 'High risk – at least every 6 months' },
    B: { months: 12, description: 'Upper medium risk – at least every 12 months' },
    C: { months: 18, description: 'Medium risk – at least every 18 months' },
    D: { months: 24, description: 'Lower medium risk – at least every 24 months' },
    E: { months: 36, description: 'Low risk – alternative enforcement strategy or 3-yearly' },
  },

  fhrsThresholds: [
    { maxScore: 15, rating: 5, label: 'Very Good' },
    { maxScore: 20, rating: 4, label: 'Good' },
    { maxScore: 30, rating: 3, label: 'Generally Satisfactory' },
    { maxScore: 40, rating: 2, label: 'Improvement Necessary' },
    { maxScore: 50, rating: 1, label: 'Major Improvement Necessary' },
    { maxScore: Infinity, rating: 0, label: 'Urgent Improvement Required' },
  ],

  reports: {
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
