export const MAX_ROWS = 50000;
export const DELIMITERS = [",", ";", "\t", "|"];

export function sniffDelimiter(line) {
  let best = ",";
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    let count = 0;
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === delimiter && !quoted) count++;
    }
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

export function parseDelimited(text, maxRows = MAX_ROWS) {
  const clean = text.replace(/^\uFEFF/, "");
  const delimiter = sniffDelimiter(clean.split(/\r?\n/).find((line) => line.trim()) ?? "");
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (clean[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) records.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) records.push(row);

  const seen = new Map();
  const columns = (records.shift() ?? []).map((name, i) => {
    const base = name.trim() || `kolom_${i + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count > 1 ? `${base}_${count}` : base;
  });
  const body = records.slice(0, maxRows).map((cells) =>
    Object.fromEntries(columns.map((column, i) => [column, (cells[i] ?? "").trim()])),
  );

  return { columns, rows: body, delimiter, totalRows: records.length, truncated: records.length > body.length };
}

export function toNumber(value) {
  const raw = String(value).trim().replace(/^(rp|idr|usd|\$)\s*/i, "").replace(/\s/g, "");
  if (!raw || !/^[-+]?[\d.,]+$/.test(raw)) return NaN;
  let normalized = raw;
  if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) normalized = raw.replace(/\./g, "").replace(",", ".");
  else if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) normalized = raw.replace(/,/g, "");
  else if (raw.includes(",") && !raw.includes(".")) normalized = raw.replace(",", ".");
  else if (raw.includes(",")) return NaN;
  return Number(normalized);
}

function utcDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

// Tanggal ambigu (01/02/2026) dibaca hari-dulu, mengikuti kebiasaan Indonesia.
export function toDate(value) {
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/);
  if (iso) return utcDate(+iso[1], +iso[2], +iso[3]);
  const short = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!short) return null;
  const first = +short[1];
  const second = +short[2];
  return second > 12 ? utcDate(+short[3], first, second) : utcDate(+short[3], second, first);
}

export function inferProfiles(rows, columns) {
  return columns.map((name) => {
    const values = rows.map((row) => row[name]);
    const present = values.filter((value) => value !== "");
    const unique = new Set(present).size;
    let type = "text";

    if (present.length) {
      const numbers = present.filter((value) => !Number.isNaN(toNumber(value))).length;
      const dates = present.filter((value) => toDate(value)).length;
      if (numbers / present.length >= 0.8) type = "number";
      else if (dates / present.length >= 0.8) type = "date";
      else if (unique <= 50 && (unique <= 12 || unique / present.length <= 0.5)) type = "category";
    }

    return { name, type, missing: values.length - present.length, unique, sample: present[0] ?? "—" };
  });
}

export function numericStats(rows, column) {
  const numbers = rows
    .map((row) => toNumber(row[column]))
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => a - b);
  if (!numbers.length) return null;
  const sum = numbers.reduce((total, value) => total + value, 0);
  const middle = Math.floor(numbers.length / 2);
  return {
    count: numbers.length,
    sum,
    mean: sum / numbers.length,
    median: numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2,
    min: numbers[0],
    max: numbers[numbers.length - 1],
  };
}

export function histogram(rows, column, bins = 10) {
  const numbers = rows.map((row) => toNumber(row[column])).filter((value) => !Number.isNaN(value));
  if (!numbers.length) return [];
  const unique = [...new Set(numbers)].sort((a, b) => a - b);
  // Data diskret (sedikit nilai unik) lebih jujur ditampilkan per nilai, bukan bin pecahan.
  if (unique.length <= bins) {
    const counts = new Map(unique.map((value) => [value, 0]));
    for (const value of numbers) counts.set(value, counts.get(value) + 1);
    return unique.map((value) => ({ from: value, to: value, count: counts.get(value) }));
  }
  const min = unique[0];
  const max = unique[unique.length - 1];
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const value of numbers) counts[Math.min(bins - 1, Math.floor((value - min) / width))]++;
  return counts.map((count, i) => ({ from: min + i * width, to: min + (i + 1) * width, count }));
}

export function monthlyTrend(rows, dateColumn, valueColumn = "", mode = "count") {
  const buckets = new Map();
  for (const row of rows) {
    const date = toDate(row[dateColumn]);
    if (!date) continue;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key) ?? { key, count: 0, sum: 0 };
    bucket.count++;
    bucket.sum += toNumber(row[valueColumn]) || 0;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((bucket) => ({
      key: bucket.key,
      value: mode === "mean" ? bucket.sum / bucket.count : mode === "sum" ? bucket.sum : bucket.count,
    }));
}

export function topValues(rows, column, limit = 10) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[column];
    if (value !== "") counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "id"))
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}
