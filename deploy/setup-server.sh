#!/usr/bin/env bash
# JetFocus — установка и обновление на Ubuntu-сервере (Nginx + HTTPS + сборка из GitHub).
#
# Запуск (от root, в консоли сервера):
#   curl -fsSL https://raw.githubusercontent.com/evgeniybutenko30-stack/JetFocus2/<ВЕТКА>/deploy/setup-server.sh | EMAIL=you@mail.ru BRANCH=<ВЕТКА> bash
#
# Скрипт идемпотентный: повторный запуск = обновление сайта до последней версии ветки.
# Он ничего не удаляет из существующих настроек Nginx и не трогает чужие сайты.
#
# Переменные (необязательные):
#   DOMAIN  основной домен            (по умолчанию jetfocus.ru)
#   BRANCH  ветка репозитория         (по умолчанию main)
#   EMAIL   почта для сертификата Let's Encrypt (уведомления об истечении)
#   REPO    адрес репозитория         (по умолчанию GitHub-репозиторий проекта)
set -euo pipefail

DOMAIN="${DOMAIN:-jetfocus.ru}"
BRANCH="${BRANCH:-main}"
EMAIL="${EMAIL:-}"
REPO="${REPO:-https://github.com/evgeniybutenko30-stack/JetFocus2.git}"
SRC_DIR="/opt/jetfocus"
WEB_ROOT="/var/www/jetfocus"
NGINX_SITE="/etc/nginx/sites-available/jetfocus"

log()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m!! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mОШИБКА: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "запустите от root (или через sudo)."
command -v apt-get >/dev/null || die "нужна Ubuntu/Debian (apt-get не найден)."
export DEBIAN_FRONTEND=noninteractive

# ── 1. Проверка занятости портов 80/443 чужими программами ──────────────────
if command -v ss >/dev/null; then
  OTHER="$(ss -ltnpH 'sport = :80 or sport = :443' 2>/dev/null | grep -v nginx || true)"
  if [ -n "$OTHER" ]; then
    printf '%s\n' "$OTHER"
    die "порты 80/443 уже заняты не Nginx (см. выше). Остановите эту программу или напишите мне, что там запущено."
  fi
fi

# ── 2. Пакеты ────────────────────────────────────────────────────────────────
log "Устанавливаю Nginx, Git, Certbot"
apt-get update -y
apt-get install -y nginx git curl ca-certificates certbot python3-certbot-nginx

NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
if [ -z "${NODE_MAJOR:-}" ] || [ "$NODE_MAJOR" -lt 22 ]; then
  log "Устанавливаю Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
log "Node $(node -v), npm $(npm -v)"

# ── 3. Исходники и сборка ────────────────────────────────────────────────────
log "Получаю код (ветка $BRANCH)"
if [ -d "$SRC_DIR/.git" ]; then
  git -C "$SRC_DIR" remote set-url origin "$REPO"
  git -C "$SRC_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$SRC_DIR" checkout -q -B "$BRANCH" FETCH_HEAD
  git -C "$SRC_DIR" reset -q --hard FETCH_HEAD
else
  rm -rf "$SRC_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$SRC_DIR"
fi
git -C "$SRC_DIR" log --oneline -1

log "Собираю сайт (1–3 минуты)"
cd "$SRC_DIR"
npm ci --no-audit --no-fund
BASE_PATH=/ npm run build
[ -f dist/index.html ] || die "сборка не создала dist/index.html"

# ── 4. Публикация файлов (подмена каталога одним шагом) ─────────────────────
log "Копирую сайт в $WEB_ROOT"
mkdir -p "$(dirname "$WEB_ROOT")"
rm -rf "${WEB_ROOT}.new"
cp -a dist "${WEB_ROOT}.new"
if [ -d "$WEB_ROOT" ]; then mv "$WEB_ROOT" "${WEB_ROOT}.old"; fi
mv "${WEB_ROOT}.new" "$WEB_ROOT"
rm -rf "${WEB_ROOT}.old"
chmod -R a+rX "$WEB_ROOT"

# ── 5. Nginx ─────────────────────────────────────────────────────────────────
# Если сертификат уже выпущен, certbot сам дописал в этот файл блок 443;
# поэтому конфиг пишем только при первом запуске.
if [ ! -f "$NGINX_SITE" ]; then
  log "Создаю конфигурацию Nginx для $DOMAIN"
  cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    root $WEB_ROOT;
    index index.html;

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_vary on;
    gzip_types text/css application/javascript application/json image/svg+xml text/plain;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    # Файлы сборки с хэшем в имени — можно кэшировать надолго
    location /assets/ {
        try_files \$uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Content-Type-Options "nosniff" always;
    }

    # Страница приложения всегда свежая, чтобы после обновления не оставалась старая версия
    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    # Прямые ссылки (/today, /goals/123 ...) отдают приложение
    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    location ~ /\. { deny all; }
}
EOF
  ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/jetfocus
fi

nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl reload nginx 2>/dev/null || systemctl restart nginx

# ── 6. Брандмауэр (только если включён ufw) ──────────────────────────────────
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  log "Открываю порты 80/443 в ufw"
  ufw allow 'Nginx Full' >/dev/null || { ufw allow 80/tcp; ufw allow 443/tcp; }
fi

# ── 7. HTTPS (Let's Encrypt) ─────────────────────────────────────────────────
MY_IP="$(curl -fsS -4 -m 10 https://api.ipify.org 2>/dev/null || true)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || true)"
if [ -n "$MY_IP" ] && [ -n "$DNS_IP" ] && [ "$MY_IP" != "$DNS_IP" ]; then
  warn "Домен $DOMAIN сейчас указывает на $DNS_IP, а этот сервер — $MY_IP. Сертификат пропущен."
  warn "Дождитесь обновления DNS и запустите скрипт ещё раз."
elif certbot certificates 2>/dev/null | grep -q "Domains: .*$DOMAIN"; then
  log "Сертификат для $DOMAIN уже есть (продлевается автоматически)"
else
  log "Выпускаю сертификат HTTPS"
  CB_ARGS=(--nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --redirect)
  if [ -n "$EMAIL" ]; then CB_ARGS+=(-m "$EMAIL"); else CB_ARGS+=(--register-unsafely-without-email); fi
  if ! certbot "${CB_ARGS[@]}"; then
    warn "Сертификат для www.$DOMAIN не выпустился, пробую только $DOMAIN"
    CB_ARGS=(--nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect)
    if [ -n "$EMAIL" ]; then CB_ARGS+=(-m "$EMAIL"); else CB_ARGS+=(--register-unsafely-without-email); fi
    certbot "${CB_ARGS[@]}" || warn "HTTPS не настроен. Сайт доступен по http://$DOMAIN. Проверьте, что порты 80 и 443 открыты у хостинга."
  fi
fi

# ── 8. Проверка ──────────────────────────────────────────────────────────────
log "Проверка"
for path in / /today /goals; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" "http://127.0.0.1$path" || true)"
  printf '  %-8s -> HTTP %s\n' "$path" "$CODE"
done
printf '\nГотово. Откройте https://%s\n' "$DOMAIN"
printf 'Обновить сайт позже: запустите ту же команду ещё раз.\n'
