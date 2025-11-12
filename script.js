const DATA_BASE_URL = "https://raw.githubusercontent.com/simonkrauter/Open-EV-Charts/master/data";

const COUNTRY_OPTIONS = [
  { code: "global", name: "Global" },
  { code: "AT", name: "Austria" },
  { code: "AU", name: "Australia" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CH", name: "Switzerland" },
  { code: "CN", name: "China" },
  { code: "DE", name: "Germany" },
  { code: "DK", name: "Denmark" },
  { code: "ES", name: "Spain" },
  { code: "EU", name: "European Union" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IS", name: "Iceland" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "SE", name: "Sweden" },
  { code: "TR", name: "Turkey" },
  { code: "UK", name: "United Kingdom" },
  { code: "US", name: "United States" },
];

let chartInstance = null;
let currentPivot = null;           // full pivot (all years)
let currentSelectedCodes = [];
let currentChartType = 'line';
let currentScaleType = 'linear';
let yearStart = null;              // numeric year or null
let yearEnd = null;                // numeric year or null

document.addEventListener("DOMContentLoaded", () => {
  renderCountryCheckboxes();
  setupEventListeners();
  setInitialSelection(["global", "US", "CN"]);
  handleUpdateChart();
});

function setupEventListeners() {
  document.getElementById("load-btn").addEventListener("click", handleUpdateChart);
  document.getElementById("download-csv-btn").addEventListener("click", handleDownloadCSV);
  document.getElementById("download-img-btn").addEventListener("click", handleDownloadImage);
  document.getElementById("search-countries").addEventListener("input", filterCountries);
  document.getElementById("chart-type").addEventListener("change", (e) => {
    currentChartType = e.target.value;
    if (currentPivot) updateChartDisplay();
  });

  // Timeframe listeners (populated after data load)
  const ys = document.getElementById("year-start");
  const ye = document.getElementById("year-end");
  if (ys && ye) {
    ys.addEventListener("change", () => {
      yearStart = parseInt(ys.value, 10);
      enforceYearOrder();
      refreshFilteredViews();
    });
    ye.addEventListener("change", () => {
      yearEnd = parseInt(ye.value, 10);
      enforceYearOrder();
      refreshFilteredViews();
    });
  }
}

function renderCountryCheckboxes() {
  const container = document.getElementById("country-list");
  container.innerHTML = "";

  COUNTRY_OPTIONS.forEach((c) => {
    const label = document.createElement("label");
    label.className = "country-chip";
    label.dataset.name = c.name.toLowerCase();

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = c.code;
    input.addEventListener("change", updateSelectedCount);

    const span = document.createElement("span");
    span.textContent = c.name;

    label.appendChild(input);
    label.appendChild(span);
    container.appendChild(label);
  });
  updateSelectedCount();
}

function filterCountries(e) {
  const search = e.target.value.toLowerCase();
  const chips = document.querySelectorAll(".country-chip");
  chips.forEach(chip => chip.style.display = chip.dataset.name.includes(search) ? "flex" : "none");
}

function updateSelectedCount() {
  const count = getSelectedCountryCodes().length;
  document.getElementById("selected-count").textContent = count;
}

function selectAll() {
  document.querySelectorAll("#country-list input").forEach(cb => cb.checked = true);
  updateSelectedCount();
}

function deselectAll() {
  document.querySelectorAll("#country-list input").forEach(cb => cb.checked = false);
  updateSelectedCount();
}

function selectEU() {
  const euCodes = ["EU", "AT", "BE", "DE", "DK", "ES", "FI", "FR", "IE", "IT", "NL", "PL", "PT", "SE"];
  document.querySelectorAll("#country-list input").forEach(cb => cb.checked = euCodes.includes(cb.value));
  updateSelectedCount();
}

function selectTop5() {
  const top5 = ["CN", "US", "DE", "NO", "UK"];
  document.querySelectorAll("#country-list input").forEach(cb => cb.checked = top5.includes(cb.value));
  updateSelectedCount();
}

function setScale(type) {
  currentScaleType = type;
  document.querySelectorAll(".toggle-btn").forEach(btn => btn.classList.remove("active"));
  // use global event to keep behavior consistent with original
  event.target.classList.add("active");
  if (currentPivot) updateChartDisplay();
}

function setInitialSelection(codes) {
  document.querySelectorAll("#country-list input").forEach(cb => { cb.checked = codes.includes(cb.value); });
  updateSelectedCount();
}

async function handleUpdateChart() {
  const loadBtn = document.getElementById("load-btn");

  const selectedCodes = getSelectedCountryCodes();
  currentSelectedCodes = selectedCodes;

  if (selectedCodes.length === 0) {
    showStatus("Please select at least one country", true);
    return;
  }

  showStatus("Loading data...", false);
  loadBtn.disabled = true;

  try {
    const datasets = await Promise.all(
      selectedCodes.map(async (code) => {
        const data = await fetchCountryEvData(code);
        return { code, data };
      })
    );

    const pivot = buildPivot(datasets); // full dataset
    currentPivot = pivot;

    // Initialize years dropdowns from available years
    const years = getAvailableYears(currentPivot);
    populateYearDropdowns(years);

    // Render filtered views
    refreshFilteredViews();

    const periods = Object.keys(getActivePivot()).length;
    showStatus(`✓ Loaded ${periods} periods for ${selectedCodes.length} region(s)`, false);
  } catch (err) {
    console.error(err);
    showStatus("Error loading data. Please try again.", true);
  } finally {
    loadBtn.disabled = false;
  }
}

/* -------------------- Year filtering helpers -------------------- */
function getAvailableYears(pivot) {
  const years = new Set();
  Object.keys(pivot).forEach(period => {
    const y = parseInt(period.slice(0, 4), 10);
    if (!isNaN(y)) years.add(y);
  });
  return Array.from(years).sort((a, b) => a - b);
}

function populateYearDropdowns(years) {
  const ys = document.getElementById("year-start");
  const ye = document.getElementById("year-end");
  if (!ys || !ye || years.length === 0) return;

  ys.innerHTML = "";
  ye.innerHTML = "";

  years.forEach(y => {
    const o1 = document.createElement("option");
    o1.value = String(y);
    o1.textContent = y;
    ys.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = String(y);
    o2.textContent = y;
    ye.appendChild(o2);
  });

  // defaults to full range
  yearStart = years[0];
  yearEnd = years[years.length - 1];
  ys.value = String(yearStart);
  ye.value = String(yearEnd);
}

function enforceYearOrder() {
  // ensure start <= end by swapping if needed
  if (yearStart != null && yearEnd != null && yearStart > yearEnd) {
    [yearStart, yearEnd] = [yearEnd, yearStart];
    document.getElementById("year-start").value = String(yearStart);
    document.getElementById("year-end").value = String(yearEnd);
  }
}

function filterPivotByYearRange(pivot, yStart, yEnd) {
  if (yStart == null || yEnd == null) return pivot;
  const filtered = {};
  Object.keys(pivot).forEach(period => {
    const y = parseInt(period.slice(0, 4), 10);
    if (!isNaN(y) && y >= yStart && y <= yEnd) {
      filtered[period] = pivot[period];
    }
  });
  return filtered;
}

function getActivePivot() {
  if (!currentPivot) return {};
  return filterPivotByYearRange(currentPivot, yearStart, yearEnd);
}

function refreshFilteredViews() {
  updateChartDisplay();
  updateTable(getActivePivot(), currentSelectedCodes);
  updateStats(getActivePivot(), currentSelectedCodes);
}
/* ---------------------------------------------------------------- */

function updateChartDisplay() {
  const activePivot = getActivePivot();
  const periods = Object.keys(activePivot).sort((a, b) => a.localeCompare(b));
  const datasetsForChart = currentSelectedCodes.map((code) => {
    const label = getCountryName(code);
    const data = periods.map((p) => activePivot[p][code] ?? null);
    return { label, data, borderWidth: 2, tension: 0.3, pointRadius: 0 };
  });

  updateChart(periods, datasetsForChart);
}

function updateChart(labels, datasets) {
  const ctx = document.getElementById("evChart").getContext("2d");

  const colors = ["#3b82f6", "#22c55e", "#eab308", "#f97316", "#ef4444", "#a855f7", "#14b8a6", "#ec4899", "#06b6d4", "#84cc16"];

  datasets.forEach((ds, idx) => {
    const color = colors[idx % colors.length];
    ds.borderColor = color;
    ds.backgroundColor = currentChartType === 'area' ? color + "40" : color + "20";
    ds.fill = currentChartType === 'area';
  });

  if (chartInstance) chartInstance.destroy();

  const chartConfig = {
    type: currentChartType === 'area' ? 'line' : currentChartType,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false }, // external legend is rendered below
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.95)",
          titleColor: "#e5e7eb",
          bodyColor: "#9ca3af",
          borderColor: "#1f2937",
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y;
              return v == null ? `${ctx.dataset.label}: n/a` : `${ctx.dataset.label}: ${v.toLocaleString()}`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: "#9ca3af", maxRotation: 45, minRotation: 30 }, grid: { color: "#1f2937" } },
        y: { type: currentScaleType, ticks: { color: "#9ca3af" }, grid: { color: "#1f2937" } }
      }
    }
  };

  chartInstance = new Chart(ctx, chartConfig);

  // render external legend after chart creation
  renderLegend(chartInstance);

  const names = currentSelectedCodes.map(getCountryName).join(", ");
  const yr = yearStart && yearEnd ? ` — ${yearStart} to ${yearEnd}` : "";
  document.getElementById("chart-title").textContent = `📊 EV Sales Over Time — ${names}${yr}`;
}

function renderLegend(chart) {
  const wrap = document.getElementById("legend");
  if (!wrap) return;
  wrap.innerHTML = "";

  chart.data.datasets.forEach((ds, i) => {
    const item = document.createElement("button");
    item.className = "legend-item";
    item.type = "button";
    item.setAttribute("aria-pressed", String(!chart.isDatasetVisible(i)));

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = ds.borderColor;

    const label = document.createElement("span");
    label.textContent = ds.label;

    item.appendChild(swatch);
    item.appendChild(label);

    // Toggle series visibility
    item.addEventListener("click", () => {
      const vis = chart.isDatasetVisible(i);
      chart.setDatasetVisibility(i, !vis);
      item.style.opacity = vis ? "0.5" : "1";
      item.setAttribute("aria-pressed", String(vis));
      chart.update();
    });

    wrap.appendChild(item);
  });
}

function updateStats(pivot, selectedCodes) {
  const statsPanel = document.getElementById("stats-panel");
  const statsGrid = document.getElementById("stats-grid");
  statsGrid.innerHTML = "";

  const periods = Object.keys(pivot).sort((a, b) => a.localeCompare(b));
  if (periods.length === 0) {
    statsPanel.style.display = "none";
    return;
  }
  const latestPeriod = periods[periods.length - 1];

  let totalLatest = 0;
  let totalOverall = 0;
  let maxCountry = { name: "", value: 0 };

  selectedCodes.forEach(code => {
    const latest = pivot[latestPeriod]?.[code] || 0;
    totalLatest += latest;

    let countryTotal = 0;
    periods.forEach(p => {
      const val = pivot[p]?.[code] || 0;
      countryTotal += val;
      totalOverall += val;
    });

    if (countryTotal > maxCountry.value) {
      maxCountry = { name: getCountryName(code), value: countryTotal };
    }
  });

  const stats = [
    { label: "Latest Period", value: latestPeriod },
    { label: "Total Sales (Latest)", value: totalLatest.toLocaleString() },
    { label: "Top Market", value: maxCountry.name || "—" },
    { label: "Total Periods", value: periods.length }
  ];

  stats.forEach(stat => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `
      <div class="stat-label">${stat.label}</div>
      <div class="stat-value">${stat.value}</div>
    `;
    statsGrid.appendChild(card);
  });

  statsPanel.style.display = "block";
}

function updateTable(pivot, selectedCodes) {
  const thead = document.querySelector("#data-table thead");
  const tbody = document.querySelector("#data-table tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  const periods = Object.keys(pivot).sort((a, b) => a.localeCompare(b)).reverse();

  const headerRow = document.createElement("tr");
  const thPeriod = document.createElement("th");
  thPeriod.textContent = "Period";
  headerRow.appendChild(thPeriod);

  selectedCodes.forEach((code) => {
    const th = document.createElement("th");
    th.textContent = getCountryName(code);
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  periods.forEach((period) => {
    const rowData = pivot[period];
    const tr = document.createElement("tr");

    const tdPeriod = document.createElement("td");
    tdPeriod.textContent = period;
    tr.appendChild(tdPeriod);

    selectedCodes.forEach((code) => {
      const td = document.createElement("td");
      const val = rowData[code];
      td.textContent = val != null ? val.toLocaleString() : "—";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

/* -------------------- Data fetching + parsing -------------------- */
// Utility: escape text for use inside new RegExp(string)
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fetchCountryEvData(countryCode) {
  const url = `${DATA_BASE_URL}/data-${countryCode}.js`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);

  const jsText = await res.text();

  // Build the regex safely (no String.raw, escape the code)
  const patternStr =
    'db\\.insert\\(\\s*db\\.countries\\.' + escapeRegExp(countryCode) +
    '\\s*,\\s*"([^"]+)"\\s*,\\s*db\\.dsTypes\\.(\\w+)' +
    '\\s*,\\s*"[^"]*"\\s*,\\s*\\{([\\s\\S]*?)\\}\\s*\\)';
  const pattern = new RegExp(patternStr, 'g');

  const periods = {};
  let match;

  while ((match = pattern.exec(jsText)) !== null) {
    const period = match[1];
    const dtype = match[2];
    const dataBody = match[3].trim();

    // Reconstruct a JSON-ish object and make it JSON-parseable
    let objStr = "{" + dataBody + "}";
    objStr = objStr.replace(/\/\/.*$/gm, "");           // strip line comments
    objStr = objStr.replace(/\/\*[\s\S]*?\*\//g, "");   // strip block comments
    objStr = objStr.replace(/,(\s*})/g, "$1");          // trailing commas

    let dataObj;
    try {
      dataObj = JSON.parse(objStr);
    } catch (e) {
      console.warn("JSON parse error for", countryCode, period, dtype, e);
      continue;
    }

    let totalVal = null;
    if (
      dtype === "ElectricCarsTotal" ||
      dtype === "ElectricCarsByModel" ||
      dtype === "ElectricCarsByBrand"
    ) {
      totalVal = Object.values(dataObj).reduce(
        (acc, v) => (typeof v === "number" ? acc + v : acc),
        0
      );
    }

    if (totalVal == null) continue;

    if (!periods[period]) periods[period] = {};
    periods[period][dtype] = totalVal;
  }

  const rows = [];
  for (const [period, perType] of Object.entries(periods)) {
    const ev =
      perType.ElectricCarsTotal ??
      perType.ElectricCarsByModel ??
      perType.ElectricCarsByBrand;
    if (ev != null) rows.push({ period, ev_sales: ev });
  }

  return rows;
}
/* ---------------------------------------------------------------- */

function sumNumericValues(obj) {
  return Object.values(obj).reduce((acc, v) => typeof v === "number" ? acc + v : acc, 0);
}

function buildPivot(datasets) {
  const pivot = {};
  datasets.forEach(({ code, data }) => {
    data.forEach((row) => {
      const { period, ev_sales } = row;
      if (!pivot[period]) pivot[period] = {};
      pivot[period][code] = ev_sales;
    });
  });
  return pivot;
}

function getSelectedCountryCodes() {
  const checkboxes = document.querySelectorAll("#country-list input[type=checkbox]");
  const codes = [];
  checkboxes.forEach((cb) => { if (cb.checked) codes.push(cb.value); });
  return codes;
}

function getCountryName(code) {
  const found = COUNTRY_OPTIONS.find((c) => c.code === code);
  return found ? found.name : code;
}

function showStatus(message, isError) {
  const statusEl = document.getElementById("status");
  statusEl.textContent = message;
  statusEl.className = "status show" + (isError ? " error" : "");
}

function handleDownloadCSV() {
  const activePivot = getActivePivot();
  if (!activePivot || !currentSelectedCodes.length) {
    alert("No data to download. Load the chart first.");
    return;
  }

  const periods = Object.keys(activePivot).sort((a, b) => a.localeCompare(b));
  const header = ["Period", ...currentSelectedCodes.map(getCountryName)];
  const rows = [header];

  periods.forEach((period) => {
    const rowData = activePivot[period];
    const row = [period];
    currentSelectedCodes.forEach((code) => {
      const val = rowData[code];
      row.push(val != null ? String(val) : "");
    });
    rows.push(row);
  });

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `ev_sales_data_${yearStart || "all"}-${yearEnd || "all"}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  if (value == null) return "";
  const v = String(value);
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function handleDownloadImage() {
  if (!chartInstance) {
    alert("No chart available. Load data first.");
    return;
  }
  const link = document.createElement("a");
  link.download = `ev_sales_chart_${yearStart || "all"}-${yearEnd || "all"}.png`;
  link.href = chartInstance.toBase64Image("image/png", 1);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
