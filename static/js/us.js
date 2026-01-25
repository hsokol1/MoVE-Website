//helper for colors
App.getColor(score)

//styles
function addScoreLegend() {
  if (App.legendControl) {
    App.map.removeControl(App.legendControl);
  }

  const legend = L.control({ position: "topright" });

  legend.onAdd = function () {
    const div = L.DomUtil.create("div");

    div.style.background = "white";
    div.style.padding = "12px 14px";
    div.style.borderRadius = "8px";
    div.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";
    div.style.fontSize = "14px";
    div.style.lineHeight = "18px";
    div.style.minWidth = "120px";

    div.innerHTML = `
      <div style="font-size:16px; font-weight:700; margin-bottom:8px;">
        Score Scale
      </div>

      <div style="display:flex; align-items:center; margin-bottom:6px;">
        <span style="background:${App.getColor(81)}; width:16px; height:16px; margin-right:8px;"></span>
        81–100
      </div>

      <div style="display:flex; align-items:center; margin-bottom:6px;">
        <span style="background:${getColor(61)}; width:16px; height:16px; margin-right:8px;"></span>
        61–80
      </div>

      <div style="display:flex; align-items:center; margin-bottom:6px;">
        <span style="background:${getColor(41)}; width:16px; height:16px; margin-right:8px;"></span>
        41–60
      </div>

      <div style="display:flex; align-items:center; margin-bottom:6px;">
        <span style="background:${getColor(21)}; width:16px; height:16px; margin-right:8px;"></span>
        21–40
      </div>

      <div style="display:flex; align-items:center;">
        <span style="background:${getColor(0)}; width:16px; height:16px; margin-right:8px;"></span>
        0–20
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
          ${s.name}: <strong>${s.score.toFixed(2)}</strong>
        </li>
      `).join("")}
    </ul>
  `;
}






/////INTERACTION FUNCTIONS/////
function onEachState(feature, layer) {
  const stateFP = String(feature.properties.STATEFP).padStart(2, "0");
  const score = App.stateScores?.[stateFP]?.score ?? null;

  layer.bindTooltip(
    `<strong>${feature.properties.NAME}</strong><br/>
     Score: ${score != null ? score.toFixed(2) : "N/A"}`,
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
    const score = App.stateScores?.[stateFP]?.score ?? null;

    return {
      fillColor: score != null ? App.getColor(score) : "#ccc",
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
