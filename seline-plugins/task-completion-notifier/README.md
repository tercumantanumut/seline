# Task Completion Notifier Plugin

Get instant desktop notifications when your Seline agent tasks complete, fail, or are aborted. Never miss a finished task again!

## Features

✅ **Cross-platform support**: macOS, Linux, and Windows  
✅ **Smart notifications**: Different sounds and icons for success, error, and abort  
✅ **Non-blocking**: Fire-and-forget hook—zero impact on response time  
✅ **Conditional logic**: Only notifies when tasks actually complete  
✅ **Fallback support**: Works even if `jq` is not installed  

## Installation

### Option 1: Drag & Drop (Easiest)
1. Download this plugin folder
2. Drag and drop it into your Seline app
3. Enable it in the plugin manager
4. Done! Notifications will start working immediately

### Option 2: Manual Installation
```bash
# Copy the plugin to your plugins directory
cp -r task-completion-notifier ~/.claude/plugins/

# Or use --plugin-dir flag when launching
claude --plugin-dir ./task-completion-notifier
```

## How It Works

This plugin registers a **Stop hook** that fires whenever your agent finishes responding. The hook:

1. Reads the `stop_reason` from the hook input (completed, error, or aborted)
2. Detects your operating system (macOS, Linux, Windows)
3. Sends a platform-specific notification with an appropriate sound

### Hook Input

```json
{
  "hook_type": "Stop",
  "session_id": "abc-123",
  "stop_reason": "completed"  // or "error", "aborted"
}
```

### Notifications

| Condition | macOS | Linux | Windows |
|-----------|-------|-------|---------|
| **Completed** | ✅ Glass sound | ✅ Normal urgency | ✅ Message box |
| **Error** | ❌ Alarm sound | ❌ Critical urgency | ❌ Message box |
| **Aborted** | ⏸️ Pop sound | ⏸️ Low urgency | ⏸️ Message box |

## Customization

To customize the notifications, edit `hooks/notify-on-stop.sh`:

### Change notification sounds (macOS)
Available sounds: `Glass`, `Alarm`, `Pop`, `Submarine`, `Ping`, `Tink`, `Morse`, `Sosumi`, `Blow`, `Purr`

```bash
send_macos_notification "Seline" "Task completed" "Submarine"
```

### Change notification titles
Replace `"Seline"` with your preferred title:

```bash
send_macos_notification "Claude Code" "Task completed" "Glass"
```

### Disable notifications for specific conditions
Comment out the notification call in the relevant case:

```bash
"completed")
  # send_macos_notification "Seline" "✅ Task completed successfully" "Glass"
  ;;
```

## Troubleshooting

### Notifications not appearing

1. **Check if hook is registered:**
   ```bash
   claude /hooks
   ```
   You should see `Stop` hook listed.

2. **Verify script is executable:**
   ```bash
   chmod +x hooks/notify-on-stop.sh
   ```

3. **Test manually:**
   ```bash
   echo '{"hook_type":"Stop","stop_reason":"completed"}' | ./hooks/notify-on-stop.sh
   ```

4. **Check macOS notification settings:**
   - System Preferences → Notifications
   - Find "osascript" or "Terminal"
   - Ensure notifications are enabled

### Script errors

Enable verbose logging by running with `--debug`:
```bash
claude --debug
```

Look for `[Hooks]` messages in the output.

## Platform-Specific Notes

### macOS
- Uses `osascript` to trigger native notifications
- Requires Terminal or your app to have notification permission
- Sounds must be from the system sounds library

### Linux
- Uses `notify-send` (pre-installed on most distributions)
- Requires a notification daemon (usually `systemd-notify`)
- Urgency levels: `low`, `normal`, `critical`

### Windows
- Uses PowerShell's `MessageBox` for notifications
- Works with Git Bash, WSL, and native Windows Terminal
- Requires PowerShell to be available in PATH

## Plugin Structure

```
task-completion-notifier/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── hooks/
│   ├── hooks.json          # Hook configuration
│   └── notify-on-stop.sh   # Notification script
└── README.md               # This file
```

## License

MIT — Feel free to modify and distribute

## Support

For issues or feature requests, open an issue on the GitHub repository.

---

**Made with ❤️ for Seline**
