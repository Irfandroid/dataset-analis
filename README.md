# Analis Set — dashboard statis analisis dataset

Dashboard satu halaman untuk membaca dataset penjualan ritel: KPI, tren bulanan, komposisi kategori & kanal, serta kinerja per kota. Tanpa framework, tanpa database — HTML, CSS, dan JavaScript murni yang menghitung langsung di browser dari satu file CSV.

![Pratinjau dashboard](docs/preview.png)

> Data bersifat **sintetis** untuk demo. Angka tidak mewakili penjualan nyata. Dataset dibuat ulang dengan `node scripts/generate-data.mjs` (seed tetap, hasil deterministik).

## Fitur

- 420 pesanan, 12 bulan (Des 2025 – Nov 2026), 5 kategori, 3 kanal, 6 kota.
- Filter kategori dan kanal; semua KPI, grafik, dan tabel ikut berubah.
- Grafik SVG dan bar HTML tanpa dependensi eksternal; angka diformat `id-ID` (Rupiah).
- Responsif, semantic HTML, `aria-live` untuk status filter, hormati `prefers-reduced-motion`.
- Nol permintaan ke pihak ketiga: tidak ada CDN, font, atau analytics.

## Struktur

```text
.
├── index.html              # markup halaman
├── assets/
│   ├── app.js              # parsing CSV, agregasi, render grafik
│   ├── styles.css          # desain & layout
│   └── favicon.svg
├── data/sales.csv          # dataset (420 baris)
├── scripts/generate-data.mjs
├── nginx.conf              # konfigurasi server (gzip, cache, header keamanan)
├── Dockerfile
├── docker-compose.yml
└── docs/preview.png
```

## Jalankan lokal

Butuh server statis karena `fetch` tidak bekerja pada `file://`.

```bash
python -m http.server 8080
# buka http://localhost:8080
```

Atau dengan Node: `npx serve .`

## Docker

```bash
docker compose up -d --build
# buka http://localhost:8080
```

Tanpa Compose:

```bash
docker build -t dataset-analis .
docker run --rm -p 8080:8080 --read-only --tmpfs /var/cache/nginx --tmpfs /tmp dataset-analis
```

Yang sudah diterapkan sesuai praktik standar container:

- Base image `nginx-unprivileged` dengan tag versi + digest; proses berjalan sebagai UID 101 (non-root).
- `HEALTHCHECK` memanggil `/healthz`; Compose memakai healthcheck yang sama.
- `read_only` root filesystem, `tmpfs` hanya untuk cache nginx dan `/tmp`, `cap_drop: ALL`, `no-new-privileges`.
- `.dockerignore` memperkecil build context; hanya aset yang disajikan yang masuk image.
- gzip untuk teks/CSS/JS/CSV/SVG, cache 7 hari untuk aset, `Expires` untuk `data/`, HTML selalu revalidasi.
- Header keamanan: CSP ketat (`'self'`), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; `server_tokens off`.

Cek kesehatan dan header:

```bash
curl -i http://localhost:8080/healthz
curl -I http://localhost:8080/
```

## Dataset

`data/sales.csv` — pemisah koma, tanpa tanda kutip di dalam nilai.

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| `order_id` | string | ID pesanan, `ORD-0001` |
| `date` | `YYYY-MM-DD` | tanggal pesanan |
| `category` | string | kategori produk |
| `product` | string | nama produk |
| `channel` | string | Marketplace, Web, Toko Fisik |
| `city` | string | kota pengiriman |
| `units` | integer | kuantitas |
| `unit_price` | integer | harga satuan dalam Rupiah |

Pendapatan dihitung di klien: `units × unit_price`. Untuk mengganti dataset, pertahankan nama kolom dan format tanggal di atas — tidak ada kode yang perlu diubah.

Regenerasi data:

```bash
node scripts/generate-data.mjs
```

## Lisensi

MIT — lihat [LICENSE](LICENSE).
