#!/usr/bin/env bash
# ==============================================================================
# PLGames Connect — proxy-side sync agent
#
# Запускается systemd-таймером раз в 30 секунд. Тянет с PLGames API список
# текущих активных подписчиков на ЭТОТ прокси-сервер и перегенерирует блок
# basic_auth в Caddyfile. Если набор юзеров изменился — делает caddy reload.
#
# Без зависимостей кроме curl и jq (ставятся одной строкой apt install).
# ==============================================================================

set -euo pipefail

CONF=${PLGAMES_AGENT_CONF:-/etc/plgames-agent/agent.env}
[[ -f "$CONF" ]] && set -a && . "$CONF" && set +a

: "${API_URL:?env API_URL is required (e.g. https://api.plgames-connect.example)}"
: "${SERVER_ID:?env SERVER_ID is required (id из proxy-pool.json, e.g. eu-1)}"
: "${INTERNAL_API_TOKEN:?env INTERNAL_API_TOKEN is required}"
CADDYFILE=${CADDYFILE:-/opt/naive2/Caddyfile}
RELOAD_CMD=${RELOAD_CMD:-systemctl reload caddy-naive2}
STATE_DIR=${STATE_DIR:-/var/lib/plgames-agent}
LOG_TAG=${LOG_TAG:-plgames-agent}

mkdir -p "$STATE_DIR"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

# 1) тянем список юзеров
HTTP=$(curl -fsSL --max-time 10 \
    -H "X-Internal-Token: $INTERNAL_API_TOKEN" \
    -o "$TMP" -w '%{http_code}' \
    "${API_URL%/}/api/internal/server/${SERVER_ID}/users") || {
    logger -t "$LOG_TAG" "API request failed (curl exit)"
    exit 0
}

if [[ "$HTTP" != "200" ]]; then
    logger -t "$LOG_TAG" "API returned HTTP $HTTP"
    exit 0
fi

# 2) детерминированный hash содержимого — чтобы зря не перезагружать Caddy
NEW_HASH=$(jq -S '.users' "$TMP" | sha256sum | cut -d' ' -f1)
PREV_HASH=$(cat "$STATE_DIR/users.sha" 2>/dev/null || true)
if [[ "$NEW_HASH" == "$PREV_HASH" && -f "$CADDYFILE" ]]; then
    exit 0
fi

# 3) генерируем строки basic_auth
USERS_BLOCK=$(jq -r '.users[] | "        basic_auth " + .username + " " + .password' "$TMP")
if [[ -z "$USERS_BLOCK" ]]; then
    # пул пуст — оставляем placeholder-юзера чтобы Caddy не падал
    USERS_BLOCK="        basic_auth __plgames_placeholder__ __plgames_placeholder__"
fi

# 4) ищем блоки forward_proxy в Caddyfile и переписываем basic_auth-список.
#
# Ожидаемая структура файла (чувствительна к маркерам):
#
#   forward_proxy {
#       # >>> PLGAMES_USERS_BEGIN
#       basic_auth ...
#       basic_auth ...
#       # <<< PLGAMES_USERS_END
#       hide_ip
#       hide_via
#   }
#
# Поддерживаются также маркеры PLGAMES_USERS_BEGIN_STEALTH/END_STEALTH —
# для отдельного site-block с probe_resistance (см. docs/STEALTH.md).
# Один прогон агента синхронизирует оба блока, если они есть.

if ! grep -q 'PLGAMES_USERS_BEGIN' "$CADDYFILE"; then
    logger -t "$LOG_TAG" "Caddyfile missing PLGAMES_USERS_BEGIN marker — see agent/README.md"
    exit 1
fi

# regex без anchors — ловит и BEGIN, и BEGIN_STEALTH (равно для END).
NEW_CADDYFILE=$(awk -v repl="$USERS_BLOCK" '
    /# >>> PLGAMES_USERS_BEGIN/ { print; print repl; inside=1; next }
    /# <<< PLGAMES_USERS_END/   { inside=0 }
    !inside { print }
' "$CADDYFILE")

# 5) пишем атомарно
echo "$NEW_CADDYFILE" > "$CADDYFILE.new"
mv "$CADDYFILE.new" "$CADDYFILE"

# 6) reload Caddy
if ! $RELOAD_CMD; then
    logger -t "$LOG_TAG" "reload command failed: $RELOAD_CMD"
    exit 1
fi

echo "$NEW_HASH" > "$STATE_DIR/users.sha"
N_USERS=$(jq -r '.users | length' "$TMP")
logger -t "$LOG_TAG" "synced $N_USERS users, caddy reloaded"
