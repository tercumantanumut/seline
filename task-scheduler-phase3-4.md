task-scheduler-phase3-4

I'll retrieve the full content from the previous plan to understand the complete architecture, then create a focused Phase 3 implementation plan with concise snippets.

Now I have the full context. Let me create a focused Phase 3 implementation plan with concise snippets rather than full code dumps.

---

# Phase 3: Enhancements Implementation Plan (Week 5-6)

## Overview

Phase 3 builds on the core scheduling infrastructure (Phase 1) and UI (Phase 2) to add advanced features that improve usability and reliability.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PHASE 3 ENHANCEMENT AREAS                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ Preset Templates│  │ Context Sources │  │ Delivery Options        │  │
│  │ (2d)            │  │ (3d)            │  │ (3d)                    │  │
│  │ • Linear        │  │ • Linear API    │  │ • Email                 │  │
│  │ • Weekly Digest │  │ • GitHub API    │  │ • Slack                 │  │
│  │ • Code Review   │  │ • Custom APIs   │  │ • Webhook               │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ Pause/Resume    │  │ Bulk Operations │  │ Run Cancellation        │  │
│  │ (1d)            │  │ (1d)            │  │ (1d)                    │  │
│  │ • Temp disable  │  │ • Multi-select  │  │ • In-flight cancel      │  │
│  │ • Resume later  │  │ • Batch toggle  │  │ • Graceful shutdown     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Preset Templates (2 days)

### 1.1 Architecture

Presets are **static template definitions** that pre-fill the schedule form. No new database tables needed.

```
lib/scheduler/presets/
├── index.ts              # Export all presets
├── linear-summary.ts     # Linear daily summary preset
├── weekly-digest.ts      # Weekly progress digest preset
└── code-review.ts        # Code review preset
```

### 1.2 Preset Type Definition

```typescript
// lib/scheduler/presets/types.ts
export interface SchedulePreset {
  id: string;
  name: string;                    // "Daily Linear Summary"
  description: string;             // User-facing description
  icon: string;                    // Lucide icon name
  category: "productivity" | "development" | "communication";
  
  // Pre-filled form values
  defaults: {
    cronExpression: string;        // "0 9 * * 1-5"
    timezone?: string;             // "UTC"
    initialPrompt: string;         // The actual prompt template
    promptVariables?: Record<string, string>;
    suggestedTools?: string[];     // ["linear", "vectorSearch"]
  };
  
  // UI hints
  requiredIntegrations?: string[]; // ["linear"] - show warning if not configured
  estimatedDuration?: string;      // "2-5 minutes"
}
```

### 1.3 Example Preset Implementation

```typescript
// lib/scheduler/presets/linear-summary.ts
export const linearSummaryPreset: SchedulePreset = {
  id: "linear-daily-summary",
  name: "Daily Linear Summary",
  description: "Summarize Linear tickets and status each morning",
  icon: "ListChecks",
  category: "productivity",
  
  defaults: {
    cronExpression: "0 9 * * 1-5",  // 9am weekdays
    initialPrompt: `Analyze Linear tickets updated since {{YESTERDAY}}.

Group by status and highlight:
- 🔴 Blocked items needing attention
- 🟡 In Progress with assignees
- 🟢 Completed yesterday

Include any tickets that seem stalled (no updates in 3+ days).`,
    suggestedTools: ["linear"],
  },
  
  requiredIntegrations: ["linear"],
  estimatedDuration: "2-3 minutes",
};
```

### 1.4 UI Component

```typescript
// components/schedules/preset-selector.tsx (key snippet)
export function PresetSelector({ onSelect }: { onSelect: (preset: SchedulePreset) => void }) {
  const presets = usePresets();
  const { mcpServers } = useMcpSettings(); // Check configured integrations
  
  return (
    <div className="grid grid-cols-2 gap-4">
      {presets.map((preset) => {
        const missingIntegrations = preset.requiredIntegrations?.filter(
          (int) => !mcpServers.some((s) => s.id === int)
        );
        
        return (
          <PresetCard
            key={preset.id}
            preset={preset}
            disabled={missingIntegrations?.length > 0}
            warning={missingIntegrations?.length ? `Requires: ${missingIntegrations.join(", ")}` : undefined}
            onClick={() => onSelect(preset)}
          />
        );
      })}
    </div>
  );
}
```

### 1.5 Locale Additions

```json
{
  "schedules.presets.title": "Quick Start Templates",
  "schedules.presets.useTemplate": "Use Template",
  "schedules.presets.requiresIntegration": "Requires {integration} integration",
  "schedules.presets.estimatedTime": "~{duration}"
}
```

---

## 2. Context Source Injection (3 days)

### 2.1 Architecture

Context sources **fetch external data and inject it into the prompt** before execution. This allows prompts to reference live data without the agent needing to make tool calls.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    CONTEXT SOURCE INJECTION FLOW                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Schedule Config         Context Fetchers          Resolved Prompt    │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐ │
│  │ contextSources: │     │ LinearFetcher   │     │ "Here are the   │ │
│  │ [{              │────▶│ GitHubFetcher   │────▶│  tickets from   │ │
│  │   type: "linear"│     │ APIFetcher      │     │  Linear:        │ │
│  │   config: {...} │     │                 │     │  - PROJ-123..." │ │
│  │ }]              │     └─────────────────┘     └─────────────────┘ │
│  └─────────────────┘                                                  │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 Schema Addition

```typescript
// Add to scheduledTasks table
contextSources: text("context_sources", { mode: "json" }).default("[]"),

// Type definition
interface ContextSource {
  type: "linear" | "github" | "api" | "database";
  config: LinearContextConfig | GitHubContextConfig | APIContextConfig;
  injectAs: "prepend" | "append" | "variable";  // Where to inject
  variableName?: string;  // If injectAs: "variable", use {{VARIABLE_NAME}}
}

interface LinearContextConfig {
  teamId?: string;
  projectIds?: string[];
  statuses?: string[];
  updatedSince?: "{{YESTERDAY}}" | "{{LAST_7_DAYS}}" | string;
  limit?: number;
}

interface GitHubContextConfig {
  owner: string;
  repo: string;
  type: "issues" | "prs" | "commits";
  state?: "open" | "closed" | "all";
  since?: string;
}
```

### 2.3 Context Fetcher Interface

```typescript
// lib/scheduler/context-sources/fetcher.ts
export interface ContextFetcher {
  type: string;
  fetch(config: Record<string, unknown>, userId: string): Promise<string>;
}

export class ContextSourceManager {
  private fetchers: Map<string, ContextFetcher> = new Map();
  
  register(fetcher: ContextFetcher) {
    this.fetchers.set(fetcher.type, fetcher);
  }
  
  async resolveContextSources(
    sources: ContextSource[],
    userId: string
  ): Promise<{ prepend: string; append: string; variables: Record<string, string> }> {
    const result = { prepend: "", append: "", variables: {} };
    
    for (const source of sources) {
      const fetcher = this.fetchers.get(source.type);
      if (!fetcher) continue;
      
      const content = await fetcher.fetch(source.config, userId);
      
      if (source.injectAs === "prepend") {
        result.prepend += `\n\n--- ${source.type.toUpperCase()} CONTEXT ---\n${content}`;
      } else if (source.injectAs === "append") {
        result.append += `\n\n${content}`;
      } else if (source.injectAs === "variable" && source.variableName) {
        result.variables[source.variableName] = content;
      }
    }
    
    return result;
  }
}
```

### 2.4 Linear Fetcher Example

```typescript
// lib/scheduler/context-sources/linear-fetcher.ts
export class LinearContextFetcher implements ContextFetcher {
  type = "linear";
  
  async fetch(config: LinearContextConfig, userId: string): Promise<string> {
    // Get user's Linear MCP server config
    const mcpConfig = await getMcpServerConfig(userId, "linear");
    if (!mcpConfig) throw new Error("Linear not configured");
    
    // Call Linear API via MCP or direct API
    const issues = await this.fetchIssues(mcpConfig, config);
    
    // Format as readable context
    return this.formatIssues(issues, config);
  }
  
  private formatIssues(issues: LinearIssue[], config: LinearContextConfig): string {
    if (issues.length === 0) return "No tickets found matching criteria.";
    
    const grouped = this.groupByStatus(issues);
    let output = `Found ${issues.length} tickets:\n\n`;
    
    for (const [status, items] of Object.entries(grouped)) {
      output += `## ${status}\n`;
      for (const issue of items) {
        output += `- [${issue.identifier}] ${issue.title} (@${issue.assignee?.name || "unassigned"})\n`;
      }
      output += "\n";
    }
    
    return output;
  }
}
```

### 2.5 Integration with Task Executor

```typescript
// In task-queue.ts executeTask method
private async executeTask(task: QueuedTask): Promise<void> {
  // ... existing code ...
  
  // NEW: Resolve context sources before execution
  if (task.contextSources?.length > 0) {
    const contextManager = getContextSourceManager();
    const context = await contextManager.resolveContextSources(
      task.contextSources,
      task.userId
    );
    
    // Inject context into prompt
    let finalPrompt = task.prompt;
    if (context.prepend) {
      finalPrompt = context.prepend + "\n\n" + finalPrompt;
    }
    if (context.append) {
      finalPrompt = finalPrompt + context.append;
    }
    for (const [key, value] of Object.entries(context.variables)) {
      finalPrompt = finalPrompt.replaceAll(`{{${key}}}`, value);
    }
    
    task.prompt = finalPrompt;
  }
  
  // ... continue with chat API call ...
}
```

### 2.6 UI: Context Source Configurator

```typescript
// components/schedules/context-source-editor.tsx (key snippet)
export function ContextSourceEditor({ 
  sources, 
  onChange 
}: { 
  sources: ContextSource[]; 
  onChange: (sources: ContextSource[]) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Label>Context Sources</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Source
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => addSource("linear")}>
              <LinearIcon /> Linear Tickets
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addSource("github")}>
              <GitHubIcon /> GitHub Issues/PRs
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addSource("api")}>
              <Globe /> Custom API
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {sources.map((source, i) => (
        <ContextSourceCard
          key={i}
          source={source}
          onChange={(updated) => updateSource(i, updated)}
          onRemove={() => removeSource(i)}
        />
      ))}
    </div>
  );
}
```

---

## 3. Email/Slack Delivery Options (3 days)

### 3.1 Architecture

Delivery handlers are triggered **after task completion** to send results to external channels.

```
┌──────────────────────────────────────────────────────────────────────┐
│                       DELIVERY FLOW                                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Task Completes         Delivery Router         Delivery Handlers     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐   │
│  │ resultSummary   │───▶│ Check delivery  │───▶│ EmailHandler    │   │
│  │ sessionId       │    │ config          │    │ SlackHandler    │   │
│  │ status          │    │                 │    │ WebhookHandler  │   │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘   │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Schema Addition

```typescript
// Add to scheduledTasks table
deliveryMethod: text("delivery_method", { 
  enum: ["session", "email", "slack", "webhook"] 
}).default("session"),
deliveryConfig: text("delivery_config", { mode: "json" }).default("{}"),

// Type definitions
interface EmailDeliveryConfig {
  recipients: string[];           // ["user@example.com"]
  subject?: string;               // "Daily Summary - {{TODAY}}"
  includeFullTranscript: boolean; // Include full chat or just summary
}

interface SlackDeliveryConfig {
  webhookUrl?: string;            // Direct webhook
  channelId?: string;             // Or channel via Slack app
  mentionUsers?: string[];        // ["U123ABC"]
}

interface WebhookDeliveryConfig {
  url: string;
  method: "POST" | "PUT";
  headers?: Record<string, string>;
  includeMetadata: boolean;
}
```

### 3.3 Delivery Handler Interface

```typescript
// lib/scheduler/delivery/handler.ts
export interface DeliveryHandler {
  type: string;
  deliver(payload: DeliveryPayload): Promise<void>;
}

export interface DeliveryPayload {
  taskId: string;
  taskName: string;
  runId: string;
  status: "succeeded" | "failed";
  summary?: string;
  sessionId?: string;
  sessionUrl?: string;
  error?: string;
  durationMs?: number;
  metadata: Record<string, unknown>;
}

export class DeliveryRouter {
  private handlers: Map<string, DeliveryHandler> = new Map();
  
  async deliver(
    method: string,
    config: Record<string, unknown>,
    payload: DeliveryPayload
  ): Promise<void> {
    const handler = this.handlers.get(method);
    if (!handler || method === "session") return; // session = no external delivery
    
    try {
      await handler.deliver({ ...payload, ...config });
    } catch (error) {
      console.error(`[Delivery] ${method} failed:`, error);
      // Don't fail the task, just log the delivery failure
    }
  }
}
```

### 3.4 Email Handler

```typescript
// lib/scheduler/delivery/email-handler.ts
import { Resend } from "resend"; // or nodemailer, sendgrid, etc.

export class EmailDeliveryHandler implements DeliveryHandler {
  type = "email";
  private resend: Resend;
  
  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }
  
  async deliver(payload: DeliveryPayload & EmailDeliveryConfig): Promise<void> {
    const subject = this.resolveVariables(
      payload.subject || `[Seline] ${payload.taskName} - ${payload.status}`,
      payload
    );
    
    await this.resend.emails.send({
      from: "Seline <notifications@seline.app>",
      to: payload.recipients,
      subject,
      html: this.buildEmailHtml(payload),
    });
  }
  
  private buildEmailHtml(payload: DeliveryPayload): string {
    const statusEmoji = payload.status === "succeeded" ? "✅" : "❌";
    const sessionLink = payload.sessionUrl 
      ? `<a href="${payload.sessionUrl}">View full conversation</a>` 
      : "";
    
    return `
      <h2>${statusEmoji} ${payload.taskName}</h2>
      <p><strong>Status:</strong> ${payload.status}</p>
      <p><strong>Duration:</strong> ${Math.round((payload.durationMs || 0) / 1000)}s</p>
      
      <h3>Summary</h3>
      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px;">
        ${payload.summary || "No summary available"}
      </div>
      
      <p>${sessionLink}</p>
    `;
  }
}
```

### 3.5 Slack Handler

```typescript
// lib/scheduler/delivery/slack-handler.ts
export class SlackDeliveryHandler implements DeliveryHandler {
  type = "slack";
  
  async deliver(payload: DeliveryPayload & SlackDeliveryConfig): Promise<void> {
    const webhookUrl = payload.webhookUrl;
    if (!webhookUrl) throw new Error("Slack webhook URL required");
    
    const blocks = this.buildSlackBlocks(payload);
    
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
  }
  
  private buildSlackBlocks(payload: DeliveryPayload): SlackBlock[] {
    const statusEmoji = payload.status === "succeeded" ? ":white_check_mark:" : ":x:";
    
    return [
      {
        type: "header",
        text: { type: "plain_text", text: `${statusEmoji} ${payload.taskName}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Status:*\n${payload.status}` },
          { type: "mrkdwn", text: `*Duration:*\n${Math.round((payload.durationMs || 0) / 1000)}s` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: payload.summary || "_No summary_" },
      },
      payload.sessionUrl && {
        type: "actions",
        elements: [{
          type: "button",
          text: { type: "plain_text", text: "View Conversation" },
          url: payload.sessionUrl,
        }],
      },
    ].filter(Boolean);
  }
}
```

### 3.6 Integration with Task Executor

```typescript
// In task-queue.ts, after successful completion
private async executeTask(task: QueuedTask): Promise<void> {
  // ... execution code ...
  
  // After success or failure, trigger delivery
  const deliveryRouter = getDeliveryRouter();
  const taskConfig = await getTaskConfig(task.taskId);
  
  await deliveryRouter.deliver(
    taskConfig.deliveryMethod,
    taskConfig.deliveryConfig,
    {
      taskId: task.taskId,
      taskName: taskConfig.name,
      runId: task.runId,
      status: success ? "succeeded" : "failed",
      summary: result?.summary,
      sessionId: result?.sessionId,
      sessionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/chat/${result?.sessionId}`,
      error: errorMessage,
      durationMs,
      metadata: {},
    }
  );
}
```

### 3.7 UI: Delivery Configuration

```typescript
// components/schedules/delivery-config.tsx (key snippet)
export function DeliveryConfig({ 
  method, 
  config, 
  onChange 
}: DeliveryConfigProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Deliver Results To</Label>
        <Select value={method} onValueChange={(v) => onChange(v, config)}>
          <SelectItem value="session">Chat Session Only</SelectItem>
          <SelectItem value="email">Email</SelectItem>
          <SelectItem value="slack">Slack</SelectItem>
          <SelectItem value="webhook">Webhook</SelectItem>
        </Select>
      </div>
      
      {method === "email" && (
        <EmailConfigForm config={config} onChange={(c) => onChange(method, c)} />
      )}
      {method === "slack" && (
        <SlackConfigForm config={config} onChange={(c) => onChange(method, c)} />
      )}
      {method === "webhook" && (
        <WebhookConfigForm config={config} onChange={(c) => onChange(method, c)} />
      )}
    </div>
  );
}
```

---

## 4. Schedule Pause/Resume (1 day)

### 4.1 Schema

Already supported via `enabled` field. Add `pausedAt` and `pausedUntil` for temporary pauses:

```typescript
// Add to scheduledTasks table
pausedAt: text("paused_at"),        // When was it paused
pausedUntil: text("paused_until"),  // Auto-resume at this time (optional)
pauseReason: text("pause_reason"),  // "vacation", "maintenance", etc.
```

### 4.2 API Endpoints

```typescript
// app/api/schedules/[id]/pause/route.ts
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { until, reason } = await req.json();
  
  await db.update(scheduledTasks)
    .set({
      enabled: false,
      pausedAt: new Date().toISOString(),
      pausedUntil: until || null,
      pauseReason: reason || null,
    })
    .where(eq(scheduledTasks.id, params.id));
  
  await getScheduler().reloadSchedule(params.id);
  
  return NextResponse.json({ success: true });
}

// app/api/schedules/[id]/resume/route.ts
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await db.update(scheduledTasks)
    .set({
      enabled: true,
      pausedAt: null,
      pausedUntil: null,
      pauseReason: null,
    })
    .where(eq(scheduledTasks.id, params.id));
  
  await getScheduler().reloadSchedule(params.id);
  
  return NextResponse.json({ success: true });
}
```

### 4.3 Auto-Resume Logic

```typescript
// In scheduler-service.ts checkAndQueueDueTasks
private async checkPausedSchedules(): Promise<void> {
  const now = new Date().toISOString();
  
  // Find schedules that should auto-resume
  const toResume = await db.query.scheduledTasks.findMany({
    where: and(
      eq(scheduledTasks.enabled, false),
      isNotNull(scheduledTasks.pausedUntil),
      lte(scheduledTasks.pausedUntil, now)
    ),
  });
  
  for (const task of toResume) {
    await this.resumeSchedule(task.id);
    console.log(`[Scheduler] Auto-resumed "${task.name}"`);
  }
}
```

### 4.4 UI Component

```typescript
// components/schedules/pause-dialog.tsx (key snippet)
export function PauseDialog({ scheduleId, onPaused }: PauseDialogProps) {
  const [pauseUntil, setPauseUntil] = useState<Date | null>(null);
  const [reason, setReason] = useState("");
  
  const handlePause = async () => {
    await fetch(`/api/schedules/${scheduleId}/pause`, {
      method: "POST",
      body: JSON.stringify({ until: pauseUntil?.toISOString(), reason }),
    });
    onPaused();
  };
  
  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pause Schedule</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label>Resume automatically on</Label>
            <DatePicker value={pauseUntil} onChange={setPauseUntil} />
            <p className="text-sm text-muted-foreground">
              Leave empty to pause indefinitely
            </p>
          </div>
          
          <div>
            <Label>Reason (optional)</Label>
            <Input 
              placeholder="e.g., On vacation" 
              value={reason} 
              onChange={(e) => setReason(e.target.value)} 
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handlePause}>Pause Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 5. Bulk Operations (1 day)

### 5.1 API Endpoint

```typescript
// app/api/schedules/bulk/route.ts
export async function POST(req: NextRequest) {
  const userId = await requireAuth(req);
  const { action, scheduleIds } = await req.json();
  
  // Validate ownership
  const schedules = await db.query.scheduledTasks.findMany({
    where: and(
      inArray(scheduledTasks.id, scheduleIds),
      eq(scheduledTasks.userId, userId)
    ),
  });
  
  if (schedules.length !== scheduleIds.length) {
    return NextResponse.json({ error: "Invalid schedule IDs" }, { status: 400 });
  }
  
  switch (action) {
    case "enable":
      await db.update(scheduledTasks)
        .set({ enabled: true, pausedAt: null })
        .where(inArray(scheduledTasks.id, scheduleIds));
      break;
      
    case "disable":
      await db.update(scheduledTasks)
        .set({ enabled: false, pausedAt: new Date().toISOString() })
        .where(inArray(scheduledTasks.id, scheduleIds));
      break;
      
    case "delete":
      await db.delete(scheduledTasks)
        .where(inArray(scheduledTasks.id, scheduleIds));
      break;
      
    case "trigger":
      for (const id of scheduleIds) {
        await getScheduler().triggerTask(id);
      }
      break;
  }
  
  // Reload all affected schedules
  for (const id of scheduleIds) {
    await getScheduler().reloadSchedule(id);
  }
  
  return NextResponse.json({ success: true, affected: scheduleIds.length });
}
```

### 5.2 UI: Multi-Select List

```typescript
// components/schedules/schedule-list.tsx (key snippet)
export function ScheduleList({ schedules }: { schedules: ScheduledTask[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  
  const handleBulkAction = async (action: string) => {
    await fetch("/api/schedules/bulk", {
      method: "POST",
      body: JSON.stringify({ action, scheduleIds: Array.from(selected) }),
    });
    setSelected(new Set());
    router.refresh();
  };
  
  return (
    <div>
      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded-lg mb-4">
          <span className="text-sm">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => handleBulkAction("enable")}>
            Enable All
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkAction("disable")}>
            Disable All
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkAction("trigger")}>
            Run All Now
          </Button>
          <Button size="sm" variant="destructive" onClick={() => handleBulkAction("delete")}>
            Delete
          </Button>
        </div>
      )}
      
      <div className="space-y-2">
        {schedules.map((schedule) => (
          <ScheduleCard
            key={schedule.id}
            schedule={schedule}
            selected={selected.has(schedule.id)}
            onSelect={(checked) => toggleSelection(schedule.id, checked)}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## 6. Run Cancellation (1 day)

### 6.1 Architecture

Cancellation requires:
1. **Tracking in-flight tasks** with AbortControllers
2. **API endpoint** to request cancellation
3. **Graceful cleanup** of partial results

### 6.2 Task Queue Modification

```typescript
// lib/scheduler/task-queue.ts (additions)
export class TaskQueue {
  private abortControllers: Map<string, AbortController> = new Map();
  
  /**
   * Cancel a running or queued task
   */
  async cancel(runId: string): Promise<boolean> {
    // Check if queued (not yet started)
    const queueIndex = this.queue.findIndex((t) => t.runId === runId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
      await this.updateRunStatus(runId, "cancelled");
      return true;
    }
    
    // Check if running
    const controller = this.abortControllers.get(runId);
    if (controller) {
      controller.abort();
      await this.updateRunStatus(runId, "cancelled");
      return true;
    }
    
    return false;
  }
  
  private async executeTask(task: QueuedTask): Promise<void> {
    // Create abort controller for this task
    const controller = new AbortController();
    this.abortControllers.set(task.runId, controller);
    
    try {
      // Pass signal to chat API call
      const response = await fetch(`${APP_URL}/api/chat`, {
        // ... existing options ...
        signal: controller.signal,
      });
      
      // ... rest of execution ...
      
    } catch (error) {
      if (error.name === "AbortError") {
        console.log(`[TaskQueue] Task ${task.runId} was cancelled`);
        return; // Status already updated by cancel()
      }
      throw error;
    } finally {
      this.abortControllers.delete(task.runId);
    }
  }
}
```

### 6.3 API Endpoint

```typescript
// app/api/schedules/runs/[runId]/cancel/route.ts
export async function POST(
  req: NextRequest,
  { params }: { params: { runId: string } }
) {
  const userId = await requireAuth(req);
  
  // Verify ownership
  const run = await db.query.scheduledTaskRuns.findFirst({
    where: eq(scheduledTaskRuns.id, params.runId),
    with: { task: true },
  });
  
  if (!run || run.task.userId !== userId) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  
  if (!["pending", "queued", "running"].includes(run.status)) {
    return NextResponse.json({ error: "Run cannot be cancelled" }, { status: 400 });
  }
  
  const cancelled = await getTaskQueue().cancel(params.runId);
  
  return NextResponse.json({ 
    success: cancelled,
    message: cancelled ? "Run cancelled" : "Run could not be cancelled",
  });
}
```

### 6.4 UI: Cancel Button

```typescript
// components/schedules/run-status.tsx (key snippet)
export function RunStatus({ run }: { run: ScheduledTaskRun }) {
  const canCancel = ["pending", "queued", "running"].includes(run.status);
  
  const handleCancel = async () => {
    if (!confirm("Cancel this run?")) return;
    
    await fetch(`/api/schedules/runs/${run.id}/cancel`, { method: "POST" });
    router.refresh();
  };
  
  return (
    <div className="flex items-center gap-2">
      <StatusBadge status={run.status} />
      
      {canCancel && (
        <Button size="sm" variant="ghost" onClick={handleCancel}>
          <XCircle className="h-4 w-4" />
          Cancel
        </Button>
      )}
    </div>
  );
}
```

---

## 7. Testing Strategy for Phase 3

### 7.1 Unit Tests

```typescript
// Presets
describe("SchedulePresets", () => {
  it("all presets have required fields", () => {
    for (const preset of getAllPresets()) {
      expect(preset.id).toBeDefined();
      expect(preset.defaults.initialPrompt).toBeDefined();
      expect(preset.defaults.cronExpression).toMatch(/^[\d\s\*\-\/,]+$/);
    }
  });
});

// Context Sources
describe("ContextSourceManager", () => {
  it("resolves Linear context correctly", async () => {
    const result = await manager.resolveContextSources([
      { type: "linear", config: { limit: 5 }, injectAs: "prepend" }
    ], userId);
    
    expect(result.prepend).toContain("LINEAR CONTEXT");
  });
});

// Delivery
describe("EmailDeliveryHandler", () => {
  it("sends email with correct format", async () => {
    const mockSend = jest.spyOn(resend.emails, "send");
    
    await handler.deliver({
      taskName: "Test",
      status: "succeeded",
      recipients: ["test@example.com"],
    });
    
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["test@example.com"] })
    );
  });
});

// Cancellation
describe("TaskQueue.cancel", () => {
  it("removes queued task", async () => {
    queue.enqueue(task);
    const cancelled = await queue.cancel(task.runId);
    expect(cancelled).toBe(true);
    expect(queue.size).toBe(0);
  });
  
  it("aborts running task", async () => {
    // Start task execution
    const executePromise = queue.executeTask(task);
    
    // Cancel mid-execution
    await queue.cancel(task.runId);
    
    // Verify aborted
    const run = await getRun(task.runId);
    expect(run.status).toBe("cancelled");
  });
});
```

### 7.2 Integration Tests

```typescript
describe("POST /api/schedules/bulk", () => {
  it("enables multiple schedules", async () => {
    const ids = [schedule1.id, schedule2.id];
    
    const response = await fetch("/api/schedules/bulk", {
      method: "POST",
      body: JSON.stringify({ action: "enable", scheduleIds: ids }),
    });
    
    expect(response.status).toBe(200);
    
    const updated = await getSchedules(ids);
    expect(updated.every((s) => s.enabled)).toBe(true);
  });
});

describe("POST /api/schedules/[id]/pause", () => {
  it("pauses with auto-resume date", async () => {
    const resumeAt = new Date(Date.now() + 86400000); // Tomorrow
    
    await fetch(`/api/schedules/${schedule.id}/pause`, {
      method: "POST",
      body: JSON.stringify({ until: resumeAt.toISOString() }),
    });
    
    const updated = await getSchedule(schedule.id);
    expect(updated.enabled).toBe(false);
    expect(updated.pausedUntil).toBe(resumeAt.toISOString());
  });
});
```

---

## 8. Summary: Phase 3 Deliverables

| Feature | Files to Create/Modify | Effort |
|---------|------------------------|--------|
| **Preset Templates** | `lib/scheduler/presets/*`, `components/schedules/preset-selector.tsx` | 2d |
| **Context Sources** | `lib/scheduler/context-sources/*`, `components/schedules/context-source-editor.tsx` | 3d |
| **Email/Slack Delivery** | `lib/scheduler/delivery/*`, `components/schedules/delivery-config.tsx` | 3d |
| **Pause/Resume** | API routes, `components/schedules/pause-dialog.tsx` | 1d |
| **Bulk Operations** | `app/api/schedules/bulk/route.ts`, update list component | 1d |
| **Run Cancellation** | Task queue modifications, API route, UI button | 1d |

**Total: 11 days** (as specified in the original plan)

---

## 9. Open Questions for Phase 3

| Question | Options | Recommendation |
|----------|---------|----------------|
| **Context source rate limits?** | A) Per-source limits, B) Global limit, C) User-configurable | **A** - Different APIs have different limits |
| **Email provider?** | A) Resend, B) SendGrid, C) AWS SES, D) Configurable | **D** - Abstract behind interface, default to Resend |
| **Slack: Webhook vs App?** | A) Webhook only, B) Slack App, C) Both | **A initially** - Webhooks are simpler, add App later |
| **Preset customization?** | A) Use as-is only, B) Allow editing after selection | **B** - Presets should be starting points |