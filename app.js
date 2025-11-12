console.log("EV Dashboard script v2 loaded");
const DATA_BASE_URL =
  "https://raw.githubusercontent.com/simonkrauter/Open-EV-Charts/master/data";

// List of countries we expose in the UI (you can extend this)
const COUNTRY_OPTIONS = [
  { code: "global", name: "Global" },
  { code: "US", name: "United States" },
  { code: "CN", name: "China" },
  { code: "EU", name: "European Union" },
  { code: "DE", name: "Germany" },
  { code: "NO", name: "Norway" },
  { code: "FR", name: "France" },
  { code: "UK", name: "United Kingdom" },
];

let chartInstance = null;
// Stores the current pivoted data (period × country)
let currentPivot = null;
let currentSelectedCodes = [];

document.addEventListener("DOMContentLoaded", () => {
  renderCountryCheckboxes();

  const loadBtn = document.getElementById("load-btn");
  const dlCsvBtn = document.getElementById("download-csv-btn");
  const dlImgBtn = document.getElementById("download-img-btn");

  loadBtn.addEventListener("click", handleUpdateChart);
  dlCsvBtn.addEventListener("click", handleDownloadCSV);
  dlImgBtn.addEventListener("click", handleDownloadImage);

  // Load a default selection (e.g. Global + US)
  setInitialSelection(["global", "US"]);
  handleUpdateChart();
});

function renderCountryCheckboxes() {
  const container = document.getElementById("country-list");
  container.innerHTML = "";

  COUNTRY_OPTIONS.forEach((c) => {
    const label = document.createElement("label");
    label.className = "country-chip";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = c.code;

    const span = document.createElement("span");
    span.textContent = c.name;

    label.appendChild(input);
    label.appendChild(span);
    container.appendChild(label);
  });
}

function setInitialSelection(codes) {
  const checkboxes = document.querySelectorAll("#country-list input[type=checkbox]");
  checkboxes.forEach((cb) => {
    cb.checked = codes.includes(cb.value);
  });
}

async function handleUpdateChart() {
  const statusEl = document.getElementById("status");
  const loadBtn = document.getElementById("load-btn");

  const selectedCodes = getSelectedCountryCodes();
  currentSelectedCodes = selectedCodes;

  if (selectedCodes.length === 0) {
    statusEl.textContent = "Select at least one country.";
    return;
  }

  statusEl.textContent = "Loading data...";
  loadBtn.disabled = true;

  try {
    // Fetch in parallel
    const datasets = await Promise.all(
      selectedCodes.map(async (code) => {
        const data = await fetchCountryEvData(code);
        return { code, data };
      })
    );

    // Build a pivot: period -> { countryCode: ev_sales }
    const pivot = buildPivot(datasets);

    currentPivot = pivot;

    const periods = Object.keys(pivot).sort((a, b) => a.localeCompare(b));
    const datasetsForChart = selectedCodes.map((code, idx) => {
      const label = getCountryName(code);
      const data = periods.map((p) =>
        pivot[p][code] != null ? pivot[p][code] : null
      );
      return {
        label,
        data,
        borderWidth: 2,
        tension: 0.15,
        pointRadius: 0,
      };
    });

    updateChart(periods, datasetsForChart);
    updateTable(pivot, selectedCodes);

    statusEl.textContent = `Loaded ${
      periods.length
    } periods for ${selectedCodes.length} country(ies).`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error loading data (see console).";
  } finally {
    loadBtn.disabled = false;
  }
}

/**
 * Fetch and parse a single country data-XX.js file.
 * Returns array of { period, ev_sales }.
 */
async function fetchCountryEvData(countryCode) {
  const url = `${DATA_BASE_URL}/data-${countryCode}.js`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  const jsText = await res.text();

  const pattern = new RegExp(
    String.raw`db\.insert\(\s*db\.countries\.${countryCode}\s*,\s*` +
      String.raw`"([^"]+)"\s*,\s*` + // period
      String.raw`db\.dsTypes\.(\w+)\s*,\s*` + // dtype
      String.raw`"[^"]*"\s*,\s*` +
      String.raw`\{([\s\S]*?)\}\s*\)`,
    "g"
  );

  const periods = {}; // period -> { ElectricCarsTotal, ElectricCarsByModel, ... }

  let match;
  while ((match = pattern.exec(jsText)) !== null) {
    const period = match[1];
    const dtype = match[2];
    const dataBody = match[3].trim();

    let objStr = "{" + dataBody + "}";

    // Remove comments
    objStr = objStr.replace(/\/\/.*$/gm, "");
    objStr = objStr.replace(/\/\*[\s\S]*?\*\//g, "");

    // Remove trailing comma before }
    objStr = objStr.replace(/,(\s*})/g, "$1");

    let dataObj;
    try {
      dataObj = JSON.parse(objStr);
    } catch (e) {
      console.warn("JSON parse error for", countryCode, period, dtype, e);
      continue;
    }

    let totalVal = null;
    if (dtype === "ElectricCarsTotal") {
      totalVal = sumNumericValues(dataObj);
    } else if (
      dtype === "ElectricCarsByModel" ||
      dtype === "ElectricCarsByBrand"
    ) {
      totalVal = sumNumericValues(dataObj);
    }

    if (totalVal == null) continue;

    if (!periods[period]) {
      periods[period] = {};
    }
    periods[period][dtype] = totalVal;
  }

  const rows = [];
  for (const [period, perType] of Object.entries(periods)) {
    let ev;
    if (perType.ElectricCarsTotal != null) {
      ev = perType.ElectricCarsTotal;
    } else if (perType.ElectricCarsByModel != null) {
      ev = perType.ElectricCarsByModel;
    } else if (perType.ElectricCarsByBrand != null) {
      ev = perType.ElectricCarsByBrand;
    } else {
      continue;
    }
    rows.push({ period, ev_sales: ev });
  }

  return rows;
}

function sumNumericValues(obj) {
  return Object.values(obj).reduce((acc, v) => {
    if (typeof v === "number") return acc + v;
    return acc;
  }, 0);
}

function buildPivot(datasets) {
  // datasets: [ { code, data: [{period, ev_sales}, ...] }, ... ]
  const pivot = {}; // period -> { countryCode: ev_sales }

  datasets.forEach(({ code, data }) => {
    data.forEach((row) => {
      const { period, ev_sales } = row;
      if (!pivot[period]) {
        pivot[period] = {};
      }
      pivot[period][code] = ev_sales;
    });
  });

  return pivot;
}

function updateChart(labels, datasets) {
  const ctx = document.getElementById("evChart").getContext("2d");

  // Generate a simple color palette
  const colors = [
    "#3b82f6",
    "#22c55e",
    "#eab308",
    "#f97316",
    "#ef4444",
    "#a855f7",
    "#14b8a6",
    "#ec4899",
  ];

  datasets.forEach((ds, idx) => {
    const color = colors[idx % colors.length];
    ds.borderColor = color;
    ds.backgroundColor = color + "33"; // translucent fill
  });

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: "#e5e7eb",
          },
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const v = ctx.parsed.y;
              if (v == null) return `${ctx.dataset.label}: n/a`;
              return `${ctx.dataset.label}: ${v.toLocaleString("en-US")}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#9ca3af", maxRotation: 60, minRotation: 30 },
          grid: { color: "#111827" },
        },
        y: {
          ticks: { color: "#9ca3af" },
          grid: { color: "#111827" },
        },
      },
    },
  });

  const titleEl = document.getElementById("chart-title");
  const names = currentSelectedCodes.map(getCountryName).join(", ");
  titleEl.textContent = `EV sales over time – ${names}`;
}

function updateTable(pivot, selectedCodes) {
  const thead = document.querySelector("#data-table thead");
  const tbody = document.querySelector("#data-table tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  const periods = Object.keys(pivot).sort((a, b) => a.localeCompare(b));

  // Header row
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

  // Data rows
  periods.forEach((period) => {
    const rowData = pivot[period];
    const tr = document.createElement("tr");

    const tdPeriod = document.createElement("td");
    tdPeriod.textContent = period;
    tr.appendChild(tdPeriod);

    selectedCodes.forEach((code) => {
      const td = document.createElement("td");
      const val = rowData[code];
      td.textContent =
        val != null ? val.toLocaleString("en-US") : "–";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

function getSelectedCountryCodes() {
  const checkboxes = document.querySelectorAll(
    "#country-list input[type=checkbox]"
  );
  const codes = [];
  checkboxes.forEach((cb) => {
    if (cb.checked) codes.push(cb.value);
  });
  return codes;
}

function getCountryName(code) {
  const found = COUNTRY_OPTIONS.find((c) => c.code === code);
  return found ? found.name : code;
}

// --- Downloads ---

function handleDownloadCSV() {
  if (!currentPivot || !currentSelectedCodes.length) {
    alert("No data to download. Load the chart first.");
    return;
  }

  const periods = Object.keys(currentPivot).sort((a, b) => a.localeCompare(b));

  // Build CSV header
  const header = ["period", ...currentSelectedCodes.map(getCountryName)];
  const rows = [header];

  periods.forEach((period) => {
    const rowData = currentPivot[period];
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
  a.download = "ev_sales_current_view.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  if (value == null) return "";
  const v = String(value);
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function handleDownloadImage() {
  if (!chartInstance) {
    alert("No chart available. Load data first.");
    return;
  }
  const link = document.createElement("a");
  link.download = "ev_sales_chart.png";
  link.href = chartInstance.toBase64Image("image/png", 1);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
