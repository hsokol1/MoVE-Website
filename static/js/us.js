/////HELPER FUNCTIONS FOR US VIEW/////
/////HELPER FUNCTIONS FOR US VIEW/////
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;

  if (0 <= hp && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (1 <= hp && hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (2 <= hp && hp < 3) [r1, g1, b1] = [0, c, x];
  else if (3 <= hp && hp < 4) [r1, g1, b1] = [0, x, c];
  else if (4 <= hp && hp < 5) [r1, g1, b1] = [x, 0, c];
  else if (5 <= hp && hp < 6) [r1, g1, b1] = [c, 0, x];

  const m = l - c / 2;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);

  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}

function getColor(score) {
  const s = clamp(score, 0, 100) / 100;

  // Curve: makes low/mid values stay warmer longer, green appears later
  const t = Math.pow(s, 1.6); // increase to 1.8/2.0 if you want even less green

  const hue = t * 120; // 0=red, 120=green
  return hslToHex(hue, 0.80, 0.42); // slightly lower lightness helps avoid “fresh green”
}

/////STYLE & LEGEND FUNCTIONS////
function addScoreLegend() {
  if (App.legendControl) App.map.removeControl(App.legendControl);

  const legend = L.control({ position: "topright" });

  legend.onAdd = function () {
    const div = L.DomUtil.create("div");
    div.style.background = "white";
    div.style.padding = "12px 14px";
    div.style.borderRadius = "8px";
    div.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";
    div.style.fontSize = "14px";
    div.style.minWidth = "180px";

    div.innerHTML = `
      <div style="font-size:16px; font-weight:700; margin-bottom:8px;">
        Score Scale
      </div>

      <div style="
        height: 14px;
        border-radius: 6px;
        border: 1px solid rgba(0,0,0,0.2);
        background: linear-gradient(to right, ${getColor(0)}, ${getColor(50)}, ${getColor(100)});
        margin-bottom: 8px;
      "></div>

      <div style="display:flex; justify-content:space-between; font-size:12px; color:#333;">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    `;

    return div;
  };

  legend.addTo(App.map);
  App.legendControl = legend;
}

function showUSSidebar() {
  const sidebar = document.getElementById("sidebar");

  // STATEFP -> state name lookup
  const stateNames = {};
  App.usStatesData.features.forEach(f => {
    stateNames[f.properties.STATEFP] = f.properties.NAME;
  });

  const states = Object.entries(App.stateScores).map(([fp, obj]) => ({
    fp,
    name: stateNames[fp],
    score: obj.score
  }));

  // Sort by score (high → low)
  states.sort((a, b) => b.score - a.score);

  sidebar.innerHTML = `
    <h2>United States</h2>
    <p>Select a state to view details.</p>
    <h3>State Average MoVE Scores</h3>
    <ul>
      ${states.map(s => `
        <li>
          ${s.name}: <strong>${s.score.toFixed(1)}</strong>
        </li>
      `).join("")}
    </ul>
  `;
}



////INTERACTION FUNCTIONS////
function onEachState(feature, layer) {
  const stateFP = String(feature.properties.STATEFP).padStart(2, "0");
  const score = App.getStateScore(stateFP);

  layer.bindTooltip(
    `<strong>${feature.properties.NAME}</strong><br/>
     Score: ${score != null ? score.toFixed(1) : "N/A"}`,
    {
      sticky: true,
      direction: "top",
      className: "hover-tooltip",
    }
  );

  layer.on({
    click: () => handleStateClick(feature, layer),
    mouseover: (e) => e.target.setStyle({ fillOpacity: 0.9 }),
    mouseout: (e) => App.usStatesLayer.resetStyle(e.target),
  });
}

function handleStateClick(feature, layer) {
  enterStateView(feature, layer);
}



///////STYLE INITIALIZATION/////
function stateStyle(feature) {
    const stateFP = feature.properties.STATEFP;
    const score = App.getStateScore(stateFP);
    return {
      fillColor: score != null ? getColor(score) : "#ccc",
      weight: 1,
      color: "#003049",
      fillOpacity: 0.5
    };
  }



//////INITIALIZATION FUNCTION/////
window.initUSView = function initUSView() {
    if (!window.App?.usStatesData) {
      console.error("initUSView: App.usStatesData not loaded yet.");
      return;
    }

    // remove if rebuilding
    if (App.usStatesLayer) App.map.removeLayer(App.usStatesLayer);

    App.usStatesLayer = L.geoJSON(App.usStatesData, {
      style: stateStyle,
      onEachFeature: onEachState
    }).addTo(App.map);

    showUSSidebar();
    addScoreLegend();
};
