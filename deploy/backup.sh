#!/bin/sh
# Daily `pg_dump` of the CampusFlow database with retention.
#
# Runs inside the `backup` service (postgres:15-alpine) as a plain loop: no cron
# daemon to install, and `restart: unless-stopped` keeps the schedule alive
# across container restarts. A failed dump is logged and never stops the next
# attempt — one bad night must not end the backup schedule.
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
START_HOUR="${BACKUP_START_HOUR:-2}"
DIR="/backups"
mkdir -p "$DIR"

log() {
    echo "[backup] $*"
}

prune() {
    # Names look like campusflow-20261012-020000.dump; -mtime matches age.
    deleted=0
    for f in "$DIR"/*.dump; do
        [ -e "$f" ] || continue
        if [ -n "$(find "$f" -mtime "+$KEEP_DAYS" 2>/dev/null)" ]; then
            rm -f "$f"
            deleted=$((deleted + 1))
        fi
    done
    [ "$deleted" -gt 0 ] && log "pruned $deleted backup(s) older than $KEEP_DAYS days"
    return 0
}

dump_once() {
    name="campusflow-$(date +%Y%m%d-%H%M%S).dump"
    if pg_dump -Fc -f "$DIR/$name.tmp" 2>/tmp/dump.err; then
        mv "$DIR/$name.tmp" "$DIR/$name"
        log "wrote $name ($(wc -c < "$DIR/$name") bytes)"
        prune
    else
        rm -f "$DIR/$name.tmp"
        log "FAILED: $(cat /tmp/dump.err)"
    fi
}

# Wait for the database before the first attempt.
until pg_isready -q; do
    log "waiting for postgres..."
    sleep 5
done

# Sleep until the configured hour, then dump every 24 hours.
now=$(date +%s)
target=$(date -d "$(date +%Y-%m-%d) $START_HOUR:00:00" +%s 2>/dev/null || echo "$now")
if [ "$target" -le "$now" ]; then
    target=$((target + 86400))
fi
log "first backup at $(date -d "@$target" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "$target"); keeping $KEEP_DAYS days"
sleep $((target - now))

while true; do
    dump_once
    sleep 86400
done
