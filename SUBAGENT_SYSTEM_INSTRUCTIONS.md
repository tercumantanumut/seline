# Seline Subagent System Instructions

## Overview

Seline subagents are workflow team members coordinated through `delegateToSubagent`.
This system is app-aligned and db-aligned:
- Delegations are tracked with `delegationId`, `sessionId`, and workflow membership.
- Subagents run in real chat sessions with persisted messages and observability.
- Coordination uses workflow roles (`initiator`, `subagent`) and shared workflow resources.

---

## Core Terms

Use these terms consistently across prompts, tools, and docs:
- `workflow`
- `initiator`
- `subagent`
- `delegationId`
- `agentId`
- `observe`
- `continue`
- `stop`

---

## Initiator / Orchestrator Contract

The initiator is responsible for delegation strategy and final user-facing synthesis.

### Delegate vs Direct

Delegate when:
- The task is multi-step and can run independently.
- The task matches a subagent's purpose/capability.
- Parallel execution improves latency or quality.

Do directly when:
- The task is simple/single-step.
- Existing context already contains needed info.
- Delegation overhead is greater than direct execution.

### Required Delegation Sequence

1. `list` (refresh available agents + active delegations)
2. `start` (target by `agentId` or `agentName`)
3. `observe` with `waitSeconds` (intentional polling windows)
4. `continue` or `stop` as needed

### Orchestration Rules

- Do not duplicate work already delegated to an active subagent.
- Reuse active `delegationId` for follow-up (`observe`/`continue`/`stop`).
- Pack delegated tasks with clear objective, constraints, and expected output structure.
- Summarize delegated outcomes back to user with decisions, risks, and next actions.

---

## Subagent / Executor Contract

Subagents execute delegated tasks and report back to initiator.

### Execution Rules

- Stay within assigned scope unless blocked by missing/conflicting input.
- Prefer tool-grounded outputs over speculation.
- Do not orchestrate further delegation unless initiator explicitly asks.

### Required Deliverable Shape

Return sections:
1. Summary
2. Findings
3. Evidence
4. Risks
5. Next Actions

### Escalation Behavior

If blocked or data conflicts:
- State exactly what is missing or conflicting.
- Ask for the minimum clarification needed.
- Provide a best-effort partial result and a concrete next step.

---

## Tool Contract (`delegateToSubagent`)

Supported actions:
- `list`
- `start`
- `observe`
- `continue`
- `stop`

Recommended polling:
- Use `observe.waitSeconds` (for example `30`, `60`, `600`) to avoid tight loops.

---

## Compatibility Mapping

Seline can support Claude-style task options through mapped behavior:

- `run_in_background: true|false`
  - Seline field: `runInBackground`
  - Default behavior is background (`true`).
  - `runInBackground=false` performs `start` then immediate `observe` wait window in one call.

- `resume: "agent_id"`
  - Seline mapping uses delegation identity, not agent identity.
  - Use `resume` as compatibility alias for existing `delegationId` (maps to `continue`).
  - Preferred native form: `continue` with `delegationId`.

- `max_turns: number`
  - Seline field: `maxTurns`.
  - Current behavior is advisory (forwarded into delegated task instructions).
  - Not a strict runtime limiter at delegation transport level.

---

## When NOT to Delegate

Do not delegate for:
- Simple file reads/searches that the current agent can complete immediately.
- One-shot factual lookups with no specialization need.
- Work already in-progress on the same subagent (reuse delegation instead).

---

## Anti-Patterns

- Starting multiple delegations to the same subagent for the same task.
- Polling `observe` in tight loops without `waitSeconds`.
- Treating `agentId` as resumable execution context (use `delegationId`).
- Returning subagent output directly without initiator synthesis.

---

## Lifecycle Summary

1. Initiator discovers targets with `list`
2. Initiator starts task with `start`
3. Subagent executes in dedicated session
4. Initiator tracks via `observe`
5. Initiator refines via `continue` or cancels via `stop`
6. Initiator delivers final integrated response to user
