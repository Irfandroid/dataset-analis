import {
  MAX_ROWS,
  histogram,
  inferProfiles,
  monthlyTrend,
  numericStats,
  parseDelimited,
  topValues,
} from "./analysis.js";

const SAMPLE_URL = "data/sales.csv";
const MAX_BYTES = 10 * 1024 * 1024;
const TYPE_LABELS = { number: "angka", date: "tanggal", category: "kategori", text: "teks" };
const numberFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const integerFmt = new Intl.NumberFormat("id-ID");
const monthFmt = new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit" });
const delimiterNames = { ",": "koma", ";": "titik koma", "\t": "tab", "|": "pipa" };

const $ = (id) => document.getElementById(id);
const byType = (type) => (data?.profiles ?? []).filter((profile) => profile.type === type);
const picks = { trend: "", numeric: "", category: "" };

let data = null;
let sourceLabel = "";
let trendWidth = 0;

function setText(id, value) {
  $(id).textContent = value;
}

function makeCell(text, className = "") {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

function makeRow(cells) {
  const row = document.createElement("tr");
  row.append(...cells);
  return row;
}

function fillSelect(select, options, selected) {
  select.replaceChildren(...options.map(({ value, label }) => new Option(label, value)));
  select.value = selected;
}

function monthLabel(key) {
  return monthFmt.format(new Date(`${key}-01T00:00:00Z`));
}

function resetBanner() {
  const banner = $("pesan");
  banner.hidden = true;
  banner.textContent = "";
  banner.className = "banner";
}

function showBanner(message, kind = "error") {
  const banner = $("pesan");
  banner.textContent = message;
  banner.className = `banner banner--${kind}`;
  banner.hidden = false;
}

function renderMeta() {
  const { rows, columns, totalRows, truncated, delimiter } = data;
  setText("meta-baris", `${integerFmt.format(rows.length)} baris`);
  setText("meta-kolom", `${integerFmt.format(columns.length)} kolom`);
  setText("meta-sumber", sourceLabel);
  setText("meta-ringkas", `${integerFmt.format(rows.length)} baris · ${integerFmt.format(columns.length)} kolom`);

  const delimiterNote = `pemisah ${delimiterNames[delimiter] ?? delimiter}`;
  $("status").textContent = truncated
    ? `${integerFmt.format(rows.length)} dari ${integerFmt.format(totalRows)} baris dianalisis (batas ${integerFmt.format(MAX_ROWS)}) · ${delimiterNote}`
    : `${integerFmt.format(rows.length)} baris × ${integerFmt.format(columns.length)} kolom · ${delimiterNote}`;
  $("kpi-baris-note").textContent = truncated ? `dari ${integerFmt.format(totalRows)} baris` : "dianalisis";
}

function renderSummary() {
  const missing = data.profiles.reduce((sum, profile) => sum + profile.missing, 0);
  setText("kpi-baris", integerFmt.format(data.rows.length));
  setText("kpi-kolom", integerFmt.format(data.columns.length));
  setText("kpi-kosong", integerFmt.format(missing));
  setText("kpi-numerik", integerFmt.format(byType("number").length));
  setText("kpi-tanggal", integerFmt.format(byType("date").length));
}

function renderProfiles() {
  $("tabel-profil").replaceChildren(
    ...data.profiles.map((profile) =>
      makeRow([
        makeCell(profile.name),
        makeCell(TYPE_LABELS[profile.type]),
        makeCell(integerFmt.format(profile.missing), "num"),
        makeCell(integerFmt.format(profile.unique), "num"),
        makeCell(profile.sample),
      ]),
    ),
  );
}

function renderTrend() {
  const column = byType("date")[0]?.name;
  $("card-tren").hidden = !column;
  if (!column) return;

  const points = monthlyTrend(data.rows, column, picks.trend, picks.trend ? $("select-tren-metrik").value : "count");
  const container = $("chart-tren");
  if (!points.length) {
    container.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: "Tidak ada tanggal valid." }));
    return;
  }

  const max = Math.max(...points.map((point) => point.value)) || 1;
  const width = Math.max(container.clientWidth, 280);
  trendWidth = width;
  const height = width < 480 ? 200 : 220;
  const pad = { top: 18, right: 26, bottom: 30, left: 26 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;
  const x = (i) => pad.left + i * step;
  const y = (value) => pad.top + plotH - (value / (max * 1.08)) * plotH;

  const line = points.map((point, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(pad.top + plotH).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + plotH).toFixed(1)} Z`;
  const grid = [0.25, 0.5, 0.75, 1]
    .map((ratio) => `<line class="grid" x1="${pad.left}" y1="${(pad.top + plotH - ratio * plotH).toFixed(1)}" x2="${width - pad.right}" y2="${(pad.top + plotH - ratio * plotH).toFixed(1)}" />`)
    .join("");
  const labels = points
    .map((point, i) => (i % 2 ? "" : `<text x="${x(i).toFixed(1)}" y="${height - 8}" text-anchor="middle">${monthLabel(point.key)}</text>`))
    .join("");
  const dots = points
    .map(
      (point, i) =>
        `<circle cx="${x(i).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="3.2" fill="#c2410c" stroke="#fffdf8" stroke-width="1.5"><title>${monthLabel(point.key)}: ${numberFmt.format(point.value)}</title></circle>`,
    )
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Tren bulanan, nilai tertinggi ${numberFmt.format(max)}.">
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
      <text class="value" x="${pad.left}" y="12">${compactFmt.format(max)}</text>
      ${labels}
    </svg>`;
}

function renderBars(container, items, total) {
  if (!items.length) {
    container.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: "Tidak ada nilai untuk ditampilkan." }));
    return;
  }
  const max = Math.max(...items.map((item) => item.value)) || 1;
  const wrapper = document.createElement("div");
  wrapper.className = "bars";

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "bar-row";
    const label = document.createElement("span");
    label.className = "bar-row__label";
    label.textContent = item.name;
    label.title = item.name;
    const track = document.createElement("div");
    track.className = "bar-row__track";
    const fill = document.createElement("div");
    fill.className = "bar-row__fill";
    fill.style.width = `${Math.max((item.value / max) * 100, 1.5)}%`;
    track.append(fill);
    const value = document.createElement("span");
    value.className = "bar-row__value";
    value.textContent = total ? `${integerFmt.format(item.value)} · ${Math.round((item.value / total) * 100)}%` : integerFmt.format(item.value);
    row.append(label, track, value);
    wrapper.append(row);
  }
  container.replaceChildren(wrapper);
}

function renderHistogram() {
  const numeric = byType("number");
  $("card-histogram").hidden = !numeric.length;
  if (!numeric.length) return;

  const column = numeric.some((profile) => profile.name === picks.numeric) ? picks.numeric : numeric[0].name;
  picks.numeric = column;
  $("select-histogram").value = column;
  const bins = histogram(data.rows, column).map((bin) => ({
    name: bin.from === bin.to ? numberFmt.format(bin.from) : `${numberFmt.format(bin.from)} – ${numberFmt.format(bin.to)}`,
    value: bin.count,
  }));
  renderBars($("chart-histogram"), bins, data.rows.length);
}

function renderTopValues() {
  const categories = byType("category");
  $("card-kategori").hidden = !categories.length;
  if (!categories.length) return;

  const valid = categories.some((profile) => profile.name === picks.category);
  const column = valid ? picks.category : categories[0].name;
  picks.category = column;
  $("select-kategori").value = column;
  const items = topValues(data.rows, column, 10);
  $("hint-kategori").textContent = `Sepuluh nilai terbanyak dari ${integerFmt.format(categories.find((profile) => profile.name === column)?.unique ?? 0)} nilai unik.`;
  renderBars($("chart-kategori"), items, data.rows.length);
}

function renderStats() {
  const numeric = byType("number");
  document.getElementById("statistik").hidden = !numeric.length;
  $("tabel-statistik").replaceChildren(
    ...numeric.map((profile) => {
      const stats = numericStats(data.rows, profile.name);
      return makeRow([
        makeCell(profile.name),
        makeCell(integerFmt.format(stats.count), "num"),
        makeCell(numberFmt.format(stats.sum), "num"),
        makeCell(numberFmt.format(stats.mean), "num"),
        makeCell(numberFmt.format(stats.median), "num"),
        makeCell(numberFmt.format(stats.min), "num"),
        makeCell(numberFmt.format(stats.max), "num"),
      ]);
    }),
  );
}

function renderPreview() {
  const head = document.createElement("tr");
  for (const column of data.columns) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = column;
    head.append(th);
  }
  $("pratinjau-kepala").replaceChildren(head);
  $("pratinjau-isi").replaceChildren(
    ...data.rows.slice(0, 20).map((row) => makeRow(data.columns.map((column) => makeCell(row[column])))),
  );
}

function populateSelects() {
  const numeric = byType("number").map((profile) => ({ value: profile.name, label: profile.name }));
  const categories = byType("category").map((profile) => ({ value: profile.name, label: profile.name }));

  fillSelect($("select-tren-nilai"), [{ value: "", label: "Jumlah baris" }, ...numeric], picks.trend);
  fillSelect($("select-histogram"), numeric, picks.numeric);
  fillSelect($("select-kategori"), categories, picks.category);
  $("select-tren-metrik").disabled = !picks.trend;
}

function renderAll() {
  if (!data) return;
  renderMeta();
  renderSummary();
  renderProfiles();
  populateSelects();
  renderTrend();
  renderHistogram();
  renderTopValues();
  renderStats();
  renderPreview();
}

function applyDataset(parsed, label) {
  if (!parsed.columns.length || !parsed.rows.length) {
    throw new Error("Tidak ada data terbaca. Pastikan baris pertama berisi nama kolom dan ada minimal satu baris isi.");
  }
  data = { ...parsed, profiles: inferProfiles(parsed.rows, parsed.columns) };
  sourceLabel = label;
  picks.trend = byType("number")[0]?.name ?? "";
  picks.numeric = picks.trend;
  picks.category = byType("category")[0]?.name ?? "";
  resetBanner();
  renderAll();
  if (parsed.truncated) {
    showBanner(`Dataset dipotong: hanya ${integerFmt.format(MAX_ROWS)} baris pertama yang dianalisis.`, "info");
  }
}

async function loadSample() {
  data = null;
  $("status").textContent = "Memuat data contoh…";
  resetBanner();
  try {
    const response = await fetch(SAMPLE_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    applyDataset(parseDelimited(await response.text()), "sales.csv · contoh");
  } catch (error) {
    $("status").textContent = "Gagal memuat data contoh.";
    showBanner(`Data contoh gagal dimuat (${error.message}). Jalankan lewat server statis, bukan file://.`);
  }
}

async function loadFile(file) {
  $("status").textContent = `Membaca ${file.name}…`;
  try {
    if (file.size > MAX_BYTES) throw new Error("Ukuran file melebihi 10 MB.");
    applyDataset(parseDelimited(await file.text()), file.name);
  } catch (error) {
    $("status").textContent = "File tidak dapat dibaca.";
    showBanner(error.message);
  }
}

function bindEvents() {
  const input = $("file-input");
  const dropzone = $("dropzone");

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) await loadFile(file);
  });

  for (const type of ["dragenter", "dragover"]) {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add("dropzone--active");
    });
  }
  for (const type of ["dragleave", "drop"]) {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.remove("dropzone--active");
    });
  }
  dropzone.addEventListener("drop", async (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) await loadFile(file);
  });

  $("pakai-contoh").addEventListener("click", loadSample);

  $("select-tren-nilai").addEventListener("change", (event) => {
    picks.trend = event.target.value;
    $("select-tren-metrik").disabled = !picks.trend;
    renderTrend();
  });
  $("select-tren-metrik").addEventListener("change", renderTrend);
  $("select-histogram").addEventListener("change", (event) => {
    picks.numeric = event.target.value;
    renderHistogram();
  });
  $("select-kategori").addEventListener("change", (event) => {
    picks.category = event.target.value;
    renderTopValues();
  });

  // Lebar SVG mengikuti kontainer agar teks tidak ikut mengecil saat layout berubah.
  new ResizeObserver(() => {
    if (Math.abs($("chart-tren").clientWidth - trendWidth) > 1) renderTrend();
  }).observe($("chart-tren"));
}

bindEvents();
loadSample();
