# Installation Guide

## Quick Start (Drag & Drop)

1. **Download the plugin folder**
   ```
   task-completion-notifier/
   ├── .claude-plugin/
   │   └── plugin.json
   ├── hooks/
   │   ├── hooks.json
   │   └── notify-on-stop.sh
   └── README.md
   ```

2. **Drag and drop into Seline app**
   - Open Seline
   - Go to Plugins section
   - Drag the `task-completion-notifier` folder into the plugins area
   - Or click "Install Plugin" and select the folder

3. **Enable the plugin**
   - In the plugin manager, find "task-completion-notifier"
   - Click the toggle to enable it
   - Done! Notifications will start working

## Manual Installation (CLI)

### Option A: User-Wide (All Projects)
```bash
mkdir -p ~/.claude/plugins
cp -r task-completion-notifier ~/.claude/plugins/
```

### Option B: Project-Specific
```bash
mkdir -p .claude/plugins
cp -r task-completion-notifier .claude/plugins/
```

### Option C: Development (Temporary)
```bash
claude --plugin-dir ./task-completion-notifier
```

## Verify Installation

Check that the plugin is registered:
```bash
claude /hooks
```

You should see `Stop` hook listed in the output.

## Test the Hook

Run the included test script:
```bash
cd task-completion-notifier
./test-hook.sh
```

Expected output:
```
🧪 Testing Task Completion Notifier Hook
========================================

✅ Hook script found and is executable

Testing: Completed task
Input: {"hook_type":"Stop","session_id":"test-1","stop_reason":"completed"}
✅ Passed

Testing: Failed task
Input: {"hook_type":"Stop","session_id":"test-2","stop_reason":"error"}
✅ Passed

Testing: Aborted task
Input: {"hook_type":"Stop","session_id":"test-3","stop_reason":"aborted"}
✅ Passed

Testing: Unknown reason
Input: {"hook_type":"Stop","session_id":"test-4","stop_reason":"unknown"}
✅ Passed

========================================
✅ All tests passed!
```

## Uninstall

### If installed via drag & drop
1. Open Seline plugin manager
2. Find "task-completion-notifier"
3. Click the trash/delete icon

### If installed manually
```bash
# User-wide
rm -rf ~/.claude/plugins/task-completion-notifier

# Project-specific
rm -rf .claude/plugins/task-completion-notifier
```

## Troubleshooting

### Notifications not appearing?

1. **Check macOS permissions:**
   - System Preferences → Notifications
   - Search for "Terminal" or "osascript"
   - Make sure notifications are enabled

2. **Verify hook is registered:**
   ```bash
   claude /hooks
   ```
   Look for `Stop` hook in the list.

3. **Check script permissions:**
   ```bash
   ls -la task-completion-notifier/hooks/notify-on-stop.sh
   ```
   Should show `rwxr-xr-x` (executable).

4. **Run with debug mode:**
   ```bash
   claude --debug
   ```
   Look for `[Hooks]` messages in the output.

### "Hook script not found" error?

Make sure the plugin folder structure is correct:
```
task-completion-notifier/
├── .claude-plugin/
│   └── plugin.json          ← Must be here
├── hooks/
│   ├── hooks.json           ← Must be here
│   └── notify-on-stop.sh    ← Must be here
```

### Script errors on Windows?

The hook uses POSIX shell syntax. If you're on Windows, make sure:
1. You have Git Bash or WSL installed
2. Your PATH includes the bash binary
3. You're using a POSIX-compatible shell

## Next Steps

- Read [README.md](./README.md) for customization options
- Check [Hook Input Schema](#hook-input-schema) below for advanced usage

## Hook Input Schema

When the Stop hook fires, it receives this JSON on stdin:

```json
{
  "hook_type": "Stop",
  "session_id": "unique-session-id",
  "stop_reason": "completed"  // or "error", "aborted"
}
```

The script parses this and sends a platform-specific notification:
- **macOS**: `osascript` with system sounds
- **Linux**: `notify-send` with urgency levels
- **Windows**: PowerShell `MessageBox`

## Support

For issues, check:
1. The [Troubleshooting](#troubleshooting) section above
2. Run the test script: `./test-hook.sh`
3. Check Seline logs with `--debug` flag
4. Open an issue on GitHub

---

**Made with ❤️ for Seline**
