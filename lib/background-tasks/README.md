# Unified Task Event System

## Overview

All task lifecycle events flow through `TaskRegistry` and are streamed to clients via
`/api/tasks/events`. This avoids split event systems and keeps the active task view
and notifications consistent.

## Event Flow

```
Task Execution -> taskRegistry -> /api/tasks/events (SSE) -> Client
                   |
                   +-> task:started / task:progress / task:completed
```

## Event Types

- `task:started`: emitted by `taskRegistry.register()`
- `task:progress`: emitted by `taskRegistry.emitProgress()`
- `task:completed`: emitted by `taskRegistry.updateStatus()` when status is terminal

## Client Connection

Clients should connect to `/api/tasks/events` for all task updates.
`/api/schedules/events` forwards the same registry events for legacy consumers.

## Migration Note

The legacy scheduler event emitter (`lib/scheduler/task-events.ts`) is deprecated.
All new task lifecycle events should use `taskRegistry`.
