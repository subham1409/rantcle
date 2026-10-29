/**
 * Rantcle - API Client Module
 * Handles public and administrative API interactions with the Rantcle Express backend.
 */
(function (global) {
  'use strict';

  const TOKEN_KEY = 'rantcle_admin_token';
  const BASE_URL = '/api';

  /**
   * Internal helper to make JSON HTTP requests to the backend.
   *
   * @param {string} endpoint - API endpoint path (e.g. '/vehicles' or '/admin/vehicles')
   * @param {Object} [options={}] - Request options
   * @param {string} [options.method='GET'] - HTTP method (GET, POST, PATCH, DELETE)
   * @param {Object} [options.body] - Request body object (will be JSON stringified)
   * @param {boolean} [options.auth=false] - Whether to include the admin JWT Bearer token
   * @returns {Promise<any>} The `data` property of the response object
   * @throws {Error} If network fails, parsing fails, or server returns ok: false
   */
  async function request(endpoint, options = {}) {
    const { method = 'GET', body, auth = false } = options;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${BASE_URL}${cleanEndpoint}`;

    const headers = {
      'Content-Type': 'application/json'
    };

    if (auth) {
      const token = API.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const config = {
      method,
      headers
    };

    if (body !== undefined) {
      config.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(url, config);
    } catch (networkError) {
      throw new Error(`Network error: ${networkError.message || 'Failed to connect to server'}`);
    }

    let result;
    try {
      result = await response.json();
    } catch (parseError) {
      throw new Error(`Server returned status ${response.status} with non-JSON response`);
    }

    if (!result || result.ok === false) {
      throw new Error((result && result.error) || 'Request failed');
    }

    return result.data;
  }

  const API = {
    /* ==================================================================
       Public Endpoints
       ================================================================== */

    /**
     * Fetch list of all public vehicles.
     * GET /api/vehicles
     * @returns {Promise<Array<Object>>} List of vehicle objects
     */
    async getVehicles() {
      return request('/vehicles', { method: 'GET' });
    },

    /**
     * Add a new vehicle to the rental fleet.
     * POST /api/vehicles
     * @param {Object} vehicleData - Vehicle details (ownerName, phone, vehicleName, brand, type, location, priceHour, priceDay, etc.)
     * @returns {Promise<Object>} Created vehicle object
     */
    async addVehicle(vehicleData) {
      return request('/vehicles', {
        method: 'POST',
        body: vehicleData
      });
    },

    /**
     * Create a new vehicle booking.
     * POST /api/bookings
     * @param {Object} bookingData - Booking details (vehicleId, customerName, phone, pickup, drop, duration)
     * @returns {Promise<Object>} Created booking object
     */
    async createBooking(bookingData) {
      return request('/bookings', {
        method: 'POST',
        body: bookingData
      });
    },

    /**
     * Check backend health and database connectivity.
     * GET /api/health
     * @returns {Promise<Object>} Status object (e.g. { status: 'up' })
     */
    async healthCheck() {
      return request('/health', { method: 'GET' });
    },

    /* ==================================================================
       Admin Endpoints
       ================================================================== */

    /**
     * Admin login with username and password. Stores token in localStorage on success.
     * POST /api/admin/login
     * @param {string} username - Admin username
     * @param {string} password - Admin password
     * @returns {Promise<Object>} Response data containing { token }
     */
    async login(username, password) {
      const data = await request('/admin/login', {
        method: 'POST',
        body: { username, password }
      });
      if (data && data.token) {
        this.setToken(data.token);
      }
      return data;
    },

    /**
     * Fetch all vehicles including owner contact details. Requires admin token.
     * GET /api/admin/vehicles
     * @returns {Promise<Array<Object>>} List of vehicle objects with admin fields
     */
    async getAdminVehicles() {
      return request('/admin/vehicles', {
        method: 'GET',
        auth: true
      });
    },

    /**
     * Update vehicle price or availability. Requires admin token.
     * PATCH /api/admin/vehicles/:id
     * @param {string|number} id - Vehicle ID
     * @param {Object} data - Update payload { priceHour, priceDay, availability }
     * @returns {Promise<Object>} Result object { id }
     */
    async updateVehicle(id, data) {
      return request(`/admin/vehicles/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: data,
        auth: true
      });
    },

    /**
     * Delete a vehicle and remove its uploaded image. Requires admin token.
     * DELETE /api/admin/vehicles/:id
     * @param {string|number} id - Vehicle ID
     * @returns {Promise<Object>} Result object { id }
     */
    async deleteVehicle(id) {
      return request(`/admin/vehicles/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        auth: true
      });
    },

    /**
     * Fetch all bookings. Requires admin token.
     * GET /api/admin/bookings
     * @returns {Promise<Array<Object>>} List of booking objects
     */
    async getAdminBookings() {
      return request('/admin/bookings', {
        method: 'GET',
        auth: true
      });
    },

    /**
     * Update booking status (Pending, Accepted, Rejected, Completed). Requires admin token.
     * PATCH /api/admin/bookings/:id/status
     * @param {string|number} id - Booking ID
     * @param {string} status - New status
     * @returns {Promise<Object>} Result object { id, status }
     */
    async updateBookingStatus(id, status) {
      return request(`/admin/bookings/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: { status },
        auth: true
      });
    },

    /**
     * Delete a booking. Requires admin token.
     * DELETE /api/admin/bookings/:id
     * @param {string|number} id - Booking ID
     * @returns {Promise<Object>} Result object { id }
     */
    async deleteBooking(id) {
      return request(`/admin/bookings/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        auth: true
      });
    },

    /* ==================================================================
       Token Management
       ================================================================== */

    /**
     * Retrieve the stored admin JWT token from localStorage.
     * @returns {string|null} JWT token or null if not found
     */
    getToken() {
      try {
        return localStorage.getItem(TOKEN_KEY);
      } catch (err) {
        console.error('Failed to read admin token from localStorage:', err);
        return null;
      }
    },

    /**
     * Store the admin JWT token in localStorage.
     * @param {string} token - JWT token string
     */
    setToken(token) {
      try {
        if (token) {
          localStorage.setItem(TOKEN_KEY, token);
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      } catch (err) {
        console.error('Failed to save admin token to localStorage:', err);
      }
    },

    /**
     * Remove the stored admin JWT token from localStorage.
     */
    clearToken() {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch (err) {
        console.error('Failed to remove admin token from localStorage:', err);
      }
    },

    /**
     * Check if an admin token currently exists in localStorage.
     * @returns {boolean} True if token exists
     */
    isLoggedIn() {
      return Boolean(this.getToken());
    },

    /**
     * Clear the stored admin JWT token to log out.
     */
    logout() {
      this.clearToken();
    }
  };

  // Expose to window in browser environments
  if (typeof global !== 'undefined') {
    global.API = API;
  }
  if (typeof window !== 'undefined') {
    window.API = API;
  }

  // Export for module systems if loaded via Node/bundler
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }
})(typeof window !== 'undefined' ? window : this);
