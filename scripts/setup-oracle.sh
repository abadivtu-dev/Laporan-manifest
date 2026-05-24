#!/bin/bash
# ============================================================
# LAPORAN-WA — Oracle Cloud Setup Script
# Untuk Ubuntu 22.04 ARM (Ampere A1)
# Jalankan sebagai root: sudo bash setup-oracle.sh
# ============================================================

set -e

echo "=== LAPORAN-WA — Oracle Cloud Setup ==="

# ── System dependencies ─────────────────────────────────────
echo "[1/6] Update system & install dependencies..."
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  curl \
  git \
  unzip \
  libnss3 \
  libnspr4 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdrm2 \
  libdbus-1-3 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2 \
  libatspi2.0-0 \
  fonts-liberation \
  fonts-noto-color-emoji

# ── Node.js 20 LTS ──────────────────────────────────────────
echo "[2/6] Install Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

node --version
npm --version

# ── App directory ───────────────────────────────────────────
echo "[3/6] Setup app directory..."
mkdir -p /opt/laporan-wa
chown -R $SUDO_USER:$SUDO_USER /opt/laporan-wa

# ── Clone & install ─────────────────────────────────────────
echo "[4/6] Clone project..."
if [ ! -d "/opt/laporan-wa/.git" ]; then
  # Ganti dengan URL repo yang sebenarnya
  echo "SKIP: clone repo dulu ke /opt/laporan-wa"
  echo "  git clone <repo-url> /opt/laporan-wa"
else
  cd /opt/laporan-wa
  git pull
fi

cd /opt/laporan-wa
npm ci --omit=dev

# ── Playwright Chromium ─────────────────────────────────────
echo "[5/6] Install Playwright Chromium..."
cd /opt/laporan-wa
npx playwright install chromium
npx playwright install-deps chromium

# ── systemd service ─────────────────────────────────────────
echo "[6/6] Install systemd service..."
cat > /etc/systemd/system/laporan-wa.service << 'SERVICE'
[Unit]
Description=LAPORAN-WA Telegram Bot Pipeline
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/laporan-wa
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=TZ=Asia/Jakarta
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable laporan-wa

echo ""
echo "=== SETUP SELESAI ==="
echo ""
echo "Langkah selanjutnya:"
echo "1. Clone repo ke /opt/laporan-wa (kalau belum)"
echo "2. Copy .env ke /opt/laporan-wa/.env"
echo "3. Copy service-account.json ke /opt/laporan-wa/service-account.json"
echo "4. systemctl start laporan-wa"
echo "5. systemctl status laporan-wa"
echo ""
