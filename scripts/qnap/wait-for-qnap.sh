#!/usr/bin/env bash
# Wait until the QNAP host answers ping and SMB (port 445).
# Used on boot when the NAS may start slower than the app server.
set -euo pipefail

QNAP_HOST="${QNAP_HOST:-192.168.10.9}"
QNAP_WAIT_ATTEMPTS="${QNAP_WAIT_ATTEMPTS:-60}"
QNAP_WAIT_INTERVAL="${QNAP_WAIT_INTERVAL:-5}"

attempt=1
max_wait=$((QNAP_WAIT_ATTEMPTS * QNAP_WAIT_INTERVAL))
echo "Waiting for QNAP at ${QNAP_HOST} (up to ${max_wait}s)..."

while (( attempt <= QNAP_WAIT_ATTEMPTS )); do
  if ping -c 1 -W 2 "$QNAP_HOST" >/dev/null 2>&1 \
    && timeout 3 bash -c "echo >/dev/tcp/${QNAP_HOST}/445" 2>/dev/null; then
    echo "QNAP reachable (attempt ${attempt}/${QNAP_WAIT_ATTEMPTS})"
    exit 0
  fi
  echo "  attempt ${attempt}/${QNAP_WAIT_ATTEMPTS} — not ready, retrying in ${QNAP_WAIT_INTERVAL}s..."
  sleep "$QNAP_WAIT_INTERVAL"
  ((attempt++))
done

echo "ERROR: QNAP not reachable at ${QNAP_HOST} after ${QNAP_WAIT_ATTEMPTS} attempts" >&2
exit 1
