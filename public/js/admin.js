/**
 * Rantcle - Admin Dashboard Module
 * Handles login, dashboard view switching, statistics,
 * vehicle and booking tables, CRUD operations, and 10s auto-refresh.
 */
(function () {
  'use strict';
  if (window.__ADMIN_APP_LOADED__) return;
  window.__ADMIN_APP_LOADED__ = true;

  const state = {
    vehicles: [],
    bookings: [],
    activeTab: 'vehicles',
    searchQuery: '',
    refreshTimer: null,
    pendingDelete: null,
    isUpdating: false
  };

  const els = {
    loginView: document.getElementById('login-view'),
    dashboardView: document.getElementById('dashboard-view'),
    btnLogout: document.getElementById('btn-logout'),
    hamburgerBtn: document.getElementById('hamburgerBtn') || document.getElementById('hamburger'),
    navLinks: document.getElementById('navLinks'),

    loginForm: document.getElementById('login-form'),
    usernameInput: document.getElementById('admin-username'),
    passwordInput: document.getElementById('admin-password'),
    btnLoginSubmit: document.getElementById('btn-login-submit'),
    loginError: document.getElementById('login-error'),
    loginErrorText: document.getElementById('login-error-text'),

    statTotalVehicles: document.getElementById('stat-total-vehicles'),
    statAvailableVehicles: document.getElementById('stat-available-vehicles'),
    statTotalBookings: document.getElementById('stat-total-bookings'),
    statPendingBookings: document.getElementById('stat-pending-bookings'),

    tabBtnVehicles: document.getElementById('tab-btn-vehicles'),
    tabBtnBookings: document.getElementById('tab-btn-bookings'),
    tabBadgeVehicles: document.getElementById('tab-badge-vehicles'),
    tabBadgeBookings: document.getElementById('tab-badge-bookings'),
    paneVehicles: document.getElementById('pane-vehicles'),
    paneBookings: document.getElementById('pane-bookings'),
    tableSearchInput: document.getElementById('table-search-input'),
    btnManualRefresh: document.getElementById('btn-manual-refresh'),

    vehiclesTableBody: document.getElementById('vehicles-table-body'),
    bookingsTableBody: document.getElementById('bookings-table-body'),

    editPriceModal: document.getElementById('edit-price-modal'),
    editPriceForm: document.getElementById('edit-price-form'),
    editVehicleId: document.getElementById('edit-vehicle-id'),
    editVehicleNameLabel: document.getElementById('edit-vehicle-name-label'),
    editPriceHour: document.getElementById('edit-price-hour'),
    editPriceDay: document.getElementById('edit-price-day'),
    editVehicleAvailability: document.getElementById('edit-vehicle-availability'),
    btnSavePrice: document.getElementById('btn-save-price'),

    confirmDeleteModal: document.getElementById('confirm-delete-modal'),
    deleteModalMsg: document.getElementById('delete-modal-msg'),
    btnConfirmDelete: document.getElementById('btn-confirm-delete'),

    toastContainer: document.getElementById('toast-container')
  };

  function showToast(message, type = 'info') {
    if (!els.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `admin-toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
      <div style="flex-shrink:0;">${iconSvg}</div>
      <div style="flex:1;">${escapeHtml(message)}</div>
    `;

    els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function formatCurrency(amount) {
    const num = Number(amount);
    if (isNaN(num)) return '₹0';
    return `₹${num.toLocaleString('en-IN')}`;
  }

  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getStatusBadgeClass(status) {
    const s = (status || '').toLowerCase();
    if (s === 'accepted') return 'badge-accepted';
    if (s === 'rejected') return 'badge-rejected';
    if (s === 'completed') return 'badge-completed';
    return 'badge-pending';
  }

  function updateView() {
    const loggedIn = window.API && typeof window.API.isLoggedIn === 'function' ? window.API.isLoggedIn() : false;

    if (loggedIn) {
      els.loginView.style.display = 'none';
      els.dashboardView.style.display = 'block';
      if (els.btnLogout) els.btnLogout.style.display = 'inline-flex';
      loadDashboardData();
      startAutoRefresh();
    } else {
      stopAutoRefresh();
      els.dashboardView.style.display = 'none';
      els.loginView.style.display = 'flex';
      if (els.btnLogout) els.btnLogout.style.display = 'none';
      if (els.passwordInput) els.passwordInput.value = '';
      hideLoginError();
    }
  }

  function showLoginError(msg) {
    if (!els.loginError || !els.loginErrorText) return;
    els.loginErrorText.textContent = msg || 'Login failed. Please check credentials.';
    els.loginError.classList.add('show');
  }

  function hideLoginError() {
    if (els.loginError) {
      els.loginError.classList.remove('show');
    }
  }

  async function loadDashboardData(isManual = false) {
    if (state.isUpdating) return;
    state.isUpdating = true;

    if (isManual && els.btnManualRefresh) {
      els.btnManualRefresh.classList.add('spinning');
    }

    try {
      const [vehicles, bookings] = await Promise.all([
        window.API.getAdminVehicles(),
        window.API.getAdminBookings()
      ]);

      state.vehicles = Array.isArray(vehicles) ? vehicles : [];
      state.bookings = Array.isArray(bookings) ? bookings : [];

      updateStats();
      renderVehiclesTable();
      renderBookingsTable();

      if (isManual) {
        showToast('Dashboard data refreshed', 'success');
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
      const errorMsg = err.message || '';
      if (errorMsg.includes('401') || errorMsg.toLowerCase().includes('log in') || errorMsg.toLowerCase().includes('unauthorized')) {
        showToast('Session expired. Please log in again.', 'error');
        if (window.API && typeof window.API.logout === 'function') {
          window.API.logout();
        }
        updateView();
      } else {
        if (isManual) {
          showToast(`Failed to refresh: ${errorMsg}`, 'error');
        }
      }
    } finally {
      state.isUpdating = false;
      if (els.btnManualRefresh) {
        els.btnManualRefresh.classList.remove('spinning');
      }
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    state.refreshTimer = setInterval(() => {
      loadDashboardData(false);
    }, 10000);
  }

  function stopAutoRefresh() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
  }

  function updateStats() {
    const totalVehicles = state.vehicles.length;
    const availableVehicles = state.vehicles.filter(v => v.availability === true || v.availability === 'true').length;
    const totalBookings = state.bookings.length;
    const pendingBookings = state.bookings.filter(b => (b.status || '').toLowerCase() === 'pending').length;

    if (els.statTotalVehicles) els.statTotalVehicles.textContent = totalVehicles;
    if (els.statAvailableVehicles) els.statAvailableVehicles.textContent = availableVehicles;
    if (els.statTotalBookings) els.statTotalBookings.textContent = totalBookings;
    if (els.statPendingBookings) els.statPendingBookings.textContent = pendingBookings;

    if (els.tabBadgeVehicles) els.tabBadgeVehicles.textContent = totalVehicles;
    if (els.tabBadgeBookings) els.tabBadgeBookings.textContent = totalBookings;
  }

  function renderVehiclesTable() {
    if (!els.vehiclesTableBody) return;

    const query = (state.searchQuery || '').trim().toLowerCase();
    const filtered = state.vehicles.filter(v => {
      if (!query) return true;
      const searchSpace = `${v.id} ${v.vehicleName || ''} ${v.brand || ''} ${v.type || ''} ${v.ownerName || ''} ${v.phone || ''} ${v.location || ''} ${v.vehicleNumber || ''}`.toLowerCase();
      return searchSpace.includes(query);
    });

    if (filtered.length === 0) {
      els.vehiclesTableBody.innerHTML = `
        <tr>
          <td colspan="11" style="padding: 3.5rem 1.5rem; text-align: center; color: #64748b;">
            <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🚗</div>
            <div style="font-weight: 600; font-size: 1.1rem; color: #1e293b;">${state.vehicles.length === 0 ? 'No vehicles listed yet' : 'No matching vehicles found'}</div>
            <div style="font-size: 0.85rem; color: #94a3b8; margin-top: 0.25rem;">Vehicles listed by owners or administrators will appear here.</div>
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    filtered.forEach(v => {
      const isAvail = (v.availability === true || v.availability === 'true');
      const availBadge = isAvail
        ? `<span class="badge-status badge-available">Available</span>`
        : `<span class="badge-status badge-unavailable">Unavailable</span>`;
      
      const toggleBtnText = isAvail ? 'Mark Unavailable' : 'Mark Available';

      let thumbHtml = '';
      if (v.image && (v.image.startsWith('http') || v.image.startsWith('/uploads') || v.image.startsWith('data:'))) {
        thumbHtml = `<img src="${escapeHtml(v.image)}" alt="${escapeHtml(v.vehicleName)}" class="vehicle-thumb-box">`;
      } else {
        thumbHtml = `<div class="vehicle-thumb-box">🚗</div>`;
      }

      html += `
        <tr data-vehicle-id="${escapeHtml(v.id)}">
          <td style="font-weight: 600; color: #64748b;">#${escapeHtml(v.id)}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              ${thumbHtml}
              <div>
                <strong style="display: block; color: #1e293b;">${escapeHtml(v.vehicleName || 'Untitled')}</strong>
                ${v.vehicleNumber ? `<small style="color: #94a3b8; font-size: 0.75rem;">${escapeHtml(v.vehicleNumber)}</small>` : ''}
              </div>
            </div>
          </td>
          <td>${escapeHtml(v.brand || '—')}</td>
          <td><span class="badge-type-pill">${escapeHtml(v.type || 'Vehicle')}</span></td>
          <td><strong>${escapeHtml(v.ownerName || '—')}</strong></td>
          <td>
            ${v.phone ? `<a href="tel:${escapeHtml(v.phone)}" style="font-family: monospace; color: #1e293b;">${escapeHtml(v.phone)}</a>` : '—'}
          </td>
          <td>${escapeHtml(v.location || '—')}</td>
          <td><strong>${formatCurrency(v.priceHour)}</strong></td>
          <td><strong>${formatCurrency(v.priceDay)}</strong></td>
          <td>${availBadge}</td>
          <td style="text-align: right;">
            <div class="table-actions-group">
              <button type="button" class="btn-table-action toggle-avail" data-action="toggle-vehicle" data-id="${escapeHtml(v.id)}" title="${toggleBtnText}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="1" y="5" width="22" height="14" rx="7" ry="7"></rect>
                  <circle cx="${isAvail ? '16' : '8'}" cy="12" r="3"></circle>
                </svg>
                <span>${isAvail ? 'Disable' : 'Enable'}</span>
              </button>

              <button type="button" class="btn-table-action edit-price" data-action="edit-price" data-id="${escapeHtml(v.id)}" title="Edit price and availability">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>Edit Price</span>
              </button>

              <button type="button" class="btn-table-action delete-item" data-action="delete-vehicle" data-id="${escapeHtml(v.id)}" title="Delete vehicle">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>Delete</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    els.vehiclesTableBody.innerHTML = html;
  }

  function renderBookingsTable() {
    if (!els.bookingsTableBody) return;

    const query = (state.searchQuery || '').trim().toLowerCase();
    const filtered = state.bookings.filter(b => {
      if (!query) return true;
      const searchSpace = `${b.id} ${b.vehicleName || ''} ${b.customerName || ''} ${b.phone || ''} ${b.pickup || ''} ${b.status || ''}`.toLowerCase();
      return searchSpace.includes(query);
    });

    if (filtered.length === 0) {
      els.bookingsTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="padding: 3.5rem 1.5rem; text-align: center; color: #64748b;">
            <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">📋</div>
            <div style="font-weight: 600; font-size: 1.1rem; color: #1e293b;">${state.bookings.length === 0 ? 'No bookings recorded yet' : 'No matching bookings found'}</div>
            <div style="font-size: 0.85rem; color: #94a3b8; margin-top: 0.25rem;">Customer bookings will appear here in real-time.</div>
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    filtered.forEach(b => {
      const status = b.status || 'Pending';
      const badgeClass = getStatusBadgeClass(status);

      const pickupLocation = escapeHtml(b.pickup || '—');
      const dropLocation = b.drop ? `<br><small style="color: #94a3b8;">Drop: ${escapeHtml(b.drop)}</small>` : '';

      html += `
        <tr data-booking-id="${escapeHtml(b.id)}">
          <td style="font-weight: 600; color: #64748b;">#${escapeHtml(b.id)}</td>
          <td>
            <strong style="color: #1e293b;">${escapeHtml(b.vehicleName || 'Vehicle')}</strong>
          </td>
          <td><strong>${escapeHtml(b.customerName || '—')}</strong></td>
          <td>
            ${b.phone ? `<a href="tel:${escapeHtml(b.phone)}" style="font-family: monospace; color: #1e293b;">${escapeHtml(b.phone)}</a>` : '—'}
          </td>
          <td>
            <div>${pickupLocation}${dropLocation}</div>
          </td>
          <td><strong>${escapeHtml(b.duration || 1)} hrs</strong></td>
          <td><strong style="color: #2563eb;">${formatCurrency(b.totalAmount)}</strong></td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="badge-status ${badgeClass}">${escapeHtml(status)}</span>
              <select class="booking-status-select" data-action="update-booking-status" data-id="${escapeHtml(b.id)}" title="Update status">
                <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Accepted" ${status === 'Accepted' ? 'selected' : ''}>Accepted</option>
                <option value="Rejected" ${status === 'Rejected' ? 'selected' : ''}>Rejected</option>
                <option value="Completed" ${status === 'Completed' ? 'selected' : ''}>Completed</option>
              </select>
            </div>
          </td>
          <td style="text-align: right;">
            <div class="table-actions-group">
              <button type="button" class="btn-table-action delete-item" data-action="delete-booking" data-id="${escapeHtml(b.id)}" title="Delete booking">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>Delete</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    els.bookingsTableBody.innerHTML = html;
  }

  async function handleToggleVehicle(id) {
    const vehicle = state.vehicles.find(v => String(v.id) === String(id));
    if (!vehicle) return;

    const currentAvail = (vehicle.availability === true || vehicle.availability === 'true');
    const newAvail = !currentAvail;

    try {
      await window.API.updateVehicle(id, {
        priceHour: vehicle.priceHour,
        priceDay: vehicle.priceDay,
        availability: newAvail
      });

      vehicle.availability = newAvail;
      updateStats();
      renderVehiclesTable();
      showToast(`Vehicle is now ${newAvail ? 'Available' : 'Unavailable'}`, 'success');
    } catch (err) {
      console.error('Failed to toggle vehicle availability:', err);
      showToast(`Error: ${err.message || 'Failed to update availability'}`, 'error');
    }
  }

  function handleOpenEditPrice(id) {
    const vehicle = state.vehicles.find(v => String(v.id) === String(id));
    if (!vehicle) return;

    els.editVehicleId.value = vehicle.id;
    els.editVehicleNameLabel.textContent = `${vehicle.vehicleName} (${vehicle.brand || ''})`;
    els.editPriceHour.value = vehicle.priceHour || 0;
    els.editPriceDay.value = vehicle.priceDay || 0;
    els.editVehicleAvailability.checked = (vehicle.availability === true || vehicle.availability === 'true');

    openModal('edit-price-modal');
  }

  async function handleSavePriceSubmit(e) {
    e.preventDefault();
    const id = els.editVehicleId.value;
    const priceHour = Number(els.editPriceHour.value);
    const priceDay = Number(els.editPriceDay.value);
    const availability = els.editVehicleAvailability.checked;

    if (isNaN(priceHour) || priceHour < 0) {
      showToast('Hourly price must be 0 or more', 'error');
      return;
    }
    if (isNaN(priceDay) || priceDay < 0) {
      showToast('Daily price must be 0 or more', 'error');
      return;
    }

    els.btnSavePrice.disabled = true;
    els.btnSavePrice.textContent = 'Saving...';

    try {
      await window.API.updateVehicle(id, {
        priceHour,
        priceDay,
        availability
      });

      const vehicle = state.vehicles.find(v => String(v.id) === String(id));
      if (vehicle) {
        vehicle.priceHour = priceHour;
        vehicle.priceDay = priceDay;
        vehicle.availability = availability;
      }

      updateStats();
      renderVehiclesTable();
      closeModal('edit-price-modal');
      showToast('Vehicle prices updated successfully', 'success');
    } catch (err) {
      console.error('Failed to update vehicle prices:', err);
      showToast(`Error: ${err.message || 'Failed to save changes'}`, 'error');
    } finally {
      els.btnSavePrice.disabled = false;
      els.btnSavePrice.textContent = 'Save Changes';
    }
  }

  async function handleUpdateBookingStatus(id, newStatus) {
    try {
      await window.API.updateBookingStatus(id, newStatus);
      const booking = state.bookings.find(b => String(b.id) === String(id));
      if (booking) {
        booking.status = newStatus;
      }
      updateStats();
      renderBookingsTable();
      showToast(`Booking #${id} status changed to ${newStatus}`, 'success');
    } catch (err) {
      console.error('Failed to update booking status:', err);
      showToast(`Error: ${err.message || 'Failed to update status'}`, 'error');
      renderBookingsTable();
    }
  }

  function promptDeleteVehicle(id) {
    const vehicle = state.vehicles.find(v => String(v.id) === String(id));
    const name = vehicle ? vehicle.vehicleName : `Vehicle #${id}`;
    state.pendingDelete = { type: 'vehicle', id, name };

    els.deleteModalMsg.innerHTML = `Are you sure you want to permanently delete <strong>${escapeHtml(name)}</strong>? This will remove the vehicle from listings.`;
    openModal('confirm-delete-modal');
  }

  function promptDeleteBooking(id) {
    const booking = state.bookings.find(b => String(b.id) === String(id));
    const name = booking ? `Booking #${id} (${booking.customerName})` : `Booking #${id}`;
    state.pendingDelete = { type: 'booking', id, name };

    els.deleteModalMsg.innerHTML = `Are you sure you want to delete <strong>${escapeHtml(name)}</strong>?`;
    openModal('confirm-delete-modal');
  }

  async function handleConfirmDelete() {
    if (!state.pendingDelete) return;

    const { type, id, name } = state.pendingDelete;
    els.btnConfirmDelete.disabled = true;
    els.btnConfirmDelete.textContent = 'Deleting...';

    try {
      if (type === 'vehicle') {
        await window.API.deleteVehicle(id);
        state.vehicles = state.vehicles.filter(v => String(v.id) !== String(id));
        updateStats();
        renderVehiclesTable();
        showToast(`${name} was deleted successfully`, 'success');
      } else if (type === 'booking') {
        await window.API.deleteBooking(id);
        state.bookings = state.bookings.filter(b => String(b.id) !== String(id));
        updateStats();
        renderBookingsTable();
        showToast(`${name} was deleted successfully`, 'success');
      }
      closeModal('confirm-delete-modal');
    } catch (err) {
      console.error(`Failed to delete ${type}:`, err);
      showToast(`Delete failed: ${err.message || 'Server error'}`, 'error');
    } finally {
      els.btnConfirmDelete.disabled = false;
      els.btnConfirmDelete.textContent = 'Delete';
      state.pendingDelete = null;
    }
  }

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  function initEventListeners() {
    if (els.hamburgerBtn && els.navLinks) {
      els.hamburgerBtn.addEventListener('click', () => {
        els.hamburgerBtn.classList.toggle('active');
        els.navLinks.classList.toggle('active');
        els.hamburgerBtn.setAttribute('aria-expanded', els.hamburgerBtn.classList.contains('active'));
      });
    }

    if (els.loginForm) {
      els.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideLoginError();

        const username = (els.usernameInput.value || '').trim();
        const password = els.passwordInput.value || '';

        if (!username || !password) {
          showLoginError('Please enter both username and password');
          return;
        }

        els.btnLoginSubmit.disabled = true;
        els.btnLoginSubmit.innerHTML = `<span>Signing in...</span>`;

        try {
          await window.API.login(username, password);
          showToast('Logged in successfully', 'success');
          updateView();
        } catch (err) {
          console.error('Login error:', err);
          showLoginError(err.message || 'Invalid username or password');
        } finally {
          els.btnLoginSubmit.disabled = false;
          els.btnLoginSubmit.innerHTML = `
            <span>Sign In</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          `;
        }
      });
    }

    if (els.btnLogout) {
      els.btnLogout.addEventListener('click', () => {
        if (window.API && typeof window.API.logout === 'function') {
          window.API.logout();
        }
        showToast('Logged out successfully', 'info');
        updateView();
      });
    }

    function switchTab(tabName) {
      state.activeTab = tabName;
      if (tabName === 'vehicles') {
        els.tabBtnVehicles.classList.add('active');
        els.tabBtnBookings.classList.remove('active');
        els.paneVehicles.classList.add('active');
        els.paneBookings.classList.remove('active');
      } else {
        els.tabBtnBookings.classList.add('active');
        els.tabBtnVehicles.classList.remove('active');
        els.paneBookings.classList.add('active');
        els.paneVehicles.classList.remove('active');
      }
    }

    if (els.tabBtnVehicles) {
      els.tabBtnVehicles.addEventListener('click', () => switchTab('vehicles'));
    }
    if (els.tabBtnBookings) {
      els.tabBtnBookings.addEventListener('click', () => switchTab('bookings'));
    }

    if (els.tableSearchInput) {
      els.tableSearchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderVehiclesTable();
        renderBookingsTable();
      });
    }

    if (els.btnManualRefresh) {
      els.btnManualRefresh.addEventListener('click', () => {
        loadDashboardData(true);
      });
    }

    if (els.vehiclesTableBody) {
      els.vehiclesTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');

        if (action === 'toggle-vehicle') {
          handleToggleVehicle(id);
        } else if (action === 'edit-price') {
          handleOpenEditPrice(id);
        } else if (action === 'delete-vehicle') {
          promptDeleteVehicle(id);
        }
      });
    }

    if (els.bookingsTableBody) {
      els.bookingsTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="delete-booking"]');
        if (btn) {
          const id = btn.getAttribute('data-id');
          promptDeleteBooking(id);
        }
      });

      els.bookingsTableBody.addEventListener('change', (e) => {
        const select = e.target.closest('[data-action="update-booking-status"]');
        if (select) {
          const id = select.getAttribute('data-id');
          const newStatus = select.value;
          handleUpdateBookingStatus(id, newStatus);
        }
      });
    }

    if (els.editPriceForm) {
      els.editPriceForm.addEventListener('submit', handleSavePriceSubmit);
    }

    if (els.btnConfirmDelete) {
      els.btnConfirmDelete.addEventListener('click', handleConfirmDelete);
    }

    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        closeModal(modalId);
      });
    });

    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('admin-modal-overlay')) {
        e.target.classList.remove('active');
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.admin-modal-overlay.active').forEach(m => m.classList.remove('active'));
      }
    });
  }

  function init() {
    // CSP-safe image fallback (inline onerror attributes are blocked)
    document.addEventListener('error', function (e) {
      const t = e.target;
      if (t && t.tagName === 'IMG' && t.classList.contains('vehicle-thumb-box')) {
        const d = document.createElement('div');
        d.className = 'vehicle-thumb-box';
        d.textContent = '🚗';
        t.replaceWith(d);
      }
    }, true);
    initEventListeners();
    updateView();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();