# Quick Start Guide

## 🚀 Installation (30 seconds)

### Drag & Drop (Easiest)
1. Open Seline app
2. Go to Plugins section
3. Drag `task-completion-notifier` folder into the plugins area
4. Enable the plugin
5. Done! 🎉

### Or via Terminal
```bash
cp -r task-completion-notifier ~/.claude/plugins/
```

## ✅ Verify Installation

```bash
claude /hooks
```

You should see `Stop` hook listed.

## 🧪 Test It

```bash
cd task-completion-notifier
./test-hook.sh
```

All tests should pass ✅

## 📝 What It Does

- Listens for when Seline agent finishes responding
- Sends a **loud desktop notification** on macOS
- Shows different notifications for success (✅), error (❌), or abort (⏸️)
- Fire-and-forget (doesn't block your response)

## 🎵 Sounds

| Condition | Sound |
|-----------|-------|
| **Task completed** | 🔔 Glass |
| **Task failed** | 🚨 Alarm |
| **Task aborted** | 🔊 Pop |

## 🛠️ Customize (Optional)

Edit `hooks/notify-on-stop.sh` to change:
- Notification sounds
- Notification titles
- Which conditions trigger notifications

See [README.md](./README.md) for examples.

## 🐛 Troubleshooting

### Notifications not appearing?

1. Check macOS Settings → Notifications
2. Make sure Terminal/osascript has permission
3. Run: `./test-hook.sh` to verify script works
4. Check: `claude /hooks` to verify plugin is registered

### More help?

See [INSTALLATION.md](./INSTALLATION.md) for detailed troubleshooting.

---

**That's it! You're all set.** 🎉

When Seline finishes a task, you'll get a notification. No more watching the terminal!
