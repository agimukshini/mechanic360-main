#!/usr/bin/env bash
set -euo pipefail
MOUNT_POINT="${MOUNT_POINT:-/mnt/qnap/mechanic}"
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then echo "Run with sudo"; exit 1; fi
if mountpoint -q "$MOUNT_POINT"; then umount "$MOUNT_POINT"; echo "Unmounted $MOUNT_POINT"; else echo "Not mounted"; fi
