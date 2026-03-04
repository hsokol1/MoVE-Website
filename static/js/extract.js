//EXTRATOR DICTIONARY
const selectedVariables = {
  geography: {
    level: null,       
    states: [],         
    counties: []        
  },
  includeMoveScore: true,
  variables: {
    county: [],
    state: [],
    census: []
  }
};

//Geography
const geoRadios = document.querySelectorAll('input[name="geo_level"]');
const stateInput = document.getElementById("stateInput");
const countyInput = document.getElementById("countyInput");

//MoVE toggle
const includeMoveCheckbox = document.getElementById("includeMoveScore");

//Variable selectors
const countyVariable = document.getElementById("CountyVar");
const stateVariable = document.getElementById("StateVar");
const censusVariable = document.getElementById("CensusVar");

//Action buttons
const previewButton = document.getElementById("previewBtn");
const clearButton = document.getElementById("clearBtn");
const exportCsvButton = document.getElementById("exportCsvBtn");
const exportJsonButton = document.getElementById("exportJsonBtn");

//Selected variables display
const selectedVariablesContainer = document.getElementById("selected-variables");

//Preview table
const previewTable = document.getElementById("preview-table");
const previewTableHead = previewTable.querySelector("thead");
const previewTableBody = previewTable.querySelector("tbody");

//Messages
const extractorMessages = document.getElementById("extractor-messages");

const selectedVarsEl = document.getElementById("selected-variables");

//Preview Table
let previewTabulator = null;

//Info Popup
let activePopup = null;
const infoText = {
  "export-level": `
    <ul class="info-list">
      <li>Data will be returned in one county per row format.</li>
      <li>Choose <strong>State</strong> to export all counties within the selected state.</li>
      <li>Choose <strong>County</strong> to export only the specified county.</li>
    </ul>
  `,
  "multi-export": `
    <div>
      <p style="margin:0 0 6px 0;">
        To export multiple states or counties, separate entries using commas.
      </p>
      <p style="margin:0;">
        <em>Example:</em><br>
        <code>MD, VA, PA</code><br>
        <code>24005, 24003, 24510</code>
      </p>
    </div>
  `,
  "move-score": `
    <div>
      <p style="margin:0 0 8px 0;">
        The MoVE (Measurement of Voting Equity) score is a composite score that summarizes various factors related to voting access and equity at the county level.
      </p>
      <p style="margin:0;">
        <a href="/methods" target="_blank" rel="noopener">
          Learn more about the MoVE methodology
        </a>
      </p>
    </div>
    `,
  "county-vars": `
    <div>
      <p style="margin:0 0 8px 0;">
        County MoVE variables consist of various metrics related to voting access and equity at the county level.
      </p>
      <p style="margin:0;">
        <a href="/variables" target="_blank" rel="noopener">
          Learn more about the MoVE variables
        </a>
      </p>
    </div>
    `,
  "state-vars": `
    <div>
      <p style="margin:0 0 8px 0;">
        State MoVE variables consist of various metrics related to voting access and equity at the state level.
      </p>

      <p style="margin:0 0 6px 0;">
        <a href="#" target="_blank" rel="noopener">
          Learn more about the MoVE variables
        </a>
      </p>

      <p style="margin:0; font-size:0.75rem; color:var(--muted);">
        If you export multiple counties within the same state, the state-level variables will be duplicated across those counties since they are the same for all counties in a state.
      </p>
    </div>
  `,
  "census-vars": `
    <div>
      <p style="margin:0 0 8px 0;">
        Various U.S. Census ACS county-level variables.
      </p>
      <p style="margin:0;">
        <a href="#" target="_blank" rel="noopener">
          Visit the Census Bureau's ACS website
        </a>
      </p>
    </div>
  `
};

//Helper Functions
function parseCsvList(raw) {
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderPills(items, varTypeKey = null) {
  if (!items || items.length === 0) {
    return `<span style="color: var(--muted); font-size: 0.9rem;">None</span>`;
  }

  return items.map(item => {
    const id = (typeof item === "string") ? item : item.id;
    const label = (typeof item === "string")
      ? item
      : (item.label ?? item.id ?? JSON.stringify(item));

    // ✅ Only var type 1 should quick-link
    const isQuickLink = (varTypeKey === "county");

    const removeBtn = varTypeKey ? `
      <button type="button"
        class="remove-pill-btn"
        data-vartype="${escapeHtml(varTypeKey)}"
        data-id="${escapeHtml(id)}"
        aria-label="Remove ${escapeHtml(label)}"
        style="margin-left:8px;border:none;background:transparent;cursor:pointer;font-size:1rem;line-height:1;color:var(--muted);"
      >×</button>
    ` : "";

    return `
      <span
        class="pill ${isQuickLink ? "var-pill-link" : ""}"
        ${isQuickLink ? `data-id="${escapeHtml(id)}"` : ""}
        style="
          display:inline-flex;
          align-items:center;
          padding:4px 8px;
          border:1px solid var(--border);
          border-radius:999px;
          font-size:0.85rem;
          margin:3px 6px 0 0;
          background: var(--panel, transparent);
          ${isQuickLink ? "cursor:pointer;" : ""}
        "
      >
        ${escapeHtml(label)}
        ${removeBtn}
      </span>
    `;
  }).join("");
}

function populateSelect(selectEl, values) {
  selectEl.innerHTML = "";

  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  });
}

function wireAddVariableButtons() {
  const buttons = document.querySelectorAll(".add-var-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const fieldset = btn.closest("fieldset");
      if (!fieldset) return;

      const varTypeKey = fieldset.dataset.vartype; 
      const selectEl = fieldset.querySelector("select");

      if (!varTypeKey || !selectEl) return;

      addVariableToState(varTypeKey, selectEl);
    });
  });
}

function countSelectedVars(varsObj) {
  const v1 = varsObj.variables.county?.length ?? 0;
  const v2 = varsObj.variables.state?.length ?? 0;
  const v3 = varsObj.variables.census?.length ?? 0;
  return v1 + v2 + v3;
}

//GEOGRAPHY SYNCING
function syncAllFromUI() {
  const selectedRadio = document.querySelector('input[name="geo_level"]:checked');
  selectedVariables.geography.level = selectedRadio ? selectedRadio.value : null;

  selectedVariables.includeMoveScore = includeMoveCheckbox.checked;

  syncGeoFromInputs();
}

function syncGeoFromInputs() {
  selectedVariables.geography.states = parseCsvList(stateInput.value);

  if (selectedVariables.geography.level === "county") {
    selectedVariables.geography.counties = parseCsvList(countyInput.value);
  } else {
    selectedVariables.geography.counties = [];
  }
}

function handleGeoLevelChange() {
  const selectedRadio = document.querySelector('input[name="geo_level"]:checked');
  selectedVariables.geography.level = selectedRadio ? selectedRadio.value : null;

  if (selectedVariables.geography.level === "county") {
    stateInput.value = "";
    stateInput.disabled = true;
    selectedVariables.geography.states = [];
    countyInput.disabled = false;
    countyInput.focus();
  } else {
    countyInput.disabled = true;
    countyInput.value = "";
    selectedVariables.geography.counties = [];
    stateInput.disabled = false;
  }
}


//SELECTED VARIABLES UI
function updateSelectedVariablesUI() {
  const geo = selectedVariables.geography;

  const states = geo.states ?? [];
  const counties = geo.counties ?? [];

  const includeMove = selectedVariables.includeMoveScore;

  const v1 = selectedVariables.variables.county ?? [];
  const v2 = selectedVariables.variables.state ?? [];
  const v3 = selectedVariables.variables.census ?? [];

  const totalVars = v1.length + v2.length + v3.length;

  selectedVariablesContainer.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px;">

      <div>
        <div style="font-size:0.9rem; color:var(--muted); margin-bottom:6px;">Geography</div>
        <div style="display:grid; grid-template-columns: 120px 1fr; gap:6px 12px; font-size:0.95rem;">
          <div style="color:var(--muted);">Level</div>
          <div>${escapeHtml(geo.level || "—")}</div>

          <div style="color:var(--muted);">States</div>
          <div>${renderPills(states)}</div>

          <div style="color:var(--muted);">Counties</div>
          <div>${renderPills(counties)}</div>
        </div>
      </div>

      <div>
        <div style="font-size:0.9rem; color:var(--muted); margin-bottom:6px;">Options</div>
        <div style="font-size:0.95rem;">
          MoVE score: <span style="font-weight:600;">${includeMove ? "Included" : "Not included"}</span>
        </div>
      </div>

      <div>
        <div style="font-size:0.9rem; color:var(--muted); margin-bottom:6px;">
          Variables (${totalVars})
        </div>

        ${totalVars === 0 ? `
          <span style="color: var(--muted); font-size: 0.9rem;">
            No variables selected yet. Use the “Add Variable” buttons on the left.
          </span>
        ` : `
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div>
              <div style="font-size:0.9rem; color:var(--muted); margin-bottom:6px;">County</div>
              <div>${renderPills(v1, "county")}</div>
            </div>

            <div>
              <div style="font-size:0.9rem; color:var(--muted); margin-bottom:6px;">State</div>
              <div>${renderPills(v2, "state")}</div>
            </div>

            <div>
              <div style="font-size:0.9rem; color:var(--muted); margin-bottom:6px;">Census</div>
              <div>${renderPills(v3, "census")}</div>
            </div>
          </div>
        `}
      </div>

    </div>
  `;
}


//SELECTED VARIABLES MANAGEMENT
function removeSelectedVariable(varTypeKey, idToRemove) {
  const arr = selectedVariables.variables[varTypeKey];
  if (!Array.isArray(arr)) return;

  selectedVariables.variables[varTypeKey] = arr.filter(v => {
    if (typeof v === "string") return v !== idToRemove;
    return v.id !== idToRemove;
  });

  updateSelectedVariablesUI();
}

function addVariableToState(varTypeKey, selectEl) {
  const value = selectEl.value;
  if (!value) return;
  const label = selectEl.options[selectEl.selectedIndex].textContent;
  const arr = selectedVariables.variables[varTypeKey];
  const alreadyExists = arr.some(v => (typeof v === "string" ? v === value : v.id === value));
  if (alreadyExists) return;
  arr.push({ id: value, label });
  updateSelectedVariablesUI();
}

//REMOVE BUTTON
function clearSelections() {
  selectedVariables.geography.level = "state";
  selectedVariables.geography.states = [];
  selectedVariables.geography.counties = [];
  selectedVariables.includeMoveScore = true;

  selectedVariables.variables.county = [];
  selectedVariables.variables.state = [];
  selectedVariables.variables.census = [];

  const stateRadio = document.querySelector('input[name="geo_level"][value="state"]');
  const countyRadio = document.querySelector('input[name="geo_level"][value="county"]');

  if (stateRadio) stateRadio.checked = true;
  if (countyRadio) countyRadio.checked = false;

  stateInput.value = "";
  countyInput.value = "";
  stateInput.disabled = false;
  countyInput.disabled = true; 

  includeMoveCheckbox.checked = true;

  // if (countyVariable) countyVariable.value = "";
  // if (stateVariable) stateVariable.value = "";
  // if (censusVariable) censusVariable.value = "";

  if (previewTableHead) previewTableHead.innerHTML = "";
  if (previewTableBody) previewTableBody.innerHTML = "";
  if (extractorMessages) extractorMessages.textContent = "";
  updateSelectedVariablesUI();
  clearPreview();
}



//Load variable lists from server
async function loadVariables() {
  try {
    const response = await fetch("/all-variables");
    if (!response.ok) {
      throw new Error("Failed to load variables");
    }
    const data = await response.json();
    console.log("Loaded variable lists:", data);
    populateSelect(countyVariable, data.county_variables || []);
    populateSelect(stateVariable, data.state_variables || []);
    populateSelect(censusVariable, data.census_variables || []);
  } catch (err) {
    console.error(err);
    extractorMessages.textContent = "Error loading variable lists.";
  }
}



//PREVIEW TABLE
function showPreview(rows) {
  if (!rows || rows.length === 0) return;
  document.getElementById("preview-placeholder").style.display = "none";
  const previewRows = rows.slice(0, 30);
  const columns = Object.keys(rows[0]).slice(0, 6).map((key) => ({
    title: key,
    field: key,
    headerSort: true,
    minWidth: 160,
    tooltip: true,
  }));
  previewTabulator = new Tabulator("#preview-grid", {
    data: previewRows,
    columns,
    layout: "fitDataTable",     // stretches columns to fill width (nice preview feel)
    responsiveLayout: "collapse", // hides overflow columns into a dropdown/row area
    pagination: "local",
    paginationSize: 10,
  });
}

function clearPreview() {
  if (previewTabulator) {
    previewTabulator.destroy();
    previewTabulator = null;
  }
  document.getElementById("preview-grid").innerHTML = "";
  document.getElementById("preview-placeholder").style.display = "block";
}



//EXTRACTION
function validateExtractionState(varsObj) {
  const errors = [];
  const totalVars = countSelectedVars(varsObj);
  if (totalVars < 1) {
    errors.push("Select at least one variable before extracting.");
  }
  const level = varsObj.geography.level;
  if (level === "county") {
    if (!Array.isArray(varsObj.geography.counties) || varsObj.geography.counties.length < 1) {
      errors.push("Enter at least one county ID (comma-separated) for county-level export.");
    }
  } else if (level === "state") {
    if (!Array.isArray(varsObj.geography.states) || varsObj.geography.states.length < 1) {
      errors.push("Enter at least one state (comma-separated) for state-level export.");
    }
  } else {
    errors.push("Choose an export level (state or county).");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

async function performExtraction(Type) {
  syncGeoFromInputs();
  const result = validateExtractionState(selectedVariables);

  if (!result.ok) {
    extractorMessages.innerHTML = `
      <div style="padding:8px 10px; border:1px solid var(--border); background:rgba(255,0,0,0.04);">
        ${result.errors.map(e => `<div>• ${escapeHtml(e)}</div>`).join("")}
      </div>
    `;
    return;
  }
  extractorMessages.textContent = "";
  const payload = structuredClone(selectedVariables);
  console.log("Sending extraction payload:", payload);

  try {
    const res = await fetch("/data-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(`Extraction failed (${res.status})`);
    }
    const data = await res.json();
    console.log("Extraction result:", data);

    if (Type == "preview") {
      showPreview(data.data);
    }
    if (Type == "CSV") {
      downloadCSVFromObjects(data.data)
    }
    extractorMessages.textContent = "Extraction completed successfully.";
  } catch (err) {
    console.error(err);
    extractorMessages.textContent = "Extraction failed. Check console for details.";
  }
}



//DOWNLOADS
function downloadCSVFromObjects(rows, filename = "export.csv") {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("rows must be a non-empty array");
  }
  const headerSet = new Set();
  for (const r of rows) Object.keys(r || {}).forEach(k => headerSet.add(k));
  const headers = Array.from(headerSet);
  const escapeCell = (value) => {
    if (value === null || value === undefined) return "";
    const s = String(value);
    
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csvLines = [];
  csvLines.push(headers.map(escapeCell).join(","));
  for (const r of rows) {
    const line = headers.map(h => escapeCell(r?.[h]));
    csvLines.push(line.join(","));
  }
  const csv = csvLines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadJSONFromObjects(rows, filename = "export.json") {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("rows must be a non-empty array");
  }
  const json = JSON.stringify(rows, null, 2); // pretty-printed JSON
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}



//Initialization
function initExtractorUI() {
  geoRadios.forEach(radio => radio.addEventListener("change", () => {
    handleGeoLevelChange();
    syncAllFromUI();
    updateSelectedVariablesUI();
  }));

  stateInput.addEventListener("input", () => {
    syncGeoFromInputs();
    updateSelectedVariablesUI();
  });

  countyInput.addEventListener("input", () => {
    syncGeoFromInputs();
    updateSelectedVariablesUI();
  });

  includeMoveCheckbox.addEventListener("change", () => {
    selectedVariables.includeMoveScore = includeMoveCheckbox.checked;
    updateSelectedVariablesUI();
  });

  selectedVariablesContainer.addEventListener("click", (e) => {
    const btn = e.target.closest(".remove-pill-btn");
    if (!btn) return;
    const varTypeKey = btn.dataset.vartype;
    const idToRemove = btn.dataset.id;
    removeSelectedVariable(varTypeKey, idToRemove);
  });

  document.querySelectorAll(".info-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      if (activePopup) {
        activePopup.remove();
        activePopup = null;
      }
      const popup = document.createElement("div");
      popup.className = "info-popup";
      popup.innerHTML = infoText[btn.dataset.info] || "No description available.";
      btn.style.position = "relative";
      btn.appendChild(popup);
      activePopup = popup;
    });
  });

  document.addEventListener("click", () => {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }
  });

  document.querySelectorAll(".var-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.target;
        document.querySelectorAll(".var-tab").forEach(t =>
          t.classList.remove("active")
        );
        tab.classList.add("active");
        document.querySelectorAll(".var-panel").forEach(panel => {
          panel.classList.toggle(
            "active",
            panel.dataset.vartype === target
          );
        });
      });
    });

    selectedVarsEl.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-pill-btn")) {
        e.stopPropagation();
        return;
      }

      // ✅ Only type 1 pills have this class
      const pill = e.target.closest(".var-pill-link");
      if (!pill) return;

      const id = pill.dataset.id;

      window.parent.postMessage(
        { type: "JUMP_TO_VAR", id},
        window.location.origin
      );
    });

    clearButton.addEventListener("click", clearSelections);

    previewButton.addEventListener("click", () => performExtraction("preview"));
    exportCsvButton.addEventListener("click", () => performExtraction("CSV"));
    exportJsonButton.addEventListener("click", () => performExtraction("JSON"));
    
    loadVariables();
    wireAddVariableButtons();
    handleGeoLevelChange();
    syncAllFromUI();
    updateSelectedVariablesUI();

    console.log("Initialized selectedVariables:", selectedVariables);
}

initExtractorUI();
