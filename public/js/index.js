(function () {
      'use strict';

      // Fallback SVG image when vehicle image is missing or fails to load
      const PLACEHOLDER_IMG = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22600%22%20height%3D%22400%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20600%20400%22%3E%3Crect%20fill%3D%22%23e2e8f0%22%20width%3D%22600%22%20height%3D%22400%22%2F%3E%3Ctext%20fill%3D%22%2364748b%22%20font-family%3D%22sans-serif%22%20font-size%3D%2254%22%20dy%3D%2220%22%20x%3D%2250%25%22%20y%3D%2246%25%22%20text-anchor%3D%22middle%22%3E%F0%9F%9A%97%3C%2Ftext%3E%3Ctext%20fill%3D%22%2394a3b8%22%20font-family%3D%22sans-serif%22%20font-size%3D%2218%22%20dy%3D%2220%22%20x%3D%2250%25%22%20y%3D%2262%25%22%20text-anchor%3D%22middle%22%3ERantcle%20Vehicle%3C%2Ftext%3E%3C%2Fsvg%3E';

      // HTML entity escaping helper to prevent XSS
      function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      // Mobile Hamburger Navigation Toggle
      function setupNavigation() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const navLinks = document.getElementById('navLinks');

        if (!hamburgerBtn || !navLinks) return;

        hamburgerBtn.addEventListener('click', function () {
          const isActive = hamburgerBtn.classList.toggle('active');
          navLinks.classList.toggle('active');
          hamburgerBtn.setAttribute('aria-expanded', isActive ? 'true' : 'false');
        });

        // Close menu when clicking outside on mobile
        document.addEventListener('click', function (e) {
          if (!hamburgerBtn.contains(e.target) && !navLinks.contains(e.target) && navLinks.classList.contains('active')) {
            hamburgerBtn.classList.remove('active');
            navLinks.classList.remove('active');
            hamburgerBtn.setAttribute('aria-expanded', 'false');
          }
        });
      }

      // Render a single vehicle card matching the specified HTML structure
      function createVehicleCard(vehicle) {
        const card = document.createElement('div');
        card.className = 'vehicle-card';
        card.style.cursor = 'pointer';

        const name = escapeHtml(vehicle.vehicleName || 'Unnamed Vehicle');
        const brand = escapeHtml(vehicle.brand || 'Standard');
        const type = escapeHtml(vehicle.type || 'Vehicle');
        const location = escapeHtml(vehicle.location || 'Location upon request');
        const price = Math.round(Number(vehicle.priceHour) || 0);
        const isAvailable = vehicle.availability !== false;
        const imgSrc = vehicle.image ? escapeHtml(vehicle.image) : PLACEHOLDER_IMG;

        const availabilityBadge = isAvailable
          ? '<span class="badge badge--available">Available</span>'
          : '<span class="badge badge--unavailable">Unavailable</span>';

        card.innerHTML = `
          <div class="vehicle-card__image">
            <img src="${imgSrc}" alt="${name}">
            <span class="badge badge--type">${type}</span>
          </div>
          <div class="vehicle-card__body">
            <h3 class="vehicle-card__name">${name}</h3>
            <p class="vehicle-card__brand">${brand}</p>
            <p class="vehicle-card__location">📍 ${location}</p>
            <div class="vehicle-card__footer">
              <span class="vehicle-card__price">₹${price}/hr</span>
              ${availabilityBadge}
            </div>
          </div>
        `;

        // Handle image loading errors gracefully with placeholder
        const imgEl = card.querySelector('img');
        if (imgEl) {
          imgEl.addEventListener('error', function () {
            this.onerror = null;
            this.src = PLACEHOLDER_IMG;
          });
        }

        // Clicking the card navigates to Find Vehicles page
        card.addEventListener('click', function () {
          window.location.href = '/find.html';
        });

        return card;
      }

      // Fetch and render featured vehicles
      async function loadFeaturedVehicles() {
        const loadingEl = document.getElementById('loadingState');
        const errorEl = document.getElementById('errorState');
        const emptyEl = document.getElementById('emptyState');
        const gridEl = document.getElementById('featuredGrid');
        const viewAllEl = document.getElementById('viewAllContainer');
        const errorMessageEl = document.getElementById('errorMessage');

        // Set initial loading state
        loadingEl.classList.remove('d-none');
        errorEl.classList.add('d-none');
        emptyEl.classList.add('d-none');
        gridEl.classList.add('d-none');
        viewAllEl.classList.add('d-none');
        gridEl.innerHTML = '';

        try {
          if (typeof API === 'undefined' || typeof API.getVehicles !== 'function') {
            throw new Error('API client module is not loaded');
          }

          const vehicles = await API.getVehicles();

          loadingEl.classList.add('d-none');

          if (!Array.isArray(vehicles) || vehicles.length === 0) {
            emptyEl.classList.remove('d-none');
            return;
          }

          // Take the 6 most recent vehicles
          const featured = vehicles.slice(0, 6);

          featured.forEach(function (vehicle) {
            const cardEl = createVehicleCard(vehicle);
            gridEl.appendChild(cardEl);
          });

          gridEl.classList.remove('d-none');
          viewAllEl.classList.remove('d-none');
        } catch (err) {
          console.error('Failed to load featured vehicles:', err);
          loadingEl.classList.add('d-none');
          if (errorMessageEl && err.message) {
            errorMessageEl.textContent = err.message;
          }
          errorEl.classList.remove('d-none');
        }
      }

      // Initialize on DOMContentLoaded
      document.addEventListener('DOMContentLoaded', function () {
        setupNavigation();
        loadFeaturedVehicles();

        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) {
          retryBtn.addEventListener('click', loadFeaturedVehicles);
        }
      });
    })();