#!/usr/bin/env bash
set -euo pipefail

BASE="https://raw.githubusercontent.com/openai/skills/main/skills"
OUT="public/icons/skills"
mkdir -p "$OUT"

# curated icons
curl -fsSL "$BASE/.curated/figma/assets/figma.png" -o "$OUT/figma.png"
curl -fsSL "$BASE/.curated/sentry/assets/sentry.png" -o "$OUT/sentry.png"
curl -fsSL "$BASE/.curated/linear/assets/linear.png" -o "$OUT/linear.png"
curl -fsSL "$BASE/.curated/playwright/assets/playwright.png" -o "$OUT/playwright.png"
curl -fsSL "$BASE/.curated/cloudflare-deploy/assets/cloudflare.png" -o "$OUT/cloudflare.png"
curl -fsSL "$BASE/.curated/vercel-deploy/assets/vercel.png" -o "$OUT/vercel.png"
curl -fsSL "$BASE/.curated/netlify-deploy/assets/netlify.png" -o "$OUT/netlify.png"
curl -fsSL "$BASE/.curated/render-deploy/assets/render.png" -o "$OUT/render.png"
curl -fsSL "$BASE/.curated/gh-fix-ci/assets/github.png" -o "$OUT/github.png"
curl -fsSL "$BASE/.curated/notion-knowledge-capture/assets/notion.png" -o "$OUT/notion.png"
curl -fsSL "$BASE/.curated/openai-docs/assets/openai.png" -o "$OUT/openai.png"
curl -fsSL "$BASE/.curated/pdf/assets/pdf.png" -o "$OUT/pdf.png"
curl -fsSL "$BASE/.curated/doc/assets/doc.png" -o "$OUT/doc.png"
curl -fsSL "$BASE/.curated/spreadsheet/assets/spreadsheet.png" -o "$OUT/spreadsheet.png"
curl -fsSL "$BASE/.curated/imagegen/assets/imagegen.png" -o "$OUT/imagegen.png"
curl -fsSL "$BASE/.curated/sora/assets/sora.png" -o "$OUT/sora.png"
curl -fsSL "$BASE/.curated/speech/assets/speech.png" -o "$OUT/speech.png"
curl -fsSL "$BASE/.curated/transcribe/assets/transcribe.png" -o "$OUT/transcribe.png"
curl -fsSL "$BASE/.curated/screenshot/assets/screenshot.png" -o "$OUT/screenshot.png"
curl -fsSL "$BASE/.curated/jupyter-notebook/assets/jupyter.png" -o "$OUT/jupyter.png"
curl -fsSL "$BASE/.curated/yeet/assets/yeet.png" -o "$OUT/yeet.png"
curl -fsSL "$BASE/.curated/develop-web-game/assets/game.png" -o "$OUT/game.png"
curl -fsSL "$BASE/.curated/aspnet-core/assets/dotnet-logo.png" -o "$OUT/dotnet.png"
curl -fsSL "$BASE/.curated/winui-app/assets/winui.png" -o "$OUT/winui.png"

# system icon from repo
curl -fsSL "$BASE/.system/skill-installer/assets/skill-installer.png" -o "$OUT/skill-installer.png"

# placeholders for catalog entries without source assets
if [ ! -f "$OUT/skill-creator.png" ]; then cp "$OUT/skill-installer.png" "$OUT/skill-creator.png"; fi
if [ ! -f "$OUT/security-best-practices.png" ]; then cp "$OUT/openai.png" "$OUT/security-best-practices.png"; fi
if [ ! -f "$OUT/security-ownership-map.png" ]; then cp "$OUT/openai.png" "$OUT/security-ownership-map.png"; fi
if [ ! -f "$OUT/security-threat-model.png" ]; then cp "$OUT/openai.png" "$OUT/security-threat-model.png"; fi

echo "Downloaded skill icons to $OUT"
