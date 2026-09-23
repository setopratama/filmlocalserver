# DESIGN.md — Cinematic Streaming UI

Spesifikasi desain UI untuk web film lokal (`/film`).

Dokumen ini adalah acuan **visual design dan interaction design saja**. Implementasi dilakukan terpisah dengan mengubah `server.js` (template HTML) dan `public/style.css`.

Arah visual: **premium streaming platform**, terinspirasi pola desain layanan seperti Netflix, tetapi bukan clone pixel-perfect. Fokus utama adalah membuat koleksi film lokal terasa seperti katalog streaming sungguhan.

---

# 1. Design Direction

## 1.1 Konsep

UI harus terasa seperti:

> **"Buka website → langsung menemukan sesuatu untuk ditonton."**

Prioritas visual:

1. Hero cinematic.
2. Poster/thumbnail sebagai pusat perhatian.
3. Content rail horizontal.
4. Hierarki judul yang kuat.
5. Dark cinematic interface.
6. Minimal UI chrome.
7. Motion ringan dan tidak mengganggu.
8. Mobile tetap menjadi prioritas.

Website bukan dashboard administrasi.

Website harus terasa seperti **aplikasi streaming**.

---

# 2. Prinsip Utama

### 2.1 Cinematic First

Gunakan warna gelap sebagai canvas utama.

Background tidak boleh terasa seperti `#000000` polos di seluruh halaman. Gunakan beberapa level black agar depth tetap terlihat.

```css
--black: #000;
--bg: #080808;
--bg-elevated: #111;
--surface: #181818;
--surface-hover: #222;
```

Hero menggunakan artwork/poster dengan gradient overlay sehingga gambar menyatu dengan background.

---

### 2.2 Content First

UI tidak boleh mengambil perhatian lebih besar daripada film.

Hindari:

* border berlebihan
* panel seperti dashboard
* terlalu banyak tombol
* icon di setiap elemen
* shadow berat
* gradient dekoratif yang tidak diperlukan

Gunakan whitespace dan hierarchy.

---

### 2.3 Streaming Platform Mental Model

Struktur halaman:

```text
NAVBAR

HERO
 ├── Genre / label
 ├── Title
 ├── Metadata
 ├── Description
 └── CTA

CONTENT
 ├── Continue Watching
 ├── Recently Added
 ├── All Movies
 └── More Movies

FOOTER
```

Jika data untuk suatu section tidak tersedia, section tidak perlu ditampilkan.

---

### 2.4 Mobile First

Target utama:

```text
360px
375px
390px
414px
```

Kemudian:

```text
768px
1024px
1280px+
```

Semua interaksi desktop harus tetap usable menggunakan touch.

---

# 3. Design Tokens

## 3.1 Color

```css
:root {
  --black: #000000;
  --bg: #080808;
  --bg-soft: #0d0d0d;

  --surface: #141414;
  --surface-2: #1f1f1f;
  --surface-hover: #292929;

  --red: #e50914;
  --red-hover: #f6121d;
  --red-dark: #b20710;

  --white: #ffffff;
  --text: #f5f5f5;
  --text-secondary: #b3b3b3;
  --text-muted: #777777;

  --success: #46d369;
  --danger: #e50914;

  --line: rgba(255,255,255,.10);
}
```

Netflix-style red digunakan sebagai **accent**, bukan sebagai warna dominan seluruh halaman.

---

# 4. Typography

Gunakan system font agar tetap offline-first.

```css
font-family:
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

Hierarchy:

```text
Hero title
48–72px desktop
32–40px tablet
28–34px mobile

Section title
24px desktop
20px mobile

Card title
14–16px

Metadata
12–14px

Description
14–18px
```

Font weight:

```text
400  body
500  metadata
600  section
700  card title
800  hero title
```

Hindari uppercase untuk semua teks.

Gunakan uppercase hanya untuk label kecil seperti:

```text
FEATURED
NEW
HD
```

---

# 5. Global Layout

Body:

```css
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  color-scheme: dark;
}
```

Tidak menggunakan:

* framework
* CDN
* webfont
* external icon library
* external image library

Website harus tetap dapat digunakan ketika internet WAN mati selama perangkat masih berada dalam jaringan lokal.

---

# 6. Navbar

Navbar harus terasa **floating dan cinematic**, bukan seperti navbar website biasa.

## Desktop

```text
┌───────────────────────────────────────────────────────────┐
│ FILM     Home   Movies                         🔍  Upload │
└───────────────────────────────────────────────────────────┘
```

Position:

```css
position: fixed;
top: 0;
left: 0;
right: 0;
z-index: 100;
```

Default:

```text
background:
linear-gradient(
  to bottom,
  rgba(0,0,0,.90),
  rgba(0,0,0,0)
);
```

Navbar tidak menggunakan border bawah.

---

## 6.1 Logo

Gunakan:

```text
FILM
```

dengan:

* uppercase
* bold
* merah
* letter-spacing kecil
* ukuran 22–28px

Logo menjadi link menuju:

```text
/film/
```

---

## 6.2 Navigation

Desktop:

```text
Home
Movies
Recently Added
```

Navigation boleh disesuaikan dengan route yang benar-benar tersedia.

Jangan membuat route baru hanya untuk kebutuhan visual.

---

## 6.3 Search

Search bukan panel besar.

Desktop:

```text
             ┌───────────────────┐
             │ 🔍 Search movies   │
             └───────────────────┘
```

Saat focus:

```text
width: 260px;
```

Normal:

```text
width: 180px;
```

Transition:

```css
transition: width .25s ease;
```

Mobile:

Search menjadi full-width pada baris kedua.

---

## 6.4 Upload

Upload menggunakan button merah:

```text
+ Upload
```

Desktop menampilkan label.

Mobile:

```text
↑
```

atau:

```text
Upload
```

jika ruang mencukupi.

---

# 7. Hero Section

Hero adalah elemen visual terbesar di homepage.

## 7.1 Structure

```text
┌──────────────────────────────────────────────────────┐
│ NAVBAR                                                │
│                                                       │
│                                                       │
│                 CINEMATIC IMAGE                       │
│                                                       │
│       FEATURED                                        │
│       Judul Film                                      │
│       2026 · 1h 32m · HD                              │
│                                                       │
│       Description                                    │
│                                                       │
│       [▶ Play]  [ⓘ More Info]                        │
│                                                       │
└──────────────────────────────────────────────────────┘
```

Hero menggunakan film terbaru yang memiliki poster:

```sql
ORDER BY id DESC
LIMIT 1
```

Jika tidak ada film dengan poster:

```text
Hero tidak ditampilkan.
```

---

# 8. Hero Visual

Desktop:

```css
.hero {
  min-height: 70vh;
  position: relative;
}
```

Artwork:

```css
.hero-backdrop {
  position: absolute;
  inset: 0;

  width: 100%;
  height: 100%;

  object-fit: cover;
}
```

Overlay wajib menggunakan beberapa gradient:

```text
top
    transparent → black

center
    transparent

bottom
    transparent → #080808
```

Tujuannya agar gambar tidak terlihat seperti banner terpisah dari halaman.

---

# 9. Hero Content

Content berada di:

```text
left: 5%
bottom: 12%
```

Desktop max-width:

```text
600px
```

Mobile:

```text
padding: 24px 16px;
```

---

## 9.1 Label

Contoh:

```text
FILM UNGGULAN
```

Style:

```text
font-size: 12px
font-weight: 700
letter-spacing: .12em
color: #fff
```

---

## 9.2 Title

Desktop:

```text
56–72px
```

Mobile:

```text
30–36px
```

Title maksimal:

```text
2–3 lines
```

Jangan membuat hero title terlalu panjang.

---

## 9.3 Metadata

Format:

```text
2026   •   1h 42m   •   HD
```

Gunakan `•` sebagai separator.

Contoh:

```text
2026 • 1h 42m • HD
```

Metadata menggunakan:

```text
color: #d2d2d2;
font-size: 14px;
```

---

## 9.4 Description

Desktop:

```text
max-width: 520px;
```

Mobile:

```text
max 3 lines;
```

Gunakan line clamp agar hero tidak menjadi terlalu tinggi.

---

# 10. Hero Buttons

Primary:

```text
▶  Putar
```

Style:

```text
background: white;
color: black;
```

Secondary:

```text
ⓘ  Detail
```

Style:

```text
background: rgba(109,109,110,.7);
color: white;
```

Hover:

```text
primary → #e6e6e6
secondary → rgba(109,109,110,.5)
```

Catatan:

Tombol **Play tidak harus merah**.

Netflix-style visual lebih kuat jika primary CTA menggunakan putih dan merah menjadi brand accent.

---

# 11. Content Rails

Setelah hero, konten menggunakan horizontal rails.

Contoh:

```text
Terbaru

┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
│       │ │       │ │       │ │       │
│ FILM  │ │ FILM  │ │ FILM  │ │ FILM  │
│       │ │       │ │       │ │       │
└───────┘ └───────┘ └───────┘ └───────┘
       ← swipe →
```

---

# 12. Rail Layout

```css
.rail {
  display: flex;
  gap: 8px;
  overflow-x: auto;

  scroll-snap-type: x mandatory;

  scrollbar-width: none;
}

.rail::-webkit-scrollbar {
  display: none;
}
```

Mobile:

```text
padding-left: 16px;
padding-right: 16px;
```

Desktop:

```text
padding-left: 4%;
padding-right: 4%;
```

---

# 13. Section Header

Section:

```text
Terbaru                                      ›
```

atau:

```text
Semua Film
```

Style:

```text
font-size: 20px;
font-weight: 700;
```

Mobile:

```text
18px;
```

Jangan menggunakan border atau background pada section header.

---

# 14. Movie Card

Card menggunakan landscape:

```text
16:9
```

Desktop:

```text
width: 260px;
```

Tablet:

```text
width: 220px;
```

Mobile:

```text
width: 170px;
```

Minimum touch-friendly.

---

# 15. Card Visual

Default:

```text
border-radius: 4px;
overflow: hidden;
background: #181818;
```

Image:

```css
width: 100%;
aspect-ratio: 16 / 9;
object-fit: cover;
```

Tidak boleh menggunakan portrait crop.

---

# 16. Card Overlay

Card menggunakan gradient bawah:

```text
transparent
        ↓
rgba(0,0,0,.85)
```

Content:

```text
Film Title
1h 20m
```

Desktop:

Overlay tersembunyi sampai hover.

Mobile:

Overlay selalu terlihat.

---

# 17. Card Hover

Desktop:

```css
transform: scale(1.06);
```

Transition:

```text
.25s ease
```

Card harus memiliki:

```text
z-index lebih tinggi
box-shadow
```

Jangan menggunakan scale terlalu besar karena akan mengganggu card tetangga.

---

# 18. Card Interaction

Saat hover desktop:

```text
Thumbnail
      ↓
Scale
      ↓
Gradient
      ↓
Title
      ↓
Metadata
```

Tidak membuat video preview otomatis.

Alasan:

* membutuhkan request tambahan
* membebani server rumah
* memperbesar bandwidth
* tidak diperlukan untuk katalog lokal

---

# 19. Movie Card State

## Normal

```text
Poster
```

## Hover

```text
Poster
+ gradient
+ title
+ metadata
```

## Compressing

Tambahkan badge:

```text
⏳ Processing
```

Badge berada di:

```text
top-left
```

Style:

```text
background: rgba(0,0,0,.75)
```

---

# 20. Movie Tanpa Poster

Jangan menampilkan kotak hitam kosong.

Fallback:

```text
┌─────────────────────┐
│                     │
│        🎬           │
│                     │
│     Film Title      │
└─────────────────────┘
```

Background:

```css
linear-gradient(
  135deg,
  #252525,
  #080808
);
```

Icon menggunakan emoji atau karakter Unicode agar tetap offline.

---

# 21. Homepage Spacing

Hero selesai tepat sebelum rail pertama.

Gunakan:

```text
hero
↓
-40px overlap
↓
section
```

Rail boleh sedikit overlap dengan hero agar terasa seperti streaming platform.

Contoh:

```text
          HERO
     ───────────────
          ↓
       TERBARU
   [ ][ ][ ][ ][ ]
```

Namun overlap tidak boleh menyebabkan masalah pada mobile.

---

# 22. Homepage Structure

Urutan utama:

```text
NAVBAR

HERO

SECTION:
Baru Ditambahkan

SECTION:
Semua Film

SECTION:
Film Lainnya
```

Untuk tahap awal cukup:

```text
Hero
+
Semua Film
```

Section tambahan hanya dibuat jika data memang tersedia.

---

# 23. Empty State

Jika database kosong:

```text
                 🎬

          Belum ada film

    Upload film pertama untuk
       mulai membuat katalog.

       [ + Upload Film ]
```

Jangan menggunakan tabel atau panel admin-style.

Empty state harus tetap terasa seperti streaming application.

---

# 24. Search Result

Jika pengguna melakukan pencarian:

```text
Search results for:

"naruto"

12 films
```

Kemudian grid/rail:

```text
[ ][ ][ ][ ]
[ ][ ][ ][ ]
```

Mobile:

```text
2 columns
```

Desktop:

```text
4–6 columns
```

Gunakan layout grid untuk search result, bukan horizontal rail, karena pengguna membutuhkan gambaran seluruh hasil.

---

# 25. Watch Page

Watch page harus menjadi pengalaman **immersive player**.

Background:

```text
#000
```

Navbar dapat tetap minimal.

Layout desktop:

```text
                VIDEO

        ┌─────────────────────┐
        │                     │
        │       PLAYER        │
        │                     │
        └─────────────────────┘

        Movie Title
        2026 • 1h 32m • HD

        Description

        ⚙ Manage
```

---

# 26. Video Player

```css
.video-player {
  width: 100%;
  max-height: 78vh;

  background: #000;

  object-fit: contain;
}
```

HTML:

```html
<video
  controls
  preload="metadata"
  playsinline>
</video>
```

`playsinline` wajib untuk mobile.

---

# 27. Watch Content Width

Desktop:

```text
max-width: 1200px;
margin: auto;
```

Mobile:

```text
width: 100%;
```

Player desktop tidak boleh memenuhi seluruh layar jika menyebabkan UI terlalu melebar.

---

# 28. Watch Metadata

Title:

```text
28px desktop
22px mobile
```

Metadata:

```text
color: #aaa;
```

Format:

```text
2026 • 1h 32m • HD
```

Description:

```text
max-width: 760px;
line-height: 1.6;
```

---

# 29. Manage Section

Bagian administrasi disembunyikan di balik menu gerigi agar tidak mengambil
perhatian dari pengalaman menonton:

```text
Judul Film                          ⚙
```

Satu menu bersama (`#manage-menu`, modal tengah, max 360px) dipakai oleh
tombol gerigi di halaman watch dan tombol `⋮` di tiap kartu home:

```text
Kelola: Judul Film                   ✕

PIN: [••••]  [ Compress ]

Nama baru: [____]  PIN: [••••]  [ Rename ]

PIN: [••••]  [ Delete ]
```

* PIN tetap diminta per aksi (tanpa session). PIN salah → 403.
* Buka/tutup: klik gerigi, klik-luar, tombol ✕, `Escape`.
* `aria-haspopup="dialog"`, `aria-expanded`, fokus ke kolom PIN saat dibuka.
* Bila film sedang dikompres: form Compress diganti teks `⏳ Sedang dikompres`.
* Satu set form dipakai ulang (JS mengisi hidden `id` + judul) agar DOM ringan.

---

# 30. Delete

Delete tetap menggunakan warna merah.

Sebelum delete:

```javascript
confirm()
```

Jangan menghapus fungsi keamanan yang sudah ada.

---

# 31. Upload Page

Upload page menggunakan style yang sama dengan streaming platform.

Layout:

```text
             Upload Movie

       ┌──────────────────────┐
       │                      │
       │   Select movie file  │
       │                      │
       └──────────────────────┘

       Supported formats
       Maximum 4 GB

       ━━━━━━━━━━━━━━━ 45%

       120 MB / 260 MB

             [ Upload ]
```

---

# 32. Upload Panel

Desktop:

```text
max-width: 640px
```

Mobile:

```text
padding: 16px;
```

Panel:

```text
background: #141414;
border-radius: 8px;
```

Tidak menggunakan border tebal.

---

# 33. Progress

Track:

```text
#2a2a2a
```

Progress:

```text
#e50914
```

Height:

```text
8px
```

Teks:

```text
45%
120 MB dari 260 MB
```

Progress bar harus memiliki `aria` attribute untuk accessibility.

---

# 34. Upload Status

Success:

```text
✓ Upload selesai
```

Menggunakan:

```text
#46d369
```

Error:

```text
Upload gagal
```

Menggunakan:

```text
#e50914
```

Hijau hanya digunakan untuk status sukses.

---

# 35. Responsive Breakpoints

| Breakpoint |      Card |    Hero | Navigation |
| ---------- | --------: | ------: | ---------- |
| ≤600px     | 160–170px | 35–55vh | 2 rows     |
| 601–1023px | 200–220px | 55–65vh | 1 row      |
| ≥1024px    | 240–260px | 65–70vh | full       |
| ≥1440px    |     280px |    70vh | full       |

---

# 36. Mobile Navigation

Mobile:

```text
┌─────────────────────────────┐
│ FILM                 ↑      │
├─────────────────────────────┤
│ 🔍 Search movies             │
└─────────────────────────────┘
```

Search berada di baris kedua.

Upload tetap accessible.

Navbar tidak boleh mengambil lebih dari sekitar:

```text
100px
```

tinggi layar.

---

# 37. Mobile Hero

Hero dibuat lebih pendek.

Urutan:

```text
Image
↓
Title
↓
Metadata
↓
Description
↓
Buttons
```

Buttons:

```text
[ ▶ Putar ]
[ ⓘ Detail ]
```

Lebar:

```text
100%
```

---

# 38. Desktop Hero

Desktop menggunakan overlay content:

```text
                 ┌──────────────────────────┐
                 │                          │
                 │                          │
                 │   FEATURED               │
                 │   MOVIE TITLE            │
                 │                          │
                 │   Description            │
                 │                          │
                 │   [▶ Putar] [ⓘ Detail]  │
                 │                          │
                 └──────────────────────────┘
```

Content tidak boleh ditempatkan tepat di tengah.

Gunakan:

```text
left aligned
bottom aligned
```

agar terasa cinematic.

---

# 39. Responsive Grid Search

Search result:

Desktop:

```css
grid-template-columns:
repeat(auto-fill, minmax(220px, 1fr));
```

Mobile:

```css
grid-template-columns:
repeat(2, minmax(0, 1fr));
```

Gap:

```text
8px mobile
12px desktop
```

---

# 40. Motion

Semua motion harus subtle.

Default:

```css
transition:
  transform .25s ease,
  opacity .25s ease,
  background-color .25s ease;
```

Allowed:

```text
card scale
button hover
navbar transition
search expansion
fade
```

Tidak dibuat:

```text
auto-playing hero
parallax berat
particle effect
page loading animation berlebihan
```

---

# 41. Accessibility

Minimum:

* semua button memiliki label
* input memiliki label/placeholder yang jelas
* focus state terlihat
* keyboard navigation tetap berfungsi
* touch target minimum 44px
* kontras teks memadai
* video memiliki controls
* jangan hanya mengandalkan warna untuk status
* horizontal rail tetap dapat dinavigasi keyboard

Focus:

```css
:focus-visible {
  outline: 2px solid white;
  outline-offset: 3px;
}
```

---

# 42. Performance

Prioritas:

```text
CSS only
+
HTML server rendered
+
minimal inline JS
```

Tidak boleh menambahkan:

* React
* Vue
* Tailwind
* Bootstrap
* jQuery
* external icon CDN
* external font
* external image dependency

Image:

```text
loading="lazy"
```

untuk thumbnail yang berada di bawah viewport.

Hero boleh menggunakan eager loading karena merupakan visual utama.

---

# 43. Offline First

Website harus tetap bekerja ketika:

```text
Internet WAN = OFF
WiFi LAN = ON
```

Tidak boleh ada dependency:

```text
Google Fonts
Font Awesome CDN
Bootstrap CDN
external JS
external CSS
external analytics
```

Semua asset harus berasal dari server lokal.

---

# 44. What We Explicitly Do NOT Build

Tidak dibuat:

### Netflix-style video preview

Karena:

* membutuhkan request tambahan
* bandwidth
* CPU
* storage
* server rumah

### Auto-playing hero

Hero cukup statis.

### Automatic carousel

Tidak diperlukan.

### Light mode

Website tetap dark cinematic.

### Excessive animation

Performance lebih penting daripada gimmick.

### New backend routes

Design tidak boleh mengubah architecture backend.

---

# 45. Implementation Map

## `public/style.css`

Rewrite CSS berdasarkan urutan:

```text
1. Tokens
2. Reset
3. Typography
4. Navbar
5. Hero
6. Sections
7. Movie Rails
8. Movie Cards
9. Search
10. Watch
11. Upload
12. Forms
13. States
14. Responsive
15. Accessibility
```

Semua styling berada di satu file.

---

## `server.js`

Perubahan hanya pada HTML/template:

```text
layout()
homepage
watch page
upload page
```

Tambahkan struktur HTML yang dibutuhkan oleh design.

Jangan mengubah:

```text
database
routes
streaming Range
upload logic
compression logic
Nginx
Bedrock
Minecraft
security
```

---

# 46. Homepage Target Structure

Target akhir:

```html
<body>

  <header class="navbar">
    ...
  </header>

  <main>

    <section class="hero">
      ...
    </section>

    <section class="content-section">
      <div class="section-header">
        <h2>Terbaru</h2>
      </div>

      <div class="movie-rail">
        ...
      </div>
    </section>

    <section class="content-section">
      <div class="section-header">
        <h2>Semua Film</h2>
      </div>

      <div class="movie-rail">
        ...
      </div>
    </section>

  </main>

</body>
```

---

# 47. Visual Hierarchy

Prioritas perhatian:

```text
1. Hero artwork
2. Hero title
3. Play button
4. Section title
5. Movie artwork
6. Movie title
7. Metadata
8. Secondary controls
```

Jika semua elemen terlihat penting, berarti tidak ada hierarchy.

---

# 48. Overall Visual Character

UI final harus memiliki karakter:

```text
BLACK
CINEMATIC
PREMIUM
MINIMAL
FAST
IMMERSIVE
LOCAL
```

Bukan:

```text
ADMIN DASHBOARD
```

dan bukan:

```text
GENERIC VIDEO WEBSITE
```

Target rasa:

> **"Ini seperti membuka aplikasi streaming pribadi yang berjalan di jaringan rumah."**

---

# 49. Acceptance Criteria

## Functional

* [ ] `node --check server.js` lolos.
* [ ] Tidak ada dependency baru.
* [ ] Semua route existing tetap berfungsi.
* [ ] Database tidak berubah.
* [ ] Streaming Range tetap berfungsi.
* [ ] Upload tetap berfungsi.
* [ ] Compression tetap berfungsi.
* [ ] Delete tetap berfungsi.
* [ ] Rename tetap berfungsi.
* [ ] PIN tetap berfungsi.
* [ ] `/health` tetap 200.
* [ ] Bedrock tetap berjalan.

---

## Visual

* [ ] Homepage terasa seperti streaming platform.
* [ ] Hero cinematic.
* [ ] Navbar transparent/floating.
* [ ] Movie cards landscape 16:9.
* [ ] Card hover hanya desktop.
* [ ] Card title selalu terbaca di mobile.
* [ ] Rail dapat di-swipe.
* [ ] Search result menggunakan grid.
* [ ] Empty state tidak terlihat seperti error page.
* [ ] Upload page menggunakan visual language yang sama.
* [ ] Watch page immersive.
* [ ] Tidak ada external asset.

---

## Mobile

* [ ] Test 360px.
* [ ] Test 375px.
* [ ] Test 390px.
* [ ] Test 414px.
* [ ] Semua button minimal 44px.
* [ ] Hero tidak terlalu tinggi.
* [ ] Search tetap usable.
* [ ] Rail dapat di-swipe.
* [ ] Video tidak memaksa fullscreen.
* [ ] Tidak ada horizontal overflow pada page.

---

## Desktop

* [ ] Test ≥1024px.
* [ ] Test 1280px.
* [ ] Test 1440px.
* [ ] Hero menggunakan cinematic layout.
* [ ] Card hover bekerja.
* [ ] Rail navigation bekerja.
* [ ] Search expansion bekerja.
* [ ] Content tidak terlalu melebar.

---

## Offline

Dengan WAN dicabut tetapi WiFi LAN tetap aktif:

* [ ] Homepage tetap tampil.
* [ ] Hero tetap tampil.
* [ ] Thumbnail tetap tampil.
* [ ] Search tetap bekerja.
* [ ] Watch tetap bekerja.
* [ ] Upload tetap bekerja.
* [ ] Tidak ada request ke external CDN.
* [ ] Tidak ada broken font/icon.
* [ ] Tidak ada console error karena external asset.

---

# 50. Final Design Principle

Jangan membuat website terlihat seperti **website yang mencoba menjadi Netflix**.

Buat website terlihat seperti:

> **sebuah streaming platform lokal yang kebetulan memiliki koleksi film sendiri.**

Netflix digunakan sebagai **referensi interaction pattern dan visual hierarchy**, bukan untuk menyalin identitas visual secara pixel-perfect.

Prioritas akhir:

```text
Content > Decoration
Cinematic > Dashboard
Speed > Animation
Clarity > Complexity
Mobile > Desktop
Local/Offline > External Dependency
```
