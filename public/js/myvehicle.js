/**
 * Rantcle - List Your Vehicle (myvehicle.js)
 * Handles client-side form validation, base64 image encoding,
 * live preview, mobile menu toggling, and API vehicle submission.
 */
(function () {
  'use strict';

  // Allowed configuration constants (matching server.js)
  const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const VALID_TYPES = ['Bike', 'Scooter', 'Car', 'Electric Scooter', 'Electric Bike', 'Cycle'];
  const VALID_FUELS = ['Petrol', 'Diesel', 'Electric', 'Manual (Cycle)'];
  const VALID_TRANSMISSIONS = ['Manual', 'Automatic', 'N/A'];

  // State
  let currentImageDataUrl = '';

  // DOM Elements (retrieved on DOMContentLoaded)
  let form;
  let ownerNameInput;
  let phoneInput;
  let vehicleNameInput;
  let brandInput;
  let typeSelect;
  let vehicleNumberInput;
  let locationInput;
  let priceHourInput;
  let priceDayInput;
  let fuelSelect;
  let transmissionSelect;
  let descriptionInput;
  let descCountSpan;
  let imageInput;
  let dropZone;
  let uploadPlaceholder;
  let previewWrapper;
  let imagePreview;
  let previewName;
  let previewSize;
  let removePhotoBtn;
  let submitBtn;
  let submitBtnText;
  let submitBtnSpinner;
  let formAlert;
  let toastContainer;
  let hamburger;
  let navLinks;

  /**
   * Safe HTML string escaper
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
   * Display toast notification
   * @param {string} title
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} [type='info']
   * @param {number} [duration=4500]
   */
  function showToast(title, message, type = 'info', duration = 4500) {
    if (!toastContainer) {
      toastContainer = document.getElementById('toastContainer');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container';
        toastContainer.setAttribute('aria-live', 'polite');
        document.body.appendChild(toastContainer);
      }
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconMap = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    toast.innerHTML = `
      <div class="toast-icon">${iconMap[type] || 'ℹ'}</div>
      <div class="toast-content">
        <div class="toast-title">${escapeHtml(title)}</div>
        <div class="toast-message">${escapeHtml(message)}</div>
      </div>
      <button class="toast-close" type="button" aria-label="Close notification">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    let timer = null;

    const dismiss = () => {
      if (timer) clearTimeout(timer);
      toast.style.animation = 'toastFadeOut 0.25s ease forwards';
      setTimeout(() => {
        if (toast.parentElement) {
          toast.parentElement.removeChild(toast);
        }
      }, 250);
    };

    closeBtn.addEventListener('click', dismiss);
    toastContainer.appendChild(toast);

    if (duration > 0) {
      timer = setTimeout(dismiss, duration);
    }
  }

  /**
   * Show inline alert inside the form card
   */
  function showAlert(type, title, message, actionsHtml = '') {
    if (!formAlert) return;
    formAlert.className = `form-alert alert-${type}`;
    formAlert.innerHTML = `
      <div class="alert-icon">${type === 'success' ? '✓' : '✕'}</div>
      <div class="alert-body">
        <h4 class="alert-title">${escapeHtml(title)}</h4>
        <div class="alert-message">${message}</div>
        ${actionsHtml ? `<div class="alert-actions">${actionsHtml}</div>` : ''}
      </div>
    `;
    formAlert.style.display = 'flex';
    formAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Hide the inline alert
   */
  function hideAlert() {
    if (!formAlert) return;
    formAlert.style.display = 'none';
    formAlert.innerHTML = '';
  }

  /**
   * Set error on a specific form field
   */
  function setFieldError(inputEl, errorMsg) {
    if (!inputEl) return;
    inputEl.classList.add('is-invalid');
    const group = inputEl.closest('.form-group');
    if (group) {
      let errSpan = group.querySelector('.form-error');
      if (!errSpan) {
        errSpan = document.createElement('span');
        errSpan.className = 'form-error';
        group.appendChild(errSpan);
      }
      errSpan.textContent = errorMsg;
    }
  }

  /**
   * Clear error from a specific form field
   */
  function clearFieldError(inputEl) {
    if (!inputEl) return;
    inputEl.classList.remove('is-invalid');
    const group = inputEl.closest('.form-group');
    if (group) {
      const errSpan = group.querySelector('.form-error');
      if (errSpan) {
        errSpan.remove();
      }
    }
  }

  /**
   * Clear all field errors
   */
  function clearAllErrors() {
    const invalids = form.querySelectorAll('.is-invalid');
    invalids.forEach((el) => el.classList.remove('is-invalid'));
    const errSpans = form.querySelectorAll('.form-error');
    errSpans.forEach((el) => el.remove());
    hideAlert();
  }

  /**
   * Format file size to human-readable string
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Process selected image file with validation and FileReader
   */
  function handleImageFile(file) {
    if (!file) return;

    // Validate type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showToast('Invalid File Type', 'Please upload a JPEG, PNG, or WebP image.', 'error');
      resetImageUpload();
      return;
    }

    // Validate size (max 2MB)
    if (file.size > MAX_IMAGE_BYTES) {
      showToast('Image Too Large', `Image size is ${formatBytes(file.size)}. Max allowed is 2 MB.`, 'error');
      resetImageUpload();
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      currentImageDataUrl = e.target.result;
      if (imagePreview) {
        imagePreview.src = currentImageDataUrl;
      }
      if (previewName) {
        previewName.textContent = file.name;
      }
      if (previewSize) {
        previewSize.textContent = formatBytes(file.size);
      }
      if (uploadPlaceholder) {
        uploadPlaceholder.style.display = 'none';
      }
      if (previewWrapper) {
        previewWrapper.style.display = 'block';
      }
      clearFieldError(dropZone);
    };

    reader.onerror = function () {
      showToast('Read Error', 'Failed to read image file. Please try another image.', 'error');
      resetImageUpload();
    };

    reader.readAsDataURL(file);
  }

  /**
   * Reset the image upload input and preview
   */
  function resetImageUpload() {
    currentImageDataUrl = '';
    if (imageInput) imageInput.value = '';
    if (imagePreview) imagePreview.src = '';
    if (previewName) previewName.textContent = '';
    if (previewSize) previewSize.textContent = '';
    if (previewWrapper) previewWrapper.style.display = 'none';
    if (uploadPlaceholder) uploadPlaceholder.style.display = 'flex';
  }

  /**
   * Smart auto-adjustment based on vehicle type
   */
  function onVehicleTypeChange() {
    const selectedType = typeSelect.value;
    if (!selectedType) return;

    if (selectedType === 'Cycle') {
      if (fuelSelect) fuelSelect.value = 'Manual (Cycle)';
      if (transmissionSelect) transmissionSelect.value = 'N/A';
    } else if (selectedType === 'Electric Scooter' || selectedType === 'Electric Bike') {
      if (fuelSelect) fuelSelect.value = 'Electric';
      if (transmissionSelect) transmissionSelect.value = 'Automatic';
    } else if (selectedType === 'Scooter') {
      if (fuelSelect && fuelSelect.value === 'Manual (Cycle)') fuelSelect.value = 'Petrol';
      if (transmissionSelect) transmissionSelect.value = 'Automatic';
    } else if (selectedType === 'Bike') {
      if (fuelSelect && fuelSelect.value === 'Manual (Cycle)') fuelSelect.value = 'Petrol';
      if (transmissionSelect && transmissionSelect.value === 'N/A') transmissionSelect.value = 'Manual';
    } else if (selectedType === 'Car') {
      if (fuelSelect && fuelSelect.value === 'Manual (Cycle)') fuelSelect.value = 'Petrol';
      if (transmissionSelect && transmissionSelect.value === 'N/A') transmissionSelect.value = 'Manual';
    }
  }

  /**
   * Auto-suggest daily price based on hourly price if empty
   */
  function onPriceHourBlur() {
    const hr = parseFloat(priceHourInput.value);
    if (!isNaN(hr) && hr > 0) {
      if (!priceDayInput.value || parseFloat(priceDayInput.value) === 0) {
        // Suggest ~8x hourly price for day rate as a standard rental discount
        priceDayInput.value = Math.round(hr * 8);
      }
    }
  }

  /**
   * Client-side validation of all form inputs
   * Returns { isValid, data, firstErrorField }
   */
  function validateForm() {
    clearAllErrors();
    let isValid = true;
    let firstErrorField = null;

    const setError = (el, msg) => {
      setFieldError(el, msg);
      if (!firstErrorField) firstErrorField = el;
      isValid = false;
    };

    // 1. Owner Name: required, max 100
    const ownerName = (ownerNameInput.value || '').trim();
    if (!ownerName) {
      setError(ownerNameInput, 'Owner name is required');
    } else if (ownerName.length > 100) {
      setError(ownerNameInput, 'Owner name must be at most 100 characters');
    }

    // 2. Phone: required, 7-15 digits
    const rawPhone = (phoneInput.value || '').trim();
    const cleanPhone = rawPhone.replace(/[\s-]/g, '');
    if (!cleanPhone) {
      setError(phoneInput, 'Phone number is required');
    } else if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
      setError(phoneInput, 'Phone number must be between 7 and 15 digits');
    }

    // 3. Vehicle Name: required, max 100
    const vehicleName = (vehicleNameInput.value || '').trim();
    if (!vehicleName) {
      setError(vehicleNameInput, 'Vehicle name is required');
    } else if (vehicleName.length > 100) {
      setError(vehicleNameInput, 'Vehicle name must be at most 100 characters');
    }

    // 4. Brand: required, max 60
    const brand = (brandInput.value || '').trim();
    if (!brand) {
      setError(brandInput, 'Brand is required');
    } else if (brand.length > 60) {
      setError(brandInput, 'Brand must be at most 60 characters');
    }

    // 5. Vehicle Type: select, required, must be valid
    const type = typeSelect.value;
    if (!type || !VALID_TYPES.includes(type)) {
      setError(typeSelect, 'Please select a valid vehicle type');
    }

    // 6. Vehicle Number: optional, max 20
    const rawVehicleNum = (vehicleNumberInput.value || '').trim();
    const vehicleNumber = rawVehicleNum.replace(/\s+/g, '').toUpperCase();
    if (vehicleNumber && vehicleNumber.length > 20) {
      setError(vehicleNumberInput, 'Vehicle number must be at most 20 characters');
    }

    // 7. Location: required, max 120
    const location = (locationInput.value || '').trim();
    if (!location) {
      setError(locationInput, 'Location is required');
    } else if (location.length > 120) {
      setError(locationInput, 'Location must be at most 120 characters');
    }

    // 8. Price per Hour: required, number >= 0
    const rawPriceHour = priceHourInput.value;
    const priceHour = Number(rawPriceHour);
    if (rawPriceHour === '' || isNaN(priceHour) || priceHour < 0 || priceHour > 10000000) {
      setError(priceHourInput, 'Price per hour must be a valid number (0 or more)');
    }

    // 9. Price per Day: required, number >= 0
    const rawPriceDay = priceDayInput.value;
    const priceDay = Number(rawPriceDay);
    if (rawPriceDay === '' || isNaN(priceDay) || priceDay < 0 || priceDay > 10000000) {
      setError(priceDayInput, 'Price per day must be a valid number (0 or more)');
    }

    // 10. Fuel Type: select, required/default Petrol
    const fuel = fuelSelect.value || 'Petrol';
    if (!VALID_FUELS.includes(fuel)) {
      setError(fuelSelect, 'Please select a valid fuel type');
    }

    // 11. Transmission: select, required/default Manual
    const transmission = transmissionSelect.value || 'Manual';
    if (!VALID_TRANSMISSIONS.includes(transmission)) {
      setError(transmissionSelect, 'Please select a valid transmission');
    }

    // 12. Description: optional, max 1000
    const description = (descriptionInput.value || '').trim();
    if (description.length > 1000) {
      setError(descriptionInput, 'Description must be at most 1000 characters');
    }

    // 13. Image: optional, but if present must be under 2MB base64
    let image = null;
    if (currentImageDataUrl) {
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(currentImageDataUrl)) {
        setError(dropZone, 'Selected image format is invalid. Use JPEG, PNG, or WebP.');
      } else {
        image = currentImageDataUrl;
      }
    }

    const data = {
      ownerName,
      phone: cleanPhone,
      vehicleName,
      brand,
      type,
      location,
      priceHour: Math.round(priceHour * 100) / 100,
      priceDay: Math.round(priceDay * 100) / 100,
      fuel,
      transmission,
      description: description || undefined,
      image: image || undefined,
      vehicleNumber: vehicleNumber || undefined
    };

    return { isValid, data, firstErrorField };
  }

  /**
   * Set form submission loading state
   */
  function setLoading(isLoading) {
    if (!submitBtn) return;
    submitBtn.disabled = isLoading;
    if (isLoading) {
      if (submitBtnSpinner) submitBtnSpinner.style.display = 'inline-block';
      if (submitBtnText) submitBtnText.textContent = 'Listing Vehicle...';
    } else {
      if (submitBtnSpinner) submitBtnSpinner.style.display = 'none';
      if (submitBtnText) submitBtnText.textContent = 'List Vehicle';
    }
  }

  /**
   * Handle form submission
   */
  async function onSubmit(e) {
    e.preventDefault();

    if (typeof API === 'undefined' || typeof API.addVehicle !== 'function') {
      showToast('Error', 'API client not loaded. Please refresh the page.', 'error');
      return;
    }

    const { isValid, data, firstErrorField } = validateForm();

    if (!isValid) {
      showToast('Validation Error', 'Please check highlighted fields and try again.', 'error');
      if (firstErrorField) {
        firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof firstErrorField.focus === 'function') {
          firstErrorField.focus();
        }
      }
      return;
    }

    setLoading(true);
    hideAlert();

    try {
      const result = await API.addVehicle(data);
      const vehicleTitle = result && result.vehicleName ? result.vehicleName : data.vehicleName;

      // Show success toast with vehicle name
      showToast(
        'Vehicle Listed!',
        `"${vehicleTitle}" is now live on Rantcle and ready for rent.`,
        'success',
        6000
      );

      // Show rich inline success message with navigation options
      const actionsHtml = `
        <a href="find.html" class="btn btn-primary btn-sm">Find Vehicles</a>
        <button type="button" id="listAnotherBtn" class="btn btn-outline btn-sm">List Another Vehicle</button>
      `;

      showAlert(
        'success',
        'Vehicle Listed Successfully!',
        `Your listing for <strong>${escapeHtml(vehicleTitle)}</strong> has been published. Renters can now discover and book it in <em>${escapeHtml(data.location)}</em>.`,
        actionsHtml
      );

      // Hook up "List Another Vehicle" button
      const listAnotherBtn = document.getElementById('listAnotherBtn');
      if (listAnotherBtn) {
        listAnotherBtn.addEventListener('click', () => {
          hideAlert();
          ownerNameInput.focus();
        });
      }

      // Clear the form
      form.reset();
      resetImageUpload();
      if (descCountSpan) descCountSpan.textContent = '0';
      if (fuelSelect) fuelSelect.value = 'Petrol';
      if (transmissionSelect) transmissionSelect.value = 'Manual';

    } catch (err) {
      console.error('Vehicle listing failed:', err);
      const errMsg = (err && err.message) || 'Failed to list vehicle. Please try again.';

      showToast('Listing Failed', errMsg, 'error', 6000);
      showAlert('danger', 'Unable to List Vehicle', escapeHtml(errMsg));

    } finally {
      setLoading(false);
    }
  }

  /**
   * Initialize DOM event listeners
   */
  function init() {
    form = document.getElementById('vehicleListingForm');
    if (!form) return;

    ownerNameInput = document.getElementById('ownerName');
    phoneInput = document.getElementById('phone');
    vehicleNameInput = document.getElementById('vehicleName');
    brandInput = document.getElementById('brand');
    typeSelect = document.getElementById('type');
    vehicleNumberInput = document.getElementById('vehicleNumber');
    locationInput = document.getElementById('location');
    priceHourInput = document.getElementById('priceHour');
    priceDayInput = document.getElementById('priceDay');
    fuelSelect = document.getElementById('fuel');
    transmissionSelect = document.getElementById('transmission');
    descriptionInput = document.getElementById('description');
    descCountSpan = document.getElementById('descCount');
    imageInput = document.getElementById('imageInput');
    dropZone = document.getElementById('dropZone');
    uploadPlaceholder = document.getElementById('uploadPlaceholder');
    previewWrapper = document.getElementById('previewWrapper');
    imagePreview = document.getElementById('imagePreview');
    previewName = document.getElementById('previewName');
    previewSize = document.getElementById('previewSize');
    removePhotoBtn = document.getElementById('removePhotoBtn');
    submitBtn = document.getElementById('submitBtn');
    submitBtnText = document.getElementById('submitBtnText');
    submitBtnSpinner = document.getElementById('submitBtnSpinner');
    formAlert = document.getElementById('formAlert');
    toastContainer = document.getElementById('toastContainer');
    hamburger = document.getElementById('hamburger');
    navLinks = document.getElementById('navLinks');

    // 1. Mobile Menu Toggle
    if (hamburger && navLinks) {
      hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = navLinks.classList.toggle('active');
        hamburger.classList.toggle('active', isOpen);
        hamburger.setAttribute('aria-expanded', String(isOpen));
      });

      // Close mobile menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!hamburger.contains(e.target) && !navLinks.contains(e.target) && navLinks.classList.contains('active')) {
          navLinks.classList.remove('active');
          hamburger.classList.remove('active');
          hamburger.setAttribute('aria-expanded', 'false');
        }
      });

      // Close mobile menu on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navLinks.classList.contains('active')) {
          navLinks.classList.remove('active');
          hamburger.classList.remove('active');
          hamburger.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // 2. Form submission
    form.addEventListener('submit', onSubmit);

    // 3. Image file input and drag-and-drop
    if (imageInput) {
      imageInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          handleImageFile(e.target.files[0]);
        }
      });
    }

    if (dropZone) {
      // Click on dropZone triggers file input (unless clicking removePhotoBtn)
      dropZone.addEventListener('click', (e) => {
        if (removePhotoBtn && removePhotoBtn.contains(e.target)) return;
        if (imageInput) imageInput.click();
      });

      // Keyboard accessibility
      dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (imageInput) imageInput.click();
        }
      });

      // Drag and drop events
      ['dragenter', 'dragover'].forEach((eventName) => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.add('drag-over');
        });
      });

      ['dragleave', 'drop'].forEach((eventName) => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.remove('drag-over');
        });
      });

      dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length) {
          handleImageFile(dt.files[0]);
        }
      });
    }

    // 4. Remove photo button
    if (removePhotoBtn) {
      removePhotoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetImageUpload();
      });
    }

    // 5. Description character count
    if (descriptionInput && descCountSpan) {
      descriptionInput.addEventListener('input', () => {
        const count = descriptionInput.value.length;
        descCountSpan.textContent = count;
        if (count > 1000) {
          descCountSpan.style.color = 'var(--danger)';
        } else {
          descCountSpan.style.color = 'inherit';
        }
      });
    }

    // 6. Vehicle Type smart defaults
    if (typeSelect) {
      typeSelect.addEventListener('change', onVehicleTypeChange);
    }

    // 7. Auto-uppercase for vehicle registration number
    if (vehicleNumberInput) {
      vehicleNumberInput.addEventListener('input', () => {
        vehicleNumberInput.value = vehicleNumberInput.value.toUpperCase();
      });
    }

    // 8. Auto-suggest day price on hour price blur
    if (priceHourInput && priceDayInput) {
      priceHourInput.addEventListener('blur', onPriceHourBlur);
    }

    // 9. Clear validation error on field input
    const inputsToClear = [
      ownerNameInput,
      phoneInput,
      vehicleNameInput,
      brandInput,
      typeSelect,
      vehicleNumberInput,
      locationInput,
      priceHourInput,
      priceDayInput,
      fuelSelect,
      transmissionSelect,
      descriptionInput
    ];

    inputsToClear.forEach((input) => {
      if (!input) return;
      input.addEventListener('input', () => clearFieldError(input));
      input.addEventListener('change', () => clearFieldError(input));
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
