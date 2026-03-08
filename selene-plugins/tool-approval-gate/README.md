# Tool Approval Gate Plugin

Prompts for user approval before each tool call using the `PreToolUse` hook.

## Behavior

- Hook event: `PreToolUse`
- Matcher: `.*` (all tools)
- Platform: macOS interactive dialog via `osascript`
- `Allow` -> tool executes
- `Deny` (or timeout) -> hook exits with code `2`, tool is blocked
- Block reason sent to agent: `User denied tool request: <tool_name>`

## Validate (dry-run)

```bash
echo '{"hook_type":"PreToolUse","tool_name":"executeCommand","tool_input":{"command":"ls"},"session_id":"test"}' \
  | ./hooks/approve-tool-use.sh --dry-run
```

## Simulate deny/allow

```bash
echo '{"hook_type":"PreToolUse","tool_name":"executeCommand","tool_input":{"command":"rm -rf /"},"session_id":"test"}' \
  | ./hooks/approve-tool-use.sh --simulate-deny

# exits 2, stderr includes: User denied tool request: executeCommand
```

```bash
echo '{"hook_type":"PreToolUse","tool_name":"readFile","tool_input":{"path":"README.md"},"session_id":"test"}' \
  | ./hooks/approve-tool-use.sh --simulate-allow
```
