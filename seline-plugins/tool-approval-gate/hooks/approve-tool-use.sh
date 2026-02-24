#!/bin/bash

set -euo pipefail

DRY_RUN=false
SIMULATE_DECISION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --simulate-allow)
      SIMULATE_DECISION="allow"
      shift
      ;;
    --simulate-deny)
      SIMULATE_DECISION="deny"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

INPUT=$(cat)

if command -v jq >/dev/null 2>&1; then
  TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
  TOOL_INPUT_RAW=$(echo "$INPUT" | jq -c '.tool_input // {}')
else
  TOOL_NAME=$(echo "$INPUT" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  SESSION_ID=$(echo "$INPUT" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  TOOL_INPUT_RAW="{}"
  TOOL_NAME=${TOOL_NAME:-unknown}
  SESSION_ID=${SESSION_ID:-unknown}
fi

TOOL_INPUT_PREVIEW=$(printf "%s" "$TOOL_INPUT_RAW" | cut -c1-220)
if [[ ${#TOOL_INPUT_RAW} -gt 220 ]]; then
  TOOL_INPUT_PREVIEW="${TOOL_INPUT_PREVIEW}..."
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] tool=$TOOL_NAME session=$SESSION_ID"
  echo "[dry-run] preview=$TOOL_INPUT_PREVIEW"
  if [[ -n "$SIMULATE_DECISION" ]]; then
    echo "[dry-run] simulated_decision=$SIMULATE_DECISION"
  fi
  exit 0
fi

if [[ "$SIMULATE_DECISION" == "deny" ]]; then
  echo "User denied tool request: $TOOL_NAME" >&2
  exit 2
fi
if [[ "$SIMULATE_DECISION" == "allow" ]]; then
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  exit 0
fi

if ! command -v osascript >/dev/null 2>&1; then
  exit 0
fi

export SELINE_TOOL_NAME="$TOOL_NAME"
export SELINE_TOOL_INPUT_PREVIEW="$TOOL_INPUT_PREVIEW"

DIALOG_RESULT=$(osascript <<'OSA' 2>/dev/null || true
set toolName to do shell script "printf %s \"$SELINE_TOOL_NAME\""
set inputPreview to do shell script "printf %s \"$SELINE_TOOL_INPUT_PREVIEW\""
set bodyText to "Tool: " & toolName & return & return & "Input: " & inputPreview & return & return & "Allow this tool call?"

activate
set dialogResult to display dialog bodyText with title "Seline Tool Approval" buttons {"Deny", "Allow"} default button "Allow" cancel button "Deny" giving up after 30

if gave up of dialogResult then
  return "deny"
else
  return button returned of dialogResult
end if
OSA
)

if [[ "$DIALOG_RESULT" == "Allow" ]]; then
  exit 0
fi

echo "User denied tool request: $TOOL_NAME" >&2
exit 2
