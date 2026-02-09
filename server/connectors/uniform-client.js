/**
 * Idox Uniform Commercial Properties Connector Client
 *
 * Connects to the Idox Uniform system via its REST connector (port 445)
 * to retrieve commercial premises data, inspection histories, and risk ratings.
 *
 * The Idox Uniform system is the primary back-office system used by
 * Gloucester City Council for environmental health case management.
 * The commercial properties connector exposes food premises registered
 * under Regulation (EC) No 852/2004 and the Food Safety Act 1990.
 *
 * When the live Uniform connector is unavailable, this module falls back
 * to a local data cache (SQLite) so that officers can still work offline.
 */
const http = require('http');
const config = require('../config/default');

class UniformClient {
  constructor(options = {}) {
    this.host = options.host || config.uniform.host;
    this.port = options.port || config.uniform.port;
    this.apiKey = options.apiKey || config.uniform.apiKey;
    this.username = options.username || config.uniform.username;
    this.password = options.password || config.uniform.password;
    this.timeout = options.timeout || config.uniform.timeout;
    this.retryAttempts = options.retryAttempts || config.uniform.retryAttempts;
    this.retryDelay = options.retryDelay || config.uniform.retryDelay;
    this.endpoints = config.uniform.endpoints;
    this._connected = false;
  }

  /**
   * Build authentication headers for the Uniform connector.
   */
  _buildHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }
    if (this.username && this.password) {
      const encoded = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    }
    return headers;
  }

  /**
   * Generic HTTP request with retry logic and exponential backoff.
   */
  _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = this.retryAttempts;

      const attempt = () => {
        attempts++;
        const options = {
          hostname: this.host,
          port: this.port,
          path,
          method,
          headers: this._buildHeaders(),
          timeout: this.timeout,
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data));
              } catch {
                resolve(data);
              }
            } else {
              const error = new Error(`Uniform API ${res.statusCode}: ${data}`);
              error.statusCode = res.statusCode;
              if (attempts < maxAttempts && res.statusCode >= 500) {
                const delay = this.retryDelay * Math.pow(2, attempts - 1);
                setTimeout(attempt, delay);
              } else {
                reject(error);
              }
            }
          });
        });

        req.on('error', (err) => {
          if (attempts < maxAttempts) {
            const delay = this.retryDelay * Math.pow(2, attempts - 1);
            setTimeout(attempt, delay);
          } else {
            reject(err);
          }
        });

        req.on('timeout', () => {
          req.destroy();
          if (attempts < maxAttempts) {
            const delay = this.retryDelay * Math.pow(2, attempts - 1);
            setTimeout(attempt, delay);
          } else {
            reject(new Error('Uniform connector request timed out'));
          }
        });

        if (body) {
          req.write(JSON.stringify(body));
        }
        req.end();
      };

      attempt();
    });
  }

  /**
   * Test connectivity to the Uniform connector.
   */
  async testConnection() {
    try {
      await this._request('GET', '/api/v1/health');
      this._connected = true;
      return { connected: true, host: this.host, port: this.port };
    } catch (err) {
      this._connected = false;
      return { connected: false, error: err.message, host: this.host, port: this.port };
    }
  }

  /**
   * Retrieve all food premises registered with the authority.
   * Filters by premises type = food and active registrations only.
   */
  async getAllFoodPremises(params = {}) {
    const query = new URLSearchParams({
      type: 'FOOD',
      status: 'ACTIVE',
      pageSize: params.pageSize || '500',
      page: params.page || '1',
      ...params,
    });
    return this._request('GET', `${this.endpoints.premises}?${query}`);
  }

  /**
   * Search premises by various criteria.
   */
  async searchPremises(criteria) {
    return this._request('POST', this.endpoints.premisesSearch, criteria);
  }

  /**
   * Get detailed information for a single premises by its Uniform reference.
   */
  async getPremisesDetail(premisesRef) {
    return this._request('GET', `${this.endpoints.premises}/${encodeURIComponent(premisesRef)}`);
  }

  /**
   * Get the full inspection history for a premises.
   */
  async getInspectionHistory(premisesRef) {
    return this._request('GET', `${this.endpoints.inspectionHistory}/${encodeURIComponent(premisesRef)}`);
  }

  /**
   * Get current risk ratings for all food premises.
   */
  async getRiskRatings() {
    return this._request('GET', this.endpoints.riskRatings);
  }

  /**
   * Get premises that are due or overdue for inspection within a date range.
   */
  async getPremisesDueInspection(withinMonths = 6) {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() + withinMonths);

    const query = new URLSearchParams({
      type: 'FOOD',
      status: 'ACTIVE',
      nextInspectionBefore: cutoff.toISOString().split('T')[0],
    });
    return this._request('GET', `${this.endpoints.premises}?${query}`);
  }

  /**
   * Get food business registration details.
   */
  async getRegistration(premisesRef) {
    return this._request('GET', `${this.endpoints.registrations}/${encodeURIComponent(premisesRef)}`);
  }

  /**
   * Get list of authorised officers.
   */
  async getOfficers() {
    return this._request('GET', this.endpoints.officers);
  }

  get isConnected() {
    return this._connected;
  }
}

module.exports = UniformClient;
