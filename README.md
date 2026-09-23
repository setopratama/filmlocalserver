# 🎬 Film Lokal — Web Streaming Satu WiFi (Node.js Tanpa Dependensi)

Website sederhana untuk **browse, streaming, dan upload koleksi film** yang
tersimpan di mesin ini. Bisa dibuka dari **HP/TV di WiFi yang sama** —
tanpa login, tanpa `npm install`, hanya modul bawaan Node.js.

Akses: `http://192.168.1.151/film` (via Nginx) atau
`http://192.168.1.151:3000/film` (langsung).

## ✨ Fitur

- **Beranda ala streaming** — hero billboard + rel horizontal + kartu 16:9
  (lihat `DESIGN.md` untuk spesifikasi UI).
- **Player + streaming seek** — HTTP Range (`206 Partial Content`), bisa
  digeser di HP/TV. Format: MP4, MKV, WebM, AVI, MOV, M4V
  (sarankan MP4 H.264 + AAC untuk kompatibilitas HP).
- **Upload publik** — siapa pun di WiFi bisa upload (maks 4 GB/file) +
  progress bar. File langsung tampil di beranda.
- **Kompres otomatis** — file berat (>6 Mbps / >720p) otomatis dikompres ke
  versi web via ffmpeg di background (prioritas CPU rendah).
- **Kelola (PIN `1234`)** — menu gerigi ⚙ di tiap kartu & halaman watch:
  kompres manual, rename file, hapus permanen.
- **Metadata otomatis** — durasi (ffprobe) + thumbnail (ffmpeg) terisi
  sendiri setelah upload/scan.
- **Tanpa login** — database SQLite hanya menyimpan metadata film.

## 🚀 Cara menjalankan

```bash
# 1. Taruh file video ke media/ (atau upload via web), lalu scan:
node scripts/scan.js

# 2. Jalankan server (default 127.0.0.1:3000, base-path /film):
node server.js
# Buka: http://192.168.1.151:3000/film
```

Setup lengkap sekali jalan (Nginx `/film/` + auto-start `film.service`,
butuh sudo, idempotent):

```bash
sudo bash scripts/setup.sh
```

## ⚙️ Konfigurasi (env, tanpa ubah kode)

| Env | Default | Fungsi |
|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `3000` | Alamat & port listen |
| `BASE_PATH` | `/film` | Prefix semua route (wajib untuk reverse proxy) |
| `UPLOAD_MAX_BYTES` | `4 GB` | Batas ukuran upload |
| `ADMIN_PIN` | `1234` | PIN menu Kelola |
| `HEAVY_BITRATE` | `6 Mbps` | Ambang auto-kompres |

## 🗂️ Struktur

```
film/
├── server.js            # SATU file app (http + fs + node:sqlite saja)
├── schema.sql           # skema SQLite
├── scripts/scan.js      # scan media/ -> database
├── scripts/setup.sh     # setup Nginx + systemd (sudo, idempotent)
├── film.service         # unit systemd (referensi)
├── nginx-film.conf      # referensi blok location /film/
├── public/style.css     # CSS murni, tanpa framework
├── media/               # taruh video di sini
├── posters/             # thumbnail generate/otomatis
├── AGENTS.md            # panduan operasional + aturan mesin
└── DESIGN.md            # spesifikasi UI
```

`films.db`, file video, dan poster hasil generate **tidak di-commit**
(lihat `.gitignore`).

## ⚠️ Catatan mesin

Di server ini juga berjalan **Minecraft Bedrock** (UDP `19132/19133`).
Web film memakai TCP `3000` + Nginx `:80` — jangan memakai/memblokir
port Bedrock, dan kelola hanya via `film.service` terpisah.
Detail lengkap: `AGENTS.md`.

## 🛠️ Syarat sistem

- Node.js `v22.x` (modul `node:sqlite` bawaan)
- `ffmpeg` + `ffprobe` (durasi & thumbnail; opsional tapi disarankan)
- Linux + (opsional) Nginx untuk akses tanpa port
