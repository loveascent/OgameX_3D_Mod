#!/usr/bin/env bash
# OgameX 3D Mod - one-click install (Linux / macOS).
# Run this from your OGameX folder:   bash ogx3d-install.sh
set -e
cd "$(dirname "$0")"
php ogx3d-install.php
php artisan migrate --force
php artisan ogx3d:doctor
