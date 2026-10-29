(function () {
      'use strict';

      // Fallback SVG placeholder matching index.html
      const PLACEHOLDER_IMG = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22600%22%20height%3D%22400%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20600%20400%22%3E%3Crect%20fill%3D%22%23e2e8f0%22%20width%3D%22600%22%20height%3D%22400%22%2F%3E%3Ctext%20fill%3D%22%2364748b%22%20font-family%3D%22sans-serif%22%20font-size%3D%2254%22%20dy%3D%2220%22%20x%3D%2250%25%22%20y%3D%2246%25%22%20text-anchor%3D%22middle%22%3E%F0%9F%9A%97%3C%2Ftext%3E%3Ctext%20fill%3D%22%2394a3b8%22%20font-family%3D%22sans-serif%22%20font-size%3D%2218%22%20dy%3D%2220%22%20x%3D%2250%25%22%20y%3D%2262%25%22%20text-anchor%3D%22middle%22%3ERantcle%20Vehicle%3C%2Ftext%3E%3C%2Fsvg%3E';

      // State
      let allVehicles = [];
      let currentVehicle = null;

      // DOM Elements - Search & Filters
      const searchInput = document.getElementById('searchInput');
      const typeFilter = document.getElementById('typeFilter');
      const fuelFilter = document.getElementById('fuelFilter');
      const availableToggle = document.getElementById('availableToggle');
      const resultsCountEl = document.getElementById('resultsCount');
      const resetFiltersBtn = document.getElementById('resetFiltersBtn');
      const clearFiltersBtn = document.getElementById('clearFiltersBtn');

      // DOM Elements - States & Grid
      const loadingEl = document.getElementById('loadingState');
      const errorEl = document.getElementById('errorState');
      const errorMessageEl = document.getElementById('errorMessage');
      const emptyEl = document.getElementById('emptyState');
      const emptyMessageEl = document.getElementById('emptyMessage');
      const gridEl = document.getElementById('vehiclesGrid');
      const retryBtn = document.getElementById('retryBtn');

      // DOM Elements - Modal & Form
      const bookingModal = document.getElementById('bookingModal');
      const closeModalBtn = document.getElementById('closeModalBtn');
      const cancelModalBtn = document.getElementById('cancelModalBtn');
      const bookingForm = document.getElementById('bookingForm');
      const modalAlert = document.getElementById('modalAlert');
      const modalFormBody = document.getElementById('modalFormBody');
      const modalFormFooter = document.getElementById('modalFormFooter');
      const modalSuccessBody = document.getElementById('modalSuccessBody');
      const successDoneBtn = document.getElementById('successDoneBtn');

      const modalVehicleTitle = document.getElementById('modalVehicleTitle');
      const modalVehicleType = document.getElementById('modalVehicleType');
      const modalHourlyRate = document.getElementById('modalHourlyRate');
      const modalDurationSummary = document.getElementById('modalDurationSummary');
      const modalEstimatedTotal = document.getElementById('modalEstimatedTotal');
      const bookingVehicleId = document.getElementById('bookingVehicleId');

      const customerNameInput = document.getElementById('customerName');
      const customerPhoneInput = document.getElementById('customerPhone');
      const pickupLocationInput = document.getElementById('pickupLocation');
      const dropLocationInput = document.getElementById('dropLocation');
      const durationHoursInput = document.getElementById('durationHours');
      const durationBadge = document.getElementById('durationBadge');

      const nameError = document.getElementById('nameError');
      const phoneError = document.getElementById('phoneError');
      const pickupError = document.getElementById('pickupError');
      const durationError = document.getElementById('durationError');

      const confirmBookingBtn = document.getElementById('confirmBookingBtn');
      const confirmBtnSpinner = document.getElementById('confirmBtnSpinner');
      const confirmBtnText = document.getElementById('confirmBtnText');

      // Success Display Elements
      const successBookingId = document.getElementById('successBookingId');
      const successVehicleName = document.getElementById('successVehicleName');
      const successCustomerName = document.getElementById('successCustomerName');
      const successCustomerPhone = document.getElementById('successCustomerPhone');
      const successPickup = document.getElementById('successPickup');
      const successDurationHours = document.getElementById('successDurationHours');
      const successBookingStatus = document.getElementById('successBookingStatus');
      const successTotalAmount = document.getElementById('successTotalAmount');

      /**
       * HTML entity escaper to prevent XSS
       */
      function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      /**
       * Mobile Navigation Setup (same as index.html)
       */
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

      /**
       * Render a single vehicle card
       * Matching index.html card design with an added Book Now button on available vehicles
       */
      function createVehicleCard(vehicle) {
        const card = document.createElement('div');
        card.className = 'vehicle-card';
        card.setAttribute('data-id', vehicle.id);

        const name = escapeHtml(vehicle.vehicleName || 'Unnamed Vehicle');
        const brand = escapeHtml(vehicle.brand || 'Standard');
        const type = escapeHtml(vehicle.type || 'Vehicle');
        const location = escapeHtml(vehicle.location || 'Location upon request');
        const fuel = escapeHtml(vehicle.fuel || 'Petrol');
        const transmission = escapeHtml(vehicle.transmission || 'Manual');
        const desc = escapeHtml(vehicle.description || '');
        const priceHour = Math.round(Number(vehicle.priceHour) || 0);
        const priceDay = Math.round(Number(vehicle.priceDay) || 0);
        const isAvailable = vehicle.availability !== false && vehicle.availability !== 'false';
        const imgSrc = vehicle.image ? escapeHtml(vehicle.image) : PLACEHOLDER_IMG;

        const availabilityBadge = isAvailable
          ? '<span class="badge badge--available">Available</span>'
          : '<span class="badge badge--unavailable">Unavailable</span>';

        const actionButton = isAvailable
          ? `<button type="button" class="btn btn-primary btn-sm book-btn" data-id="${vehicle.id}">Book Now</button>`
          : `<button type="button" class="btn btn-outline btn-sm" disabled style="opacity: 0.6; cursor: not-allowed;">Unavailable</button>`;

        card.innerHTML = `
          <div class="vehicle-card__image">
            <img src="${imgSrc}" alt="${name}" loading="lazy">
            <span class="badge badge--type">${type}</span>
          </div>
          <div class="vehicle-card__body">
            <h3 class="vehicle-card__name">${name}</h3>
            <p class="vehicle-card__brand">${brand}</p>
            <p class="vehicle-card__location">📍 ${location}</p>

            <div class="vehicle-card__meta-tags">
              <span class="meta-tag">⛽ ${fuel}</span>
              <span class="meta-tag">⚙️ ${transmission}</span>
            </div>

            ${desc ? `<p class="vehicle-card__desc">${desc}</p>` : ''}

            <div class="vehicle-card__footer" style="margin-top: auto; padding-top: 1rem; border-top: 1px solid var(--gray-light); display: flex; align-items: center; justify-content: space-between;">
              <div class="vehicle-card__rates">
                <span class="hourly-rate">₹${priceHour}/hr</span>
                ${priceDay > 0 ? `<span class="daily-rate">₹${priceDay}/day</span>` : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                ${availabilityBadge}
                ${actionButton}
              </div>
            </div>
          </div>
        `;

        // Image fallback handler
        const imgEl = card.querySelector('img');
        if (imgEl) {
          imgEl.addEventListener('error', function () {
            this.onerror = null;
            this.src = PLACEHOLDER_IMG;
          });
        }

        // Book Now button click handler
        const bookBtn = card.querySelector('.book-btn');
        if (bookBtn) {
          bookBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            openBookingModal(vehicle);
          });
        }

        return card;
      }

      /**
       * Render filtered vehicles into the vehicle grid
       */
      function renderVehicles(vehicles) {
        gridEl.innerHTML = '';

        // Update count display
        resultsCountEl.textContent = String(vehicles.length);

        // Check if any filters are currently active
        const hasActiveFilters =
          searchInput.value.trim() !== '' ||
          typeFilter.value !== 'all' ||
          fuelFilter.value !== 'all' ||
          availableToggle.checked;

        resetFiltersBtn.style.display = hasActiveFilters ? 'inline-flex' : 'none';

        if (vehicles.length === 0) {
          gridEl.classList.add('d-none');
          emptyEl.classList.remove('d-none');

          if (hasActiveFilters) {
            emptyMessageEl.textContent = "We couldn't find any vehicles matching your filter criteria. Try adjusting or clearing your filters.";
            clearFiltersBtn.style.display = 'inline-block';
          } else {
            emptyMessageEl.textContent = "There are no vehicles listed in the fleet yet. Check back soon or list your own!";
            clearFiltersBtn.style.display = 'none';
          }
          return;
        }

        emptyEl.classList.add('d-none');
        gridEl.classList.remove('d-none');

        const fragment = document.createDocumentFragment();
        vehicles.forEach(function (v) {
          fragment.appendChild(createVehicleCard(v));
        });
        gridEl.appendChild(fragment);
      }

      /**
       * Filter vehicles based on search, type, fuel, and availability
       */
      function applyFilters() {
        const query = searchInput.value.trim().toLowerCase();
        const selectedType = typeFilter.value;
        const selectedFuel = fuelFilter.value;
        const onlyAvailable = availableToggle.checked;

        const filtered = allVehicles.filter(function (v) {
          // 1. Text Search (filters vehicleName, brand, location)
          if (query) {
            const name = (v.vehicleName || '').toLowerCase();
            const brand = (v.brand || '').toLowerCase();
            const loc = (v.location || '').toLowerCase();
            const matchesQuery = name.includes(query) || brand.includes(query) || loc.includes(query);
            if (!matchesQuery) return false;
          }

          // 2. Type Filter
          if (selectedType !== 'all') {
            if ((v.type || '').trim().toLowerCase() !== selectedType.toLowerCase()) {
              return false;
            }
          }

          // 3. Fuel Filter
          if (selectedFuel !== 'all') {
            if ((v.fuel || '').trim().toLowerCase() !== selectedFuel.toLowerCase()) {
              return false;
            }
          }

          // 4. Availability Filter
          if (onlyAvailable) {
            const isAvail = v.availability !== false && v.availability !== 'false';
            if (!isAvail) return false;
          }

          return true;
        });

        renderVehicles(filtered);
      }

      /**
       * Reset all filter controls to their default states
       */
      function resetFilters() {
        searchInput.value = '';
        typeFilter.value = 'all';
        fuelFilter.value = 'all';
        availableToggle.checked = false;
        applyFilters();
      }

      /**
       * Calculate dynamic estimated total based on duration and vehicle hourly price
       */
      function updateEstimatedTotal() {
        if (!currentVehicle) return;

        const hours = parseInt(durationHoursInput.value, 10);
        const priceHour = Number(currentVehicle.priceHour) || 0;

        if (isNaN(hours) || hours < 1) {
          modalEstimatedTotal.textContent = '₹0';
          modalDurationSummary.textContent = '0 hours';
          durationBadge.textContent = '0 hours';
          return;
        }

        const total = hours * priceHour;
        modalEstimatedTotal.textContent = `₹${total.toLocaleString('en-IN')}`;

        if (hours === 1) {
          modalDurationSummary.textContent = '1 hour';
          durationBadge.textContent = '1 hour';
        } else if (hours < 24) {
          modalDurationSummary.textContent = `${hours} hours`;
          durationBadge.textContent = `${hours} hours`;
        } else {
          const days = Math.floor(hours / 24);
          const rem = hours % 24;
          const text = `${hours} hrs (${days}d${rem > 0 ? ` ${rem}h` : ''})`;
          modalDurationSummary.textContent = text;
          durationBadge.textContent = text;
        }
      }

      /**
       * Open the booking modal with the selected vehicle preloaded
       */
      function openBookingModal(vehicle) {
        currentVehicle = vehicle;

        // Reset modal alert and validation states
        hideModalAlert();
        clearValidationErrors();

        // Show form body & footer, hide success body
        modalFormBody.style.display = 'block';
        modalFormFooter.style.display = 'flex';
        modalSuccessBody.style.display = 'none';

        // Set Vehicle details
        modalVehicleTitle.textContent = vehicle.vehicleName || 'Vehicle';
        modalVehicleType.textContent = vehicle.type || 'Vehicle';
        const priceHour = Math.round(Number(vehicle.priceHour) || 0);
        modalHourlyRate.textContent = `₹${priceHour}`;
        bookingVehicleId.value = vehicle.id;

        // Reset form inputs
        customerNameInput.value = '';
        customerPhoneInput.value = '';
        pickupLocationInput.value = vehicle.location || '';
        dropLocationInput.value = '';
        durationHoursInput.value = '4';

        // Update estimated total
        updateEstimatedTotal();

        // Reset confirm button
        confirmBookingBtn.disabled = false;
        confirmBtnSpinner.style.display = 'none';
        confirmBtnText.textContent = 'Confirm Booking';

        // Open modal
        bookingModal.classList.add('active');
        bookingModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        // Focus first input
        setTimeout(function () {
          customerNameInput.focus();
        }, 150);
      }

      /**
       * Close the booking modal
       */
      function closeBookingModal() {
        bookingModal.classList.remove('active');
        bookingModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        currentVehicle = null;
      }

      /**
       * Show error or alert message inside modal
       */
      function showModalAlert(message, type = 'error') {
        modalAlert.className = `modal-alert alert-${type}`;
        modalAlert.textContent = message;
        modalAlert.style.display = 'block';
      }

      /**
       * Hide modal alert
       */
      function hideModalAlert() {
        modalAlert.style.display = 'none';
        modalAlert.textContent = '';
      }

      /**
       * Clear field error states
       */
      function clearValidationErrors() {
        [customerNameInput, customerPhoneInput, pickupLocationInput, durationHoursInput].forEach(function (input) {
          input.classList.remove('is-invalid');
        });
        nameError.style.display = 'none';
        phoneError.style.display = 'none';
        pickupError.style.display = 'none';
        durationError.style.display = 'none';
      }

      /**
       * Validate booking form inputs client-side
       */
      function validateBookingForm() {
        clearValidationErrors();
        let isValid = true;

        // Name: required, max 100
        const nameVal = customerNameInput.value.trim();
        if (!nameVal) {
          customerNameInput.classList.add('is-invalid');
          nameError.textContent = 'Your name is required';
          nameError.style.display = 'block';
          isValid = false;
        } else if (nameVal.length > 100) {
          customerNameInput.classList.add('is-invalid');
          nameError.textContent = 'Name must be at most 100 characters';
          nameError.style.display = 'block';
          isValid = false;
        }

        // Phone: 7-15 digits
        const rawPhone = customerPhoneInput.value.trim().replace(/[\s-]/g, '');
        const phoneRegex = /^\+?[0-9]{7,15}$/;
        if (!rawPhone) {
          customerPhoneInput.classList.add('is-invalid');
          phoneError.textContent = 'Phone number is required';
          phoneError.style.display = 'block';
          isValid = false;
        } else if (!phoneRegex.test(rawPhone)) {
          customerPhoneInput.classList.add('is-invalid');
          phoneError.textContent = 'Phone number must be 7 to 15 digits';
          phoneError.style.display = 'block';
          isValid = false;
        }

        // Pickup: required, max 120
        const pickupVal = pickupLocationInput.value.trim();
        if (!pickupVal) {
          pickupLocationInput.classList.add('is-invalid');
          pickupError.textContent = 'Pickup location is required';
          pickupError.style.display = 'block';
          isValid = false;
        } else if (pickupVal.length > 120) {
          pickupLocationInput.classList.add('is-invalid');
          pickupError.textContent = 'Pickup location must be under 120 characters';
          pickupError.style.display = 'block';
          isValid = false;
        }

        // Duration: integer between 1 and 720
        const durationVal = Number(durationHoursInput.value);
        if (!Number.isInteger(durationVal) || durationVal < 1 || durationVal > 720) {
          durationHoursInput.classList.add('is-invalid');
          durationError.textContent = 'Duration must be between 1 and 720 hours';
          durationError.style.display = 'block';
          isValid = false;
        }

        return isValid;
      }

      /**
       * Handle Booking Form Submission
       */
      async function handleBookingSubmit(e) {
        e.preventDefault();
        hideModalAlert();

        if (!validateBookingForm()) {
          return;
        }

        if (!currentVehicle) {
          showModalAlert('No vehicle selected. Please try reopening the booking modal.');
          return;
        }

        const bookingData = {
          vehicleId: String(currentVehicle.id),
          customerName: customerNameInput.value.trim(),
          phone: customerPhoneInput.value.trim().replace(/[\s-]/g, ''),
          pickup: pickupLocationInput.value.trim(),
          drop: dropLocationInput.value.trim() || undefined,
          duration: parseInt(durationHoursInput.value, 10)
        };

        // Loading state
        confirmBookingBtn.disabled = true;
        confirmBtnSpinner.style.display = 'inline-block';
        confirmBtnText.textContent = 'Submitting...';

        try {
          if (typeof API === 'undefined' || typeof API.createBooking !== 'function') {
            throw new Error('API client module is unavailable. Please refresh the page.');
          }

          const result = await API.createBooking(bookingData);

          // Populate success screen details
          successBookingId.textContent = `#${result.id || 'N/A'}`;
          successVehicleName.textContent = result.vehicleName || currentVehicle.vehicleName || 'Vehicle';
          successCustomerName.textContent = result.customerName || bookingData.customerName;
          successCustomerPhone.textContent = result.phone || bookingData.phone;
          successPickup.textContent = result.pickup || bookingData.pickup;
          successDurationHours.textContent = `${result.duration || bookingData.duration} hour(s)`;

          const formattedTotal = Number(result.totalAmount) || (bookingData.duration * (Number(currentVehicle.priceHour) || 0));
          successTotalAmount.textContent = `₹${formattedTotal.toLocaleString('en-IN')}`;

          const status = result.status || 'Pending';
          successBookingStatus.className = `badge badge-${status.toLowerCase()}`;
          successBookingStatus.innerHTML = `<span class="badge-dot"></span> ${status}`;

          // Switch modal view to success card
          modalFormBody.style.display = 'none';
          modalFormFooter.style.display = 'none';
          modalSuccessBody.style.display = 'block';

        } catch (err) {
          console.error('Booking failed:', err);
          showModalAlert(err.message || 'Failed to submit booking. Please check your information and try again.');
          confirmBookingBtn.disabled = false;
          confirmBtnSpinner.style.display = 'none';
          confirmBtnText.textContent = 'Confirm Booking';
        }
      }

      /**
       * Fetch all vehicles from API.getVehicles() on page load
       */
      async function loadVehicles() {
        loadingEl.classList.remove('d-none');
        errorEl.classList.add('d-none');
        emptyEl.classList.add('d-none');
        gridEl.classList.add('d-none');
        gridEl.innerHTML = '';

        try {
          if (typeof API === 'undefined' || typeof API.getVehicles !== 'function') {
            throw new Error('API client is not loaded. Please verify script tags.');
          }

          const vehicles = await API.getVehicles();

          loadingEl.classList.add('d-none');

          if (!Array.isArray(vehicles)) {
            throw new Error('Invalid vehicle list format received from backend.');
          }

          allVehicles = vehicles;
          applyFilters();

        } catch (err) {
          console.error('Failed to load vehicles:', err);
          loadingEl.classList.add('d-none');
          if (errorMessageEl && err.message) {
            errorMessageEl.textContent = err.message;
          }
          errorEl.classList.remove('d-none');
        }
      }

      /**
       * Initialize page event listeners and initial vehicle fetch
       */
      function init() {
        setupNavigation();

        // Search & Filter listeners
        searchInput.addEventListener('input', applyFilters);
        typeFilter.addEventListener('change', applyFilters);
        fuelFilter.addEventListener('change', applyFilters);
        availableToggle.addEventListener('change', applyFilters);

        // Reset filter buttons
        resetFiltersBtn.addEventListener('click', resetFilters);
        clearFiltersBtn.addEventListener('click', resetFilters);

        // Retry button
        retryBtn.addEventListener('click', loadVehicles);

        // Modal close listeners
        closeModalBtn.addEventListener('click', closeBookingModal);
        cancelModalBtn.addEventListener('click', closeBookingModal);
        successDoneBtn.addEventListener('click', closeBookingModal);

        // Close on background overlay click
        bookingModal.addEventListener('click', function (e) {
          if (e.target === bookingModal) {
            closeBookingModal();
          }
        });

        // Close on Escape key
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && bookingModal.classList.contains('active')) {
            closeBookingModal();
          }
        });

        // Dynamic total recalculation on duration input
        durationHoursInput.addEventListener('input', updateEstimatedTotal);
        durationHoursInput.addEventListener('change', updateEstimatedTotal);

        // Booking form submit
        bookingForm.addEventListener('submit', handleBookingSubmit);

        // Fetch initial vehicle list
        loadVehicles();
      }

      // Start on DOMContentLoaded
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    })();