// Regenerates data/sales.csv (synthetic demo data, deterministic seed).
// Usage: node scripts/generate-data.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const CATALOG = {
  Elektronik: [["TWS Earbuds", 549000], ["Smartwatch", 899000]],
  Fesyen: [["Kemeja Linen", 249000], ["Sneakers Kanvas", 459000]],
  "Rumah Tangga": [["Lampu Meja", 189000], ["Rak Dinding", 329000]],
  Kecantikan: [["Serum Vitamin C", 129000], ["Sunscreen SPF50", 89000]],
  Olahraga: [["Matras Yoga", 219000], ["Botol Minum 1L", 119000]],
};

const CHANNELS = ["Marketplace", "Web", "Toko Fisik"];
const CITIES = ["Jakarta", "Bandung", "Surabaya", "Medan", "Yogyakarta", "Makassar"];

let seed = 20261121;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const rows = [["order_id", "date", "category", "product", "channel", "city", "units", "unit_price"]];
const start = Date.UTC(2025, 11, 1);

for (let i = 1; i <= 420; i++) {
  const date = new Date(start + Math.floor(rand() * 365) * 86400000).toISOString().slice(0, 10);
  const category = pick(Object.keys(CATALOG));
  const [product, unitPrice] = pick(CATALOG[category]);
  const units = 1 + Math.floor(rand() * rand() * 5);
  rows.push([`ORD-${String(i).padStart(4, "0")}`, date, category, product, pick(CHANNELS), pick(CITIES), units, unitPrice]);
}

mkdirSync("data", { recursive: true });
writeFileSync("data/sales.csv", rows.map((r) => r.join(",")).join("\n") + "\n");
console.log(`wrote data/sales.csv (${rows.length - 1} rows)`);
