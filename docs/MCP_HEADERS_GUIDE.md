# MCP Custom Headers Implementation Guide

## Overview

This guide documents the complete implementation of custom HTTP headers support for MCP SSE servers, including UI, API, security, and testing.

## Features Implemented

### 1. **Reusable Form Component** (`MCPServerForm`)
- **Location**: `components/settings/mcp-server-form.tsx`
- **Features**:
  - Unified form for both stdio and SSE transports
  - Dynamic header management with add/remove
  - Environment variable substitution with `${VAR}` syntax
  - Real-time validation and warnings
  - Variable preview with resolved values
  - Auto-suggestion for common patterns

### 2. **Inline Editing**
- Click "Edit" button on any server card
- Form expands inline (no modal/drawer)
- Pre-populated with existing config
- Preserves masked values during save

### 3. **Security Features**
- **Header Masking**: Sensitive headers (Authorization, X-API-Key, tokens) are masked in UI
- **Format**: First 4 + `••••••••` + last 4 characters
- **Preservation**: Masked values are not overwritten on save
- **Patterns**: Auto-detects sensitive headers by name patterns

### 4. **Template Library**
Enhanced with SSE examples:
- **Composio**: 100+ tool integrations via SSE
- **Supabase**: Database management (stdio + headers via env)
- **Linear**: Issue tracking
- **GitHub**: Repository management
- **Filesystem**: Local file access (stdio)

## Usage Examples

### Example 1: Composio Integration

**Step 1**: Add Composio template
- Click "Composio" in Recommended Servers
- Automatically creates server config with header placeholder

**Step 2**: Set API key
- Go to Environment Variables section
- Add `COMPOSIO_API_KEY` = your actual key
- The header `X-API-Key: ${COMPOSIO_API_KEY}` will auto-resolve

**Step 3**: Connect
- Click refresh icon on Composio server card
- Tools are discovered and registered

### Example 2: Custom SSE Server with Auth

```json
{
  "mcpServers": {
    "my-custom-server": {
      "type": "sse",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${MY_API_TOKEN}",
        "X-Custom-Header": "static-value"
      }
    }
  }
}
```

**Environment Variables**:
```json
{
  "MY_API_TOKEN": "sk-abc123..."
}
```

**Resolved at runtime**:
```http
GET https://api.example.com/mcp
Authorization: Bearer sk-abc123...
X-Custom-Header: static-value
```

### Example 3: Multiple Headers

```typescript
// In the UI form:
Headers:
  Authorization      → Bearer ${OPENAI_KEY}
  X-API-Version      → 2024-01
  X-Request-Source   → seline-mcp-client
  Content-Type       → application/json
```

## Variable Substitution

### Supported Variables

1. **Environment Variables**: `${ANY_ENV_VAR}`
   - Resolved from Settings → MCP Settings → Environment Variables
   - Used for API keys, tokens, secrets

2. **Synced Folders** (for stdio args/env):
   - `${SYNCED_FOLDER}` - Primary folder path
   - `${SYNCED_FOLDERS_ARRAY}` - All folders as separate args
   - `${SYNCED_FOLDERS}` - All folders comma-separated

### Resolution Order

1. **Load time**: Config loaded from disk
2. **Resolution**: `resolveMCPConfig()` replaces `${...}` patterns
3. **Connection**: Resolved config passed to transport
4. **Runtime**: Headers sent with every SSE request

### Security Notes

- **Masked values** are never sent to frontend
- **Original values** remain in settings file on disk
- **Updates** preserve masked values (don't overwrite with `••••`)
- **Logging**: Sensitive headers are not logged

## API Reference

### GET /api/mcp

**Response**:
```json
{
  "config": {
    "mcpServers": {
      "composio": {
        "type": "sse",
        "url": "https://backend.composio.dev/api/v1/mcp",
        "headers": {
          "X-API-Key": "sk-c••••••••3xyz"
        }
      }
    }
  },
  "environment": {
    "COMPOSIO_API_KEY": "sk-c••••••••3xyz"
  },
  "status": [...]
}
```

### PUT /api/mcp

**Request**:
```json
{
  "mcpServers": {
    "mcpServers": {
      "my-server": {
        "type": "sse",
        "url": "https://api.example.com/mcp",
        "headers": {
          "Authorization": "Bearer ${TOKEN}"
        }
      }
    }
  },
  "mcpEnvironment": {
    "TOKEN": "actual-secret-value"
  }
}
```

**Behavior**:
- Merges headers (preserves masked values)
- Disconnects removed servers
- Clears tools from registry
- Returns sync results

## Component API

### `MCPServerForm` Props

```typescript
interface MCPServerFormProps {
  /** Initial config for editing (omit for new server) */
  initialConfig?: MCPServerConfig;
  
  /** Initial name (for edit mode, readonly) */
  initialName?: string;
  
  /** Environment variables for substitution preview */
  environment: Record<string, string>;
  
  /** Synced folders for path variable preview */
  syncedFolders: Array<{
    folderPath: string;
    isPrimary: boolean;
    characterId: string;
  }>;
  
  /** Called on save with name and config */
  onSave: (name: string, config: MCPServerConfig) => Promise<void>;
  
  /** Called on cancel */
  onCancel: () => void;
  
  /** Existing server names (for validation) */
  existingNames?: string[];
}
```

### Usage

```tsx
<MCPServerForm
  environment={environment}
  syncedFolders={syncedFolders}
  onSave={async (name, config) => {
    await saveServer(name, config);
  }}
  onCancel={() => setIsAdding(false)}
  existingNames={Object.keys(servers)}
/>
```

## Testing Checklist

### Manual Testing

- [ ] **Add SSE server with headers**
  - Create new server (type: SSE)
  - Add Authorization header with `${VAR}` syntax
  - Verify variable preview shows resolved value
  - Save and verify header appears masked in UI

- [ ] **Edit existing server**
  - Click Edit on server card
  - Form expands inline with pre-filled values
  - Headers show masked (••••)
  - Change URL, save
  - Verify headers preserved (not overwritten)

- [ ] **Template usage**
  - Click Composio template
  - Verify server created with header placeholder
  - Add COMPOSIO_API_KEY to env vars
  - Connect server
  - Verify tools discovered

- [ ] **Variable substitution**
  - Add env var: `TEST_TOKEN=abc123`
  - Create header: `Authorization: Bearer ${TEST_TOKEN}`
  - Preview shows: `Bearer abc123`
  - Connect server
  - Verify header sent to server (check server logs)

- [ ] **Security**
  - Refresh page after adding sensitive header
  - Verify header value is masked in UI
  - Edit server, verify masked value preserved
  - Check network tab: masked values not sent to frontend

### Integration Testing

```typescript
// Test header resolution
const config = {
  type: "sse",
  url: "https://api.example.com/mcp",
  headers: {
    "Authorization": "Bearer ${API_KEY}"
  }
};

const env = { API_KEY: "secret123" };
const resolved = await resolveMCPConfig("test", config, env);

expect(resolved.headers?.Authorization).toBe("Bearer secret123");
```

### Real Server Testing

**Test with Composio**:
1. Sign up at https://app.composio.dev
2. Get API key from settings
3. Add Composio template in Seline
4. Set `COMPOSIO_API_KEY` env var
5. Connect server
6. Verify tools appear in chat (use /tools command)
7. Test a tool: "List my GitHub repositories"

## Troubleshooting

### Headers not being sent

**Symptom**: Server returns 401 Unauthorized

**Checks**:
1. Verify env variable is set: Settings → MCP → Environment Variables
2. Check variable name matches: `${VAR_NAME}` must exist in env
3. Check resolution: Look for `[MCP] ✅ Resolved server-name` in logs
4. Verify transport type: Headers only work with `type: "sse"`

**Fix**: Ensure variable is defined before connecting

### Headers showing as undefined

**Symptom**: Preview shows `Bearer undefined`

**Cause**: Environment variable not set or typo in name

**Fix**: 
- Add variable to Environment Variables section
- Check spelling: `${COMPOSIO_API_KEY}` vs `${COMPOSIO_KEY}`

### Masked values being overwritten

**Symptom**: After edit, header value becomes `••••••••`

**Cause**: Bug in merge logic (should be fixed)

**Check**: 
```typescript
// In PUT handler, should skip masked values:
for (const [key, value] of Object.entries(incoming)) {
  if (!value.includes("•")) {
    mergedHeaders[key] = value;
  }
}
```

### SSE connection fails with CORS

**Symptom**: `CORS policy: No 'Access-Control-Allow-Origin' header`

**Cause**: Server doesn't allow Seline's origin

**Fix**: Contact server admin or use mcp-remote proxy

## Architecture

### Data Flow

```
User Input (UI)
  ↓
MCPServerForm validates
  ↓
onSave callback
  ↓
PUT /api/mcp
  ↓
Mask sensitive headers
  ↓
Save to settings.json
  ↓
resolveMCPConfig()
  ↓
Replace ${VAR} with env values
  ↓
SSEClientTransport
  ↓
Headers sent with every SSE request
```

### File Structure

```
components/settings/
  mcp-server-form.tsx       # Reusable form component
  mcp-settings.tsx          # Main settings page (uses form)

app/api/mcp/
  route.ts                  # GET/PUT handlers with masking

lib/mcp/
  client-manager.ts         # resolveMCPConfig(), connection logic
  types.ts                  # MCPServerConfig interface
```

## Best Practices

### 1. Use Environment Variables for Secrets

✅ **Good**:
```json
{
  "headers": {
    "Authorization": "Bearer ${MY_TOKEN}"
  }
}
```

❌ **Bad** (hardcoded secret):
```json
{
  "headers": {
    "Authorization": "Bearer sk-abc123xyz..."
  }
}
```

### 2. Name Variables Clearly

✅ **Good**: `COMPOSIO_API_KEY`, `LINEAR_TOKEN`

❌ **Bad**: `KEY1`, `TOKEN`, `VAR`

### 3. Use Templates When Available

Templates include proper env var setup and examples.

### 4. Test Variable Resolution

Use the preview panel to verify variables resolve correctly before connecting.

### 5. Don't Commit Secrets

Environment variables are stored in `settings.json` (gitignored).

## Future Enhancements

### Potential Features

1. **Header Presets**: Common auth patterns (Bearer, Basic, API Key)
2. **Validation**: Warn if header format is invalid
3. **Testing**: Built-in connection tester with header preview
4. **Import/Export**: Share configs without exposing secrets
5. **Per-Character Headers**: Different tokens for different characters

### Extension Points

- Add custom header transformations in `resolveMCPConfig()`
- Support dynamic headers (e.g., timestamp, nonce)
- Add header templates for common APIs

## Support

### Common Questions

**Q: Can I use headers with stdio servers?**  
A: No, headers only work with `type: "sse"` or `type: "http"`. Stdio servers use process arguments and environment variables.

**Q: Are headers sent with every request?**  
A: Yes, SSEClientTransport includes headers in the initial connection and all subsequent requests.

**Q: Can I use multiple variables in one header?**  
A: Yes! Example: `X-Auth: ${USER_ID}:${API_KEY}`

**Q: What if I need to change a masked header?**  
A: Edit the server, delete the header row, add it again with the new value.

## Changelog

### v1.0.0 (2024-02-05)
- ✅ Initial implementation
- ✅ MCPServerForm component
- ✅ Header masking in API
- ✅ Inline editing
- ✅ Composio template
- ✅ Variable substitution
- ✅ Security: masked value preservation

---

**Last Updated**: February 5, 2024  
**Author**: Seline MCP Team  
**Status**: Production Ready ✅
