///STYLE FUNCTIONS IN STATE VIEW///
function showCountySidebar(feature) {
  const geoid = String(feature.properties.GEOID).padStart(5, "0");      // county GEOID (usually 5 digits)
  const score = App.getCountyScore(geoid);

  const stateData = App.StateCensusData || {};
  const censusObj =
    stateData[String(Number(geoid)).padStart(5, "0")] ||
    null;

  const d = censusObj?.data || {};

  const popRaw = d["Overall Population"];
  const earnRaw = d["Overall median earnings"];
  const bachRaw = d["Overall Bachelor's degree population"];

  const pop = popRaw != null && popRaw !== "" ? Number(popRaw).toLocaleString() : "N/A";
  const earn = earnRaw != null && earnRaw !== "" ? `$${Number(earnRaw).toLocaleString()}` : "N/A";
  const bach = bachRaw != null && bachRaw !== "" ? Number(bachRaw).toLocaleString() : "N/A";

  document.getElementById("sidebar").innerHTML = `
    <button onclick="showStateSidebar(App.selectedStateName, App.selectedStateFP)" class="sidebar-button">
      Back to State
    </button>

    <h2>${feature.properties.NAME} County</h2>

    <p><strong>MoVE Score:</strong> ${score ?? "N/A"}</p>

    <h3 style="margin-top:12px;">County Demographics</h3>

    ${
      censusObj
        ? `<ul style="list-style:none; padding-left:0; margin-top:8px;">
            <li><strong>Population:</strong> ${pop}</li>
            <li><strong>Median Earnings:</strong> ${earn}</li>
            <li><strong>Bachelor’s Degree Population:</strong> ${bach}</li>
          </ul>`
        : `<p style="margin-top:8px;">Census data not available for GEOID ${geoid}.</p>`
    }
  `;
}


function showStateSidebar(stateName, stateFP) {
  const avg = App.getStateScore(stateFP);

  let countyList = '';
  App.selectedCountiesData.features.forEach(f => {
    const score = App.getCountyScore(f.properties.GEOID);
    if (score !== null) {
      countyList += `
        <li>
          ${f.properties.NAME}: <strong>${score}</strong>
        </li>`;
    }
  });

  document.getElementById('sidebar').innerHTML = `
    <button onclick="returnToUSView()" class="sidebar-button">Back to US</button>
    <h2>${stateName}</h2>
    <p><strong>Average MoVE Score:</strong> ${avg ?? 'N/A'}</p>
    <h3>Counties</h3>
    <ul>${countyList}</ul>
  `;
}

function countyStyle(feature) {
  const geoid = String(feature.properties.GEOID).padStart(5, "0");
  const score = App.countyScores?.[geoid]?.score ?? null;

  return {
    fillColor: score != null ? getColor(score) : "#ccc",
    weight: 1,
    color: "#003049",
    fillOpacity: 0.5
  };
}



/// INTERACTION FUNCTIONS FOR COUNTIES ///
function onEachCounty(feature, layer) {
  const geoid = String(feature.properties.GEOID).padStart(5, "0");
  const score = App.countyScores?.[geoid]?.score ?? null;

  layer.bindTooltip(
    `<strong>${feature.properties.NAME} County</strong><br/>
     Score: ${score != null ? score.toFixed(2) : "N/A"}`,
    {
      sticky: true,
      direction: "top",
      className: "hover-tooltip",
    }
  );

  layer.on({
    click: () => showCountySidebar(feature),
    mouseover: (e) => e.target.setStyle({ fillOpacity: 0.9 }),
    mouseout: (e) => App.activeCountyLayer.resetStyle(e.target),
  });
}



/// LOAD DATA FOR STATE VIEW ///
async function loadCountyGeoForState(stateFP) {
  // Load master counties once
  if (!App.usCountiesData) {
    const res = await fetch("https://raw.githubusercontent.com/BrendanHodges/DATA-ACCESS/refs/heads/main/us_counties.json");
    if (!res.ok) {
      throw new Error(`us_counties.json failed: ${res.status}`);
    }
    App.usCountiesData = await res.json();
  }

  const fp = String(stateFP).padStart(2, "0");

  // Filter to selected state
  App.selectedCountiesData = {
    type: "FeatureCollection",
    features: App.usCountiesData.features.filter(f => f.properties.STATEFP === fp)
  };
}

async function loadCountyScoresForState(stateFP) {
  // Load once
  if (Object.keys(App.allCountyScores).length === 0) {
    const res = await fetch("/api/county-scores");
    if (!res.ok) {
      throw new Error(`/api/county-scores failed: ${res.status}`);
    }
    App.allCountyScores = await res.json();
  }
  console.log(App.allCountyScores);
  const fp = String(stateFP).padStart(2, "0");

  // Filter to selected state
  const filtered = {};
  for (const [geoid, data] of Object.entries(App.allCountyScores)) {
    if (String(geoid).startsWith(fp)) {
      filtered[geoid] = data;
    }
  }

  // Store current state's county scores
  App.countyScores = filtered;
}

async function loadStateCensusData(stateFP) {
  const res = await fetch(`/api/state-census/${stateFP}`);

  if (!res.ok) {
    throw new Error(`State census fetch failed: ${res.status}`);
  }

  App.StateCensusData = await res.json();
  console.log(App.StateCensusData);
}

/// INITIALIZATION STATE VIEW FUNCTIONS ///
async function showCountiesForState(stateFP) { 
  if (App.activeCountyLayer) App.map.removeLayer(App.activeCountyLayer);

  await Promise.all([
    loadCountyGeoForState(stateFP),
    loadCountyScoresForState(stateFP),
    loadStateCensusData(stateFP)
  ]);

  App.activeCountyLayer = L.geoJSON(App.selectedCountiesData, {
    style: countyStyle,
    onEachFeature: onEachCounty
  }).addTo(App.map);
}

async function enterStateView(feature, layer) { // made async to await showCountiesForState
  App.selectedStateFP = feature.properties.STATEFP;
  App.selectedStateName = feature.properties.NAME;

  App.map.fitBounds(layer.getBounds(), { padding: [20, 20] });

  // Remove US layer
  if (App.usStatesLayer && App.map.hasLayer(App.usStatesLayer)) {
    App.map.removeLayer(App.usStatesLayer);
  }

  // Remove existing counties layer
  if (App.activeCountyLayer && App.map.hasLayer(App.activeCountyLayer)) {
    App.map.removeLayer(App.activeCountyLayer);
  }

  await showCountiesForState(App.selectedStateFP);
  showStateSidebar(App.selectedStateName, App.selectedStateFP);
}



/// RETURN TO US VIEW FUNCTION ///
function returnToUSView() {
  showUSSidebar();
  App.selectedStateFP = null;
  App.selectedStateName = null;

  if (App.activeCountyLayer && App.map.hasLayer(App.activeCountyLayer)) {
    App.map.removeLayer(App.activeCountyLayer);
  }

  if (App.usStatesLayer && !App.map.hasLayer(App.usStatesLayer)) { // fixed: App.usStatesLayer/App.map
    App.usStatesLayer.addTo(App.map);
  }

  App.map.setView([37.8, -96], 4); // fixed: App.map
}
