#!/bin/bash
# pack.sh - builds an unsigned XPI (zip). Use for testing or local developer builds.
set -e
OUT=yt-trust-hint.xpi
rm -f "$OUT"
zip -r "$OUT" manifest.json background.js content_script.js LICENSE README.md
echo "Created $OUT"
