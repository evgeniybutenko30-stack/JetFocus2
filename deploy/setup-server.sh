#!/usr/bin/env bash
# JetFocus — установка и обновление на Ubuntu-сервере (сборка из GitHub + веб-сервер + HTTPS).
#
# Запуск (от root):
#   curl -fsSL https://raw.githubusercontent.com/evgeniybutenko30-stack/JetFocus2/<ВЕТКА>/deploy/setup-server.sh | DOMAIN=jetfocus.ru BRANCH=<ВЕТКА> bash
#
# Скрипт идемпотентный: повторный запуск = обновление сайта до последней версии ветки.
# Веб-сервер выбирается сам:
#   - если порты 80/443 уже держит Caddy — сайт добавляется в его конфигурацию
#     (резервная копия → проверка → плавная перезагрузка; при ошибке — откат), HTTPS выпускает Caddy;
#   - иначе ставится/используется Nginx, HTTPS выпускает certbot.
# Безопасен для других проектов на том же сервере:
#   - чужие сайты и конфиги не меняются, установленные пакеты не обновляются;
#   - системный Node.js не меняется: для сборки скачивается отдельный Node 22 в /opt/jetfocus-node;
#   - если домен уже настроен в чужом конфиге — скрипт останавливается до любых изменений.
#
# Переменные (необязательные):
#   DOMAIN  основной домен            (по умолчанию jetfocus.ru)
#   BRANCH  ветка репозитория         (по умолчанию main)
#   EMAIL   почта для Let's Encrypt (только для режима Nginx)
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
MARK_BEGIN="# >>> jetfocus (управляется deploy/setup-server.sh, не редактировать вручную)"
MARK_END="# <<< jetfocus"

log()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m!! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mОШИБКА: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "запустите от root (или через sudo)."
command -v apt-get >/dev/null || die "нужна Ubuntu/Debian (apt-get не найден)."
export DEBIAN_FRONTEND=noninteractive
DOMAIN_RE="${DOMAIN//./\\.}"

# ── 1. Какой веб-сервер уже работает ─────────────────────────────────────────
LISTENERS="$(ss -ltnpH 'sport = :80 or sport = :443' 2>/dev/null || true)"
if [ -z "$LISTENERS" ]; then
  MODE=nginx
elif printf '%s\n' "$LISTENERS" | grep -q '"caddy"' && ! printf '%s\n' "$LISTENERS" | grep -vq '"caddy"'; then
  MODE=caddy
elif ! printf '%s\n' "$LISTENERS" | grep -vq 'nginx'; then
  MODE=nginx
else
  printf '%s\n' "$LISTENERS"
  die "порты 80/443 заняты программой, с которой скрипт не умеет работать (см. выше). Ничего не менял — пришлите мне этот вывод."
fi
log "Веб-сервер: $MODE"

# ── 2. Предварительные проверки (до любых изменений) ─────────────────────────
if [ "$MODE" = caddy ]; then
  command -v caddy >/dev/null || die "Caddy слушает порты, но команда caddy не найдена (возможно, он в Docker). Ничего не менял — пришлите мне вывод: docker ps"
  caddy version 2>/dev/null | grep -qE '^v?2\.' || die "нужен Caddy v2, найден: $(caddy version 2>&1 | head -1)"
  [ "$(systemctl show -p LoadState --value caddy 2>/dev/null || true)" = loaded ] \
    || die "служба caddy не найдена в systemd. Ничего не менял — пришлите мне вывод: ps aux | grep caddy"
  EXEC_START="$(systemctl show -p ExecStart --value caddy 2>/dev/null || true)"
  CADDYFILE="$(printf '%s' "$EXEC_START" | grep -oE -- '--config[= ][^ ;]+' | head -1 | sed -E 's/--config[= ]//' || true)"
  CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
  [ -f "$CADDYFILE" ] || die "не найден файл конфигурации Caddy ($CADDYFILE). Ничего не менял — пришлите мне вывод: systemctl cat caddy"
  case "$CADDYFILE" in *.json) die "Caddy настроен через JSON ($CADDYFILE), а не Caddyfile. Ничего не менял — напишите мне." ;; esac
  printf '%s' "$EXEC_START" | grep -qE -- '--adapter[= ]' && ! printf '%s' "$EXEC_START" | grep -qE -- '--adapter[= ]caddyfile' \
    && die "Caddy использует нестандартный адаптер конфигурации. Ничего не менял — напишите мне."
  # Домен уже упомянут где-то кроме нашего блока?
  CONFLICT="$(awk -v b="$MARK_BEGIN" -v e="$MARK_END" '$0==b{skip=1} !skip{print FILENAME": "$0} $0==e{skip=0}' "$CADDYFILE" \
    | grep -E "(^|[[:space:],/])(www\\.)?${DOMAIN_RE}([[:space:],:{]|$)" || true)"
  if [ -n "$CONFLICT" ]; then
    printf '%s\n' "$CONFLICT"
    die "домен $DOMAIN уже есть в конфигурации Caddy (см. выше). Ничего не менял — пришлите мне этот вывод."
  fi
  log "Конфигурация Caddy: $CADDYFILE"
else
  CONFLICT="$(grep -RlE "server_name[^;]*[[:space:]](www\\.)?${DOMAIN_RE}([[:space:];]|$)" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null \
    | xargs -r readlink -f | grep -vx "$(readlink -f "$NGINX_SITE" 2>/dev/null || echo "$NGINX_SITE")" || true)"
  if [ -n "$CONFLICT" ]; then
    printf '%s\n' "$CONFLICT"
    die "домен $DOMAIN уже настроен в другом конфиге Nginx (см. выше). Ничего не менял — пришлите мне этот вывод."
  fi
fi

# ── 3. Пакеты (ставим только недостающие, установленные не обновляем) ───────
PKGS=(git curl ca-certificates xz-utils)
[ "$MODE" = nginx ] && PKGS+=(nginx certbot python3-certbot-nginx)
MISSING=()
for pkg in "${PKGS[@]}"; do dpkg -s "$pkg" >/dev/null 2>&1 || MISSING+=("$pkg"); done
if [ "${#MISSING[@]}" -gt 0 ]; then
  log "Устанавливаю: ${MISSING[*]}"
  apt-get update -y
  apt-get install -y --no-upgrade "${MISSING[@]}"
fi

# Свой Node.js 22 только для сборки JetFocus — системный Node не трогаем.
SYS_NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
if [ -n "${SYS_NODE_MAJOR:-}" ] && [ "$SYS_NODE_MAJOR" -ge 22 ] 2>/dev/null; then
  BUILD_PATH="$PATH"
else
  if [ ! -x "$NODE_DIR/bin/node" ]; then
    case "$(uname -m)" in
      x86_64) NODE_ARCH=x64 ;;
      aarch64|arm64) NODE_ARCH=arm64 ;;
      *) die "неизвестная архитектура $(uname -m)" ;;
    esac
    log "Скачиваю отдельный Node.js 22 в $NODE_DIR (системный Node не меняется)"
    SUMS="$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt)"
    NODE_FILE="$(printf '%s\n' "$SUMS" | awk '{print $2}' | grep -E "^node-v22\.[0-9.]+-linux-${NODE_ARCH}\.tar\.xz$" | head -1)"
    [ -n "$NODE_FILE" ] || die "не удалось найти архив Node.js 22 на nodejs.org"
    TMP_NODE="$(mktemp -d)"
    curl -fsSL "https://nodejs.org/dist/latest-v22.x/$NODE_FILE" -o "$TMP_NODE/$NODE_FILE"
    (cd "$TMP_NODE" && printf '%s\n' "$SUMS" | grep " $NODE_FILE\$" | sha256sum -c - >/dev/null) \
      || die "контрольная сумма архива Node.js не совпала"
    rm -rf "$NODE_DIR" && mkdir -p "$NODE_DIR"
    tar -xJf "$TMP_NODE/$NODE_FILE" -C "$NODE_DIR" --strip-components=1
    rm -rf "$TMP_NODE"
  fi
  BUILD_PATH="$NODE_DIR/bin:$PATH"
fi
log "Node для сборки: $(PATH="$BUILD_PATH" node -v)"

# ── 4. Исходники и сборка ────────────────────────────────────────────────────
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

# ── 5. Публикация файлов (подмена каталога одним шагом) ─────────────────────
log "Копирую сайт в $WEB_ROOT"
mkdir -p "$(dirname "$WEB_ROOT")"
chmod a+rx "$(dirname "$WEB_ROOT")"
rm -rf "${WEB_ROOT}.new"
cp -a dist "${WEB_ROOT}.new"
if [ -d "$WEB_ROOT" ]; then mv "$WEB_ROOT" "${WEB_ROOT}.old"; fi
mv "${WEB_ROOT}.new" "$WEB_ROOT"
rm -rf "${WEB_ROOT}.old"
chmod -R a+rX "$WEB_ROOT"

# ── 6a. Caddy ────────────────────────────────────────────────────────────────
setup_caddy() {
  local backup tmp
  backup="${CADDYFILE}.bak-jetfocus-$(date +%Y%m%d-%H%M%S)"
  cp -a "$CADDYFILE" "$backup"
  log "Резервная копия конфигурации Caddy: $backup"

  tmp="$(mktemp)"
  # Старый блок JetFocus (если есть) убираем, остальное оставляем как было.
  awk -v b="$MARK_BEGIN" -v e="$MARK_END" '$0==b{skip=1; next} $0==e{skip=0; next} !skip{print}' "$CADDYFILE" > "$tmp"
  cat >> "$tmp" <<EOF

$MARK_BEGIN
$DOMAIN {
	root * $WEB_ROOT
	encode zstd gzip
	@jf_assets path /assets/*
	@jf_pages not path /assets/*
	header @jf_assets Cache-Control "public, max-age=31536000, immutable"
	header @jf_pages Cache-Control "no-cache"
	header X-Content-Type-Options "nosniff"
	header Referrer-Policy "strict-origin-when-cross-origin"
	try_files {path} /index.html
	file_server
}

www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
$MARK_END
EOF

  if ! caddy validate --config "$tmp" --adapter caddyfile >/tmp/jetfocus-caddy-validate.log 2>&1; then
    rm -f "$tmp"
    tail -20 /tmp/jetfocus-caddy-validate.log
    die "новая конфигурация Caddy не прошла проверку — ничего не применял, старая работает как прежде. Пришлите мне вывод выше."
  fi
  cat "$tmp" > "$CADDYFILE"   # сохраняем владельца и права исходного файла
  rm -f "$tmp"

  log "Плавно перезагружаю Caddy (без остановки других сайтов)"
  if ! systemctl reload caddy; then
    warn "перезагрузка не удалась — возвращаю прежнюю конфигурацию"
    cat "$backup" > "$CADDYFILE"
    systemctl reload caddy || true
    die "Caddy не принял новую конфигурацию, прежняя восстановлена. Пришлите мне вывод: journalctl -u caddy -n 50 --no-pager"
  fi
}

# ── 6b. Nginx + certbot ──────────────────────────────────────────────────────
setup_nginx() {
  local new_site=0
  if [ ! -f "$NGINX_SITE" ]; then
    new_site=1
    log "Создаю конфигурацию Nginx для $DOMAIN"
    local listen_v6=""
    if [ -f /proc/net/if_inet6 ]; then listen_v6="    listen [::]:80;"; fi
    cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
$listen_v6
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

    location /assets/ {
        try_files \$uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Content-Type-Options "nosniff" always;
    }

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
    if [ "$new_site" -eq 1 ]; then
      rm -f /etc/nginx/sites-enabled/jetfocus "$NGINX_SITE"
      die "проверка Nginx не прошла — мой конфиг удалён, остальные сайты не тронуты. Пришлите мне вывод выше."
    fi
    die "проверка Nginx не прошла — Nginx не перезагружался. Пришлите мне вывод выше."
  fi
  systemctl enable nginx >/dev/null 2>&1 || true
  if systemctl is-active --quiet nginx; then systemctl reload nginx; else systemctl start nginx; fi

  if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow 'Nginx Full' >/dev/null || { ufw allow 80/tcp; ufw allow 443/tcp; }
  fi

  if certbot certificates 2>/dev/null | grep -q "Domains: .*$DOMAIN"; then
    log "Сертификат для $DOMAIN уже есть (продлевается автоматически)"
    return
  fi
  log "Выпускаю сертификат HTTPS"
  local args=(--nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --redirect)
  if [ -n "$EMAIL" ]; then args+=(-m "$EMAIL"); else args+=(--register-unsafely-without-email); fi
  certbot "${args[@]}" || warn "HTTPS пока не настроен (DNS ещё не обновился или закрыты порты). Запустите команду ещё раз позже."
}

if [ "$MODE" = caddy ]; then setup_caddy; else setup_nginx; fi

# ── 7. Проверка ──────────────────────────────────────────────────────────────
log "Проверка"
if [ "$MODE" = caddy ]; then
  # Caddy выпускает сертификат сам в течение 1–2 минут после перезагрузки.
  HTTPS_OK=0
  for _ in $(seq 1 "${HTTPS_TRIES:-12}"); do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/today" || true)"
    if [ "$CODE" = 200 ]; then HTTPS_OK=1; break; fi
    sleep 10
  done
  for path in / /today /goals; do
    CODE="$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN$path" || true)"
    printf '  https %-8s -> HTTP %s\n' "$path" "$CODE"
  done
  if [ "$HTTPS_OK" -eq 1 ]; then
    printf '\nГотово. Откройте https://%s\n' "$DOMAIN"
  else
    printf '\nСайт добавлен в Caddy, но сертификат ещё не выпущен (обычно из-за DNS).\n'
    printf 'Проверьте через пару минут https://%s; если не открывается — пришлите мне вывод: journalctl -u caddy -n 50 --no-pager\n' "$DOMAIN"
  fi
else
  for path in / /today /goals; do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" "http://127.0.0.1$path" || true)"
    printf '  %-8s -> HTTP %s\n' "$path" "$CODE"
  done
  if certbot certificates 2>/dev/null | grep -q "Domains: .*$DOMAIN"; then
    printf '\nГотово. Откройте https://%s\n' "$DOMAIN"
  else
    printf '\nСайт работает по http://%s (без HTTPS). Запустите команду ещё раз, когда DNS обновится.\n' "$DOMAIN"
  fi
fi
printf 'Обновить сайт позже: запустите ту же команду ещё раз.\n'
