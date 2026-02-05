# MCP Form Builder - Quick Start Guide

## 🚀 What's New

You can now configure MCP servers using a **visual form builder** instead of editing raw JSON!

## ✨ Key Features

### 1. **One-Click Templates**

Click a template to instantly add a pre-configured server:

```
┌─────────────────────────────────────────────────────┐
│  📦 Recommended Servers                             │
├─────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │Filesystem│  │  GitHub  │  │ Composio │          │
│  │Read/write│  │Repo mgmt │  │100+ tools│          │
│  └──────────┘  └──────────┘  └──────────┘          │
└─────────────────────────────────────────────────────┘
```

### 2. **Inline Editing**

Edit any server without opening a modal:

```
┌─────────────────────────────────────────────────────┐
│  ✅ composio                      [SSE] [2 headers] │
│  https://backend.composio.dev/... │ 15 tools active │
│                                                      │
│  [Toggle] [Refresh] [Edit] [Delete]                 │
└─────────────────────────────────────────────────────┘
                    ↓ Click Edit
┌─────────────────────────────────────────────────────┐
│  Edit Server                        [Variables]     │
├─────────────────────────────────────────────────────┤
│  Server Name: composio                              │
│  Transport:   [Stdio] [SSE ✓]                       │
│                                                      │
│  Server URL:                                        │
│  https://backend.composio.dev/api/v1/mcp            │
│                                                      │
│  Request Headers (Optional)           [Examples]    │
│  ┌──────────────┬──────────────────────────────┐   │
│  │ X-API-Key    │ sk_t••••••••••abc123    [👁]│   │
│  └──────────────┴──────────────────────────────┘   │
│  [+ Add Header]                                     │
│                                                      │
│  [Cancel] [Save Server]                             │
└─────────────────────────────────────────────────────┘
```

### 3. **Custom Headers Support**

Add authentication headers for SSE servers:

```
┌─────────────────────────────────────────────────────┐
│  Request Headers (Optional)           [Examples]    │
├─────────────────────────────────────────────────────┤
│  ┌──────────────┬──────────────────────────────┐   │
│  │ Authorization│ Bearer ${COMPOSIO_API_KEY}   │   │
│  │ X-API-Key    │ ${MY_API_KEY}                │   │
│  └──────────────┴──────────────────────────────┘   │
│                                                      │
│  [+ Add Header]                                     │
└─────────────────────────────────────────────────────┘
```

### 4. **Variable Substitution Helper**

See and insert environment variables easily:

```
┌─────────────────────────────────────────────────────┐
│  ℹ Available Environment Variables:                 │
├─────────────────────────────────────────────────────┤
│  ${COMPOSIO_API_KEY}                      [Copy]    │
│  ${GITHUB_PERSONAL_ACCESS_TOKEN}          [Copy]    │
│  ${SUPABASE_ACCESS_TOKEN}                 [Copy]    │
│                                                      │
│  Path Variables:                                    │
│  ${SYNCED_FOLDER} - Primary folder                  │
│  ${SYNCED_FOLDERS_ARRAY} - All folders (expands)    │
└─────────────────────────────────────────────────────┘
```

### 5. **Visual Previews**

See how variables will be resolved:

```
┌─────────────────────────────────────────────────────┐
│  Server URL:                                        │
│  https://api.example.com?key=${API_KEY}             │
│                                                      │
│  Preview: https://api.example.com?key=sk_test...    │
└─────────────────────────────────────────────────────┘
```

## 📖 How to Use

### Add a Server from Template

1. Scroll to **"Recommended Servers"**
2. Click a template (e.g., **Composio**)
3. Server is added automatically
4. Scroll to **"Environment Variables"**
5. Fill in required values (e.g., `COMPOSIO_API_KEY`)
6. Click **"Connect"** to test

### Add a Custom SSE Server

1. Click **"Add Custom Server"**
2. Enter server name
3. Select **SSE** transport
4. Enter URL
5. Click **"Add Header"**
6. Enter header name and value (use `${VAR}` for env vars)
7. Click **"Save Server"**

### Add a Stdio Server

1. Click **"Add Custom Server"**
2. Enter server name
3. Select **Stdio** transport
4. Enter command (e.g., `npx`)
5. Add arguments (one per line):
   ```
   -y
   @modelcontextprotocol/server-filesystem
   ${SYNCED_FOLDER}
   ```
6. Click **"Save Server"**

### Edit an Existing Server

1. Find the server card
2. Click the **Edit** button (pencil icon)
3. Make changes in the inline form
4. Click **"Save Server"** or **"Cancel"**

## 🔐 Security Features

### Automatic Masking

Sensitive headers are automatically masked:

```
Before (what you type):
Authorization: Bearer sk_test_1234567890abcdef

After (what you see):
Authorization: Bear••••••••cdef
```

Masked headers include:
- `Authorization`
- `X-API-Key`
- Any header with "token", "key", "secret", or "bearer"

### Password-Style Inputs

Click the eye icon to show/hide values:

```
[Authorization] [Bear••••••••cdef] [👁]
                                    ↓ Click
[Authorization] [Bearer sk_test_...] [👁‍🗨]
```

## 🎯 Common Use Cases

### Use Case 1: Composio (100+ Tools)

```
Template: Composio
Type: SSE
URL: https://backend.composio.dev/api/v1/mcp
Headers:
  X-API-Key: ${COMPOSIO_API_KEY}

Required Env Vars:
  COMPOSIO_API_KEY: Get from https://app.composio.dev/settings
```

### Use Case 2: Custom API with Bearer Token

```
Name: my-api
Type: SSE
URL: https://api.myservice.com/mcp
Headers:
  Authorization: Bearer ${MY_API_TOKEN}

Env Vars:
  MY_API_TOKEN: <your-token>
```

### Use Case 3: Filesystem Access

```
Template: Filesystem (All Folders)
Type: Stdio
Command: npx
Args:
  -y
  @modelcontextprotocol/server-filesystem
  ${SYNCED_FOLDERS_ARRAY}

No env vars needed - uses synced folders automatically
```

### Use Case 4: GitHub with Personal Access Token

```
Template: GitHub
Type: Stdio
Command: npx
Args:
  -y
  @modelcontextprotocol/server-github

Env Vars:
  GITHUB_PERSONAL_ACCESS_TOKEN: <your-PAT>
```

## 🐛 Troubleshooting

### "Variable not set" Error

**Problem:** Server won't connect because `${VAR_NAME}` isn't set

**Solution:**
1. Go to **"Environment Variables"** section
2. Click **"Add Variable"**
3. Enter variable name (e.g., `COMPOSIO_API_KEY`)
4. Enter the value
5. Try connecting again

### Headers Not Being Sent

**Problem:** Server rejects connection (401/403)

**Solution:**
1. Check variable name is correct (case-sensitive)
2. Verify environment variable has a value
3. Make sure header name matches server requirements
4. Check for typos in `${VAR_NAME}` syntax

### Can't See Header Value

**Problem:** Header shows dots instead of value

**Solution:**
- This is intentional security masking
- Click the eye icon (👁) to show/hide
- Editing works even when masked

### Server Won't Connect

**Problem:** Connection fails or times out

**Solution:**
1. Check URL is correct (no typos)
2. Verify API key/token is valid
3. Check server status (is it online?)
4. Look at error message in server card
5. Try clicking **"Refresh"** to reconnect

## 💡 Pro Tips

### Tip 1: Use Variable Helper

Don't remember variable names? Click **"Variables"** button to see all available env vars with one-click copy.

### Tip 2: Test Before Saving

Templates are pre-configured and tested. Use them as starting points for custom servers.

### Tip 3: Inline Editing is Fast

No need to delete and re-add servers. Just click **Edit**, make changes, and save.

### Tip 4: Headers Support Variables

You can use variables in header values:
```
X-API-Key: ${API_KEY}
Authorization: Bearer ${ACCESS_TOKEN}
X-Custom-Header: ${CUSTOM_VALUE}
```

### Tip 5: Path Variables Auto-Resolve

Use `${SYNCED_FOLDER}` or `${SYNCED_FOLDERS_ARRAY}` in arguments - they automatically resolve to your synced folder paths.

## 🔄 Migrating from Raw JSON

### Before (Raw JSON)

```json
{
  "mcpServers": {
    "composio": {
      "type": "sse",
      "url": "https://backend.composio.dev/api/v1/mcp",
      "headers": {
        "X-API-Key": "${COMPOSIO_API_KEY}"
      }
    }
  }
}
```

### After (Form Builder)

1. Click **Composio** template → Done!
2. Or click **Add Custom Server** and fill the form

**Both work!** You can still use Raw JSON if you prefer (toggle at bottom of page).

## 📚 More Information

- **Full Documentation:** See `MCP_FORM_BUILDER_IMPLEMENTATION.md`
- **MCP Protocol:** https://modelcontextprotocol.io
- **Seline Docs:** https://github.com/yourusername/seline

## 🎉 That's It!

You now have a powerful, user-friendly way to configure MCP servers without touching JSON.

**Happy configuring! 🚀**
