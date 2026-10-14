#!/usr/bin/env bash
# JetFocus — установка и обновление на Ubuntu-сервере (Nginx + HTTPS + сборка из GitHub).
#
# Запуск (от root, в консоли сервера):
#   curl -fsSL https://raw.githubusercontent.com/evgeniybutenko30-stack/JetFocus2/<ВЕТКА>/deploy/setup-server.sh | EMAIL=you@mail.ru BRANCH=<ВЕТКА> bash
#
# Скрипт идемпотентный: повторный запуск = обновление сайта до последней версии ветки.
# Безопасен для других проектов на том же сервере:
#   - не трогает чужие конфиги Nginx и не обновляет уже установленные пакеты;
#   - системный Node.js не меняет: для сборки качает свой Node 22 в /opt/jetfocus-node;
#   - если проверка конфигурации Nginx не прошла, убирает свой конфиг и ничего не перезагружает.
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
NODE_DIR="/opt/jetfocus-node"

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

# Если домен уже обслуживает какой-то другой конфиг — не вмешиваемся.
CONFLICT="$(grep -RlE "server_name[^;]*[[:space:]]$DOMAIN([[:space:];]|$)" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null \
  | xargs -r readlink -f | grep -vx "$(readlink -f "$NGINX_SITE" 2>/dev/null || echo "$NGINX_SITE")" || true)"
if [ -n "$CONFLICT" ]; then
  printf '%s\n' "$CONFLICT"
  die "домен $DOMAIN уже настроен в другом конфиге Nginx (см. выше). Ничего не менял — пришлите мне этот вывод."
fi

# ── 2. Пакеты (ставим только недостающие, установленные не обновляем) ───────
MISSING=()
for pkg in nginx git curl ca-certificates certbot python3-certbot-nginx xz-utils; do
  dpkg -s "$pkg" >/dev/null 2>&1 || MISSING+=("$pkg")
done
if [ "${#MISSING[@]}" -gt 0 ]; then
  log "Устанавливаю: ${MISSING[*]}"
  apt-get update -y
  apt-get install -y --no-upgrade "${MISSING[@]}"
else
  log "Nginx, Git, Certbot уже установлены"
fi

# Свой Node.js 22 только для сборки JetFocus — системный Node не трогаем.
SYS_NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
if [ -n "${SYS_NODE_MAJOR:-}" ] && [ "$SYS_NODE_MAJOR" -ge 22 ]; then
  BUILD_PATH="$PATH"
else
  if [ ! -x "$NODE_DIR/bin/node" ]; then
    case "$(uname -m)" in
      x86_64) NODE_ARCH=x64 ;;
      aarch64|arm64) NODE_ARCH=arm64 ;;
      *) die "неизвестная архитектура $(uname -m)" ;;
    esac
    log "Скачиваю отдельный Node.js 22 в $NODE_DIR (системный Node не меняется)"
    NODE_FILE="$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | awk '{print $2}' | grep -E "^node-v22\.[0-9.]+-linux-${NODE_ARCH}\.tar\.xz$" | head -1)"
    [ -n "$NODE_FILE" ] || die "не удалось найти архив Node.js 22 на nodejs.org"
    TMP_NODE="$(mktemp -d)"
    curl -fsSL "https://nodejs.org/dist/latest-v22.x/$NODE_FILE" -o "$TMP_NODE/node.tar.xz"
    curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep " $NODE_FILE\$" | awk '{print $1"  '"$TMP_NODE"'/node.tar.xz"}' | sha256sum -c - >/dev/null \
      || die "контрольная сумма архива Node.js не совпала"
    rm -rf "$NODE_DIR" && mkdir -p "$NODE_DIR"
    tar -xJf "$TMP_NODE/node.tar.xz" -C "$NODE_DIR" --strip-components=1
    rm -rf "$TMP_NODE"
  fi
  BUILD_PATH="$NODE_DIR/bin:$PATH"
fi
log "Node для сборки: $(PATH="$BUILD_PATH" node -v)"

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
PATH="$BUILD_PATH" npm ci --no-audit --no-fund
PATH="$BUILD_PATH" BASE_PATH=/ npm run build
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
NEW_SITE=0
if [ ! -f "$NGINX_SITE" ]; then
  NEW_SITE=1
  log "Создаю конфигурацию Nginx для $DOMAIN"
  # IPv6-слушатель только если ядро поддерживает IPv6, иначе nginx не стартует.
  LISTEN_V6=""
  if [ -f /proc/net/if_inet6 ]; then LISTEN_V6="    listen [::]:80;"; fi
  cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
$LISTEN_V6
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

if ! nginx -t; then
  if [ "$NEW_SITE" -eq 1 ]; then
    rm -f /etc/nginx/sites-enabled/jetfocus "$NGINX_SITE"
    die "проверка Nginx не прошла — мой конфиг удалён, остальные сайты не тронуты. Пришлите мне вывод выше."
  fi
  die "проверка Nginx не прошла — Nginx не перезагружался. Пришлите мне вывод выше."
fi
systemctl enable nginx >/dev/null 2>&1 || true
if systemctl is-active --quiet nginx; then systemctl reload nginx; else systemctl start nginx; fi

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
if certbot certificates 2>/dev/null | grep -q "Domains: .*$DOMAIN"; then
  printf '\nГотово. Откройте https://%s\n' "$DOMAIN"
else
  printf '\nСайт работает по http://%s (без HTTPS). Как только DNS и порты будут в порядке, запустите команду ещё раз — она выпустит сертификат.\n' "$DOMAIN"
fi
printf 'Обновить сайт позже: запустите ту же команду ещё раз.\n'
