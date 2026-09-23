// Web Film Lokal — Node.js stdlib only (http + fs + path + node:sqlite).
// Tanpa dependensi npm. Dijalankan sebagai user biasa, port TCP 3000.
// JANGAN pakai port 19132-19133/udp (milik Bedrock di mesin yang sama).
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const BASE_PATH = (process.env.BASE_PATH || '/film').replace(/\/+$/, '') || '/film';

const DB_PATH = path.join(ROOT, 'films.db');
const SCHEMA_PATH = path.join(ROOT, 'schema.sql');
const MEDIA_DIR = path.join(ROOT, 'media');
const POSTER_DIR = path.join(ROOT, 'posters');

// Batas upload (bisa dioverride untuk testing: UPLOAD_MAX_BYTES=...).
const MAX_UPLOAD_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 4 * 1024 * 1024 * 1024); // 4 GB
const MIN_FREE_BYTES = 1 * 1024 * 1024 * 1024; // tolak bila sisa disk < 1 GB

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v']);
const MIME = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.css': 'text/css; charset=utf-8',
};

// ---- DB ----
const db = new DatabaseSync(DB_PATH);
if (fs.existsSync(SCHEMA_PATH)) {
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
} else {
  db.exec(`CREATE TABLE IF NOT EXISTS films (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, file_path TEXT NOT NULL UNIQUE,
    duration_sec INTEGER, poster TEXT, year INTEGER, synopsis TEXT,
    added_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
    CREATE INDEX IF NOT EXISTS idx_films_title ON films(title);`);
}

// ---- helpers ----
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function humanBytes(n) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

// Durasi gaya streaming: "1h 32m", "45m". Null -> null (bagian dilewati).
function fmtLong(sec) {
  if (sec == null) return null;
  const t = Math.round(sec);
  const h = Math.floor(t / 3600);
  const m = Math.round((t % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${t}s`;
}

// Metadata "2026 • 1h 32m" — bagian yang kosong dilewati.
function metaLine(f) {
  const parts = [];
  if (f.year) parts.push(f.year);
  const d = fmtLong(f.duration_sec);
  if (d) parts.push(d);
  return parts.join(' • ');
}

function listFilms(q) {
  if (q) return db.prepare('SELECT * FROM films WHERE title LIKE ? ORDER BY title').all(`%${q}%`);
  return db.prepare('SELECT * FROM films ORDER BY title').all();
}

function layout(title, body, mainClass) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(title)} — Film Lokal</title>`
    + `<link rel="stylesheet" href="${BASE_PATH}/static/style.css"></head>`
    + `<body><header class="navbar"><a class="brand" href="${BASE_PATH}/">FILM</a>`
    + `<nav class="nav-links" aria-label="Navigasi"><a href="${BASE_PATH}/">Home</a>`
    + `<a href="${BASE_PATH}/#semua">Movies</a><a href="${BASE_PATH}/#terbaru">Terbaru</a></nav>`
    + `<form class="search" role="search" action="${BASE_PATH}/" method="get">`
    + `<input name="q" placeholder="Cari film…" value="" aria-label="Cari film">`
    + `<button type="submit" aria-label="Cari">🔍</button></form>`
    + `<a class="upload-btn" href="${BASE_PATH}/upload"><span class="up-full">+ Upload</span><span class="up-ic">↑</span></a></header>`
    + `<main${mainClass ? ` class="${mainClass}"` : ''}>${body}</main>`
    + `<footer>Film Lokal · satu WiFi · tanpa login</footer>`
    + `<div class="menu-overlay" id="menuOverlay" hidden></div>`
    + `<div class="manage-menu" id="manageMenu" role="dialog" aria-modal="true" aria-labelledby="mmTitle" hidden>`
    + `<div class="mm-head"><h3 id="mmTitle">Kelola</h3><button type="button" class="mm-close" aria-label="Tutup">✕</button></div>`
    + `<p class="meta mm-busy" hidden>⏳ Sedang dikompres — refresh halaman ini nanti.</p>`
    + `<form method="post" action="${BASE_PATH}/compress" class="mrow mm-compress"><input type="hidden" name="id" value="">`
    + `<input type="password" name="pin" placeholder="PIN" aria-label="PIN" inputmode="numeric" autocomplete="off" required>`
    + `<button type="submit">Compress</button></form>`
    + `<form method="post" action="${BASE_PATH}/rename" class="mrow"><input type="hidden" name="id" value="">`
    + `<input type="text" name="name" placeholder="Nama file baru" aria-label="Nama file baru" maxlength="200" required>`
    + `<input type="password" name="pin" placeholder="PIN" aria-label="PIN" inputmode="numeric" autocomplete="off" required>`
    + `<button type="submit">Rename</button></form>`
    + `<form method="post" action="${BASE_PATH}/delete" class="mrow" onsubmit="return confirm('Hapus permanen? File video + data tidak bisa dikembalikan!')">`
    + `<input type="hidden" name="id" value="">`
    + `<input type="password" name="pin" placeholder="PIN" aria-label="PIN" inputmode="numeric" autocomplete="off" required>`
    + `<button type="submit" class="danger">Delete</button></form></div>`
    + `<script>(function(){var m=document.getElementById('manageMenu'),o=document.getElementById('menuOverlay'),`
    + `t=document.getElementById('mmTitle');`
    + `function setExp(v){document.querySelectorAll('[data-menu-btn]').forEach(function(x){x.setAttribute('aria-expanded',v)});}`
    + `function open(d){m.querySelectorAll('input[name=id]').forEach(function(i){i.value=d.id});`
    + `t.textContent='Kelola: '+(d.title||'');var b=d.busy==='1';`
    + `m.querySelector('.mm-busy').hidden=!b;m.querySelector('.mm-compress').style.display=b?'none':'';`
    + `m.hidden=false;o.hidden=false;setExp('true');var p=m.querySelector('input[name=pin]');if(p)p.focus();}`
    + `function close(){m.hidden=true;o.hidden=true;setExp('false');}`
    + `document.addEventListener('click',function(e){var b=e.target.closest('[data-menu-btn]');`
    + `if(b){open(b.dataset);return;}if(e.target===o||e.target.closest('.mm-close'))close();});`
    + `document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});})();</script>`
    + `</body></html>`;
}

function posterUrl(f) {
  return `${BASE_PATH}/poster?f=${encodeURIComponent(path.basename(f.poster))}`;
}

function cardHtml(f, eager) {
  const thumb = f.poster
    ? `<span class="thumb"><img ${eager ? '' : 'loading="lazy" '}src="${posterUrl(f)}" alt="">`
      + (isCompressing(f.id) ? `<span class="badge">⏳ Processing</span>` : '')
      + `</span>`
    : `<span class="thumb fallback"><span class="emoji">🎬</span><span>${esc(f.title)}</span></span>`;
  const meta = metaLine(f);
  return `<article class="card"><a href="${BASE_PATH}/watch?id=${f.id}">${thumb}`
    + `<span class="card-ov"><span class="card-title">${esc(f.title)}</span>`
    + (meta ? `<span class="card-meta">${esc(meta)}</span>` : '')
    + `</span></a>`
    + `<button type="button" class="card-gear" data-menu-btn data-id="${f.id}" data-title="${esc(f.title)}" data-busy="${isCompressing(f.id) ? 1 : 0}" aria-haspopup="dialog" aria-expanded="false" aria-label="Kelola ${esc(f.title)}">⋮</button>`
    + `</article>`;
}

function railHtml(id, title, films, first) {
  const cards = films.map((f) => cardHtml(f)).join('');
  return `<section class="content-section" id="${id}"><div class="section-header"><h2>${esc(title)}</h2>`
    + `<div class="rail-nav"><button type="button" aria-label="Geser kiri">‹</button><button type="button" aria-label="Geser kanan">›</button></div></div>`
    + `<div class="movie-rail${first ? ' first' : ''}">${cards}</div></section>`;
}

const RAIL_JS = `<script>(function(){document.querySelectorAll('.movie-rail').forEach(function(r){`
  + `var b=r.parentElement.querySelectorAll('.rail-nav button');if(b.length<2)return;`
  + `b[0].addEventListener('click',function(){r.scrollBy({left:-r.clientWidth*0.8,behavior:'smooth'})});`
  + `b[1].addEventListener('click',function(){r.scrollBy({left:r.clientWidth*0.8,behavior:'smooth'})});});})();</script>`;

function send(res, code, headers, body) {
  res.writeHead(code, headers);
  res.end(body);
}

// Aman: resolve file di dalam folder proyek, tolak traversal.
function resolveInRoot(rel) {
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

function serveStream(req, res, id) {
  const row = db.prepare('SELECT * FROM films WHERE id = ?').get(Number(id));
  if (!row || !Number.isInteger(Number(id))) {
    return send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'film tidak ditemukan');
  }
  const abs = resolveInRoot(row.file_path);
  if (!abs || !fs.existsSync(abs)) {
    return send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'file video hilang');
  }
  const stat = fs.statSync(abs);
  const mime = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m) return send(res, 416, { 'content-range': `bytes */${stat.size}` }, '');
    let start = m[1] === '' ? null : Number(m[1]);
    let end = m[2] === '' ? null : Number(m[2]);
    if (start == null && end != null) { start = stat.size - end; end = stat.size - 1; }
    if (start == null) start = 0;
    if (end == null || end >= stat.size) end = stat.size - 1;
    if (start > end || start < 0) {
      return send(res, 416, { 'content-range': `bytes */${stat.size}` }, '');
    }
    res.writeHead(206, {
      'content-type': mime,
      'accept-ranges': 'bytes',
      'content-range': `bytes ${start}-${end}/${stat.size}`,
      'content-length': end - start + 1,
    });
    fs.createReadStream(abs, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    'content-type': mime, 'accept-ranges': 'bytes', 'content-length': stat.size,
  });
  fs.createReadStream(abs).pipe(res);
}

function servePoster(res, f) {
  if (!f || /[\\/]/.test(f) || f.includes('..')) {
    return send(res, 400, { 'content-type': 'text/plain' }, 'nama poster tidak valid');
  }
  const abs = path.join(ROOT, 'posters', path.basename(f));
  if (!fs.existsSync(abs)) return send(res, 404, { 'content-type': 'text/plain' }, 'poster tidak ada');
  const mime = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': mime, 'cache-control': 'public, max-age=86400' });
  fs.createReadStream(abs).pipe(res);
}

function serveStatic(res, name) {
  const allow = new Set(['style.css']);
  if (!allow.has(name)) return send(res, 404, { 'content-type': 'text/plain' }, 'tidak ada');
  const abs = path.join(ROOT, 'public', name);
  if (!fs.existsSync(abs)) return send(res, 404, { 'content-type': 'text/plain' }, 'tidak ada');
  res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=3600' });
  fs.createReadStream(abs).pipe(res);
}

// ---- upload (publik, tanpa login) ----
function freeBytes() {
  try { return fs.statfsSync(ROOT).available; } catch { return Infinity; }
}

// Buang path, karakter berbahaya, dan tolak ekstensi non-video.
function sanitizeName(raw) {
  let name = String(raw || '').split(/[\\/]/).pop().trim();
  // Buang karakter kontrol (di bawah spasi) + karakter berbahaya Windows.
  name = name.split('').filter((c) => c >= ' ' && !':*?"<>|'.includes(c)).join('');
  name = name.replace(/^\.+/, '').trim();
  if (!name || name.length > 200) return null;
  if (!VIDEO_EXTS.has(path.extname(name).toLowerCase())) return null;
  return name;
}

function uniqueMediaPath(name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let cand = path.join(MEDIA_DIR, name);
  for (let i = 1; fs.existsSync(cand) && i < 10000; i++) {
    cand = path.join(MEDIA_DIR, `${base}-${i}${ext}`);
  }
  return cand;
}

function titleFromFile(base) {
  const t = base.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t || base;
}

// Isi durasi + poster di background agar upload langsung selesai.
function fillMetadataAsync(id, abs, rel) {
  execFile('ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', abs],
    { timeout: 30000 }, (err, out) => {
      let sec = null;
      if (!err) {
        const n = Math.round(Number(String(out).trim()));
        if (Number.isFinite(n) && n > 0) sec = n;
      }
      const name = rel.replace(/[\\/]/g, '_').replace(/\.[^.]+$/, '') + '.jpg';
      const dest = path.join(POSTER_DIR, name);
      const seek = sec ? Math.min(10, Math.max(0.5, sec * 0.1)) : 1;
      fs.mkdirSync(POSTER_DIR, { recursive: true });
      execFile('ffmpeg',
        ['-y', '-v', 'error', '-ss', String(seek), '-i', abs,
          '-vframes', '1', '-q:v', '4', dest],
        { timeout: 60000 }, (e2) => {
          try {
            const poster = (!e2 && fs.existsSync(dest)) ? path.join('posters', name) : null;
            if (sec != null && poster) {
              db.prepare('UPDATE films SET duration_sec = ?, poster = ? WHERE id = ?').run(sec, poster, id);
            } else if (sec != null) {
              db.prepare('UPDATE films SET duration_sec = ? WHERE id = ?').run(sec, id);
            } else if (poster) {
              db.prepare('UPDATE films SET poster = ? WHERE id = ?').run(poster, id);
            }
          } catch (e) { console.error('update metadata gagal:', e.message); }
        });
    });
}

function readFormBody(req) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    req.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      if (buf.length > 65536) { req.destroy(); reject(new Error('form terlalu besar')); }
    });
    req.on('end', () => {
      try { resolve(new URLSearchParams(buf.toString('utf8'))); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ---- kelola: kompres / rename / hapus (PIN sederhana, tanpa login) ----
// PIN hardcoded sesuai permintaan (gerbang keluarga, bukan keamanan serius).
// Override via env: ADMIN_PIN=xxxx node server.js
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
// Ambang "file berat": bitrate > 6 Mbps ATAU lebar > 1280px.
const HEAVY_BITRATE = Number(process.env.HEAVY_BITRATE || 6 * 1000 * 1000);
const HEAVY_WIDTH = 1280;

function compressFlag(id) { return path.join(MEDIA_DIR, `.compressing-${id}`); }
let compressCurrent = null;
const compressQueue = [];

function isCompressing(id) {
  return compressCurrent === id || compressQueue.includes(id)
    || fs.existsSync(compressFlag(id));
}

function enqueueCompress(id) {
  if (compressCurrent === id || compressQueue.includes(id)) return false;
  compressQueue.push(id);
  pumpCompress();
  return true;
}

function pumpCompress() {
  if (compressCurrent != null) return;
  const id = compressQueue.shift();
  if (id == null) return;
  compressCurrent = id;
  runCompress(id, () => { compressCurrent = null; pumpCompress(); });
}

function probeInfo(abs) {
  return new Promise((resolve) => {
    execFile('ffprobe',
      ['-v', 'error', '-show_entries', 'format=bit_rate,duration',
        '-show_entries', 'stream=width,codec_type', '-of', 'json', abs],
      { timeout: 30000 }, (err, out) => {
        if (err) return resolve(null);
        try {
          const j = JSON.parse(out);
          const vs = (j.streams || []).find((s) => s.codec_type === 'video');
          resolve({
            bitrate: Number(j.format && j.format.bit_rate) || 0,
            width: (vs && Number(vs.width)) || 0,
            duration: Math.round(Number(j.format && j.format.duration)) || null,
          });
        } catch { resolve(null); }
      });
  });
}

// ffmpeg prioritas CPU rendah (nice) agar Minecraft tidak lag.
function runFfmpegNice(args, cb) {
  execFile('nice', ['-n', '15', 'ffmpeg', ...args], { timeout: 3600 * 1000 },
    (err, so, se) => {
      if (err && err.code === 'ENOENT') {
        execFile('ffmpeg', args, { timeout: 3600 * 1000 }, cb);
      } else cb(err, so, se);
    });
}

// Kompres menggantikan file asli (nama & slot di home tidak berubah).
function runCompress(id, done) {
  const finish = () => { try { done(); } catch (e) { console.error(e); } };
  let row;
  try { row = db.prepare('SELECT * FROM films WHERE id = ?').get(id); }
  catch { return finish(); }
  if (!row) return finish();
  const abs = resolveInRoot(row.file_path);
  if (!abs || !fs.existsSync(abs)) return finish();
  probeInfo(abs).then((info) => {
    if (!info) { console.error(`kompres id=${id}: ffprobe gagal`); return finish(); }
    if (!(info.bitrate > HEAVY_BITRATE || info.width > HEAVY_WIDTH)) return finish(); // sudah ringan
    try { fs.writeFileSync(compressFlag(id), String(Date.now())); } catch { /* abaikan */ }
    const tmp = abs + '.part.mp4'; // akhiran .mp4 agar ffmpeg tahu format output
    runFfmpegNice(['-y', '-v', 'error', '-i', abs,
      '-c:v', 'libx264', '-crf', '23', '-preset', 'medium',
      '-c:a', 'aac', '-movflags', '+faststart', '-f', 'mp4', tmp], (err) => {
      try { fs.unlinkSync(compressFlag(id)); } catch { /* abaikan */ }
      if (err) {
        try { fs.unlinkSync(tmp); } catch { /* abaikan */ }
        console.error(`kompres id=${id} gagal:`, err.message);
        return finish();
      }
      try {
        fs.unlinkSync(abs);      // hapus file mentah
        fs.renameSync(tmp, abs); // versi web pakai nama & slot yang sama
        if (info.duration != null) {
          db.prepare('UPDATE films SET duration_sec = ? WHERE id = ?').run(info.duration, id);
        }
        console.log(`kompres id=${id} selesai`);
      } catch (e) { console.error(`kompres id=${id} finalisasi gagal:`, e.message); }
      finish();
    });
  });
}

function handleManagePost(req, res, action) {
  if (req.method !== 'POST') {
    return send(res, 405, { 'content-type': 'text/plain' }, 'method tidak didukung');
  }
  readFormBody(req).then((form) => {
    if ((form.get('pin') || '') !== ADMIN_PIN) {
      return send(res, 403, { 'content-type': 'text/plain; charset=utf-8' }, 'PIN salah');
    }
    const id = Number(form.get('id'));
    if (!Number.isInteger(id)) {
      return send(res, 400, { 'content-type': 'text/plain; charset=utf-8' }, 'id tidak valid');
    }
    const back = () => {
      res.writeHead(303, { location: `${BASE_PATH}/watch?id=${id}` });
      res.end();
    };

    if (action === 'compress') {
      const row = db.prepare('SELECT id FROM films WHERE id = ?').get(id);
      if (!row) return send(res, 404, { 'content-type': 'text/plain' }, 'film tidak ditemukan');
      enqueueCompress(id); // worker otomatis skip bila file sudah ringan
      return back();
    }

    if (action === 'rename') {
      if (isCompressing(id)) {
        return send(res, 400, { 'content-type': 'text/plain; charset=utf-8' }, 'tunggu kompres selesai dulu');
      }
      const row = db.prepare('SELECT * FROM films WHERE id = ?').get(id);
      if (!row) return send(res, 404, { 'content-type': 'text/plain' }, 'film tidak ditemukan');
      const oldAbs = resolveInRoot(row.file_path);
      if (!oldAbs || !fs.existsSync(oldAbs)) {
        return send(res, 404, { 'content-type': 'text/plain' }, 'file video hilang');
      }
      let base = path.basename((form.get('name') || '').trim());
      if (!base) return send(res, 400, { 'content-type': 'text/plain' }, 'nama kosong');
      if (!path.extname(base)) base += path.extname(oldAbs); // tanpa ext -> pakai ext lama
      const safe = sanitizeName(base);
      if (!safe) {
        return send(res, 400, { 'content-type': 'text/plain; charset=utf-8' }, 'nama tidak valid / format tidak didukung');
      }
      const dest = path.join(MEDIA_DIR, safe);
      if (dest !== oldAbs && fs.existsSync(dest)) {
        return send(res, 400, { 'content-type': 'text/plain; charset=utf-8' }, 'nama sudah dipakai');
      }
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
      fs.renameSync(oldAbs, dest);
      const rel = path.relative(ROOT, dest);
      db.prepare('UPDATE films SET file_path = ?, title = ? WHERE id = ?')
        .run(rel, titleFromFile(safe), id);
      return back();
    }

    if (action === 'delete') {
      if (isCompressing(id)) {
        return send(res, 400, { 'content-type': 'text/plain; charset=utf-8' }, 'tunggu kompres selesai dulu');
      }
      const row = db.prepare('SELECT * FROM films WHERE id = ?').get(id);
      if (!row) return send(res, 404, { 'content-type': 'text/plain' }, 'film tidak ditemukan');
      const abs = resolveInRoot(row.file_path);
      if (abs) { try { fs.unlinkSync(abs); } catch { /* abaikan */ } }
      if (row.poster) {
        const pabs = resolveInRoot(row.poster);
        if (pabs) { try { fs.unlinkSync(pabs); } catch { /* abaikan */ } }
      }
      db.prepare('DELETE FROM films WHERE id = ?').run(id);
      res.writeHead(303, { location: `${BASE_PATH}/` });
      res.end();
      return;
    }

    return send(res, 404, { 'content-type': 'text/plain' }, 'aksi tidak dikenal');
  }).catch(() => {
    if (!res.headersSent) send(res, 400, { 'content-type': 'text/plain' }, 'form tidak valid');
  });
}

function serveUploadForm(res) {
  const maxTxt = humanBytes(MAX_UPLOAD_BYTES);
  const body = `<p><a class="back" href="${BASE_PATH}/">← Kembali</a></p>`
    + `<div class="upload-panel"><h1>Upload Movie</h1>`
    + `<p class="meta">Pilih file film dari HP/laptop. Maksimal ${maxTxt} per file. `
    + `Format: MP4, MKV, WebM, AVI, MOV, M4V. File besar (&gt;6 Mbps) otomatis dikompres di background.</p>`
    + `<form id="up" action="${BASE_PATH}/upload" method="post" enctype="multipart/form-data">`
    + `<input type="file" name="file" aria-label="Pilih file film" accept="video/*,.mkv,.avi,.mov,.m4v" required>`
    + `<button type="submit">Upload</button></form>`
    + `<div class="progress" role="progressbar" aria-label="Progress upload" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="pwrap"><div id="bar"></div></div><p id="status" class="meta"></p></div>`
    + `<script>(function(){var f=document.getElementById('up');`
    + `f.addEventListener('submit',function(e){e.preventDefault();`
    + `var inp=f.querySelector('input[type=file]');if(!inp.files.length)return;`
    + `var bar=document.getElementById('bar'),st=document.getElementById('status');`
    + `var x=new XMLHttpRequest();x.open('POST',f.action);`
    + `x.upload.onprogress=function(ev){if(ev.lengthComputable){`
    + `var p=Math.round(ev.loaded/ev.total*100);bar.style.width=p+'%';`
    + `document.getElementById('pwrap').setAttribute('aria-valuenow',p);`
    + `st.className='meta';st.textContent=p+'% — '+Math.round(ev.loaded/1048576)+' MB dari '+Math.round(ev.total/1048576)+' MB';}};`
    + `x.onload=function(){if(x.status===303||x.status===200){st.className='meta ok';st.textContent='✓ Upload selesai, membuka…';location.href=x.responseURL;}`
    + `else{st.className='meta err';st.textContent='Upload gagal ('+x.status+'): '+x.responseText;}};`
    + `x.onerror=function(){st.className='meta err';st.textContent='Koneksi terputus.';};`
    + `st.className='meta';st.textContent='Mengupload…';x.send(new FormData(f));});})();</script>`;
  return send(res, 200, { 'content-type': 'text/html; charset=utf-8' }, layout('Upload', body));
}

// Parser multipart/form-data streaming: file langsung ditulis ke disk,
// tidak pernah ditampung utuh di RAM. Satu file per request.
function handleUploadPost(req, res) {
  const ct = req.headers['content-type'] || '';
  const bm = /boundary=(?:"([^"]+)"|([^;,\s]+))/.exec(ct);
  if (!bm) {
    return send(res, 400, { 'content-type': 'text/plain; charset=utf-8' }, 'harus multipart/form-data');
  }
  const bstr = (bm[1] || bm[2]).trim();
  const dashBoundary = Buffer.from('--' + bstr, 'latin1');
  const splitNeedle = Buffer.from('\r\n--' + bstr, 'latin1');

  if (freeBytes() < MIN_FREE_BYTES) {
    return send(res, 507, { 'content-type': 'text/plain; charset=utf-8' }, 'disk hampir penuh, upload ditolak');
  }
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  req.setTimeout(3600 * 1000); // upload GB via wifi lambat

  let buf = Buffer.alloc(0);
  let state = 'start'; // start|headers|file|skip|done
  let fileStream = null, tmpPath = null, origName = null;
  let bytesWritten = 0, totalReceived = 0, failed = false, responded = false;

  function cleanupTmp() {
    try { if (fileStream) fileStream.destroy(); } catch { /* abaikan */ }
    fileStream = null;
    try { if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* abaikan */ }
    tmpPath = null;
  }

  function fail(code, msg) {
    if (failed) return;
    failed = true;
    cleanupTmp();
    if (!responded) {
      responded = true;
      if (!res.headersSent) send(res, code, { 'content-type': 'text/plain; charset=utf-8' }, msg);
      else res.destroy();
    }
    req.destroy();
  }

  function decodeFilename(hval) {
    const mStar = /filename\*\s*=\s*([^;]+)/i.exec(hval);
    if (mStar) {
      const v = mStar[1].trim().replace(/^"|"$/g, '').split("''");
      try { return decodeURIComponent(v[v.length - 1]); } catch { return v[v.length - 1]; }
    }
    const mq = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(hval)
      || /filename\s*=\s*([^;]+)/i.exec(hval);
    if (!mq) return null;
    const raw = mq[1].replace(/\\(.)/g, '$1');
    try {
      const s = Buffer.from(raw, 'latin1').toString('utf8');
      if (!s.includes('�')) return s;
    } catch { /* pakai raw */ }
    return raw;
  }

  function writeChunk(chunk) {
    if (failed || chunk.length === 0) return !failed;
    bytesWritten += chunk.length;
    if (bytesWritten > MAX_UPLOAD_BYTES) {
      fail(413, `file melebihi batas ${humanBytes(MAX_UPLOAD_BYTES)}`);
      return false;
    }
    if (!fileStream.write(chunk)) {
      req.pause();
      fileStream.once('drain', () => { if (!failed) req.resume(); });
    }
    return true;
  }

  function finalize() {
    state = 'done';
    if (!fileStream) { fail(400, 'tidak ada file yang diupload'); return; }
    const stream = fileStream;
    fileStream = null;
    stream.end(() => {
      if (failed) return;
      const safe = sanitizeName(origName);
      if (!safe) { cleanupTmp(); fail(400, 'nama file tidak valid'); return; }
      const dest = uniqueMediaPath(safe);
      try {
        fs.renameSync(tmpPath, dest);
      } catch (e) { fail(500, 'gagal menyimpan file'); return; }
      tmpPath = null;
      const rel = path.relative(ROOT, dest);
      const title = titleFromFile(path.basename(dest));
      let id;
      try {
        id = Number(db.prepare('INSERT INTO films (title, file_path) VALUES (?, ?)').run(title, rel).lastInsertRowid);
      } catch (e) {
        try { fs.unlinkSync(dest); } catch { /* abaikan */ }
        fail(500, 'gagal mencatat ke database');
        return;
      }
      fillMetadataAsync(id, dest, rel);
      enqueueCompress(id); // file berat otomatis dikompres di background
      responded = true;
      res.writeHead(303, { location: `${BASE_PATH}/watch?id=${id}` });
      res.end();
    });
  }

  function pump() {
    while (!failed && state !== 'done') {
      if (state === 'start') {
        if (buf.length < dashBoundary.length + 2) return true;
        const eol = buf.indexOf('\r\n');
        if (eol < 0) {
          if (buf.length > 1024) { fail(400, 'body multipart tidak valid'); return false; }
          return true;
        }
        const line = buf.subarray(0, eol).toString('latin1');
        buf = buf.subarray(eol + 2);
        const dbl = dashBoundary.toString('latin1');
        if (line === dbl + '--') { fail(400, 'tidak ada file yang diupload'); return false; }
        if (line !== dbl) { fail(400, 'body multipart tidak valid'); return false; }
        state = 'headers';
      } else if (state === 'headers') {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) {
          if (buf.length > 32 * 1024) { fail(400, 'header part terlalu besar'); return false; }
          return true;
        }
        const htext = buf.subarray(0, end).toString('latin1');
        buf = buf.subarray(end + 4);
        const disp = /^content-disposition:(.*)$/mi.exec(htext);
        const fname = disp ? decodeFilename(disp[1]) : null;
        if (fname) {
          if (fileStream) { fail(400, 'satu file per request'); return false; }
          origName = fname;
          const safe = sanitizeName(fname);
          if (!safe) { fail(400, 'format file tidak didukung (hanya .mp4 .mkv .webm .avi .mov .m4v)'); return false; }
          tmpPath = path.join(MEDIA_DIR, '.upload-' + crypto.randomBytes(8).toString('hex') + '.part');
          fileStream = fs.createWriteStream(tmpPath);
          fileStream.on('error', (e) => {
            if (!failed) fail(e.code === 'ENOSPC' ? 507 : 500, e.code === 'ENOSPC' ? 'disk penuh saat upload' : 'gagal menulis file');
          });
          bytesWritten = 0;
          state = 'file';
        } else {
          state = 'skip'; // field teks biasa, buang isinya
        }
      } else if (state === 'file' || state === 'skip') {
        const keep = splitNeedle.length + 6;
        const writableLimit = buf.length > keep ? buf.length - keep : 0;
        let idx = buf.indexOf(splitNeedle);
        if (idx >= 0 && idx > writableLimit) idx = -1; // boundary mungkin terpotong, tunggu data
        if (idx < 0) {
          if (state === 'file' && writableLimit > 0) {
            if (!writeChunk(buf.subarray(0, writableLimit))) return false;
            buf = buf.subarray(writableLimit);
          } else if (state === 'skip' && buf.length > 65536) {
            buf = buf.subarray(buf.length - keep); // buang field teks raksasa
          }
          return true; // tunggu data berikutnya
        }
        if (state === 'file' && !writeChunk(buf.subarray(0, idx))) return false;
        const rest = buf.subarray(idx + splitNeedle.length);
        if (rest.length < 2) return true; // trailer belum lengkap, tunggu data
        buf = rest;
        if (buf[0] === 45 && buf[1] === 45) { // '--' -> boundary akhir
          buf = Buffer.alloc(0);
          finalize();
          return false;
        }
        if (buf[0] === 13 && buf[1] === 10) { // CRLF -> part berikutnya
          buf = buf.subarray(2);
          state = 'headers';
          continue;
        }
        fail(400, 'body multipart tidak valid');
        return false;
      }
    }
    return !failed;
  }

  req.on('data', (chunk) => {
    if (failed || state === 'done') return;
    totalReceived += chunk.length;
    if (totalReceived > MAX_UPLOAD_BYTES + 1024 * 1024) { fail(413, 'request terlalu besar'); return; }
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    pump();
  });
  req.on('end', () => {
    if (failed || state === 'done') return;
    if (state === 'file' || state === 'skip') {
      const idx = buf.indexOf(splitNeedle);
      if (idx < 0) { fail(400, 'upload terpotong'); return; }
      if (state === 'file' && !writeChunk(buf.subarray(0, idx))) return;
      const rest = buf.subarray(idx + splitNeedle.length).toString('latin1');
      if (rest.startsWith('--')) {
        buf = Buffer.alloc(0);
        finalize();
        return;
      }
    }
    fail(400, 'upload tidak lengkap');
  });
  req.on('error', () => fail(500, 'koneksi upload terputus'));
  req.on('close', () => {
    // Client pergi sebelum selesai (atau sesudah): bersihkan file parsial.
    if (state !== 'done' && !failed) { failed = true; cleanupTmp(); }
  });
}

// ---- app ----
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;

  if (p === '/' ) {
    res.writeHead(302, { location: `${BASE_PATH}/` });
    res.end();
    return;
  }
  if (p === BASE_PATH) {
    res.writeHead(302, { location: `${BASE_PATH}/` });
    res.end();
    return;
  }
  if (!p.startsWith(BASE_PATH + '/')) {
    return send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'bukan route /film');
  }
  const route = p.slice(BASE_PATH.length); // diawali '/'

  try {
    if (route === '/' || route === '/index') {
      const q = (u.searchParams.get('q') || '').trim();
      const films = listFilms(q);
      if (!films.length) {
        const body = `<div class="empty-state"><div class="big">🎬</div><h1>Belum ada film</h1>`
          + (q
            ? `<p>Tidak ketemu hasil untuk <b>${esc(q)}</b>.</p><p><a href="${BASE_PATH}/">← Tampilkan semua</a></p>`
            : `<p>Upload film pertama untuk mulai membuat katalog.</p>`
            + `<a class="btn-upload" href="${BASE_PATH}/upload">+ Upload Film</a>`);
        return send(res, 200, { 'content-type': 'text/html; charset=utf-8' }, layout(q ? 'Cari' : 'Daftar', body + '</div>', 'home'));
      }
      let body = '';
      if (q) {
        const cards = films.map((f) => cardHtml(f)).join('');
        body += `<section class="content-section"><div class="section-header"><h2>Hasil pencarian</h2></div>`
          + `<p class="sub" style="padding:0 16px">Untuk “<b>${esc(q)}</b>” — ${films.length} film · <a href="${BASE_PATH}/">reset</a></p>`
          + `<div class="search-grid">${cards}</div></section>`;
      } else {
        const hero = db.prepare('SELECT * FROM films WHERE poster IS NOT NULL ORDER BY id DESC LIMIT 1').get();
        if (hero) {
          const hmeta = metaLine(hero);
          body += `<section class="hero"><img class="hero-backdrop" src="${posterUrl(hero)}" alt="">`
            + `<div class="hero-shade"></div><div class="hero-body">`
            + `<p class="hero-kicker">FEATURED</p><h1 class="hero-title">${esc(hero.title)}</h1>`
            + (hmeta ? `<p class="hero-meta">${esc(hmeta)}</p>` : '')
            + (hero.synopsis ? `<p class="hero-desc">${esc(hero.synopsis)}</p>` : '')
            + `<div class="hero-btns"><a class="btn-putar" href="${BASE_PATH}/watch?id=${hero.id}">▶ Putar</a>`
            + `<a class="btn-detail" href="${BASE_PATH}/watch?id=${hero.id}">ⓘ Detail</a></div>`
            + `</div></section>`;
        }
        const fresh = db.prepare('SELECT * FROM films ORDER BY id DESC LIMIT 10').all();
        if (fresh.length > 1 || (fresh.length === 1 && films.length > 1)) {
          body += railHtml('terbaru', 'Terbaru', fresh, true);
        }
        body += railHtml('semua', 'Semua Film', films, !body.includes('movie-rail first'));
        body += RAIL_JS;
      }
      return send(res, 200, { 'content-type': 'text/html; charset=utf-8' }, layout(q ? 'Cari' : 'Daftar', body, 'home'));
    }

    if (route === '/watch') {
      const row = db.prepare('SELECT * FROM films WHERE id = ?').get(Number(u.searchParams.get('id')));
      if (!row) return send(res, 404, { 'content-type': 'text/plain' }, 'film tidak ditemukan');
      const busy = isCompressing(row.id);
      const wmeta = metaLine(row);
      const body = `<p><a class="back" href="${BASE_PATH}/">← Kembali</a></p>`
        + `<div class="watch-head"><h1 class="watch-title">${esc(row.title)}</h1>`
        + `<button type="button" class="gear-btn" data-menu-btn data-id="${row.id}" data-title="${esc(row.title)}" data-busy="${busy ? 1 : 0}" aria-haspopup="dialog" aria-expanded="false" aria-label="Kelola film">⚙</button></div>`
        + (wmeta || busy ? `<p class="meta">${esc(wmeta)}${busy ? ' • ⏳ Processing' : ''}</p>` : '')
        + `<div class="player-wrap"><video class="video-player" controls preload="metadata" playsinline src="${BASE_PATH}/stream?id=${row.id}"></video></div>`
        + (row.synopsis ? `<p class="synopsis">${esc(row.synopsis)}</p>` : '');
      return send(res, 200, { 'content-type': 'text/html; charset=utf-8' }, layout(row.title, body, 'watch'));
    }

    if (route === '/stream') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return send(res, 405, { 'content-type': 'text/plain' }, 'method tidak didukung');
      }
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'accept-ranges': 'bytes' });
        res.end();
        return;
      }
      return serveStream(req, res, u.searchParams.get('id'));
    }

    if (route === '/poster') return servePoster(res, u.searchParams.get('f'));
    if (route.startsWith('/static/')) return serveStatic(res, route.slice('/static/'.length));

    if (route === '/upload') {
      if (req.method === 'GET') return serveUploadForm(res);
      if (req.method === 'POST') { handleUploadPost(req, res); return; }
      return send(res, 405, { 'content-type': 'text/plain' }, 'method tidak didukung');
    }

    if (route === '/compress' || route === '/rename' || route === '/delete') {
      handleManagePost(req, res, route.slice(1)); return;
    }

    if (route === '/api/films') {
      const films = listFilms((u.searchParams.get('q') || '').trim());
      return send(res, 200, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify(films));
    }

    if (route === '/health') {
      return send(res, 200, { 'content-type': 'text/plain' }, 'ok');
    }

    return send(res, 404, { 'content-type': 'text/plain' }, 'tidak ditemukan');
  } catch (err) {
    console.error(err);
    return send(res, 500, { 'content-type': 'text/plain' }, 'kesalahan server');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Film lokal jalan di http://${HOST}:${PORT}${BASE_PATH} (base ${BASE_PATH})`);
});
