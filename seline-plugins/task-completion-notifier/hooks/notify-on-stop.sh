#!/bin/bash
#
# Task Completion Notifier Hook
# 
# Sends desktop notifications when Claude Code agent tasks complete.
# Supports macOS, Linux, and Windows with platform-specific commands.
# 
# Input (via stdin):
#   {
#     "hook_type": "Stop",
#     "session_id": "abc-123",
#     "stop_reason": "completed" | "error" | "aborted"
#   }
#

set -e

# Read hook input from stdin
INPUT=$(cat)

# Extract stop reason using jq (fallback to grep if jq unavailable)
if command -v jq &> /dev/null; then
  STOP_REASON=$(echo "$INPUT" | jq -r '.stop_reason // "unknown"')
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
else
  # Fallback: basic grep-based parsing
  STOP_REASON=$(echo "$INPUT" | grep -o '"stop_reason":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
  SESSION_ID=$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
fi

# Determine platform
PLATFORM=$(uname -s)

# Function to send macOS notification
send_macos_notification() {
  local title="$1"
  local message="$2"
  local sound="$3"
  
  osascript -e "display notification \"$message\" with title \"$title\" sound name \"$sound\"" 2>/dev/null || true
}

# Function to send Linux notification
send_linux_notification() {
  local title="$1"
  local message="$2"
  local urgency="$3"
  
  if command -v notify-send &> /dev/null; then
    notify-send -u "$urgency" "$title" "$message" 2>/dev/null || true
  fi
}

# Function to send Windows notification
send_windows_notification() {
  local title="$1"
  local message="$2"
  
  if command -v powershell.exe &> /dev/null; then
    powershell.exe -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('$message', '$title')" 2>/dev/null || true
  fi
}

# Send notification based on stop reason and platform
case "$STOP_REASON" in
  "completed")
    case "$PLATFORM" in
      "Darwin")
        send_macos_notification "Seline" "✅ Task completed successfully" "Glass"
        ;;
      "Linux")
        send_linux_notification "Seline" "✅ Task completed successfully" "normal"
        ;;
      "MINGW"*|"MSYS"*|"CYGWIN"*)
        send_windows_notification "Seline" "✅ Task completed successfully"
        ;;
    esac
    ;;
  "error")
    case "$PLATFORM" in
      "Darwin")
        send_macos_notification "Seline" "❌ Task failed with error" "Alarm"
        ;;
      "Linux")
        send_linux_notification "Seline" "❌ Task failed with error" "critical"
        ;;
      "MINGW"*|"MSYS"*|"CYGWIN"*)
        send_windows_notification "Seline" "❌ Task failed with error"
        ;;
    esac
    ;;
  "aborted")
    case "$PLATFORM" in
      "Darwin")
        send_macos_notification "Seline" "⏸️  Task was aborted" "Pop"
        ;;
      "Linux")
        send_linux_notification "Seline" "⏸️  Task was aborted" "low"
        ;;
      "MINGW"*|"MSYS"*|"CYGWIN"*)
        send_windows_notification "Seline" "⏸️  Task was aborted"
        ;;
    esac
    ;;
  *)
    # Unknown stop reason - send generic notification
    case "$PLATFORM" in
      "Darwin")
        send_macos_notification "Seline" "Task finished" "Glass"
        ;;
      "Linux")
        send_linux_notification "Seline" "Task finished" "normal"
        ;;
      "MINGW"*|"MSYS"*|"CYGWIN"*)
        send_windows_notification "Seline" "Task finished"
        ;;
    esac
    ;;
esac

# Always exit successfully (don't block the Stop hook)
exit 0
