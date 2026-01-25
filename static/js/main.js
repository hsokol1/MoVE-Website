//map setup
const map = L.map('map', { doubleClickZoom: false }).setView([39.8, -98.6], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

//ignore till you see the stuff in caps - i had to use some old code
let usStatesLayer = null;
let usCountiesData = null;
let activeCountyLayer = null;
let selectedStateFP = null;

const countyPopulation = {};
let stateScores = {};
let countyScores = {};

/*state/county population and state/county scores -
had to use my old code, because it was not fetching for me*/
async function loadCountyPopulation() {
  const url = 'https://api.census.gov/data/2020/dec/pl?get=P1_001N,STATE,COUNTY&for=county:*';
  const res = await fetch(url);
  const data = await res.json();
  data.slice(1).forEach(row => {
    const population = parseInt(row[0], 10);
    const stateFP = row[1];
    const countyFP = row[2];
    countyPopulation[stateFP + countyFP] = population;
  });
}

async function loadScores() {
  const stateRes = await fetch('/api/state-scores');   // state scores endpoint
  stateScores = await stateRes.json();

  const countyRes = await fetch('/api/county-scores'); // county scores endpoint
  countyScores = await countyRes.json();
}

//color helper - previously defined in original code
function getColor(score) {
  return score > 80 ? "#1a9850" :
         score > 60 ? "#66bd63" :
         score > 40 ? "#4575b4" :
         score > 20 ? "#f46d43" :
                      "#d73027";
}

//this is in your app definition
function getStateAverageScore(stateFP) {
  return stateScores[stateFP]?.score ?? null;
}
function getCountyScore(geoid) {
  return countyScores[geoid]?.score ?? null;
}
function getCountyPopulation(geoid) {
  return countyPopulation[geoid] ?? null;
}

//ignore this as well - most likely in other two js files
Promise.all([
  fetch('/static/us_states.json').then(r => r.json()),
  fetch('/static/us_counties.json').then(r => r.json()),
  loadCountyPopulation(),
  loadScores()
]).then(([statesData, countiesData]) => {
  usCountiesData = countiesData;

  usStatesLayer = L.geoJSON(statesData, {
    style: stateStyle,
    onEachFeature: onEachState
  }).addTo(map);

  showUSSidebar();
}).catch(err => console.error(err));

//OPACITY WAS CHANGED - SHOULD BE IN STATE.JS
function stateStyle(feature) {
  const avg = getStateAverageScore(feature.properties.STATEFP);
  return {
    fillColor: avg ? getColor(avg) : '#ccc',
    weight: 1,
    color: '#003049',
    fillOpacity: 0.5
  };
}

function countyStyle(feature) {
  const score = getCountyScore(feature.properties.GEOID);
  return {
    fillColor: score ? getColor(score) : '#eee',
    weight: 1,
    color: '#003049',
    fillOpacity: 0.5
  };
}

//
function onEachState(feature, layer) {
  const avg = getStateAverageScore(feature.properties.STATEFP);

  layer.bindTooltip(
    `<strong>${feature.properties.NAME}</strong><br/>Avg Score: ${avg ?? 'N/A'}`,
    { sticky: true, direction: 'top', className: 'hover-tooltip' }
  );

  layer.on({
    click: () => handleStateClick(feature, layer),
    mouseover: e => e.target.setStyle({ fillOpacity: 0.9 }),
    mouseout: e => usStatesLayer.resetStyle(e.target)
  });
}
/*THIS is in your us.js file 
  - add if loading screen is not working*/
function handleStateClick(feature, layer) {
  showDashboardLoading(); // show overlay inside dashboard
  selectedStateFP = feature.properties.STATEFP;

  map.fitBounds(layer.getBounds(), { padding: [20, 20] });
  map.removeLayer(usStatesLayer);

  setTimeout(() => {
    showCountiesForState(selectedStateFP);
    showStateSidebar(feature.properties.NAME);
    hideDashboardLoading(); // hide overlay when done
  }, 100);
}

//county layer
function showCountiesForState(stateFP) {
  if (activeCountyLayer) map.removeLayer(activeCountyLayer);

  const filtered = {
    type: 'FeatureCollection',
    features: usCountiesData.features.filter(f => f.properties.STATEFP === stateFP)
  };

  activeCountyLayer = L.geoJSON(filtered, {
    style: countyStyle,
    onEachFeature: onEachCounty
  }).addTo(map);
}
/*CHECK if needed for your state.js code 
  - ADD LOADING CODE*/
function onEachCounty(feature, layer) {
   layer.bindTooltip(
    `<strong>${feature.properties.NAME} County</strong><br/>
     Score: ${getCountyScore(feature.properties.GEOID)?.toFixed(1) ?? 'N/A'}`,
    { sticky: true, direction: 'top', className: 'hover-tooltip' }
  );

  layer.on({
    click: () => {
      showDashboardLoading();
      setTimeout(() => {
        showCountySidebar(feature);
        hideDashboardLoading();
      }, 50);
    },
    mouseover: e => e.target.setStyle({ fillOpacity: 0.9 }),
    mouseout: e => activeCountyLayer.resetStyle(e.target)
  });
}

//same stuff
function showUSSidebar() {
  document.getElementById('sidebar').innerHTML = `
    <h2>United States</h2>
    <p>Select a state to view details.</p>
  `;
}

//NEW STUFF - UPDATE  IN STATE.JS
async function showStateSidebar(stateName) {
  const avg = getStateAverageScore(selectedStateFP);

  //Fetch election info from FastAPI
  let electionInfo = {};
  try {
    const res = await fetch(`/api/state/${selectedStateFP}`);
    electionInfo = await res.json();
  } catch (err) {
    console.error(err);
    electionInfo = { error: 'Failed to load election info.' };
  }

  //Build counties list
  let countyList = '';
  usCountiesData.features.forEach(f => {
    if (f.properties.STATEFP === selectedStateFP) {
      const score = getCountyScore(f.properties.GEOID);
      if (score !== null) {
        countyList += `
          <li>
            ${f.properties.NAME}: <strong>${score.toFixed(1)}</strong>
          </li>`;
      }
    }
  });

  //NEW SIDEBAR - election and voting is placeholder
  document.getElementById('sidebar').innerHTML = `
    <button onclick="resetToUS()" class="sidebar-button">Back to US</button>
    <h2>${stateName}</h2>
    <p><strong>Average Score:</strong> ${avg?.toFixed(1) ?? 'N/A'}</p>

    <h3>Election & Voting Info</h3>
    

    <h3>Counties</h3>
    <ul>${countyList}</ul>
  `;
}

function showCountySidebar(feature) {
  const geoid = feature.properties.GEOID;
  const score = getCountyScore(geoid);
  const population = getCountyPopulation(geoid);

  document.getElementById('sidebar').innerHTML = `
    <button onclick="resetToState()" class="sidebar-button">Back to State</button>
    <h2>${feature.properties.NAME} County</h2>
    <p><strong>Score:</strong> ${score ?? 'N/A'}</p>
    <p><strong>Population:</strong> ${population ? population.toLocaleString() : 'N/A'}</p>
  `;
}

//old navigation
function resetToUS() {
  if (activeCountyLayer) map.removeLayer(activeCountyLayer);
  map.addLayer(usStatesLayer);
  map.setView([39.8, -98.6], 4);
  showUSSidebar();
}

function resetToState() {
  if (activeCountyLayer) {
    map.fitBounds(activeCountyLayer.getBounds(), { padding: [20, 20] });
  }
  const stateName = usStatesLayer.getLayers()
    .find(l => l.feature.properties.STATEFP === selectedStateFP)
    .feature.properties.NAME;
  showStateSidebar(stateName);
}

//LOADING SCREEN
function showDashboardLoading() {
  document.getElementById('dashboard-loading').style.display = 'flex';
}
function hideDashboardLoading() {
  document.getElementById('dashboard-loading').style.display = 'none';
}
