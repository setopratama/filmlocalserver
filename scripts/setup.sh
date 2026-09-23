#!/usr/bin/env bash
# Setup sekali jalan — BUTUH sudo:
#   sudo bash /home/x220/projects/film/scripts/setup.sh
# Aman untuk server Minecraft: hanya menambah location /film/ di Nginx,
# me-reload (bukan restart) Nginx, dan memasang unit film.service yang
# terpisah dari bedrock.service. Tidak menyentuh port 19132-19133/udp.
set -euo pipefail

FILM_DIR="/home/x220/projects/film"
SITE_LINK="/etc/nginx/sites-enabled/default"
# File config asli (sites-enabled/default adalah symlink ke sites-available/).
SITE_REAL="$(readlink -f "$SITE_LINK")"

echo "== 0/4 Bersihkan sisa percobaan sebelumnya =="
# Hapus backup palsu (symlink) di sites-enabled: file di folder ini ikut
# dimuat Nginx sehingga duplikat server block membuat `nginx -t` gagal.
for f in /etc/nginx/sites-enabled/default.bak-*; do
  if [ -e "$f" ] || [ -L "$f" ]; then
    rm -f "$f"
    echo "  dihapus: $f"
  fi
done

echo "== 1/4 Nginx: tambah location /film/ =="
if grep -q 'location \^~ /film/' "$SITE_REAL"; then
  echo "  sudah ada, dilewati."
else
  # Backup ISI file ke sites-available (tidak dimuat Nginx, aman dari duplikat).
  BACKUP="$SITE_REAL.bak-$(date +%F_%H%M)"
  cp -aL "$SITE_REAL" "$BACKUP"
  echo "  backup isi: $BACKUP"
  python3 - "$SITE_REAL" <<'EOF'
import sys
p = sys.argv[1]
s = open(p).read()
block = (
    "\tlocation = /film { return 301 /film/; }\n"
    "\tlocation ^~ /film/ {\n"
    "\t\tproxy_pass http://127.0.0.1:3000/film/;\n"
    "\t\tproxy_http_version 1.1;\n"
    "\t\tproxy_set_header Host $host;\n"
    "\t\tproxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n"
    "\t\t# penting untuk streaming: teruskan Range request apa adanya\n"
    "\t\tproxy_buffering off;\n"
    "\t\t# wajib untuk upload file besar (default Nginx hanya 1 MB)\n"
    "\t\tclient_max_body_size 4G;\n"
    "\t\tproxy_request_buffering off;\n"
    "\t\tproxy_send_timeout 1h;\n"
    "\t\tproxy_read_timeout 1h;\n"
    "\t}\n"
)
anchor = "\tlocation / {"
assert anchor in s, "anchor location / tidak ketemu"
s = s.replace(anchor, block + "\n" + anchor, 1)
open(p, "w").write(s)
print("  location /film/ ditambahkan.")
EOF
fi
# Pastikan direktif upload ada (untuk instalasi lama sebelum fitur upload).
for d in 'client_max_body_size 4G;' 'proxy_request_buffering off;' 'proxy_send_timeout 1h;' 'proxy_read_timeout 1h;'; do
  if ! grep -qF "$d" "$SITE_REAL"; then
    python3 - "$SITE_REAL" "$d" <<'EOF'
import sys
p, directive = sys.argv[1], sys.argv[2]
s = open(p).read()
anchor = "\t\tproxy_buffering off;"
assert anchor in s, "anchor proxy_buffering off tidak ketemu"
s = s.replace(anchor, anchor + "\n\t\t" + directive, 1)
open(p, "w").write(s)
print("  ditambah: " + directive)
EOF
  fi
done
nginx -t
systemctl reload nginx
echo "  nginx reload OK."

echo "== 2/4 systemd: pasang film.service =="
cp -a "$FILM_DIR/film.service" /etc/systemd/system/film.service
systemctl daemon-reload
systemctl enable film
systemctl restart film # restart (bukan start) agar kode baru kepakai saat setup dijalankan ulang
systemctl --no-pager status film | head -8

echo "== 3/4 firewall (aditif saja) =="
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp
else
  echo "  ufw tidak aktif / tidak ada, dilewati (port 80 sudah LISTEN)."
fi

echo "== 4/4 verifikasi =="
sleep 2
curl -sf http://127.0.0.1/film/health && echo "  <- /film/health OK"
if ss -ulnp 2>/dev/null | grep -q 19132; then
  echo "  bedrock OK (udp 19132 tetap hidup)."
else
  echo "  PERINGATAN: udp 19132 tidak terlihat!"
fi
echo "Selesai. Buka http://192.168.1.151/film dari HP satu WiFi."
