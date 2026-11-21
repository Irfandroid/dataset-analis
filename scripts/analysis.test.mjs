import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDelimited,
  inferProfiles,
  toNumber,
  toDate,
  histogram,
  monthlyTrend,
  topValues,
} from "../assets/analysis.js";

test("parser menangani kutip, BOM, dan header duplikat", () => {
  const parsed = parseDelimited('\uFEFFnama,nilai,nilai\n"Jakarta, Selatan",1,2\nBandung,3,4\n');
  assert.deepEqual(parsed.columns, ["nama", "nilai", "nilai_2"]);
  assert.equal(parsed.rows[0].nama, "Jakarta, Selatan");
  assert.equal(parsed.rows[1].nilai_2, "4");
  assert.equal(parsed.delimiter, ",");
});

test("parser mendeteksi delimiter tab", () => {
  const parsed = parseDelimited("a\tb\n1\t2\n");
  assert.equal(parsed.delimiter, "\t");
  assert.deepEqual(parsed.rows, [{ a: "1", b: "2" }]);
});

test("parser memotong baris di atas batas", () => {
  const parsed = parseDelimited("a\n1\n2\n3\n", 2);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.totalRows, 3);
  assert.equal(parsed.truncated, true);
});

test("angka menerima format Rp dan id-ID", () => {
  assert.equal(toNumber("Rp 1.234.567"), 1234567);
  assert.equal(toNumber("1.234,5"), 1234.5);
  assert.equal(toNumber("1,234.56"), 1234.56);
  assert.equal(toNumber("-0,5"), -0.5);
  assert.ok(Number.isNaN(toNumber("bukan angka")));
});

test("tanggal ISO dan hari-dulu diparse, tanggal mustahil ditolak", () => {
  assert.equal(toDate("2026-01-02").toISOString().slice(0, 10), "2026-01-02");
  assert.equal(toDate("01/02/2026").toISOString().slice(0, 10), "2026-02-01");
  assert.equal(toDate("13/02/2026").toISOString().slice(0, 10), "2026-02-13");
  assert.equal(toDate("31/02/2026"), null);
  assert.equal(toDate("bukan tanggal"), null);
});

test("inferensi tipe memakai isi kolom", () => {
  const rows = [
    { tanggal: "2026-01-02", jumlah: "1.000", kota: "Bandung" },
    { tanggal: "2026-02-03", jumlah: "2,5", kota: "Bandung" },
    { tanggal: "2026-02-04", jumlah: "3", kota: "Medan" },
  ];
  const profiles = inferProfiles(rows, ["tanggal", "jumlah", "kota"]);
  assert.deepEqual(
    profiles.map((profile) => [profile.name, profile.type]),
    [
      ["tanggal", "date"],
      ["jumlah", "number"],
      ["kota", "category"],
    ],
  );
});

test("histogram menghitung semua nilai", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ x: String(i) }));
  const bins = histogram(rows, "x", 5);
  assert.equal(bins.length, 5);
  assert.equal(bins.reduce((sum, bin) => sum + bin.count, 0), 10);
  assert.equal(bins[0].count, 2);
});

test("histogram data diskret memakai satu bin per nilai", () => {
  const rows = [{ x: "1" }, { x: "2" }, { x: "2" }, { x: "5" }];
  assert.deepEqual(
    histogram(rows, "x").map((bin) => [bin.from, bin.to, bin.count]),
    [
      [1, 1, 1],
      [2, 2, 2],
      [5, 5, 1],
    ],
  );
});

test("tren bulanan mendukung count, sum, dan mean", () => {
  const rows = [
    { tanggal: "2026-01-02", nilai: "2" },
    { tanggal: "2026-01-20", nilai: "4" },
    { tanggal: "2026-02-01", nilai: "6" },
    { tanggal: "rusak", nilai: "9" },
  ];
  assert.deepEqual(monthlyTrend(rows, "tanggal").map((point) => point.value), [2, 1]);
  assert.deepEqual(monthlyTrend(rows, "tanggal", "nilai", "sum").map((point) => point.value), [6, 6]);
  assert.deepEqual(monthlyTrend(rows, "tanggal", "nilai", "mean").map((point) => point.value), [3, 6]);
});

test("topValues mengurutkan dan memotong", () => {
  const rows = [{ k: "a" }, { k: "b" }, { k: "a" }, { k: "" }];
  assert.deepEqual(topValues(rows, "k", 2), [
    { name: "a", value: 2 },
    { name: "b", value: 1 },
  ]);
});
