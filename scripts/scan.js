// Scan media/ (+ file video di root proyek) -> upsert ke films.db.
// Pakai: node scripts/scan.js
// Tidak menghapus baris film yang file-nya hilang (hanya log peringatan).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'films.db');
const SCHEMA_PATH = path.join(ROOT, 'schema.sql');
const POSTER_DIR = path.join(ROOT, 'posters');
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v']);

const db = new DatabaseSync(DB_PATH);
if (fs.existsSync(SCHEMA_PATH)) db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

function titleFromFile(base) {
  return base
    .replace(/\.[^.]+$/, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function probeDuration(abs) {
  try {
    const out = execFileSync(
      'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', abs],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 },
    ).trim();
    const sec = Math.round(Number(out));
    return Number.isFinite(sec) && sec > 0 ? sec : null;
  } catch { return null; } // ffprobe tidak ada / gagal -> durasi NULL
}

function makePoster(abs, rel, durationSec) {
  try {
    const name = rel.replace(/[\\/]/g, '_').replace(/\.[^.]+$/, '') + '.jpg';
    const dest = path.join(POSTER_DIR, name);
    if (fs.existsSync(dest)) return path.join('posters', name);
    fs.mkdirSync(POSTER_DIR, { recursive: true });
    // Ambil frame di ~10% durasi (maks 10 dtk) agar video pendek tetap dapat thumbnail.
    const seek = durationSec
      ? Math.min(10, Math.max(0.5, durationSec * 0.1))
      : 1;
    execFileSync('ffmpeg',
      ['-y', '-v', 'error', '-ss', String(seek), '-i', abs, '-vframes', '1', '-q:v', '4', dest],
      { stdio: ['ignore', 'ignore', 'ignore'], timeout: 30000 });
    if (!fs.existsSync(dest)) return null;
    return path.join('posters', name);
  } catch { return null; } // ffmpeg gagal -> tanpa poster, tidak fatal
}

function collect(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (path.basename(abs) === 'node_modules') continue;
      if (abs === POSTER_DIR) continue;
      collect(abs, out);
    } else if (ent.isFile() && VIDEO_EXTS.has(path.extname(ent.name).toLowerCase())) {
      out.push(abs);
    }
  }
  return out;
}

const files = [
  ...collect(path.join(ROOT, 'media'), []),
  ...fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isFile() && VIDEO_EXTS.has(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(ROOT, e.name)),
];

const upsert = db.prepare(`INSERT INTO films (title, file_path, duration_sec, poster)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(file_path) DO UPDATE SET
    duration_sec = COALESCE(excluded.duration_sec, films.duration_sec),
    poster = COALESCE(excluded.poster, films.poster)`);

let added = 0;
for (const abs of files) {
  const rel = path.relative(ROOT, abs);
  const title = titleFromFile(path.basename(abs));
  const duration = probeDuration(abs);
  const poster = makePoster(abs, rel, duration);
  upsert.run(title, rel, duration, poster);
  added++;
  console.log(`ok: ${rel} | ${title} | dur=${duration ?? '-'} | poster=${poster ?? '-'}`);
}

// Tandai file yang hilang (tidak dihapus dari DB).
for (const row of db.prepare('SELECT id, file_path FROM films').all()) {
  if (!fs.existsSync(path.join(ROOT, row.file_path))) {
    console.log(`hilang: id=${row.id} ${row.file_path} (baris DB dipertahankan)`);
  }
}
console.log(`selesai: ${added} file diproses.`);
