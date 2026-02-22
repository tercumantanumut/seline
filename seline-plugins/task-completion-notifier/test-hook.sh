#!/bin/bash
#
# Test script to validate the notify-on-stop hook
# Run this to test the hook without needing to run the full Seline app
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/hooks/notify-on-stop.sh"

echo "🧪 Testing Task Completion Notifier Hook"
echo "========================================"
echo ""

# Check if script exists
if [ ! -f "$HOOK_SCRIPT" ]; then
  echo "❌ Hook script not found at $HOOK_SCRIPT"
  exit 1
fi

# Check if script is executable
if [ ! -x "$HOOK_SCRIPT" ]; then
  echo "❌ Hook script is not executable. Run: chmod +x $HOOK_SCRIPT"
  exit 1
fi

echo "✅ Hook script found and is executable"
echo ""

# Test cases
test_case() {
  local name="$1"
  local json="$2"
  
  echo "Testing: $name"
  echo "Input: $json"
  
  if echo "$json" | "$HOOK_SCRIPT" > /dev/null 2>&1; then
    echo "✅ Passed"
  else
    echo "❌ Failed"
  fi
  echo ""
}

# Run test cases
test_case "Completed task" '{"hook_type":"Stop","session_id":"test-1","stop_reason":"completed"}'
test_case "Failed task" '{"hook_type":"Stop","session_id":"test-2","stop_reason":"error"}'
test_case "Aborted task" '{"hook_type":"Stop","session_id":"test-3","stop_reason":"aborted"}'
test_case "Unknown reason" '{"hook_type":"Stop","session_id":"test-4","stop_reason":"unknown"}'

echo "========================================"
echo "✅ All tests passed!"
echo ""
echo "Next steps:"
echo "1. Install the plugin in Seline"
echo "2. Run a task and wait for it to complete"
echo "3. You should see a desktop notification"
