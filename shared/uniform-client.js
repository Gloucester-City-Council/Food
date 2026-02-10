/**
 * Idox Uniform Commercial Properties Connector Client
 * (Azure Functions version – identical logic to server/connectors/uniform-client.js)
 */
const http = require('http');
const config = require('./config');

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

  _buildHeaders() {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;
    if (this.username && this.password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
    }
    return headers;
  }

  _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = this.retryAttempts;
      const attempt = () => {
        attempts++;
        const options = {
          hostname: this.host, port: this.port, path, method,
          headers: this._buildHeaders(), timeout: this.timeout,
        };
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try { resolve(JSON.parse(data)); } catch { resolve(data); }
            } else {
              const error = new Error(`Uniform API ${res.statusCode}: ${data}`);
              error.statusCode = res.statusCode;
              if (attempts < maxAttempts && res.statusCode >= 500) {
                setTimeout(attempt, this.retryDelay * Math.pow(2, attempts - 1));
              } else { reject(error); }
            }
          });
        });
        req.on('error', (err) => {
          if (attempts < maxAttempts) {
            setTimeout(attempt, this.retryDelay * Math.pow(2, attempts - 1));
          } else { reject(err); }
        });
        req.on('timeout', () => {
          req.destroy();
          if (attempts < maxAttempts) {
            setTimeout(attempt, this.retryDelay * Math.pow(2, attempts - 1));
          } else { reject(new Error('Uniform connector request timed out')); }
        });
        if (body) req.write(JSON.stringify(body));
        req.end();
      };
      attempt();
    });
  }

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

  async getAllFoodPremises(params = {}) {
    const query = new URLSearchParams({
      type: 'FOOD', status: 'ACTIVE',
      pageSize: params.pageSize || '500', page: params.page || '1', ...params,
    });
    return this._request('GET', `${this.endpoints.premises}?${query}`);
  }

  async searchPremises(criteria) {
    return this._request('POST', this.endpoints.premisesSearch, criteria);
  }

  async getPremisesDetail(premisesRef) {
    return this._request('GET', `${this.endpoints.premises}/${encodeURIComponent(premisesRef)}`);
  }

  async getInspectionHistory(premisesRef) {
    return this._request('GET', `${this.endpoints.inspectionHistory}/${encodeURIComponent(premisesRef)}`);
  }

  async getRiskRatings() {
    return this._request('GET', this.endpoints.riskRatings);
  }

  async getPremisesDueInspection(withinMonths = 6) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() + withinMonths);
    const query = new URLSearchParams({
      type: 'FOOD', status: 'ACTIVE',
      nextInspectionBefore: cutoff.toISOString().split('T')[0],
    });
    return this._request('GET', `${this.endpoints.premises}?${query}`);
  }

  async getRegistration(premisesRef) {
    return this._request('GET', `${this.endpoints.registrations}/${encodeURIComponent(premisesRef)}`);
  }

  async getOfficers() {
    return this._request('GET', this.endpoints.officers);
  }

  get isConnected() { return this._connected; }
}

module.exports = UniformClient;
