(function () {
  'use strict';

  var MAX_ITEMS = 12;
  var allVehicles = [];
  var activeType = '';
  var query = '';

  var $ = function (id) { return document.getElementById(id); };
  var loadingEl = $('loadingState');
  var errorEl = $('errorState');
  var errorMsgEl = $('errorMessage');
  var emptyEl = $('emptyState');
  var emptyTitleEl = $('emptyTitle');
  var emptyMsgEl = $('emptyMessage');
  var emptyCta = $('emptyCta');
  var listEl = $('vehicleList');
  var refreshBtn = $('refreshBtn');

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function icon(type) {
    switch (type) {
      case 'Car': return '🚗';
      case 'Scooter': case 'Electric Scooter': return '🛵';
      case 'Cycle': return '🚲';
      default: return '🏍️';
    }
  }

  function show(which) {
    loadingEl.classList.toggle('d-none', which !== 'loading');
    errorEl.classList.toggle('d-none', which !== 'error');
    emptyEl.classList.toggle('d-none', which !== 'empty');
    listEl.classList.toggle('d-none', which !== 'list');
  }

  function cardHtml(v) {
    var name = escapeHtml(v.vehicleName || 'Vehicle');
    var type = escapeHtml(v.type || 'Vehicle');
    var brand = escapeHtml(v.brand || '');
    var place = escapeHtml(v.location || 'Location on request');
    var price = Math.round(Number(v.priceHour) || 0);
    var avail = v.availability !== false;
    var img = v.image
      ? '<img src="' + escapeHtml(v.image) + '" alt="" loading="lazy">'
      : icon(v.type);
    return (
      '<li class="vcard" data-id="' + escapeHtml(v.id) + '" tabindex="0" role="link" aria-label="' + name + '">' +
        '<div class="vcard__img">' + img + '</div>' +
        '<div class="vcard__body">' +
          '<span class="vcard__type">' + type + '</span>' +
          '<h3 class="vcard__name">' + name + '</h3>' +
          '<p class="vcard__meta">' + (brand ? brand + ' · ' : '') + '📍 ' + place + '</p>' +
          '<div class="vcard__foot">' +
            '<span class="vcard__price">₹' + price + '<small>/hr</small></span>' +
            '<span class="badge ' + (avail ? 'badge--ok' : 'badge--bad') + '">' +
              (avail ? 'Available' : 'Booked') + '</span>' +
          '</div>' +
        '</div>' +
      '</li>'
    );
  }

  function render() {
    var q = query.trim().toLowerCase();
    var rows = allVehicles.filter(function (v) {
      if (activeType && v.type !== activeType) return false;
      if (!q) return true;
      return [v.vehicleName, v.brand, v.location, v.type]
        .join(' ').toLowerCase().indexOf(q) !== -1;
    });

    if (!allVehicles.length) {
      emptyTitleEl.textContent = 'No vehicles yet';
      emptyMsgEl.textContent = 'Be the first to list one.';
      emptyCta.classList.remove('d-none');
      show('empty');
      return;
    }
    if (!rows.length) {
      emptyTitleEl.textContent = 'No match';
      emptyMsgEl.textContent = 'Try another type or search word.';
      emptyCta.classList.add('d-none');
      show('empty');
      return;
    }

    listEl.innerHTML = rows.slice(0, MAX_ITEMS).map(cardHtml).join('');
    show('list');
  }

  function load() {
    show('loading');
    refreshBtn.classList.add('is-spinning');
    Promise.resolve()
      .then(function () {
        if (typeof API === 'undefined' || typeof API.getVehicles !== 'function') {
          throw new Error('Could not start the app. Please reload.');
        }
        return API.getVehicles();
      })
      .then(function (vehicles) {
        allVehicles = Array.isArray(vehicles) ? vehicles : [];
        render();
      })
      .catch(function (err) {
        console.error('Failed to load vehicles:', err);
        errorMsgEl.textContent = (err && err.message) || 'Check your connection and try again.';
        show('error');
      })
      .then(function () { refreshBtn.classList.remove('is-spinning'); });
  }

  function openFind() { window.location.href = 'find.html'; }

  function init() {
    // Photos that fail to load fall back to the vehicle emoji.
    document.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG' && t.closest('.vcard__img')) {
        var box = t.parentNode;
        var li = t.closest('.vcard');
        var v = allVehicles.filter(function (x) { return String(x.id) === li.getAttribute('data-id'); })[0];
        box.textContent = icon(v && v.type);
      }
    }, true);

    $('chips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      activeType = b.getAttribute('data-type') || '';
      Array.prototype.forEach.call(this.children, function (c) { c.classList.toggle('is-active', c === b); });
      render();
    });

    $('quickSearch').addEventListener('input', function () { query = this.value; render(); });
    $('retryBtn').addEventListener('click', load);
    refreshBtn.addEventListener('click', load);

    listEl.addEventListener('click', function (e) { if (e.target.closest('.vcard')) openFind(); });
    listEl.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.vcard')) { e.preventDefault(); openFind(); }
    });

    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();