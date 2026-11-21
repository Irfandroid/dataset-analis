const CSV_URL = "data/sales.csv";
const DONUT_COLORS = ["#2f5d4e", "#3b5f8a", "#b98a1e", "#c2410c", "#8a5f9e"];
const MONTH_FMT = new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit" });
const FULL_DATE_FMT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("id-ID");

const el = (id) => document.getElementById(id);
const state = { category: "Semua", channel: "Semua" };
let rows = [];
let months = [];

// Sederhana: kolom CSV demo tidak memuat koma atau tanda kutip.
function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const keys = header.split(",");
  return lines
    .filter(Boolean)
    .map((line) => {
      const cells = line.split(",");
      const row = Object.fromEntries(keys.map((key, i) => [key, cells[i]]));
      const units = Number(row.units);
      const unitPrice = Number(row.unit_price);
      return { ...row, units, unitPrice, revenue: units * unitPrice };
    });
}

function uniqueSorted(list) {
  return [...new Set(list)].sort((a, b) => a.localeCompare(b, "id"));
}

function monthKey(date) {
  return date.slice(0, 7);
}

function monthLabel(key) {
  return MONTH_FMT.format(new Date(`${key}-01T00:00:00`));
}

function fillSelect(select, values) {
  select.replaceChildren(
    ...["Semua", ...values].map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      return option;
    }),
  );
}

function filteredRows() {
  return rows.filter(
    (row) =>
      (state.category === "Semua" || row.category === state.category) &&
      (state.channel === "Semua" || row.channel === state.channel),
  );
}

function totals(list) {
  const revenue = list.reduce((sum, row) => sum + row.revenue, 0);
  return {
    revenue,
    orders: list.length,
    units: list.reduce((sum, row) => sum + row.units, 0),
    average: list.length ? revenue / list.length : 0,
  };
}

function groupSum(list, key, metric = "revenue") {
  const map = new Map();
  for (const row of list) {
    const name = row[key];
    const bucket = map.get(name) ?? { name, value: 0, orders: 0, units: 0 };
    bucket.value += row[metric];
    bucket.orders += 1;
    bucket.units += row.units;
    map.set(name, bucket);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

function renderKpis(list) {
  const sum = totals(list);
  el("kpi-pendapatan").textContent = rupiah.format(sum.revenue);
  el("kpi-pesanan").textContent = integer.format(sum.orders);
  el("kpi-unit").textContent = integer.format(sum.units);
  el("kpi-rata").textContent = rupiah.format(Math.round(sum.average));
}

function emptyChart(container, message) {
  container.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: message }));
}

// Grafik SVG memakai lebar kontainer agar teks tidak ikut mengecil di layar sempit.
let resizeTimer;
function watchResize() {
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 120);
  });
}

function renderTrend(list) {
  const container = el("chart-tren");
  if (!list.length) return emptyChart(container, "Tidak ada pesanan untuk filter ini.");

  const byMonth = new Map(months.map((key) => [key, 0]));
  for (const row of list) {
    const key = monthKey(row.date);
    byMonth.set(key, (byMonth.get(key) ?? 0) + row.revenue);
  }
  const data = [...byMonth].map(([key, value]) => ({ key, value }));
  const max = Math.max(...data.map((d) => d.value)) || 1;
  const width = Math.max(container.clientWidth, 280);
  const height = width < 480 ? 200 : 220;
  const pad = { top: 18, right: 26, bottom: 30, left: 26 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const step = data.length > 1 ? plotW / (data.length - 1) : 0;
  const x = (i) => pad.left + i * step;
  const y = (value) => pad.top + plotH - (value / (max * 1.08)) * plotH;

  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(pad.top + plotH).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + plotH).toFixed(1)} Z`;

  const grid = [0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const gy = (pad.top + plotH - ratio * plotH).toFixed(1);
      return `<line class="grid" x1="${pad.left}" y1="${gy}" x2="${width - pad.right}" y2="${gy}" />`;
    })
    .join("");

  const labels = data
    .map((d, i) => `<text x="${x(i).toFixed(1)}" y="${height - 8}" ${i % 2 ? "" : 'text-anchor="middle"'}>${i % 2 ? "" : monthLabel(d.key)}</text>`)
    .join("");

  const dots = data
    .map(
      (d, i) =>
        `<circle cx="${x(i).toFixed(1)}" cy="${y(d.value).toFixed(1)}" r="3.2" fill="#c2410c" stroke="#fffdf8" stroke-width="1.5"><title>${monthLabel(d.key)}: ${rupiah.format(d.value)}</title></circle>`,
    )
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Pendapatan bulanan. Tertinggi ${rupiah.format(max)}.">
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#c2410c" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#c2410c" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${grid}
      <path d="${area}" fill="url(#area-fill)" />
      <path d="${line}" fill="none" stroke="#c2410c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      ${dots}
      <text class="value" x="${pad.left}" y="12">${compact.format(max)}</text>
      ${labels}
    </svg>`;
}

function renderCategory(list) {
  const container = el("chart-kategori");
  if (!list.length) return emptyChart(container, "Tidak ada pesanan untuk filter ini.");

  const data = groupSum(list, "category");
  const max = data[0].value || 1;
  const wrapper = document.createElement("div");
  wrapper.className = "bars";

  for (const item of data) {
    const rowEl = document.createElement("div");
    rowEl.className = "bar-row";

    const label = document.createElement("span");
    label.className = "bar-row__label";
    label.textContent = item.name;

    const track = document.createElement("div");
    track.className = "bar-row__track";
    const fill = document.createElement("div");
    fill.className = "bar-row__fill";
    fill.style.width = `${Math.max((item.value / max) * 100, 1.5)}%`;
    track.append(fill);

    const value = document.createElement("span");
    value.className = "bar-row__value";
    value.textContent = `${compact.format(item.value)} · ${Math.round((item.value / totals(list).revenue) * 100)}%`;

    rowEl.append(label, track, value);
    wrapper.append(rowEl);
  }
  container.replaceChildren(wrapper);
}

function renderChannel(list) {
  const container = el("chart-kanal");
  if (!list.length) return emptyChart(container, "Tidak ada pesanan untuk filter ini.");

  const data = groupSum(list, "channel", "orders").sort((a, b) => b.orders - a.orders);
  const total = data.reduce((sum, d) => sum + d.orders, 0);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const arcs = data
    .map((item, i) => {
      const length = (item.orders / total) * circumference;
      const arc = `<circle cx="60" cy="60" r="${radius}" fill="none" stroke="${DONUT_COLORS[i % DONUT_COLORS.length]}" stroke-width="16"
        stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}"
        transform="rotate(-90 60 60)"><title>${item.name}: ${integer.format(item.orders)} pesanan</title></circle>`;
      offset += length;
      return arc;
    })
    .join("");

  const legend = document.createElement("ul");
  legend.className = "legend";
  data.forEach((item, i) => {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "legend__dot";
    dot.style.background = DONUT_COLORS[i % DONUT_COLORS.length];
    const name = document.createElement("span");
    name.className = "legend__name";
    name.textContent = item.name;
    const value = document.createElement("span");
    value.className = "legend__value";
    value.textContent = `${Math.round((item.orders / total) * 100)}%`;
    li.append(dot, name, value);
    legend.append(li);
  });

  const wrapper = document.createElement("div");
  wrapper.className = "donut";
  wrapper.innerHTML = `<svg viewBox="0 0 120 120" role="img" aria-label="Porsi pesanan per kanal">${arcs}
    <text x="60" y="58" font-size="17">${compact.format(total)}</text>
    <text x="60" y="72" font-size="9">pesanan</text></svg>`;
  wrapper.append(legend);
  container.replaceChildren(wrapper);
}

function renderTable(list) {
  const body = el("tabel-kota");
  if (!list.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "empty";
    td.textContent = "Tidak ada pesanan untuk filter ini.";
    tr.append(td);
    body.replaceChildren(tr);
    return;
  }

  const data = groupSum(list, "city");
  const max = data[0].value || 1;
  const fragment = document.createDocumentFragment();

  for (const item of data) {
    const tr = document.createElement("tr");
    const city = document.createElement("td");
    city.textContent = item.name;

    const revenue = document.createElement("td");
    revenue.className = "num";
    const bar = document.createElement("span");
    bar.className = "bar-cell";
    const barFill = document.createElement("span");
    barFill.style.width = `${Math.max((item.value / max) * 100, 3)}%`;
    bar.append(barFill);
    revenue.append(bar, document.createTextNode(rupiah.format(item.value)));

    const orders = document.createElement("td");
    orders.className = "num";
    orders.textContent = integer.format(item.orders);

    const units = document.createElement("td");
    units.className = "num";
    units.textContent = integer.format(item.units);

    const average = document.createElement("td");
    average.className = "num";
    average.textContent = rupiah.format(Math.round(item.value / item.orders));

    tr.append(city, revenue, orders, units, average);
    fragment.append(tr);
  }
  body.replaceChildren(fragment);
}

function render() {
  const list = filteredRows();
  const isFiltered = state.category !== "Semua" || state.channel !== "Semua";
  el("status").textContent = `${integer.format(list.length)} dari ${integer.format(rows.length)} pesanan${isFiltered ? " (terfilter)" : ""}`;
  renderKpis(list);
  renderTrend(list);
  renderCategory(list);
  renderChannel(list);
  renderTable(list);
}

function renderMeta() {
  const dates = rows.map((row) => row.date).sort();
  const first = new Date(`${dates[0]}T00:00:00`);
  const last = new Date(`${dates.at(-1)}T00:00:00`);
  const period = `${FULL_DATE_FMT.format(first)} – ${FULL_DATE_FMT.format(last)}`;
  el("periode").textContent = period;
  el("meta-periode").textContent = period;
  el("meta-baris").textContent = `${integer.format(rows.length)} pesanan`;
}

function showError(message) {
  const alert = document.createElement("p");
  alert.className = "alert";
  alert.setAttribute("role", "alert");
  alert.textContent = message;
  document.querySelector(".hero").append(alert);
}

async function init() {
  try {
    const response = await fetch(CSV_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    rows = parseCsv(await response.text());

    months = [...new Set(rows.map((row) => monthKey(row.date)))].sort();
    fillSelect(el("filter-kategori"), uniqueSorted(rows.map((row) => row.category)));
    fillSelect(el("filter-kanal"), uniqueSorted(rows.map((row) => row.channel)));

    renderMeta();
    render();
    watchResize();

    el("filter-kategori").addEventListener("change", (event) => {
      state.category = event.target.value;
      render();
    });
    el("filter-kanal").addEventListener("change", (event) => {
      state.channel = event.target.value;
      render();
    });
    el("reset").addEventListener("click", () => {
      state.category = "Semua";
      state.channel = "Semua";
      el("filter-kategori").value = "Semua";
      el("filter-kanal").value = "Semua";
      render();
    });
  } catch (error) {
    showError(`Dataset gagal dimuat (${error.message}). Jalankan lewat server statis, bukan file://.`);
  }
}

init();
