// Food Hygiene Inspection Form - JavaScript
// Gloucester City Council

document.addEventListener('DOMContentLoaded', function() {
    initializeForm();
    initializeSignaturePads();
    initializeScoreCalculation();
    initializeRatingDisplay();
    initializeTemperatureReadings();
    initializeFormActions();
    initializeProgressBar();
    initializeModal();
});

// ---------- Toast Notifications (replaces alert/confirm) ----------

function showToast(message, type) {
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.textContent = message;
    container.appendChild(toast);
    // Announce to screen readers via the aria-live region
    var live = document.getElementById('liveStatus');
    if (live) live.textContent = message;
    setTimeout(function() {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3200);
}

// ---------- Progress Bar ----------

function initializeProgressBar() {
    var steps = document.querySelectorAll('.progress-step');
    steps.forEach(function(step) {
        step.addEventListener('click', function() {
            var sectionNum = this.getAttribute('data-section');
            var target = document.getElementById('section-' + sectionNum);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                target.querySelector('h2').focus({ preventScroll: true });
            }
        });
    });

    // Intersection observer to highlight active section
    var sections = document.querySelectorAll('.form-section[id^="section-"]');
    if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var id = entry.target.id;
                    var num = id.replace('section-', '');
                    setActiveStep(num);
                }
            });
        }, { rootMargin: '-80px 0px -60% 0px', threshold: 0 });
        sections.forEach(function(s) { observer.observe(s); });
    }
}

function setActiveStep(num) {
    document.querySelectorAll('.progress-step').forEach(function(step) {
        var stepNum = step.getAttribute('data-section');
        step.classList.toggle('active', stepNum === num);
    });
}

// ---------- Generate Reference Number ----------

function generateReferenceNumber() {
    var date = new Date();
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    var random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return 'GCC-FHI-' + year + month + day + '-' + random;
}

// ---------- Initialize Form ----------

function initializeForm() {
    // Set today's date as default
    var today = new Date().toISOString().split('T')[0];
    var inspectionDateInput = document.getElementById('inspectionDate');
    if (inspectionDateInput) {
        inspectionDateInput.value = today;
    }

    // Set current time
    var now = new Date();
    var hours = String(now.getHours()).padStart(2, '0');
    var minutes = String(now.getMinutes()).padStart(2, '0');
    var inspectionTimeInput = document.getElementById('inspectionTime');
    if (inspectionTimeInput) {
        inspectionTimeInput.value = hours + ':' + minutes;
    }

    // Generate reference number
    var refNumberInput = document.getElementById('referenceNumber');
    if (refNumberInput) {
        refNumberInput.value = generateReferenceNumber();
    }

    // Form submission handler
    var form = document.getElementById('foodInspectionForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
}

// ---------- Signature Pad Implementation ----------

function initializeSignaturePads() {
    var canvases = ['inspectorCanvas', 'businessCanvas'];

    canvases.forEach(function(canvasId) {
        var canvas = document.getElementById(canvasId);
        if (!canvas) return;

        var ctx = canvas.getContext('2d');
        var isDrawing = false;
        var lastX = 0;
        var lastY = 0;

        // Set canvas size
        function resizeCanvas() {
            var rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = rect.width - 26;
            canvas.height = 100;
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Mouse events
        canvas.addEventListener('mousedown', function(e) {
            isDrawing = true;
            var coords = getCoordinates(e, canvas);
            lastX = coords[0];
            lastY = coords[1];
        });

        canvas.addEventListener('mousemove', function(e) {
            if (!isDrawing) return;
            var coords = getCoordinates(e, canvas);
            draw(ctx, lastX, lastY, coords[0], coords[1]);
            lastX = coords[0];
            lastY = coords[1];
        });

        canvas.addEventListener('mouseup', function() { isDrawing = false; });
        canvas.addEventListener('mouseout', function() { isDrawing = false; });

        // Touch events
        canvas.addEventListener('touchstart', function(e) {
            e.preventDefault();
            isDrawing = true;
            var coords = getCoordinates(e.touches[0], canvas);
            lastX = coords[0];
            lastY = coords[1];
        });

        canvas.addEventListener('touchmove', function(e) {
            e.preventDefault();
            if (!isDrawing) return;
            var coords = getCoordinates(e.touches[0], canvas);
            draw(ctx, lastX, lastY, coords[0], coords[1]);
            lastX = coords[0];
            lastY = coords[1];
        });

        canvas.addEventListener('touchend', function() { isDrawing = false; });
    });

    // Clear signature buttons
    document.querySelectorAll('.btn-clear-sig').forEach(function(button) {
        button.addEventListener('click', function() {
            var canvasId = this.getAttribute('data-canvas');
            var canvas = document.getElementById(canvasId);
            if (canvas) {
                var ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                showToast('Signature cleared', 'info');
            }
        });
    });
}

function getCoordinates(event, canvas) {
    var rect = canvas.getBoundingClientRect();
    var x = (event.clientX || event.pageX) - rect.left;
    var y = (event.clientY || event.pageY) - rect.top;
    return [x, y];
}

function draw(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

// ---------- Score Calculation ----------

function initializeScoreCalculation() {
    var hygienicScore = document.getElementById('hygienicScore');
    var structureScore = document.getElementById('structureScore');
    var managementScore = document.getElementById('managementScore');

    var scoreInputs = [hygienicScore, structureScore, managementScore];

    scoreInputs.forEach(function(input) {
        if (input) {
            input.addEventListener('input', updateTotalScore);
        }
    });
}

function updateTotalScore() {
    var hygienicScore = parseInt(document.getElementById('hygienicScore').value) || 0;
    var structureScore = parseInt(document.getElementById('structureScore').value) || 0;
    var managementScore = parseInt(document.getElementById('managementScore').value) || 0;

    var total = hygienicScore + structureScore + managementScore;

    // Update display
    document.getElementById('displayHygienic').textContent = hygienicScore;
    document.getElementById('displayStructure').textContent = structureScore;
    document.getElementById('displayManagement').textContent = managementScore;
    document.getElementById('displayTotal').textContent = total;

    // Auto-suggest rating based on total score
    suggestRating(total);
}

function suggestRating(total) {
    // Based on FHRS scoring guidelines (lower is better)
    var suggestedRating;

    if (total <= 15) {
        suggestedRating = 5;
    } else if (total <= 20) {
        suggestedRating = 4;
    } else if (total <= 30) {
        suggestedRating = 3;
    } else if (total <= 40) {
        suggestedRating = 2;
    } else if (total <= 50) {
        suggestedRating = 1;
    } else {
        suggestedRating = 0;
    }

    // Update the rating select if it hasn't been manually changed
    var ratingSelect = document.getElementById('overallRating');
    if (ratingSelect && !ratingSelect.dataset.manuallySet) {
        ratingSelect.value = suggestedRating;
        updateRatingDisplay(suggestedRating);
    }
}

// ---------- Rating Display ----------

function initializeRatingDisplay() {
    var ratingSelect = document.getElementById('overallRating');
    if (ratingSelect) {
        ratingSelect.addEventListener('change', function() {
            this.dataset.manuallySet = 'true';
            updateRatingDisplay(this.value);
        });
    }
}

function updateRatingDisplay(rating) {
    var badge = document.querySelector('.rating-badge');
    if (badge) {
        badge.textContent = rating !== '' ? rating : '-';

        // Remove all rating classes
        badge.classList.remove('rating-0', 'rating-1', 'rating-2', 'rating-3', 'rating-4', 'rating-5');

        // Add appropriate rating class
        if (rating !== '') {
            badge.classList.add('rating-' + rating);
        }

        // Update aria-label
        var labels = {
            '5': 'Rating 5: Very Good',
            '4': 'Rating 4: Good',
            '3': 'Rating 3: Generally Satisfactory',
            '2': 'Rating 2: Improvement Necessary',
            '1': 'Rating 1: Major Improvement Necessary',
            '0': 'Rating 0: Urgent Improvement Required'
        };
        badge.setAttribute('aria-label', labels[String(rating)] || 'No rating selected');
    }
}

// ---------- Temperature Readings ----------

function initializeTemperatureReadings() {
    var addButton = document.getElementById('addTempReading');
    if (addButton) {
        addButton.addEventListener('click', addTemperatureRow);
    }
}

function addTemperatureRow() {
    var container = document.getElementById('temperatureReadings');
    var newRow = document.createElement('div');
    newRow.className = 'temp-reading-row';
    newRow.innerHTML =
        '<div class="form-group">' +
            '<label>Item / Equipment</label>' +
            '<input type="text" name="tempItem[]" placeholder="e.g., Fridge 2">' +
        '</div>' +
        '<div class="form-group">' +
            '<label>Temp (\u00B0C)</label>' +
            '<input type="number" name="tempReading[]" step="0.1">' +
        '</div>' +
        '<div class="form-group">' +
            '<label>Required Range</label>' +
            '<input type="text" name="tempRequired[]" placeholder="e.g., 0-5\u00B0C">' +
        '</div>' +
        '<div class="form-group">' +
            '<label>Compliant?</label>' +
            '<select name="tempCompliant[]">' +
                '<option value="yes">Yes</option>' +
                '<option value="no">No</option>' +
            '</select>' +
        '</div>';
    container.appendChild(newRow);
    // Focus the first input in the new row
    var firstInput = newRow.querySelector('input');
    if (firstInput) firstInput.focus();
    showToast('Temperature row added', 'info');
}

// ---------- Form Actions ----------

function initializeFormActions() {
    // Save Draft
    var saveDraftBtn = document.getElementById('saveDraft');
    if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', saveDraft);
    }

    // Print Form
    var printBtn = document.getElementById('printForm');
    if (printBtn) {
        printBtn.addEventListener('click', function() { window.print(); });
    }
}

// ---------- Modal (accessible) ----------

function initializeModal() {
    var modal = document.getElementById('confirmationModal');
    if (!modal) return;

    var closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() { closeModal(); });
    }

    // Close on backdrop click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeModal();
    });

    // Close on Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
            closeModal();
        }
    });
}

var previouslyFocusedElement = null;

function openModal() {
    var modal = document.getElementById('confirmationModal');
    if (!modal) return;
    previouslyFocusedElement = document.activeElement;
    modal.setAttribute('aria-hidden', 'false');
    // Focus the first focusable element inside
    var firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) firstFocusable.focus();
    // Trap focus inside modal
    modal.addEventListener('keydown', trapFocus);
}

function closeModal() {
    var modal = document.getElementById('confirmationModal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    modal.removeEventListener('keydown', trapFocus);
    if (previouslyFocusedElement) previouslyFocusedElement.focus();
}

function trapFocus(e) {
    if (e.key !== 'Tab') return;
    var modal = document.getElementById('confirmationModal');
    var focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
        if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
        }
    } else {
        if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
}

// ---------- Draft Save / Load ----------

function saveDraft() {
    var form = document.getElementById('foodInspectionForm');
    var formData = new FormData(form);
    var data = {};

    formData.forEach(function(value, key) {
        if (data[key]) {
            if (Array.isArray(data[key])) {
                data[key].push(value);
            } else {
                data[key] = [data[key], value];
            }
        } else {
            data[key] = value;
        }
    });

    // Save to localStorage
    localStorage.setItem('foodInspectionDraft', JSON.stringify(data));
    showToast('Draft saved successfully', 'success');
}

function loadDraft() {
    var draftData = localStorage.getItem('foodInspectionDraft');
    if (draftData) {
        var data = JSON.parse(draftData);
        var form = document.getElementById('foodInspectionForm');

        Object.keys(data).forEach(function(key) {
            var element = form.elements[key];
            if (element) {
                if (element.type === 'checkbox' || element.type === 'radio') {
                    element.checked = data[key] === element.value;
                } else {
                    element.value = data[key];
                }
            }
        });

        updateTotalScore();
    }
}

// ---------- Inline Validation ----------

function clearErrors() {
    document.querySelectorAll('.form-group.has-error').forEach(function(group) {
        group.classList.remove('has-error');
        var msg = group.querySelector('.error-message');
        if (msg) msg.remove();
    });
}

function showFieldError(field, message) {
    var group = field.closest('.form-group');
    if (!group) return;
    group.classList.add('has-error');
    var existing = group.querySelector('.error-message');
    if (existing) existing.remove();
    var msg = document.createElement('span');
    msg.className = 'error-message';
    msg.setAttribute('role', 'alert');
    msg.textContent = message;
    group.appendChild(msg);
    field.setAttribute('aria-invalid', 'true');
}

function clearFieldError(field) {
    var group = field.closest('.form-group');
    if (!group) return;
    group.classList.remove('has-error');
    var msg = group.querySelector('.error-message');
    if (msg) msg.remove();
    field.removeAttribute('aria-invalid');
}

// ---------- Form Submission ----------

function handleFormSubmit(e) {
    e.preventDefault();
    clearErrors();

    // Validate form
    if (!validateForm()) {
        showToast('Please fix the errors highlighted above', 'error');
        return;
    }

    // Collect form data
    var formData = collectFormData();

    // In a real application, this would send data to a server
    console.log('Form submitted:', formData);

    // Show confirmation modal
    showConfirmation(formData.referenceNumber);
}

function validateForm() {
    var form = document.getElementById('foodInspectionForm');
    var valid = true;

    // Check required fields
    var requiredFields = form.querySelectorAll('[required]');
    requiredFields.forEach(function(field) {
        clearFieldError(field);
        if (!field.value || field.value.trim() === '') {
            var label = form.querySelector('label[for="' + field.id + '"]');
            var labelText = label ? label.textContent.replace('*', '').trim() : 'This field';
            showFieldError(field, labelText + ' is required');
            if (valid) {
                field.focus();
                var section = field.closest('.form-section');
                if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            valid = false;
        }
    });

    // Score range validation
    var ranges = [
        { id: 'hygienicScore', min: 0, max: 25, label: 'Hygienic Food Handling score' },
        { id: 'structureScore', min: 0, max: 25, label: 'Structure and Cleaning score' },
        { id: 'managementScore', min: 0, max: 30, label: 'Management of Food Safety score' }
    ];

    ranges.forEach(function(r) {
        var field = document.getElementById(r.id);
        if (field && field.value !== '') {
            var val = parseInt(field.value);
            if (isNaN(val) || val < r.min || val > r.max) {
                showFieldError(field, r.label + ' must be between ' + r.min + ' and ' + r.max);
                if (valid) field.focus();
                valid = false;
            }
        }
    });

    return valid;
}

function collectFormData() {
    var form = document.getElementById('foodInspectionForm');
    var formData = new FormData(form);
    var data = {};

    formData.forEach(function(value, key) {
        if (key.includes('[]')) {
            var cleanKey = key.replace('[]', '');
            if (!data[cleanKey]) {
                data[cleanKey] = [];
            }
            data[cleanKey].push(value);
        } else {
            data[key] = value;
        }
    });

    // Add signature data
    var inspectorCanvas = document.getElementById('inspectorCanvas');
    var businessCanvas = document.getElementById('businessCanvas');

    if (inspectorCanvas) {
        data.inspectorSignature = inspectorCanvas.toDataURL();
    }
    if (businessCanvas) {
        data.businessSignature = businessCanvas.toDataURL();
    }

    // Add timestamp
    data.submittedAt = new Date().toISOString();

    return data;
}

function showConfirmation(refNumber) {
    var refDisplay = document.getElementById('confirmRefNumber');

    if (refDisplay) {
        refDisplay.textContent = refNumber;
    }

    openModal();

    // Clear localStorage draft
    localStorage.removeItem('foodInspectionDraft');
}

// ---------- Check for saved draft on load ----------

document.addEventListener('DOMContentLoaded', function() {
    // Check if launched from the dashboard with a premises reference
    var urlParams = new URLSearchParams(window.location.search);
    var premisesRef = urlParams.get('premises');
    if (premisesRef) {
        loadPremisesFromDashboard(premisesRef);
        return;
    }

    var draftData = localStorage.getItem('foodInspectionDraft');
    if (draftData) {
        // Use a toast + inline prompt instead of confirm()
        showToast('A saved draft was found. Loading it now.', 'info');
        loadDraft();
    }
});

/**
 * Auto-populate the inspection form with premises data from the
 * Idox Uniform connector via the dashboard API.
 */
async function loadPremisesFromDashboard(premisesRef) {
    try {
        var resp = await fetch('/api/visit-sheets/' + encodeURIComponent(premisesRef));
        if (!resp.ok) throw new Error('Failed to load premises data');
        var sheet = await resp.json();
        populateFormFromVisitSheet(sheet);
        showToast('Form pre-populated from Uniform', 'success');
    } catch (err) {
        console.warn('Could not auto-populate from dashboard:', err.message);
    }
}

/**
 * Populate the digital inspection form fields from a visit sheet
 * data structure returned by the API.
 */
function populateFormFromVisitSheet(sheet) {
    var biz = sheet.businessDetails;
    var prev = sheet.previousInspectionSummary;
    var details = sheet.inspectionDetails;

    // Inspection details
    if (details.inspectionDate) setField('inspectionDate', details.inspectionDate);
    if (details.inspectionTime) setField('inspectionTime', details.inspectionTime);
    if (details.inspectorName) setField('inspectorName', details.inspectorName);
    if (details.inspectorId) setField('inspectorId', details.inspectorId);

    // Set inspection type
    if (details.inspectionType) setField('inspectionType', details.inspectionType);

    // Business details
    if (biz.businessName) setField('businessName', biz.tradingName || biz.businessName);
    if (biz.businessAddress) setField('businessAddress', biz.businessAddress);
    if (biz.postcode) setField('postcode', biz.postcode);
    if (biz.telephone) setField('telephone', biz.telephone);
    if (biz.email) setField('email', biz.email);
    if (biz.foodBusinessOperator) setField('ownerName', biz.foodBusinessOperator);
    if (biz.businessType) setField('businessType', biz.businessType);
    if (biz.numberOfFoodHandlers) setField('numEmployees', biz.numberOfFoodHandlers);

    // Pre-populate temperature readings from business type
    if (sheet.temperatureReadings && sheet.temperatureReadings.length > 0) {
        var firstRow = document.querySelector('.temp-reading-row');
        if (firstRow) {
            var inputs = firstRow.querySelectorAll('input');
            if (inputs[0]) inputs[0].value = sheet.temperatureReadings[0].item;
            if (inputs[2]) inputs[2].value = sheet.temperatureReadings[0].requiredRange;
        }
        // Add additional temperature rows
        for (var i = 1; i < sheet.temperatureReadings.length; i++) {
            addTemperatureRow();
            var rows = document.querySelectorAll('.temp-reading-row');
            var row = rows[rows.length - 1];
            if (row) {
                var rowInputs = row.querySelectorAll('input');
                if (rowInputs[0]) rowInputs[0].value = sheet.temperatureReadings[i].item;
                if (rowInputs[2]) rowInputs[2].value = sheet.temperatureReadings[i].requiredRange;
            }
        }
    }

    // Add a note about the pre-population source
    var notesField = document.getElementById('additionalNotes');
    if (notesField) {
        var notes = [];
        notes.push('Pre-populated from Idox Uniform (' + biz.premisesRef + ')');
        if (prev.riskCategory) notes.push('Risk Category: ' + prev.riskCategory);
        if (prev.currentFhrsRating != null) notes.push('Current FHRS: ' + prev.currentFhrsRating);
        if (prev.lastInspectionDate) notes.push('Last Inspection: ' + prev.lastInspectionDate);
        if (prev.officerNotes) notes.push('Officer Notes: ' + prev.officerNotes);
        notesField.value = notes.join('\n');
    }
}

function setField(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value;
}
