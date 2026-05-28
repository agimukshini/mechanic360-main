#!/usr/bin/env bash
set -euo pipefail

QNAP_HOST="${QNAP_HOST:-192.168.10.9}"
QNAP_USER="${QNAP_USER:-mechanich}"
QNAP_SHARE="${1:-${QNAP_SHARE:-mechanic}}"

echo "=== QNAP SMB test ==="
echo "Host:  $QNAP_HOST"
echo "User:  $QNAP_USER"
echo "Share: $QNAP_SHARE"
echo "Docker host IP: $(hostname -I | awk '{print $1}')"
echo

ping -c 1 -W 2 "$QNAP_HOST" >/dev/null && echo "OK  Ping" || { echo "ERROR: Cannot ping $QNAP_HOST"; exit 1; }
nc -zv -w 3 "$QNAP_HOST" 445 >/dev/null 2>&1 && echo "OK  SMB port 445" || { echo "ERROR: Port 445 not reachable"; exit 1; }

read -r -s -p "Enter SMB password for ${QNAP_USER}@${QNAP_HOST}: " QNAP_PASS
echo

echo
echo "--- Available shares ---"
smbclient -L "//$QNAP_HOST" -U "${QNAP_USER}%${QNAP_PASS}" 2>&1 | head -40

TEST_MOUNT="/mnt/qnap/.test-mount-$$"
PROD_MOUNT="/mnt/qnap/mechanic"
sudo mkdir -p "$TEST_MOUNT" "$PROD_MOUNT"

cleanup() {
  mountpoint -q "$TEST_MOUNT" 2>/dev/null && sudo umount "$TEST_MOUNT" || true
  sudo rmdir "$TEST_MOUNT" 2>/dev/null || true
}
trap cleanup EXIT

echo
echo "--- Mount test: //$QNAP_HOST/$QNAP_SHARE ---"
MOUNT_OPTS="username=${QNAP_USER},password=${QNAP_PASS},vers=3.0,uid=0,gid=0,file_mode=0660,dir_mode=0770,noserverino"
if ! sudo mount -t cifs "//${QNAP_HOST}/${QNAP_SHARE}" "$TEST_MOUNT" -o "$MOUNT_OPTS"; then
  echo "SMB3 failed — retrying SMB2..."
  MOUNT_OPTS="username=${QNAP_USER},password=${QNAP_PASS},vers=2.1,uid=0,gid=0,file_mode=0660,dir_mode=0770,noserverino"
  sudo mount -t cifs "//${QNAP_HOST}/${QNAP_SHARE}" "$TEST_MOUNT" -o "$MOUNT_OPTS"
fi

TEST_FILE="$TEST_MOUNT/mechanic360-write-test-$(date +%s).txt"
echo "Mechanic360 QNAP write test $(date -Is)" | sudo tee "$TEST_FILE" >/dev/null
sudo cat "$TEST_FILE"
sudo rm -f "$TEST_FILE"

echo
echo "SUCCESS: Read/write test passed on //$QNAP_HOST/$QNAP_SHARE"
echo "Next: sudo cp scripts/qnap/credentials.example /etc/mechanic360/qnap.credentials"
echo "      edit password, then: sudo ./scripts/qnap/mount.sh"
