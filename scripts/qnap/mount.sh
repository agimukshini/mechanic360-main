#!/usr/bin/env bash
set -euo pipefail

QNAP_HOST="${QNAP_HOST:-192.168.10.9}"
QNAP_SHARE="${1:-${QNAP_SHARE:-mechanic}}"
MOUNT_POINT="${MOUNT_POINT:-/mnt/qnap/mechanic}"
CREDS_FILE="${CREDS_FILE:-/etc/mechanic360/qnap.credentials}"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run with sudo: sudo $0"
  exit 1
fi

if [[ ! -f "$CREDS_FILE" ]]; then
  echo "Missing: $CREDS_FILE"
  echo "  sudo mkdir -p /etc/mechanic360"
  echo "  sudo cp /opt/docker/mechanic360/scripts/qnap/credentials.example $CREDS_FILE"
  echo "  sudo chmod 600 $CREDS_FILE && sudo nano $CREDS_FILE"
  exit 1
fi

mkdir -p "$MOUNT_POINT"

if mountpoint -q "$MOUNT_POINT"; then
  echo "Already mounted: $MOUNT_POINT"
  mount | grep "$MOUNT_POINT"
  exit 0
fi

# file_mode=0644 / dir_mode=0755 so the nginx user (uid 101) inside the
# frontend container can read uploaded media for direct serving. Backend
# runs as root and can still write. These files are user-uploaded photos —
# not secrets — so world-readable on the host is acceptable.
MOUNT_OPTS="credentials=${CREDS_FILE},vers=3.0,uid=0,gid=0,file_mode=0644,dir_mode=0755,noserverino,_netdev"
if ! mount -t cifs "//${QNAP_HOST}/${QNAP_SHARE}" "$MOUNT_POINT" -o "$MOUNT_OPTS"; then
  echo "SMB3 failed — retrying SMB2..."
  MOUNT_OPTS="credentials=${CREDS_FILE},vers=2.1,uid=0,gid=0,file_mode=0644,dir_mode=0755,noserverino,_netdev"
  mount -t cifs "//${QNAP_HOST}/${QNAP_SHARE}" "$MOUNT_POINT" -o "$MOUNT_OPTS"
fi

echo "Mounted //$QNAP_HOST/$QNAP_SHARE -> $MOUNT_POINT"
mkdir -p "$MOUNT_POINT/vehicle_photos" "$MOUNT_POINT/global_vehicle_photos" "$MOUNT_POINT/vehicle_documents" "$MOUNT_POINT/inspections"
ls -la "$MOUNT_POINT"
