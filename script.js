// --- Config ---
const DATA_BASE_URL =
  "https://raw.githubusercontent.com/simonkrauter/Open-EV-Charts/master/data";

let chartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("country-select");
  const button = document.getElementById("load-btn");

  button.addEventListener("click", async () => {
    const code = select.value;
    await loadCountry(code);
  });

  // load default
  loadCountry(select.value);
});

async function loadCountry(countryCode) {
  const statusEl = document.getElementById("status");
  const titleEl = document.getElementById("chart-title");

  statusEl.textContent = "Loading...";
  try {
    const data = await fetchCountryEvData(countryCode);

    if (!data.length) {
      statusEl.textContent = "No EV data parsed.";
      updateChart([], [], countryCode);
      updateTable([]);
      return;
    }

    // sort by period (simple lexicographic sort)
    data.sort((a, b) => a.period.localeCompare(b.period));

    const labels = data.map((d) => d.period);
    const values = data.map((d) => d.ev_sales);

    titleEl.textContent = `EV sales over time – ${countryCode}`;
    updateChart(labels, values, countryCode);
    updateTable(data);

    statusEl.textContent = `Loaded ${data.length} periods.`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error loading data (see console).";
  }
}

/**
 * Fetch and parse a single country data-XX.js
 * countryCode: e.g. "US", "DE", "CN", "global"
 */
async function fetchCountryEvData(countryCode) {
  const url = `${DATA_BASE_URL}/data-${countryCode}.js`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  const jsText = await res.text();

  // Regex to match:
  // db.insert(db.countries.US, "2017-Q1", db.dsTypes.ElectricCarsTotal, "url",
  // { "other": 21415 });
  //
  // Groups: period, dtype, data body
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

    // Reconstruct {...} and make it JSON-friendly
    let objStr = "{" + dataBody + "}";

    // Remove comments, if any
    objStr = objStr.replace(/\/\/.*$/gm, "");
    objStr = objStr.replace(/\/\*[\s\S]*?\*\//g, "");

    // Remove trailing comma before }
    objStr = objStr.replace(/,(\s*})/g, "$1");

    let dataObj;
    try {
      dataObj = JSON.parse(objStr);
    } catch (e) {
      // If parsing fails for some edge case, skip that record
      console.warn("JSON parse error for", countryCode, period, dtype, e);
      continue;
    }

    // Compute total EVs for relevant types
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

  // Convert to array of rows
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

function updateChart(labels, values, countryCode) {
  const ctx = document.getElementById("evChart").getContext("2d");

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `EV sales (${countryCode})`,
          data: values,
          borderWidth: 2,
          tension: 0.15,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: {
            color: "#e5e7eb",
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#9ca3af" },
          grid: { color: "#111827" },
        },
        y: {
          ticks: { color: "#9ca3af" },
          grid: { color: "#111827" },
        },
      },
    },
  });
}

function updateTable(rows) {
  const tbody = document.querySelector("#data-table tbody");
  tbody.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    const tdPeriod = document.createElement("td");
    const tdVal = document.createElement("td");
    tdPeriod.textContent = row.period;
    tdVal.textContent = row.ev_sales.toLocaleString("en-US");
    tr.appendChild(tdPeriod);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  }
}
