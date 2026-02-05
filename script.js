// Food Hygiene Inspection Form - JavaScript
// Gloucester City Council

document.addEventListener('DOMContentLoaded', function() {
    initializeForm();
    initializeSignaturePads();
    initializeScoreCalculation();
    initializeRatingDisplay();
    initializeTemperatureReadings();
    initializeFormActions();
});

// Generate Reference Number
function generateReferenceNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `GCC-FHI-${year}${month}${day}-${random}`;
}

// Initialize Form
function initializeForm() {
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    const inspectionDateInput = document.getElementById('inspectionDate');
    if (inspectionDateInput) {
        inspectionDateInput.value = today;
    }

    // Set current time
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const inspectionTimeInput = document.getElementById('inspectionTime');
    if (inspectionTimeInput) {
        inspectionTimeInput.value = `${hours}:${minutes}`;
    }

    // Generate reference number
    const refNumberInput = document.getElementById('referenceNumber');
    if (refNumberInput) {
        refNumberInput.value = generateReferenceNumber();
    }

    // Form submission handler
    const form = document.getElementById('foodInspectionForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
}

// Signature Pad Implementation
function initializeSignaturePads() {
    const canvases = ['inspectorCanvas', 'businessCanvas'];

    canvases.forEach(canvasId => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let isDrawing = false;
        let lastX = 0;
        let lastY = 0;

        // Set canvas size
        function resizeCanvas() {
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = rect.width - 22; // Account for padding
            canvas.height = 100;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Mouse events
        canvas.addEventListener('mousedown', (e) => {
            isDrawing = true;
            [lastX, lastY] = getCoordinates(e, canvas);
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isDrawing) return;
            const [x, y] = getCoordinates(e, canvas);
            draw(ctx, lastX, lastY, x, y);
            [lastX, lastY] = [x, y];
        });

        canvas.addEventListener('mouseup', () => isDrawing = false);
        canvas.addEventListener('mouseout', () => isDrawing = false);

        // Touch events
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            isDrawing = true;
            [lastX, lastY] = getCoordinates(e.touches[0], canvas);
        });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!isDrawing) return;
            const [x, y] = getCoordinates(e.touches[0], canvas);
            draw(ctx, lastX, lastY, x, y);
            [lastX, lastY] = [x, y];
        });

        canvas.addEventListener('touchend', () => isDrawing = false);
    });

    // Clear signature buttons
    document.querySelectorAll('.btn-clear-sig').forEach(button => {
        button.addEventListener('click', function() {
            const canvasId = this.getAttribute('data-canvas');
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        });
    });
}

function getCoordinates(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX || event.pageX) - rect.left;
    const y = (event.clientY || event.pageY) - rect.top;
    return [x, y];
}

function draw(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

// Score Calculation
function initializeScoreCalculation() {
    const hygienicScore = document.getElementById('hygienicScore');
    const structureScore = document.getElementById('structureScore');
    const managementScore = document.getElementById('managementScore');

    const scoreInputs = [hygienicScore, structureScore, managementScore];

    scoreInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', updateTotalScore);
        }
    });
}

function updateTotalScore() {
    const hygienicScore = parseInt(document.getElementById('hygienicScore').value) || 0;
    const structureScore = parseInt(document.getElementById('structureScore').value) || 0;
    const managementScore = parseInt(document.getElementById('managementScore').value) || 0;

    const total = hygienicScore + structureScore + managementScore;

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
    let suggestedRating;

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
    const ratingSelect = document.getElementById('overallRating');
    if (ratingSelect && !ratingSelect.dataset.manuallySet) {
        ratingSelect.value = suggestedRating;
        updateRatingDisplay(suggestedRating);
    }
}

// Rating Display
function initializeRatingDisplay() {
    const ratingSelect = document.getElementById('overallRating');
    if (ratingSelect) {
        ratingSelect.addEventListener('change', function() {
            this.dataset.manuallySet = 'true';
            updateRatingDisplay(this.value);
        });
    }
}

function updateRatingDisplay(rating) {
    const badge = document.querySelector('.rating-badge');
    if (badge) {
        badge.textContent = rating !== '' ? rating : '-';

        // Remove all rating classes
        badge.classList.remove('rating-0', 'rating-1', 'rating-2', 'rating-3', 'rating-4', 'rating-5');

        // Add appropriate rating class
        if (rating !== '') {
            badge.classList.add(`rating-${rating}`);
        }
    }
}

// Temperature Readings
function initializeTemperatureReadings() {
    const addButton = document.getElementById('addTempReading');
    if (addButton) {
        addButton.addEventListener('click', addTemperatureRow);
    }
}

function addTemperatureRow() {
    const container = document.getElementById('temperatureReadings');
    const newRow = document.createElement('div');
    newRow.className = 'temp-reading-row';
    newRow.innerHTML = `
        <div class="form-group">
            <label>Item/Equipment</label>
            <input type="text" name="tempItem[]" placeholder="e.g., Fridge 2">
        </div>
        <div class="form-group">
            <label>Temperature (°C)</label>
            <input type="number" name="tempReading[]" step="0.1">
        </div>
        <div class="form-group">
            <label>Required Range</label>
            <input type="text" name="tempRequired[]" placeholder="e.g., 0-5°C">
        </div>
        <div class="form-group">
            <label>Compliant</label>
            <select name="tempCompliant[]">
                <option value="yes">Yes</option>
                <option value="no">No</option>
            </select>
        </div>
    `;
    container.appendChild(newRow);
}

// Form Actions
function initializeFormActions() {
    // Save Draft
    const saveDraftBtn = document.getElementById('saveDraft');
    if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', saveDraft);
    }

    // Print Form
    const printBtn = document.getElementById('printForm');
    if (printBtn) {
        printBtn.addEventListener('click', () => window.print());
    }

    // Modal close
    const modal = document.getElementById('confirmationModal');
    const closeBtn = modal?.querySelector('.close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

function saveDraft() {
    const form = document.getElementById('foodInspectionForm');
    const formData = new FormData(form);
    const data = {};

    formData.forEach((value, key) => {
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
    alert('Draft saved successfully!');
}

function loadDraft() {
    const draftData = localStorage.getItem('foodInspectionDraft');
    if (draftData) {
        const data = JSON.parse(draftData);
        const form = document.getElementById('foodInspectionForm');

        Object.keys(data).forEach(key => {
            const element = form.elements[key];
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

// Form Submission
function handleFormSubmit(e) {
    e.preventDefault();

    // Validate form
    if (!validateForm()) {
        return;
    }

    // Collect form data
    const formData = collectFormData();

    // In a real application, this would send data to a server
    console.log('Form submitted:', formData);

    // Show confirmation modal
    showConfirmation(formData.referenceNumber);
}

function validateForm() {
    const form = document.getElementById('foodInspectionForm');

    // Check HTML5 validation
    if (!form.checkValidity()) {
        form.reportValidity();
        return false;
    }

    // Additional custom validation
    const hygienicScore = parseInt(document.getElementById('hygienicScore').value);
    const structureScore = parseInt(document.getElementById('structureScore').value);
    const managementScore = parseInt(document.getElementById('managementScore').value);

    if (hygienicScore < 0 || hygienicScore > 25) {
        alert('Hygienic Food Handling score must be between 0 and 25');
        return false;
    }

    if (structureScore < 0 || structureScore > 25) {
        alert('Structure and Cleaning score must be between 0 and 25');
        return false;
    }

    if (managementScore < 0 || managementScore > 30) {
        alert('Management of Food Safety score must be between 0 and 30');
        return false;
    }

    return true;
}

function collectFormData() {
    const form = document.getElementById('foodInspectionForm');
    const formData = new FormData(form);
    const data = {};

    formData.forEach((value, key) => {
        if (key.includes('[]')) {
            const cleanKey = key.replace('[]', '');
            if (!data[cleanKey]) {
                data[cleanKey] = [];
            }
            data[cleanKey].push(value);
        } else {
            data[key] = value;
        }
    });

    // Add signature data
    const inspectorCanvas = document.getElementById('inspectorCanvas');
    const businessCanvas = document.getElementById('businessCanvas');

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
    const modal = document.getElementById('confirmationModal');
    const refDisplay = document.getElementById('confirmRefNumber');

    if (refDisplay) {
        refDisplay.textContent = refNumber;
    }

    if (modal) {
        modal.style.display = 'block';
    }

    // Clear localStorage draft
    localStorage.removeItem('foodInspectionDraft');
}

// Check for saved draft on load
document.addEventListener('DOMContentLoaded', function() {
    const draftData = localStorage.getItem('foodInspectionDraft');
    if (draftData) {
        const loadDraftConfirm = confirm('A saved draft was found. Would you like to load it?');
        if (loadDraftConfirm) {
            loadDraft();
        }
    }
});
