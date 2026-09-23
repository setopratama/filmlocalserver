# AGENTS.md — Web Film Lokal (Node.js Tanpa Dependensi)

Panduan untuk menjalankan, mengelola, dan mengembangkan website film lokal
yang bisa ditonton dari HP/TV di WiFi yang sama, **tanpa login** dan
**tanpa `npm install`**. Hanya memakai modul bawaan Node.js.

## Tujuan proyek

Halaman web sederhana untuk browse + streaming koleksi film yang tersimpan
di mesin ini. Akses via `http://192.168.1.151:<PORT>/film` (langsung) atau
`http://192.168.1.151/film` (via Nginx reverse proxy).

## Lingkungan

- OS: Ubuntu 22.04.5 LTS, host `x220`, IP statis **`192.168.1.151`**
  (dikunci via netplan — lihat `../minecraft-server/AGENTS.md`).
- Runtime: Node.js `v22.x` (modul `node:sqlite` bawaan — sudah dites OK).
- Tools sistem: `ffmpeg` + `ffprobe` (durasi & thumbnail). Tanpa itu app
  tetap jalan, hanya metadata durasi/poster yang kosong.
- **Tanpa dependensi npm**: dilarang menambah `package.json` dependencies.
  `node_modules/` tidak boleh ada.

## ⚠️ Zona larangan — server Minecraft Bedrock di mesin yang sama

Di mesin ini berjalan `bedrock_server` (service `bedrock.service`).
Aturan mutlak:

1. **Port sengketa**: Bedrock memakai **UDP 19132 + 19133**.
   Web film memakai **TCP `3000`** (cadangan `8080`).
   Dilarang memakai, mem-forward, atau memblokir port `19132-19133/udp`,
   `22/tcp` (SSH), `53` (DNS).
2. **Jalankan sebagai user `x220`**, tanpa sudo. Jangan `stop/restart`
   service `bedrock`, jangan `kill` proses `bedrock_server`,
   jangan menyentuh `../minecraft-server/` (terutama `worlds/`),
   jangan menyentuh FIFO `/tmp/bedrock-server-console`.
3. **Firewall aditif saja**: jika perlu, `sudo ufw allow 3000/tcp`.
   Dilarang `ufw reset`, `ufw delete`, atau mengubah aturan `19132/udp`.
4. **Service terpisah**: bila dibuatkan auto-start, unit baru bernama
   `film.service` — dilarang menempel ke `bedrock.service`.
5. **Hemat resource**: BDS ±570 MB RAM. App film dilarang transcode
   on-the-fly; streaming = kirim file apa adanya (HTTP Range).
   `ffmpeg` hanya dipakai sekali saat scan untuk thumbnail/durasi.
6. Sebelum klaim "port bebas", verifikasi:
   `ss -tlnp` (TCP) dan `ss -ulnp | grep 19132` (Bedrock tetap hidup).

## Struktur folder

```
film/
├── AGENTS.md            # file ini
├── server.js            # SATU file app (http + fs + node:sqlite saja)
├── schema.sql           # skema SQLite (referensi, dieksekusi otomatis)
├── films.db             # database SQLite (JANGAN di-commit)
├── film.service         # unit systemd (referensi, dipasang via setup.sh)
├── nginx-film.conf      # referensi blok location /film/
├── media/               # taruh file video di sini (*.mp4/*.mkv/*.webm)
├── posters/             # thumbnail hasil generate (boleh + poster manual .jpg)
├── public/
│   └── style.css        # CSS murni, tanpa framework
└── scripts/
    ├── scan.js          # scan media/ -> upsert SQLite (node scripts/scan.js)
    └── setup.sh         # setup sekali jalan (BUTUH sudo, idempotent)
```

File video boleh juga ditaruh langsung di root folder proyek;
`scan.js` memindai `media/` **dan** root (mengabaikan dotfile & `*.db`).

## Cara menjalankan

```bash
# 1. Taruh video ke media/, lalu scan ke database:
node scripts/scan.js

# 2. Jalankan server (default TCP 3000, base-path /film):
node server.js
# Buka: http://192.168.1.151:3000/film

# 3. Variasi env (tanpa ubah kode):
PORT=8080 BASE_PATH=/film node server.js
# Default HOST=127.0.0.1 (hanya localhost, untuk akses via Nginx).
# Untuk akses langsung tanpa proxy: HOST=0.0.0.0 node server.js
```

Health check: `curl http://127.0.0.1:3000/film/health` → `ok`.

## Konvensi base-path `/film` (PENTING)

App hidup di balik prefix `/film` agar bisa diproxy dari server utama.
Aturannya:

- Semua route + link + asset **wajib** diawali `BASE_PATH`
  (env `BASE_PATH`, default `/film`). Contoh: `/film/`, `/film/watch`,
  `/film/stream`, `/film/static/style.css`.
- Dilarang hardcode `/` atau `http://localhost:3000` di HTML.
- Request ke `/` dialihkan (redirect) ke `/film/` agar IP:port tetap berguna
  saat dibuka langsung tanpa proxy.
- Request ke `/film` (tanpa slash) di-redirect ke `/film/`.

## Skema SQLite (metadata saja, tanpa tabel user/login)

```sql
CREATE TABLE IF NOT EXISTS films (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  file_path    TEXT NOT NULL UNIQUE,  -- path relatif thd folder proyek
  duration_sec INTEGER,                -- dari ffprobe, NULL bila gagal
  poster       TEXT,                    -- path relatif poster, NULL bila tak ada
  year         INTEGER,
  synopsis     TEXT,
  added_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_films_title ON films(title);
```

- `server.js` membuat tabel otomatis saat start (idempotent).
- `scripts/scan.js` = satu-satunya penulis massal (upsert by `file_path`,
  tidak menghapus baris film yang file-nya hilang — hanya menandai lewat log).
- Tanpa login → tidak ada tabel user/session; riwayat tonton (jika kelak ada)
  cukup di `localStorage` browser, bukan server.

## Aturan streaming

- `GET /film/stream?id=<id>` **wajib** mendukung `Range`
  (`206 Partial Content`, header `Accept-Ranges: bytes`,
  `Content-Range`, `Content-Length` per chunk) agar `<video>` bisa seek
  di HP/TV. Tanpa Range, video besar tidak bisa digeser.
- `HEAD`/`GET` tanpa `Range` → `200` full file (tetap via stream, jangan
  `readFile` seluruh isi ke RAM).
- MIME minimal: `.mp4` → `video/mp4`, `.webm` → `video/webm`,
  `.mkv` → `video/x-matroska`.
  **Catatan**: `.mkv` sering tidak bisa diputar di browser HP/Safari —
  sarankan koleksi utama dalam **MP4 (H.264 + AAC)**.
- Path traversal dilarang: `id` hanya integer dari DB; file harus berada
  di dalam folder proyek (`path.resolve` + cek prefix).
- Poster diserve sebagai file statis biasa (cache-able).

## Route yang tersedia

| Route | Fungsi |
|---|---|
| `GET /film/` | Grid daftar film + kolom search (`?q=`) |
| `GET /film/upload` | Form upload (publik, tanpa login) + progress bar |
| `POST /film/upload` | Terima 1 file `multipart/form-data` (maks 4 GB), sukses → `303` ke `/film/watch` |
| `GET /film/watch?id=` | Halaman player `<video controls preload=metadata>` |
| `GET /film/stream?id=` | Binary video (Range). `id` invalid → 404 |
| `GET /film/poster?f=` | File poster (nama file tervalidasi, tanpa `..`) |
| `GET /film/static/*` | Aset `public/` (hanya `style.css` + ekstensi aman) |
| `GET /film/api/films` | JSON daftar film (untuk TV/debugging) |
| `GET /film/health` | `ok` (untuk cek hidup/monitoring) |

## Aturan upload (publik, tanpa login)

- `POST /film/upload`: parser `multipart` streaming (tulis langsung ke
  `media/`, tidak buffer di RAM), 1 file per request, nama disanitasi
  (buang path + karakter `:*?"<>|` + kontrol, tolak traversal),
  tabrakan nama → tambah `-1`, `-2`.
- Batas: `MAX_UPLOAD_BYTES` (default **4 GB**, env `UPLOAD_MAX_BYTES`
  untuk testing), tolak bila sisa disk < 1 GB (`507`), ekstensi di luar
  whitelist video → `400`. File parsial selalu dihapus saat gagal.
- Sukses → insert DB (langsung tampil di home) → `303` ke `/film/watch`;
  durasi + poster diisi async via `fillMetadataAsync` (jangan blokir event loop
  dengan `execFileSync` di request upload).
- Nginx wajib: `client_max_body_size 4G` + `proxy_request_buffering off`
  + timeout 1 jam (tanpa ini upload >1 MB gagal di proxy).

## Kelola film (PIN `1234`, tanpa login)

Seksi `⚙ Kelola` di halaman watch, satu PIN untuk semua aksi
(default `1234`, override via env `ADMIN_PIN`). PIN salah → `403`.

| Route (POST) | Fungsi |
|---|---|
| `/film/compress?id=&pin=` | Antrekan kompres (FIFO, 1 ffmpeg dalam 1 waktu, via `nice -15` agar Bedrock tidak lag). Hanya file "berat" (bitrate >6 Mbps via `HEAVY_BITRATE`, atau lebar >1280px) yang diproses; file ringan di-skip. Hasil **menggantikan file asli** (nama & slot sama), mentah dihapus hanya bila sukses. Flag `.compressing-<id>` di `media/` = badge ⏳ di home/watch. |
| `/film/rename?id=&pin=&name=` | Rename file di `media/` + judul ikut nama baru (tanpa ext → pakai ext lama). Sanitasi = aturan upload; tolak nama ganda & saat dikompres. |
| `/film/delete?id=&pin=` | Hapus permanen video + poster + baris DB (tanpa recycle bin). Tolak saat dikompres. |

- Upload otomatis antre kompres (`enqueueCompress` di finalize) — respons `303` tetap langsung, kompres di background.
- Form kelola = `application/x-www-form-urlencoded` (parser `readFormBody`, maks 64 KB).
- Jangan blokir event loop: `execFile` async untuk ffprobe/ffmpeg; timeout ffmpeg 1 jam.

## Nginx (sudah terinstal) + auto-start

Setup sekali jalan (butuh sudo, idempotent — aman dijalankan ulang):

```bash
sudo bash scripts/setup.sh
```

Script itu: menambah `location /film/` ke site Nginx `default`
(dengan backup otomatis), `reload` Nginx, memasang + start
`film.service` (auto-start saat reboot), membuka `80/tcp` bila `ufw`
aktif, lalu verifikasi `/film/health` + UDP 19132 Bedrock tetap hidup.

Blok yang dipasang (lihat `nginx-film.conf`):

```nginx
location = /film { return 301 /film/; }
location ^~ /film/ {
  proxy_pass http://127.0.0.1:3000/film/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  # penting untuk streaming: jangan buffer video
  proxy_buffering off;
  # wajib untuk upload file besar (default Nginx hanya 1 MB):
  client_max_body_size 4G;
  proxy_request_buffering off;
  proxy_send_timeout 1h;
  proxy_read_timeout 1h;
}
```

Aturan: **hanya tambah `location /film/`**, jangan ubah blok lain.

Tanpa Nginx pun web tetap bisa diakses langsung di
`http://192.168.1.151:3000/film` dari satu WiFi.

## Troubleshooting

| Gejala | Solusi |
|---|---|
| HP tidak bisa buka web | Satu WiFi? Cek `hostname -I` (harusnya `.151`), cek `ss -tlnp` port 3000 LISTEN, coba `curl /film/health` di laptop dulu |
| Video tidak bisa digeser (seek) | Pastikan response `206` + `Content-Range`; test: `curl -H "Range: bytes=0-1023" -i .../film/stream?id=1` |
| MKV tidak jalan di HP | Normal — konversi ke MP4: `ffmpeg -i in.mkv -c copy out.mp4` (atau transcode bila codec tak cocok) |
| Judul tidak muncul | Jalankan ulang `node scripts/scan.js`; pastikan ekstensi didukung dan file readable |
| Port 3000 bentrok | Ganti `PORT=8080`, jangan pernah ambil 19132/19133/22 |
| Curiga ganggu Minecraft | `ss -ulnp \| grep 19132` harus tetap muncul; `sudo systemctl status bedrock` harus `active` |

## Catatan untuk AI agent / pengelola

- **Dilarang keras**: `npm install`, menambah dependensi, menjalankan
  `bedrock_server` manual, `kill -9` proses Bedrock, menghapus `worlds/`,
  `ufw reset`, install tool yang bind UDP 19132/19133.
- Edit kode hanya di folder `film/`; dilarang menyentuh folder
  `minecraft-server/` dari proyek ini.
- Setiap perubahan route wajib menjaga prefix `BASE_PATH` dan melewati
  uji `curl` (list `200`, Range `206`) sebelum selesai.
- Jangan commit `films.db`, file video (`*.mp4/*.mkv/*.webm`), atau
  `posters/` hasil generate. Hanya kode + `schema.sql` + `AGENTS.md`.
