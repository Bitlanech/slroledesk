#!/usr/bin/env bash
set -euo pipefail

# =========================
# Konfiguration
# =========================
APP_NAME="sl-roledesk"
DB_NAME="sl_roledesk"
DB_USER="sl_user"
DB_PORT="5432"
DB_HOST="localhost"
ENV_FILE=".env"
NODE_VERSION="18"   # LTS, kompatibel mit Next 15

# =========================
# Helpers
# =========================
generate_random_string() {  # usage: generate_random_string 32
  openssl rand -base64 "$1" | tr -d '\n' | tr '+/' '-_' | cut -c1-"$1"
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

# =========================
# System & Runtimes
# =========================
install_base() {
  echo "📦 Systempakete…"
  sudo apt-get update -y
  sudo apt-get install -y curl git build-essential
}

install_node() {
  echo "📦 Node.js ${NODE_VERSION}…"
  if ! have_cmd node; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    echo "✅ Node vorhanden: $(node -v)"
  fi
  echo "✅ npm: $(npm -v)"
}

install_postgres() {
  echo "📦 PostgreSQL…"
  if ! have_cmd psql; then
    sudo apt-get install -y postgresql postgresql-contrib
  else
    echo "✅ PostgreSQL vorhanden: $(psql --version)"
  fi
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
}

# =========================
# DB Setup
# =========================
create_db() {
  echo "🛠 DB & User anlegen…"
  # DB_PASS hier generieren, wir brauchen ihn gleich in psql & .env
DB_PASS_RAW="$(openssl rand -base64 32)"
DB_PASS_URLENC="$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "${DB_PASS_RAW}")"


  # User anlegen (falls nicht vorhanden)
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
   sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS_RAW}';"

  # DB anlegen (falls nicht vorhanden)
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

  # Rechte: erlauben, dass Prisma ohne Shadow-DB CREATE DATABASE auskommt
  sudo -u postgres psql -c "ALTER USER ${DB_USER} CREATEDB;"

  echo "✅ DB: ${DB_NAME}, User: ${DB_USER}"
}

# =========================
# Env-Datei
# =========================
create_env() {
  echo "📝 .env schreiben…"
  if [ -f "${ENV_FILE}" ]; then
    echo "⚠️  ${ENV_FILE} existiert – Werte werden NICHT überschrieben."
  else
    SESSION_PASSWORD="$(generate_random_string 64)"
    ADMIN_TOKEN="$(openssl rand -hex 16)"
    SESSION_SECRET="$(openssl rand -hex 32)"
    cat > "${ENV_FILE}" <<EOF
# SL-RoleDesk
DATABASE_URL=\"postgresql://${DB_USER}:${DB_PASS_URLENC}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public\"
SESSION_PASSWORD="${SESSION_PASSWORD}"
ADMIN_TOKEN="${ADMIN_TOKEN}"
NEXT_PUBLIC_APP_NAME="SL-RoleDesk"
SESSION_SECRET="${SESSION_SECRET}"
EOF
    echo "✅ .env erstellt."
  fi
}

# =========================
# App Build & Run
# =========================
install_node_deps() {
  echo "📦 NPM Dependencies…"
  if [ -f package-lock.json ]; then
    npm ci          # inkl. devDependencies (wichtig für Build: eslint, @tailwindcss/postcss)
  else
    npm install
  fi

  # Safety: sicherstellen, dass diese Dev-Deps da sind (falls Package.json abweicht)
  npm i -D eslint @tailwindcss/postcss
}

prisma_deploy() {
  echo "🗄️ Prisma…"
  npx prisma generate
  # In Prod niemals "migrate dev", sondern:
  npx prisma migrate deploy
}

build_app() {
  echo "🏗️ Next Build…"
  npx next telemetry disable || true
  npm run build
}

prune_dev_deps() {
  echo "🧹 Dev-Dependencies entfernen (Runtime schlank halten)…"
  npm prune --production
}

install_pm2() {
  echo "📦 PM2…"
  sudo npm i -g pm2
  pm2 delete "${APP_NAME}" >/dev/null 2>&1 || true
  pm2 start npm --name "${APP_NAME}" -- start
  pm2 save
  # Autostart
  pm2 startup systemd -u "$(whoami)" --hp "$(eval echo ~$(whoami))" | tail -n 1 | bash || true
}

# =========================
# Run
# =========================
main() {
  install_base
  install_node
  install_postgres
  create_db
  create_env
  install_node_deps
  prisma_deploy
  build_app
  prune_dev_deps
  install_pm2

  echo ""
  echo "✅ Fertig!"
  echo "DB_USER=${DB_USER}"
  echo "DB_PASS=${DB_PASS}"
  echo "App läuft via PM2:   pm2 status"
  echo "Logs ansehen:        pm2 logs ${APP_NAME}"
  echo "Neu starten:         pm2 restart ${APP_NAME}"
  echo "Autostart gesichert: pm2 save"
}
main "$@"
