// Wait for DOM to be fully loaded before running app
document.addEventListener('DOMContentLoaded', function() {
  const esc = window.RentUKLib.escapeHtml;
  const { readJson, writeAll } = window.RentUKLib;
  // localStorage itself can throw (e.g. blocked in some private modes), so fall back to an in-memory store.
  let store;
  try { store = window.localStorage; store.getItem('_'); } catch (e) { store = null; }
  const storageMissing = !store;
  if (!store) {
    const mem = {};
    store = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  }
  let storageWarned = false;
  // Data storage: this browser's localStorage only. Nothing is sent to any server.
  let expenses = readJson(store, 'expenses', []);
  let properties = readJson(store, 'properties', []);
  let currentPropertyId = store.getItem('currentPropertyId') || null;
  let reminders = readJson(store, 'reminders', null) || [
    { id: 1, name: '🔥 Gas Safety Check', dueDate: '', type: 'gas', completed: false, propertyId: null },
    { id: 2, name: '🌡️ Boiler Service', dueDate: '', type: 'maintenance', completed: false, propertyId: null },
    { id: 3, name: '⚡ Electrical Safety Check', dueDate: '', type: 'electrical', completed: false, propertyId: null },
    { id: 4, name: '🛡️ Insurance Renewal', dueDate: '', type: 'insurance', completed: false, propertyId: null },
    { id: 5, name: '📊 EPC Renewal', dueDate: '', type: 'epc', completed: false, propertyId: null },
    { id: 6, name: '🔒 Deposit Protection', dueDate: '', type: 'deposit', completed: false, propertyId: null }
  ];

  // AOB reminders (dynamic)
  let aobReminders = readJson(store, 'aobReminders', []);

  // Get current property
  function getCurrentProperty() {
    return properties.find(p => p.id === currentPropertyId) || (properties.length > 0 ? properties[0] : null);
  }

  // Set current property
  function setCurrentProperty(propertyId) {
    currentPropertyId = propertyId;
    writeAll(store, { currentPropertyId: String(propertyId) });
    loadDashboard();
    loadExpenses();
    loadReminders();
  }

  // Custom Alert System
  function showCustomAlert(message, title = "RentUK says") {
    // Remove existing alert if any
    const existingAlert = document.getElementById('custom-alert');
    if (existingAlert) {
      existingAlert.remove();
    }

    const alertDiv = document.createElement('div');
    alertDiv.id = 'custom-alert';
    alertDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      padding: 20px;
      z-index: 10000;
      max-width: 400px;
      text-align: center;
    `;

    alertDiv.innerHTML = `
      <h3 style="color: #6366f1; margin-bottom: 12px;">${esc(title)}</h3>
      <p style="margin-bottom: 20px; color: #1e293b;">${esc(message)}</p>
      <button onclick="document.getElementById('custom-alert').remove()" 
              style="background: #6366f1; color: white; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;">
        OK
      </button>
    `;

    document.body.appendChild(alertDiv);
  }

  // Show feedback form for thumbs down
  function showFeedbackForm() {
    // Remove existing alert if any
    const existingAlert = document.getElementById('custom-alert');
    if (existingAlert) {
      existingAlert.remove();
    }

    const alertDiv = document.createElement('div');
    alertDiv.id = 'custom-alert';
    alertDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      padding: 20px;
      z-index: 10000;
      max-width: 400px;
      text-align: center;
    `;

    alertDiv.innerHTML = `
      <h3 style="color: #6366f1; margin-bottom: 12px;">RentUK says</h3>
      <p style="margin-bottom: 10px; color: #1e293b;">We're sorry to hear that. What could we improve?</p>
      <textarea id="feedback-text" placeholder="Please share your feedback..." 
                 style="width: 100%; height: 80px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 10px;"></textarea>
      <div style="display: flex; gap: 10px; justify-content: center;">
        <button onclick="submitFeedback()" 
                style="background: #6366f1; color: white; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;">
          Submit
        </button>
        <button onclick="document.getElementById('custom-alert').remove()" 
                style="background: #ef4444; color: white; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;">
          Cancel
        </button>
      </div>
    `;

    document.body.appendChild(alertDiv);
  }

  function submitFeedback() {
    const feedback = document.getElementById('feedback-text').value.trim();
    if (feedback) {
      showCustomAlert('Thank you for your feedback!', 'RentUK says');
    } else {
      showCustomAlert('Thank you!', 'RentUK says');
    }
  }

  // Start the app (local-only, no sign-in)
  function initApp() {
    loadLocalData();
    loadMainUI();
    if (storageMissing) showCustomAlert('This browser is blocking storage, so nothing you enter will be kept after you close the page. Try a normal (not private) window.', 'Storage unavailable');
    else if (properties.length === 0) showSetupWizard();
  }

  // Load main UI
  function loadMainUI() {
    document.getElementById('app').innerHTML = `
      <div id="app">
        <h1>RentUK</h1>

        <div id="property-selector-container" style="padding: 0 24px 16px 24px; display: none;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="margin: 0; color: #f8fafc;">Properties</h3>
            <button class="btn" id="add-property-btn" style="background: linear-gradient(135deg, #10b981, #059669); padding: 8px 16px; font-size: 0.9rem;">
              + Add Property
            </button>
          </div>
          <div id="property-selector"></div>
        </div>

        <div class="nav-tabs">
            <button class="nav-btn active" data-tab="dashboard">Dashboard</button>
            <button class="nav-btn" data-tab="expenses">Expenses</button>
            <button class="nav-btn" data-tab="reminders">Reminders</button>
            <button class="nav-btn" data-tab="tenants">Tenants</button>
        </div>

        <div id="dashboard" class="tab active">
            <div id="dashboard-content"></div>
        </div>

        <div id="expenses" class="tab">
            <h2>💰 Expenses Tracker</h2>
            <div class="card">
                <div class="form-group">
                    <label for="expense-date">Date</label>
                    <input type="date" id="expense-date">
                </div>
                <div class="form-group">
                    <label for="expense-description">Description</label>
                    <input type="text" id="expense-description" placeholder="Boiler service, insurance, etc.">
                </div>
                <div class="form-group">
                    <label for="expense-amount">Amount (£)</label>
                    <input type="number" id="expense-amount" step="0.01" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label for="expense-category">Category</label>
                    <select id="expense-category">
                        <option value="maintenance">🔧 Maintenance</option>
                        <option value="insurance">🛡️ Insurance</option>
                        <option value="utilities">⚡ Utilities</option>
                        <option value="repairs">🛠️ Repairs</option>
                        <option value="other">✨ Other</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="expense-property">Property</label>
                    <select id="expense-property">
                        <option value="">Select Property</option>
                    </select>
                </div>
                <button class="btn" id="add-expense">Add Expense</button>
            </div>
            <div id="expenses-list"></div>
        </div>

        <div id="reminders" class="tab">
            <h2>📅 Reminders & Compliance</h2>
            <div id="reminders-list"></div>
        </div>

        <div id="tenants" class="tab">
            <h2>🏠 Tenants Management</h2>
            <div class="card">
                <h3>Add/Edit Tenant</h3>
                <div class="form-group">
                    <label for="tenant-property">Property</label>
                    <select id="tenant-property">
                        <option value="">Select Property</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="tenant-name">Tenant Name</label>
                    <input type="text" id="tenant-name" placeholder="Full name">
                </div>
                <div class="form-group">
                    <label for="tenant-contact">Contact</label>
                    <input type="text" id="tenant-contact" placeholder="Phone/Email">
                </div>
                <div class="form-group">
                    <label for="lease-start">Lease Start Date</label>
                    <input type="date" id="lease-start">
                </div>
                <div class="form-group">
                    <label for="lease-end">Lease End Date</label>
                    <input type="date" id="lease-end">
                </div>
                <div class="form-group">
                    <label for="rent-amount">Monthly Rent (£)</label>
                    <input type="number" id="rent-amount" placeholder="0.00">
                </div>
                <button class="btn" id="save-tenant">Save Tenant</button>
            </div>
            <div id="tenants-list"></div>
        </div>

        <div id="feedback-section" style="text-align: center; margin: 20px 0; padding: 20px;">
            <p style="margin-bottom: 10px;">Was this app helpful?</p>
            <div>
                <button class="btn" id="thumbs-up" style="background: linear-gradient(135deg, #10b981, #059669); margin-right: 10px;">
                    👍 Yes
                </button>
                <button class="btn" id="thumbs-down" style="background: linear-gradient(135deg, #ef4444, #dc2626);">
                    👎 No
                </button>
            </div>
        </div>
      </div>
    `;

    // Setup feedback buttons
    const thumbsUpBtn = document.getElementById('thumbs-up');
    const thumbsDownBtn = document.getElementById('thumbs-down');

    if (thumbsUpBtn) {
      thumbsUpBtn.addEventListener('click', function() {
        showCustomAlert('Thank you!', 'RentUK says');
      });
    }

    if (thumbsDownBtn) {
      thumbsDownBtn.addEventListener('click', function() {
        showFeedbackForm();
      });
    }

    // Setup property selector
    const addPropertyBtn = document.getElementById('add-property-btn');
    if (addPropertyBtn) {
      addPropertyBtn.addEventListener('click', showSetupWizard);
    }

    // Setup tab navigation
    setupTabNavigation();

    // Load property selector
    loadPropertySelector();

    // Load dashboard content
    loadDashboard();
  }

  // Load property selector
  function loadPropertySelector() {
    const container = document.getElementById('property-selector-container');
    const selector = document.getElementById('property-selector');

    if (properties.length === 0) {
      container.style.display = 'block';
      selector.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #94a3b8; background: #1e293b; border-radius: 8px;">
          <p>No properties added yet</p>
          <p>Click "Add Property" to get started</p>
        </div>
      `;
      return;
    }

    container.style.display = 'block';

    let selectorHTML = '<div style="display: flex; gap: 10px; flex-wrap: wrap;">';

    properties.forEach(property => {
      const isActive = property.id === currentPropertyId;
      selectorHTML += `
        <button onclick="setCurrentProperty('${esc(property.id)}')" 
                style="padding: 10px 16px; border: 2px solid ${isActive ? '#6366f1' : '#334155'}; 
                       background: ${isActive ? '#6366f1' : 'transparent'}; 
                       color: ${isActive ? 'white' : '#94a3b8'}; 
                       border-radius: 8px; cursor: pointer; font-weight: 600;">
          ${esc(property.name)}
        </button>
      `;
    });

    selectorHTML += '</div>';
    selector.innerHTML = selectorHTML;

    // Update property dropdowns
    updatePropertyDropdowns();
  }

  // Update property dropdowns in forms
  function updatePropertyDropdowns() {
    const expensePropertySelect = document.getElementById('expense-property');
    const tenantPropertySelect = document.getElementById('tenant-property');

    if (expensePropertySelect) {
      expensePropertySelect.innerHTML = '<option value="">Select Property</option>';
      properties.forEach(property => {
        expensePropertySelect.innerHTML += `<option value="${esc(property.id)}">${esc(property.name)}</option>`;
      });
    }

    if (tenantPropertySelect) {
      tenantPropertySelect.innerHTML = '<option value="">Select Property</option>';
      properties.forEach(property => {
        tenantPropertySelect.innerHTML += `<option value="${esc(property.id)}">${esc(property.name)}</option>`;
      });

      // Auto-select current property if available
      if (currentPropertyId) {
        tenantPropertySelect.value = currentPropertyId;
      }
    }
  }

  // Show add property form
  function showAddPropertyForm() {
    const alertDiv = document.createElement('div');
    alertDiv.id = 'custom-alert';
    alertDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      padding: 20px;
      z-index: 10000;
      max-width: 500px;
      width: 90%;
      color: #1e293b;
    `;

    alertDiv.innerHTML = `
      <h3 style="color: #6366f1; margin-bottom: 16px;">Add New Property</h3>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Property Name</label>
        <input type="text" id="property-name" placeholder="e.g., 123 Main Street" 
               style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px;">
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Address</label>
        <input type="text" id="property-address" placeholder="Full property address" 
               style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px;">
      </div>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="confirm-add-property" 
                style="background: #6366f1; color: white; padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer;">
          Add Property
        </button>
        <button onclick="document.getElementById('custom-alert').remove()" 
                style="background: #94a3b8; color: white; padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer;">
          Cancel
        </button>
      </div>
    `;

    document.body.appendChild(alertDiv);

    // Add event listener to the button after the element is created
    setTimeout(() => {
      const confirmButton = document.getElementById('confirm-add-property');
      if (confirmButton) {
        confirmButton.addEventListener('click', addNewProperty);
      }
    }, 100);
  }

  // Add new property - FIXED VERSION
  function addNewProperty() {
    const alertDiv = document.getElementById('custom-alert');
    if (!alertDiv) return;

    const nameInput = alertDiv.querySelector('#property-name');
    const addressInput = alertDiv.querySelector('#property-address');

    if (!nameInput || !addressInput) {
      showCustomAlert('Form elements not found', 'RentUK says');
      return;
    }

    const name = nameInput.value.trim();
    const address = addressInput.value.trim();

    if (!name) {
      showCustomAlert('Please enter a property name', 'RentUK says');
      return;
    }

    const newProperty = {
      id: 'prop_' + Date.now(),
      name: name,
      address: address,
      tenant: null,
      createdAt: new Date().toISOString()
    };

    properties.push(newProperty);

    // Set as current property if it's the first one
    if (properties.length === 1) {
      currentPropertyId = newProperty.id;
      writeAll(store, { currentPropertyId: String(currentPropertyId) });
    }

    saveData();
    alertDiv.remove();
    loadPropertySelector();
    loadDashboard();
    showCustomAlert('Property added successfully!', 'RentUK says');
  }

  // Load local data
  function loadLocalData() {
    expenses = readJson(store, 'expenses', []);
    properties = readJson(store, 'properties', []);
    currentPropertyId = store.getItem('currentPropertyId') || (properties.length > 0 ? properties[0].id : null);
    reminders = readJson(store, 'reminders', null) || [
      { id: 1, name: '🔥 Gas Safety Check', dueDate: '', type: 'gas', completed: false, propertyId: null },
      { id: 2, name: '🌡️ Boiler Service', dueDate: '', type: 'maintenance', completed: false, propertyId: null },
      { id: 3, name: '⚡ Electrical Safety Check', dueDate: '', type: 'electrical', completed: false, propertyId: null },
      { id: 4, name: '🛡️ Insurance Renewal', dueDate: '', type: 'insurance', completed: false, propertyId: null },
      { id: 5, name: '📊 EPC Renewal', dueDate: '', type: 'epc', completed: false, propertyId: null },
      { id: 6, name: '🔒 Deposit Protection', dueDate: '', type: 'deposit', completed: false, propertyId: null }
    ];
    aobReminders = readJson(store, 'aobReminders', []);
  }

  // Save local data
  function saveLocalData() {
    const result = writeAll(store, {
      expenses, properties, reminders, aobReminders,
      currentPropertyId: currentPropertyId === null ? '' : String(currentPropertyId)
    });
    if (!result.ok && !storageWarned) {
      storageWarned = true;
      showCustomAlert(result.reason === 'full'
        ? 'Browser storage is full, so your latest change was not saved. Export a backup now, then delete old expenses or receipts.'
        : 'This browser is blocking storage, so changes will be lost when you close the page. Export a backup before leaving.',
        'Not saved');
    }
    return result.ok;
  }

  // Save data (this device only)
  function saveData() {
    saveLocalData();
  }

  // Export data functionality
  function exportData() {
    const dataStr = JSON.stringify({ expenses, properties, currentPropertyId, reminders, aobReminders }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = `rentuk-backup-${new Date().toISOString().slice(0,10)}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

  // Import data functionality
  function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > window.RentUKLib.MAX_BACKUP_BYTES) {
      showCustomAlert('Backup file is too large (over 5 MB).', 'RentUK says');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const result = window.RentUKLib.validateBackup(JSON.parse(e.target.result));
        if (!result.ok) {
          showCustomAlert(result.error, 'RentUK says');
          return;
        }
        const importedData = result.data;
        expenses = importedData.expenses || expenses;
        properties = importedData.properties || properties;
        currentPropertyId = importedData.currentPropertyId || currentPropertyId;
        reminders = importedData.reminders || reminders;
        aobReminders = importedData.aobReminders || aobReminders;
        saveData();
        showCustomAlert(result.skipped > 0
          ? `Data imported. ${result.skipped} invalid record(s) were skipped.`
          : 'Data imported successfully!', 'RentUK says');
        loadPropertySelector();
        loadDashboard();
        loadExpenses();
        loadReminders();
        loadTenants();
      } catch (error) {
        showCustomAlert('Error importing data. Please check the file format.', 'RentUK says');
      }
    };
    reader.readAsText(file);
  }


  // Expenses functionality
  document.addEventListener('click', function(e) {
    if (e.target.id === 'add-expense') {
      const date = document.getElementById('expense-date').value;
      const description = document.getElementById('expense-description').value;
      const amount = document.getElementById('expense-amount').value;
      const category = document.getElementById('expense-category').value;
      const propertyId = document.getElementById('expense-property').value;

      if (!date || !description || !amount || !propertyId) {
        showCustomAlert('Please fill in all required fields', 'RentUK says');
        return;
      }

      const expense = {
        id: Date.now(),
        date,
        description,
        amount: parseFloat(amount),
        category,
        propertyId
      };

      expenses.push(expense);
      saveData();

      // Clear form
      document.getElementById('expense-date').value = '';
      document.getElementById('expense-description').value = '';
      document.getElementById('expense-amount').value = '';

      loadExpenses();
      loadDashboard(); // Update dashboard too
    }
  });

  function loadExpenses() {
    const container = document.getElementById('expenses-list');
    container.innerHTML = '';

    const currentProperty = getCurrentProperty();
    const propertyExpenses = expenses.filter(expense => 
      !currentProperty || expense.propertyId === currentProperty.id
    );

    if (propertyExpenses.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>💰 No expenses recorded yet</p>
          <p>Add your first expense to get started</p>
        </div>
      `;
      return;
    }

    // Sort expenses by date (newest first)
    const sortedExpenses = [...propertyExpenses].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedExpenses.forEach(expense => {
      const property = properties.find(p => p.id === expense.propertyId);
      const div = document.createElement('div');
      div.className = 'reminder-item';
      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="font-size: 1.2em; color: #f8fafc;">£${expense.amount.toFixed(2)}</strong>
            <div style="color: #94a3b8; font-size: 0.9em; margin-top: 4px;">${esc(expense.description)}</div>
            ${property ? `<div style="color: #6366f1; font-size: 0.8em; margin-top: 2px;">${esc(property.name)}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 600; color: #6366f1;">${esc(expense.date)}</div>
            <div class="status-badge status-pending" style="margin-top: 4px;">${esc(expense.category)}</div>
          </div>
        </div>
      `;
      container.appendChild(div);
    });
  }

  // Tenant functionality
  document.addEventListener('click', function(e) {
    if (e.target.id === 'save-tenant') {
      const propertyId = document.getElementById('tenant-property').value;
      const name = document.getElementById('tenant-name').value;
      const contact = document.getElementById('tenant-contact').value;
      const leaseStart = document.getElementById('lease-start').value;
      const leaseEnd = document.getElementById('lease-end').value;
      const rentAmount = document.getElementById('rent-amount').value;

      if (!propertyId || !name) {
        showCustomAlert('Please select a property and enter tenant name', 'RentUK says');
        return;
      }

      // Find the property
      const propertyIndex = properties.findIndex(p => p.id === propertyId);
      if (propertyIndex === -1) {
        showCustomAlert('Property not found', 'RentUK says');
        return;
      }

      // Update property with tenant info
      properties[propertyIndex].tenant = {
        name,
        contact,
        leaseStart,
        leaseEnd,
        rentAmount: parseFloat(rentAmount) || 0
      };

      saveData();
      showCustomAlert('✅ Tenant information saved!', 'RentUK says');
      loadDashboard();
      loadTenants();
    }
  });

  function loadTenants() {
    const container = document.getElementById('tenants-list');
    container.innerHTML = '';

    const propertiesWithTenants = properties.filter(p => p.tenant);

    if (propertiesWithTenants.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>🏠 No tenants added yet</p>
          <p>Add your first tenant to get started</p>
        </div>
      `;
      return;
    }

    propertiesWithTenants.forEach(property => {
      const div = document.createElement('div');
      div.className = 'reminder-item';
      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div>
            <strong style="color: #f8fafc;">${esc(property.tenant.name)}</strong>
            <div style="color: #94a3b8; font-size: 0.9em; margin-top: 4px;">
              📞 ${esc(property.tenant.contact || 'Not provided')}
            </div>
            <div style="color: #6366f1; font-size: 0.9em; margin-top: 2px;">
              🏠 ${esc(property.name)}
            </div>
            <div style="color: #10b981; font-size: 0.9em; margin-top: 2px; font-weight: 600;">
              💰 £${esc(property.tenant.rentAmount || '0.00')} / month
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 600; color: #6366f1;">Lease</div>
            <div style="color: #94a3b8; font-size: 0.8em;">
              ${esc(property.tenant.leaseStart || 'Not set')} to ${esc(property.tenant.leaseEnd || 'Not set')}
            </div>
            <button onclick="editTenant('${esc(property.id)}')" style="background: #6366f1; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; margin-top: 8px; cursor: pointer;">
              Edit
            </button>
          </div>
        </div>
      `;
      container.appendChild(div);
    });
  }

  // Edit tenant
  function editTenant(propertyId) {
    const property = properties.find(p => p.id === propertyId);
    if (!property || !property.tenant) return;

    // Fill the form with existing data
    document.getElementById('tenant-property').value = property.id;
    document.getElementById('tenant-name').value = property.tenant.name || '';
    document.getElementById('tenant-contact').value = property.tenant.contact || '';
    document.getElementById('lease-start').value = property.tenant.leaseStart || '';
    document.getElementById('lease-end').value = property.tenant.leaseEnd || '';
    document.getElementById('rent-amount').value = property.tenant.rentAmount || '';

    // Switch to tenants tab
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tenants').classList.add('active');
    document.querySelector('[data-tab="tenants"]').classList.add('active');
  }

  // Reminders functionality
  function loadReminders() {
    const container = document.getElementById('reminders-list');
    container.innerHTML = '';

    // Sort all reminders by due date (earliest first), then completed items at bottom
    const sortedReminders = reminders.sort((a, b) => {
      // First, sort by completion status (completed at bottom)
      if (a.completed && !b.completed) return 1;
      if (!a.completed && b.completed) return -1;

      // Then, sort by due date (earliest first)
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });

    // Display Predefined Reminders
    if (sortedReminders.length > 0) {
      const predefinedSection = document.createElement('div');
      predefinedSection.style.marginBottom = '20px';

      sortedReminders.forEach(reminder => {
        const div = document.createElement('div');
        div.className = 'reminder-item';
        div.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <input type="checkbox" id="complete-${esc(reminder.id)}" ${reminder.completed ? 'checked' : ''} onchange="toggleReminderStatus(${esc(reminder.id)})" style="width: 20px; height: 20px; cursor: pointer;">
              <div>
                <strong>${esc(reminder.name)}</strong><br>
                <small style="color: #94a3b8;">Due: <input type="date" value="${esc(reminder.dueDate)}" data-id="${esc(reminder.id)}" onchange="updateReminderDate(${esc(reminder.id)}, this.value)" style="margin-top: 8px; padding: 6px 8px; border-radius: 8px; border: 1px solid #e2e8f0;"></small>
              </div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="remove-btn" onclick="deleteReminder(${esc(reminder.id)})" style="background: #ef4444; padding: 4px 8px; font-size: 0.75rem;">Delete</button>
              <div class="status-badge ${reminder.completed ? 'status-completed' : 'status-pending'}">${reminder.completed ? 'COMPLETED' : 'PENDING'}</div>
            </div>
          </div>
        `;
        predefinedSection.appendChild(div);
      });
      container.appendChild(predefinedSection);
    }

    // Add AOB form at the bottom
    const aobForm = document.createElement('div');
    aobForm.style.marginTop = '30px';
    aobForm.innerHTML = `
      <h3>✨ Add New AOB Reminder</h3>
      <div class="card" style="padding: 16px;">
        <div class="form-group">
          <label for="new-aob-name">Reminder Name</label>
          <input type="text" id="new-aob-name" placeholder="E.g. Garden maintenance, Check windows, etc." style="margin-top: 8px;">
        </div>
        <div class="form-group">
          <label for="new-aob-date">Due Date</label>
          <input type="date" id="new-aob-date" style="margin-top: 8px;">
        </div>
        <button class="btn" onclick="addNewAOB()" style="background: linear-gradient(135deg, #06b6d4, #0ea5e9); margin-top: 12px;">+ Add AOB Reminder</button>
      </div>
    `;
    container.appendChild(aobForm);

    // Display existing AOB reminders
    if (aobReminders.length > 0) {
      const aobSection = document.createElement('div');
      aobSection.style.marginTop = '30px';
      aobSection.innerHTML = `
        <h3>✨ Your AOB Reminders</h3>
        <div id="aob-reminders">
      `;

      // Sort AOB reminders
      const sortedAOB = aobReminders.sort((a, b) => {
        if (a.completed && !b.completed) return 1;
        if (!a.completed && b.completed) return -1;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });

      sortedAOB.forEach(aob => {
        const aobDiv = document.createElement('div');
        aobDiv.className = 'reminder-item';
        aobDiv.style.marginBottom = '10px';
        aobDiv.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px;">
            <input type="checkbox" id="complete-aob-${esc(aob.id)}" ${aob.completed ? 'checked' : ''} onchange="toggleAOBStatus('${esc(aob.id)}')" style="width: 20px; height: 20px; cursor: pointer;">
            <div style="flex: 1;">
              <div><strong>${esc(aob.name || 'Untitled Reminder')}</strong></div>
              <div style="color: #94a3b8; font-size: 0.9em; margin-top: 4px;">
                Due: ${esc(aob.dueDate || 'Not set')}
              </div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="remove-btn" onclick="deleteAOBReminder('${esc(aob.id)}')" style="background: #ef4444; padding: 4px 8px; font-size: 0.75rem;">Delete</button>
              <div class="status-badge ${aob.completed ? 'status-completed' : 'status-pending'}">${aob.completed ? 'COMPLETED' : 'PENDING'}</div>
            </div>
          </div>
        `;
        aobSection.appendChild(aobDiv);
      });

      aobSection.innerHTML += `</div>`;
      container.appendChild(aobSection);
    }
  }

  // Add new AOB reminder
  function addNewAOB() {
    const name = document.getElementById('new-aob-name').value;
    const date = document.getElementById('new-aob-date').value;

    if (!name || !date) {
      showCustomAlert('Please fill in both the reminder name and due date', 'RentUK says');
      return;
    }

    const newAOB = {
      id: 'aob_' + Date.now(),
      name: name,
      dueDate: date,
      completed: false
    };

    aobReminders.push(newAOB);
    saveData();

    // Clear form
    document.getElementById('new-aob-name').value = '';
    document.getElementById('new-aob-date').value = '';

    loadReminders();
  }

  // Function to toggle reminder status
  function toggleReminderStatus(id) {
    const reminder = reminders.find(r => r.id == id);
    if (reminder) {
      reminder.completed = !reminder.completed;
      saveData();
      loadReminders(); // Refresh UI
      loadDashboard(); // Update dashboard too
    }
  }

  // Function to toggle AOB status
  function toggleAOBStatus(id) {
    const aob = aobReminders.find(a => a.id === id);
    if (aob) {
      aob.completed = !aob.completed;
      saveData();
      loadReminders(); // Refresh UI
      loadDashboard(); // Update dashboard too
    }
  }

  // Function to update reminder date
  function updateReminderDate(id, value) {
    const reminder = reminders.find(r => r.id == id);
    if (reminder) {
      reminder.dueDate = value;
      saveData();
      loadDashboard(); // Update dashboard too
    }
  }

  // Delete reminder function
  function deleteReminder(id) {
    reminders = reminders.filter(r => r.id != id);
    saveData();
    loadReminders();
    loadDashboard();
  }

  // Delete AOB reminder function
  function deleteAOBReminder(id) {
    aobReminders = aobReminders.filter(a => a.id !== id);
    saveData();
    loadReminders();
    loadDashboard();
  }

  // Dashboard functionality with completed checkboxes
  function loadDashboard() {
    const container = document.getElementById('dashboard-content');
    const currentProperty = getCurrentProperty();

    let dashboardHTML = `
      <div class="dashboard-section">
        <h2>${currentProperty ? `🏠 ${esc(currentProperty.name)}` : '🏠 Properties Overview'}</h2>
        <div class="card">
    `;

    // Property info
    if (currentProperty) {
      dashboardHTML += `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
          <div>
            <h3 style="color: #6366f1; margin-bottom: 8px;">Property</h3>
            <p style="font-size: 1.1em; font-weight: 600;">${esc(currentProperty.name)}</p>
            <p style="color: #94a3b8; font-size: 0.9em;">${esc(currentProperty.address || 'No address provided')}</p>
          </div>
      `;

      if (currentProperty.tenant) {
        dashboardHTML += `
          <div>
            <h3 style="color: #6366f1; margin-bottom: 8px;">Tenant</h3>
            <p style="font-size: 1.1em; font-weight: 600;">${esc(currentProperty.tenant.name)}</p>
            <p style="color: #94a3b8; font-size: 0.9em;">${esc(currentProperty.tenant.contact || 'No contact provided')}</p>
          </div>
          <div>
            <h3 style="color: #6366f1; margin-bottom: 8px;">Lease</h3>
            <p style="color: #94a3b8;">${esc(currentProperty.tenant.leaseStart || 'Not set')} to ${esc(currentProperty.tenant.leaseEnd || 'Not set')}</p>
          </div>
          <div>
            <h3 style="color: #6366f1; margin-bottom: 8px;">Monthly Rent</h3>
            <p style="font-size: 1.3em; font-weight: 700; color: #10b981;">£${esc(currentProperty.tenant.rentAmount || '0.00')}</p>
          </div>
        `;
      } else {
        dashboardHTML += `
          <div>
            <h3 style="color: #6366f1; margin-bottom: 8px;">Tenant</h3>
            <p style="color: #94a3b8;">No tenant assigned</p>
          </div>
          <div></div>
          <div></div>
        `;
      }
    } else {
      dashboardHTML += `
        <div style="text-align: center;">
          <p style="color: #94a3b8; margin-bottom: 16px;">No properties added yet</p>
          <button class="btn" onclick="showSetupWizard()" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);">
            ⚡ 60-second setup
          </button>
        </div>
      `;
    }

    dashboardHTML += `</div></div>`;

    if (currentProperty) dashboardHTML += renderCompliance(currentProperty) + renderTools() + renderTaxEstimate();

    // Financial summary (only if we have a current property)
    if (currentProperty) {
      const propertyExpenses = expenses.filter(expense => expense.propertyId === currentProperty.id);
      const totalExpenses = propertyExpenses.reduce((total, expense) => total + expense.amount, 0);
      const monthlyIncome = currentProperty.tenant ? (parseFloat(currentProperty.tenant.rentAmount) || 0) : 0;
      const netIncome = monthlyIncome - totalExpenses;

      dashboardHTML += `
        <div class="dashboard-section">
          <h2>📊 Financial Overview - ${esc(currentProperty.name)}</h2>
          <div class="financial-overview">
            <div class="financial-card income-card">
              <h3>Monthly Income</h3>
              <div class="amount">£${monthlyIncome.toFixed(2)}</div>
            </div>
            <div class="financial-card expenses-card">
              <h3>Total Expenses</h3>
              <div class="amount">£${totalExpenses.toFixed(2)}</div>
            </div>
            <div class="financial-card net-card">
              <h3>Net Income</h3>
              <div class="amount">£${netIncome.toFixed(2)}</div>
            </div>
          </div>
        </div>
      `;
    }

    // Combine all reminders for dashboard (only show reminders due within next month)
    const allReminders = [...reminders, ...aobReminders.filter(aob => aob.name !== '')];

    // Upcoming reminders (only pending, not completed, and due within next 30 days)
    dashboardHTML += `
      <div class="dashboard-section">
        <h2>📅 Upcoming Reminders (Next 30 Days)</h2>
        <div id="upcoming-reminders">
    `;

    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const thirtyDaysStr = thirtyDaysFromNow.toISOString().split('T')[0];

    const upcomingReminders = allReminders.filter(r => 
      r.dueDate && 
      r.dueDate >= today && 
      r.dueDate <= thirtyDaysStr && 
      !r.completed
    ).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    if (upcomingReminders.length > 0) {
      upcomingReminders.forEach(reminder => {
        const daysUntil = Math.ceil((new Date(reminder.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
        const daysText = daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`;
        dashboardHTML += `
          <div class="reminder-item">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <input type="checkbox" id="dashboard-complete-${esc(reminder.id)}" onchange="toggleDashboardReminderStatus(${esc(reminder.id)})" style="width: 20px; height: 20px; cursor: pointer;">
                <div>
                  <strong>${esc(reminder.name)}</strong>
                  <div style="font-size: 0.9em; color: #94a3b8;">Due: ${esc(reminder.dueDate)}</div>
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-weight: 600; color: #6366f1;">${daysText}</div>
                <div class="status-badge status-pending">PENDING</div>
              </div>
            </div>
          </div>
        `;
      });
    } else {
      dashboardHTML += `<div class="empty-state"><p>✅ No upcoming reminders in the next 30 days</p></div>`;
    }

    dashboardHTML += `</div></div>`;

    // Overdue reminders (only pending, not completed)
    const overdueReminders = allReminders.filter(r => r.dueDate && r.dueDate < today && !r.completed);
    if (overdueReminders.length > 0) {
      dashboardHTML += `
        <div class="dashboard-section">
          <h2 style="color: #ef4444;">⚠️ Overdue Reminders!</h2>
          <div id="overdue-reminders">
      `;
      overdueReminders.forEach(reminder => {
        const daysOverdue = Math.ceil((new Date() - new Date(reminder.dueDate)) / (1000 * 60 * 60 * 24));
        dashboardHTML += `
          <div class="reminder-item overdue">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <input type="checkbox" id="dashboard-overdue-complete-${esc(reminder.id)}" onchange="toggleDashboardReminderStatus(${esc(reminder.id)})" style="width: 20px; height: 20px; cursor: pointer;">
                <div>
                  <strong style="color: #ef4444;">${esc(reminder.name)}</strong>
                  <div style="font-size: 0.9em; color: #ef4444;">Due: ${esc(reminder.dueDate)}</div>
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-weight: 600; color: #ef4444;">${daysOverdue} days overdue</div>
                <div class="status-badge status-pending">OVERDUE</div>
              </div>
            </div>
          </div>
        `;
      });
      dashboardHTML += `</div></div>`;
    }

    container.innerHTML = dashboardHTML;
    bindCompliance(container);

    // Add export/import buttons
    addExportImportButtons();

  }


  // ---- Compliance Score ----
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const STATUS_ICON = { ok: '✅', soon: '⏳', expired: '❌', missing: '⚪' };

  const ukDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  function statusText(item) {
    if (item.kind === 'yes') return item.status === 'ok' ? 'Done' : 'Not done yet';
    if (item.status === 'missing') return 'Add the date of the last one';
    if (item.status === 'expired') return `Expired ${esc(ukDate(item.expires))}`;
    return `Renew by ${esc(ukDate(item.expires))} (${item.daysLeft === 1 ? '1 day' : item.daysLeft + ' days'})`;
  }

  function scoreRing(score, level, size) {
    return `<div class="score-ring level-${level}" style="--p:${score}; --size:${size}px">
      <span class="score-num" data-target="${score}">${score}</span></div>`;
  }

  function renderCompliance(property) {
    const r = RentUKLib.complianceScore(property.compliance, todayIso());
    const done = r.items.filter(i => i.status === 'ok').length;
    const headline = r.level === 'great' ? 'Looking great — you’re on top of it.'
      : r.level === 'fair' ? 'Nearly there. Fix the items below to reach 100.'
      : 'A few important checks are missing. Start at the top.';
    const rows = r.items.map(item => `
      <div class="check-row status-${item.status}">
        <span class="check-icon">${STATUS_ICON[item.status]}</span>
        <div class="check-text">
          <strong>${esc(item.label)}</strong>
          <small>${statusText(item)} · ${esc(item.hint)} · <a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Official guidance ↗</a></small>
        </div>
        ${item.kind === 'yes'
          ? `<button class="check-toggle ${item.status === 'ok' ? 'on' : ''}" data-check="${esc(item.key)}" aria-pressed="${item.status === 'ok'}">${item.status === 'ok' ? 'Yes' : 'No'}</button>`
          : `<input type="date" class="check-date" data-check="${esc(item.key)}" value="${esc((property.compliance || {})[item.key] || '')}" aria-label="Date of last ${esc(item.label)}">`}
      </div>`).join('');
    return `
      <div class="dashboard-section">
        <h2>🛡️ Compliance Score</h2>
        <div class="card score-card">
          <div class="score-head">
            ${scoreRing(r.score, r.level, 120)}
            <div>
              <p class="score-headline">${headline}</p>
              <p class="score-sub">${done} of ${r.items.length} checks complete</p>
              <button class="btn share-btn" id="share-score-btn">📣 Share my score</button>
            </div>
          </div>
          <div class="check-list">${rows}</div>
          <p class="score-note">England rules, simplified, checked against GOV.UK and HSE guidance on 30 Oct 2026. Informational only, not legal advice.</p>
        </div>
      </div>`;
  }

  function animateScores(root) {
    root.querySelectorAll('.score-num[data-target]').forEach(el => {
      const target = Number(el.dataset.target);
      const ring = el.parentElement;
      const start = performance.now();
      const step = now => {
        const t = Math.min(1, (now - start) / 900);
        const v = Math.round(target * (1 - Math.pow(1 - t, 3)));
        el.textContent = v;
        ring.style.setProperty('--p', v);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function updateCompliance(key, value) {
    const property = getCurrentProperty();
    if (!property) return;
    property.compliance = { ...(property.compliance || {}) };
    if (value === '' || value === false) delete property.compliance[key];
    else property.compliance[key] = value;
    saveData();
    loadDashboard();
  }

  function bindCompliance(root) {
    root.querySelectorAll('.check-toggle').forEach(btn =>
      btn.addEventListener('click', () => updateCompliance(btn.dataset.check, !btn.classList.contains('on'))));
    root.querySelectorAll('.check-date').forEach(input =>
      input.addEventListener('change', () => updateCompliance(input.dataset.check, input.value)));
    const share = root.querySelector('#share-score-btn');
    if (share) share.addEventListener('click', shareScore);
    const cal = root.querySelector('#calendar-btn');
    if (cal) cal.addEventListener('click', exportCalendar);
    const pack = root.querySelector('#move-in-btn');
    if (pack) pack.addEventListener('click', openMoveInPack);
    animateScores(root);
  }


  // ---- Quick tools ----
  function renderTools() {
    return `
      <div class="tool-row">
        <button class="tool-btn" id="calendar-btn"><span>📅</span>Add renewals to my calendar</button>
        <button class="tool-btn" id="move-in-btn"><span>📋</span>Tenant move-in pack</button>
      </div>`;
  }

  // ---- Tax estimate ----
  const money = n => '£' + Math.round(n).toLocaleString('en-GB');

  function renderTaxEstimate() {
    const est = RentUKLib.rentalEstimate(properties, expenses, RentUKLib.taxYearStart(todayIso()));
    const rows = est.rows.length > 1 ? est.rows.map(r => `
      <tr><td>${esc(r.name)}</td><td>${money(r.income)}</td><td>${money(r.costs)}</td></tr>`).join('') : '';
    const mtd = est.mtd.due
      ? `<div class="mtd mtd-due">📲 <strong>Making Tax Digital likely applies from ${esc(est.mtd.from)}</strong> — your rental income is over ${money(est.mtd.over)}. That means quarterly updates to HMRC with compatible software.</div>`
      : `<div class="mtd">✅ Rental income alone is under £20,000, so Making Tax Digital for Income Tax is not triggered by it. Self-employment income also counts towards the threshold.</div>`;
    return `
      <div class="dashboard-section">
        <h2>💷 Tax Year ${esc(est.taxYear.label)} Estimate</h2>
        <div class="card tax-card">
          <div class="tax-grid">
            <div><small>Rent (projected)</small><strong>${money(est.income)}</strong></div>
            <div><small>${est.useAllowance ? 'Property allowance' : 'Expenses'}</small><strong>− ${money(est.useAllowance ? Math.min(1000, est.income) : est.costs)}</strong></div>
            <div><small>Taxable profit</small><strong class="tax-profit">${money(est.profit)}</strong></div>
          </div>
          <p class="tax-bands">Tax on that profit: about <strong>${money(est.taxAt.basic)}</strong> at basic rate (20%), <strong>${money(est.taxAt.higher)}</strong> at higher rate (40%), or <strong>${money(est.taxAt.additional)}</strong> at additional rate (45%).</p>
          ${est.useAllowance && est.income > 0 ? '<p class="tax-tip">💡 Your expenses are under £1,000, so the £1,000 property allowance gives the lower profit. You can use one or the other, not both.</p>' : ''}
          ${mtd}
          ${rows ? `<table class="tax-table"><thead><tr><th>Property</th><th>Rent</th><th>Expenses</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
          <p class="score-note">Rough guide, not tax advice. Based on rent × lease dates in this tax year (6 Apr–5 Apr) and the expenses you have entered. Does not include mortgage interest relief, other income, joint ownership or personal allowance. Check with HMRC or an accountant.</p>
        </div>
      </div>`;
  }

  // ---- Calendar export ----
  function exportCalendar() {
    const events = [];
    const today = todayIso();
    properties.forEach(p => {
      RentUKLib.complianceScore(p.compliance, today).items
        .filter(i => i.expires)
        .forEach(i => events.push({
          uid: `${p.id}-${i.key}-${i.expires}`, date: i.expires,
          title: `Renew ${i.label} – ${p.name}`,
          description: `${i.hint}. Guidance: ${i.url}`
        }));
    });
    [...reminders, ...aobReminders].filter(r => r.dueDate && !r.completed && r.dueDate >= today)
      .forEach(r => events.push({ uid: `reminder-${r.id}-${r.dueDate}`, date: r.dueDate, title: r.name }));
    if (!events.length) {
      showCustomAlert('Nothing to add yet. Add certificate dates in the Compliance Score, or reminder due dates, then try again.', 'No dates yet');
      return;
    }
    const blob = new Blob([RentUKLib.buildIcs(events, new Date().toISOString())], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'rentuk-reminders.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showCustomAlert(`Saved ${events.length} date${events.length === 1 ? '' : 's'} as rentuk-reminders.ics. Open it to add them to Apple, Google or Outlook calendar — each one alerts you 14 days before.`, 'Calendar file ready');
  }

  // ---- Tenant move-in pack (printable) ----
  function openMoveInPack() {
    const p = getCurrentProperty();
    if (!p) return;
    const r = RentUKLib.complianceScore(p.compliance, todayIso());
    const box = ok => ok ? '☑' : '☐';
    const item = key => r.items.find(i => i.key === key);
    const certLine = key => {
      const i = item(key);
      return `<li>${box(i.status === 'ok')} ${esc(i.label)}${i.expires ? ` — valid until ${esc(ukDate(i.expires))}` : ''}: copy given to tenant</li>`;
    };
    const rooms = ['Entrance / hall', 'Living room', 'Kitchen', 'Bathroom', 'Bedroom 1', 'Bedroom 2', 'Garden / outside'];
    const t = p.tenant || {};
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Move-in pack – ${esc(p.name)}</title>
      <style>
        body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; max-width: 780px; margin: 24px auto; padding: 0 16px; }
        h1 { font-size: 22px; margin-bottom: 0; } h2 { font-size: 16px; border-bottom: 2px solid #6366f1; padding-bottom: 4px; margin-top: 24px; }
        ul { list-style: none; padding: 0; } li { padding: 3px 0; }
        table { width: 100%; border-collapse: collapse; } td, th { border: 1px solid #999; padding: 6px; text-align: left; vertical-align: top; }
        td { height: 28px; } .meta { color: #555; } .note { color: #555; font-size: 12px; margin-top: 24px; }
        .print { background: #6366f1; color: #fff; border: 0; padding: 10px 18px; border-radius: 8px; font-size: 15px; cursor: pointer; }
        @media print { .print { display: none; } body { margin: 0; } }
      </style></head><body>
      <button class="print" onclick="window.print()">🖨️ Print or save as PDF</button>
      <h1>Tenant move-in pack</h1>
      <p class="meta">${esc(p.name)}${p.address ? ' · ' + esc(p.address) : ''}<br>
        Tenant: ${esc(t.name || '____________________')} · Move-in date: ${esc(t.leaseStart ? ukDate(t.leaseStart) : '____________')}</p>

      <h2>1. Before the tenant moves in</h2>
      <ul>
        <li>${box(item('rightToRent').status === 'ok')} Right to Rent checked for every adult, copies of documents kept</li>
        <li>${box(item('rraInfo').status === 'ok')} Renters' Rights Act Information Sheet or written statement of terms given (as a printed copy or attached PDF — a link alone is not valid)</li>
        ${certLine('gas')}
        ${certLine('eicr')}
        ${certLine('epc')}
      </ul>

      <h2>2. On move-in day</h2>
      <ul>
        <li>${box(item('alarms').status === 'ok')} Every smoke alarm and CO alarm tested and working (tenant initials: ______)</li>
        <li>☐ Inventory below completed and signed by both</li>
        <li>☐ Meter readings taken (below)</li>
        <li>☐ Keys handed over (below)</li>
        <li>☐ Stopcock, boiler, fuse box and alarm locations shown to tenant</li>
      </ul>

      <h2>3. Within 30 days</h2>
      <ul>
        <li>${box(item('deposit').status === 'ok')} Deposit protected in a government-backed scheme and its required information given to the tenant</li>
      </ul>

      <h2>Meter readings</h2>
      <table><tr><th>Meter</th><th>Reading</th><th>Serial / location</th></tr>
        <tr><td>Electricity</td><td></td><td></td></tr><tr><td>Gas</td><td></td><td></td></tr><tr><td>Water</td><td></td><td></td></tr></table>

      <h2>Keys</h2>
      <table><tr><th>Key / fob</th><th>How many</th></tr>
        <tr><td>Front door</td><td></td></tr><tr><td>Back door</td><td></td></tr><tr><td>Windows</td><td></td></tr><tr><td>Other</td><td></td></tr></table>

      <h2>Inventory and condition</h2>
      <table><tr><th style="width:22%">Room</th><th>Items and condition (note marks, damage, cleanliness)</th><th style="width:12%">Photos taken</th></tr>
        ${rooms.map(room => `<tr><td>${room}</td><td style="height:48px"></td><td>☐</td></tr>`).join('')}</table>

      <h2>Signatures</h2>
      <table><tr><th>Landlord</th><th>Tenant</th></tr><tr><td style="height:56px">Signed:<br>Date:</td><td>Signed:<br>Date:</td></tr></table>

      <p class="note">Made with RentUK. Checklist for England, based on GOV.UK and HSE guidance checked on 30 Oct 2026. Informational only, not legal advice.</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { showCustomAlert('Your browser blocked the new window. Allow pop-ups for this page and try again.', 'Pop-up blocked'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  // ---- 60-second setup ----
  function showSetupWizard() {
    if (document.getElementById('setup-wizard')) return;
    const answers = { name: '', rent: '', compliance: {} };
    const overlay = document.createElement('div');
    overlay.id = 'setup-wizard';
    overlay.className = 'wizard-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    document.body.appendChild(overlay);
    const dates = RentUKLib.COMPLIANCE_ITEMS.filter(i => i.kind === 'date');
    const yeses = RentUKLib.COMPLIANCE_ITEMS.filter(i => i.kind === 'yes');
    let step = 0;

    function frame(body, nextLabel) {
      overlay.innerHTML = `
        <div class="wizard">
          <div class="wizard-progress"><span style="width:${(step + 1) * 25}%"></span></div>
          <button class="wizard-close" aria-label="Close setup">×</button>
          ${body}
          <div class="wizard-actions">
            ${step > 0 && step < 3 ? '<button class="wizard-back">Back</button>' : '<span></span>'}
            <button class="btn wizard-next">${nextLabel}</button>
          </div>
        </div>`;
      overlay.querySelector('.wizard-close').onclick = () => overlay.remove();
      const back = overlay.querySelector('.wizard-back');
      if (back) back.onclick = () => { step--; render(); };
      overlay.querySelector('.wizard-next').onclick = next;
      const first = overlay.querySelector('input, .yn');
      if (first) first.focus();
    }

    function render() {
      if (step === 0) {
        frame(`
          <p class="wizard-kicker">Step 1 of 3 · about 60 seconds</p>
          <h3>What do you call this property?</h3>
          <input id="wz-name" type="text" maxlength="60" placeholder="e.g. Flat 2, Oak Street house" value="${esc(answers.name)}">
          <label class="wizard-label" for="wz-rent">Monthly rent (optional)</label>
          <input id="wz-rent" type="number" min="0" step="1" placeholder="£" value="${esc(answers.rent)}">
          <p class="wizard-hint">🔒 Stays on this device. No account, no sign-up.</p>`, 'Next →');
      } else if (step === 1) {
        frame(`
          <p class="wizard-kicker">Step 2 of 3</p>
          <h3>When were these last done?</h3>
          <p class="wizard-hint">Not sure? Leave it blank and add it later.</p>
          ${dates.map(i => `
            <label class="wizard-label" for="wz-${i.key}">${esc(i.label)} <small>${esc(i.hint)}</small></label>
            <input id="wz-${i.key}" type="date" max="${todayIso()}" value="${esc(answers.compliance[i.key] || '')}">`).join('')}`, 'Next →');
      } else if (step === 2) {
        frame(`
          <p class="wizard-kicker">Step 3 of 3</p>
          <h3>Quick yes or no</h3>
          ${yeses.map(i => `
            <div class="yn-row">
              <span>${esc(i.label)}<small>${esc(i.hint)}</small></span>
              <button class="yn ${answers.compliance[i.key] ? 'on' : ''}" data-key="${esc(i.key)}" aria-pressed="${!!answers.compliance[i.key]}">${answers.compliance[i.key] ? 'Yes' : 'No'}</button>
            </div>`).join('')}`, 'See my score →');
        overlay.querySelectorAll('.yn').forEach(b => b.onclick = () => {
          answers.compliance[b.dataset.key] = !answers.compliance[b.dataset.key];
          render();
        });
      } else {
        const r = RentUKLib.complianceScore(answers.compliance, todayIso());
        const todo = r.items.filter(i => i.status !== 'ok').slice(0, 3);
        frame(`
          <p class="wizard-kicker">All set</p>
          <h3>Your compliance score</h3>
          <div class="wizard-score">${scoreRing(r.score, r.level, 150)}</div>
          ${todo.length ? `<p class="wizard-hint">Next to fix:</p><ul class="wizard-todo">${todo.map(i => `<li>${STATUS_ICON[i.status]} ${esc(i.label)}</li>`).join('')}</ul>`
            : '<p class="wizard-hint">🎉 Every check is complete. Nice work.</p>'}`, 'Go to my dashboard');
        animateScores(overlay);
      }
    }

    function next() {
      if (step === 0) {
        const name = overlay.querySelector('#wz-name').value.trim();
        if (!name) { overlay.querySelector('#wz-name').classList.add('invalid'); overlay.querySelector('#wz-name').focus(); return; }
        answers.name = name;
        answers.rent = overlay.querySelector('#wz-rent').value;
      } else if (step === 1) {
        dates.forEach(i => {
          const v = overlay.querySelector('#wz-' + i.key).value;
          if (v) answers.compliance[i.key] = v; else delete answers.compliance[i.key];
        });
      } else if (step === 2) {
        const rent = parseFloat(answers.rent);
        const property = {
          id: 'prop_' + Date.now(),
          name: answers.name,
          address: '',
          tenant: null,
          compliance: RentUKLib.cleanCompliance(answers.compliance),
          createdAt: new Date().toISOString()
        };
        if (Number.isFinite(rent) && rent > 0) {
          property.tenant = { name: '', contact: '', leaseStart: '', leaseEnd: '', rentAmount: String(rent) };
        }
        properties.push(property);
        currentPropertyId = property.id;
        saveData();
      } else {
        overlay.remove();
        loadPropertySelector();
        loadDashboard();
        return;
      }
      step++;
      render();
    }

    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') overlay.remove();
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') next();
    });
    render();
  }

  // ---- Share card (no names, addresses or tenant details) ----
  function drawShareCard(score, level, done, total) {
    const c = document.createElement('canvas');
    c.width = 1080; c.height = 1080;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 1080, 1080);
    bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#312e81');
    g.fillStyle = bg; g.fillRect(0, 0, 1080, 1080);
    const colour = level === 'great' ? '#10b981' : level === 'fair' ? '#f59e0b' : '#ef4444';
    const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#c7d2fe'; g.font = `600 44px ${font}`;
    g.fillText('MY RENTAL COMPLIANCE SCORE', 540, 160);
    g.lineWidth = 44; g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.arc(540, 500, 230, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = colour;
    g.beginPath(); g.arc(540, 500, 230, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * score / 100); g.stroke();
    g.fillStyle = '#ffffff'; g.font = `800 200px ${font}`;
    g.fillText(String(score), 540, 570);
    g.fillStyle = colour; g.font = `700 56px ${font}`;
    g.fillText(level === 'great' ? 'On top of it 💪' : level === 'fair' ? 'Getting there' : 'Work in progress', 540, 840);
    g.fillStyle = '#cbd5e1'; g.font = `400 40px ${font}`;
    g.fillText(`${done} of ${total} landlord checks complete`, 540, 905);
    g.fillStyle = '#94a3b8'; g.font = `500 34px ${font}`;
    g.fillText('RentUK · free, private, no sign-up · What’s your score?', 540, 1010);
    return c;
  }

  async function shareScore() {
    const property = getCurrentProperty();
    if (!property) return;
    const r = RentUKLib.complianceScore(property.compliance, todayIso());
    const done = r.items.filter(i => i.status === 'ok').length;
    const canvas = drawShareCard(r.score, r.level, done, r.items.length);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const file = new File([blob], `rentuk-score-${r.score}.png`, { type: 'image/png' });
    const text = `My rental compliance score is ${r.score}/100 on RentUK. What's yours?`;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showCustomAlert('Your score card image has been saved. It shows only your score — no names or addresses.', 'Score card ready');
  }

  // Function to toggle reminder status from dashboard
  function toggleDashboardReminderStatus(id) {
    // Find in reminders first
    let reminder = reminders.find(r => r.id == id);
    if (reminder) {
      reminder.completed = !reminder.completed;
      saveData();
      loadDashboard();
      loadReminders();
      return;
    }

    // Find in AOB reminders
    let aob = aobReminders.find(a => a.id == id);
    if (aob) {
      aob.completed = !aob.completed;
      saveData();
      loadDashboard();
      loadReminders();
    }
  }

  // Export / import buttons and local-storage notice on the dashboard
  function addExportImportButtons() {
    const dashboardContent = document.getElementById('dashboard-content');
    if (!dashboardContent) return;
    const box = document.createElement('div');
    box.className = 'card';
    box.style.marginTop = '20px';
    box.style.textAlign = 'center';
    box.innerHTML = `
      <p style="margin: 0 0 12px 0; font-size: 0.9rem; color: #94a3b8;">
        🔒 Your data is stored only in this browser on this device. Nothing is sent to any server.
        Clearing browser data deletes it, so export a backup regularly and store it securely.
      </p>
      <button class="btn" id="export-data-btn" style="margin-right: 10px;">⬇️ Export backup</button>
      <label class="btn" style="cursor: pointer;">⬆️ Import backup
        <input type="file" id="import-data-input" accept="application/json,.json" style="display: none;">
      </label>
    `;
    box.querySelector('#export-data-btn').addEventListener('click', exportData);
    box.querySelector('#import-data-input').addEventListener('change', importData);
    dashboardContent.appendChild(box);
  }

  // Setup tab navigation
  function setupTabNavigation() {
    document.querySelectorAll('.nav-btn').forEach(button => {
      button.addEventListener('click', () => {
        // Remove active class from all tabs and buttons
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

        // Add active class to clicked button
        button.classList.add('active');

        // Show corresponding tab
        const tabId = button.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');

        // Load tab content
        if (tabId === 'expenses') loadExpenses();
        if (tabId === 'reminders') loadReminders();
        if (tabId === 'tenants') loadTenants();
        if (tabId === 'dashboard') loadDashboard();
      });
    });
  }

  // Initialize app
  initApp();

  // Make functions available globally for HTML onclick
  window.exportData = exportData;
  window.importData = importData;
  window.toggleReminderStatus = toggleReminderStatus;
  window.toggleAOBStatus = toggleAOBStatus;
  window.toggleDashboardReminderStatus = toggleDashboardReminderStatus;
  window.deleteReminder = deleteReminder;
  window.deleteAOBReminder = deleteAOBReminder;
  window.addNewAOB = addNewAOB;
  window.showCustomAlert = showCustomAlert;
  window.showFeedbackForm = showFeedbackForm;
  window.submitFeedback = submitFeedback;
  window.showAddPropertyForm = showAddPropertyForm;
  window.addNewProperty = addNewProperty;
  window.setCurrentProperty = setCurrentProperty;
  window.editTenant = editTenant;
  window.updateReminderDate = updateReminderDate;
  window.showSetupWizard = showSetupWizard;
});