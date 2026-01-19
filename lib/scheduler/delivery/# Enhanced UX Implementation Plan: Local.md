# Enhanced UX Implementation Plan: Local Timezone & Task Visibility

## Executive Summary

This plan addresses two critical UX gaps in the scheduled task system:
1. **Timezone friction** - Users must manually find their timezone instead of auto-detecting
2. **Task invisibility** - Users have no awareness when scheduled tasks execute during active sessions

Both enhancements focus on **reducing cognitive load** and **increasing system transparency**.

---

## 1. Local Timezone Detection & Selection

### 1.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LOCAL TIMEZONE DETECTION FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Browser/Device              Timezone Selector              Task Executor    │
│  ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐  │
│  │ Intl.DateTime   │        │ Dropdown with   │        │ Resolve "local" │  │
│  │ Format()        │───────▶│ "Local Time     │───────▶│ at execution    │  │
│  │ .resolvedOptions│        │ (Europe/Istanbul│        │ time using      │  │
│  │ .timeZone       │        │ detected)"      │        │ stored fallback │  │
│  │                 │        │ at TOP          │        │                 │  │
│  └─────────────────┘        └─────────────────┘        └─────────────────┘  │
│         │                          │                          │             │
│         │                          ▼                          │             │
│         │                   ┌─────────────────┐               │             │
│         │                   │ Stored value:   │               │             │
│         │                   │ "local" OR      │◀──────────────┘             │
│         │                   │ explicit tz     │                             │
│         │                   └─────────────────┘                             │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  IMPORTANT: Store BOTH "local" flag AND detected timezone           │    │
│  │  This handles: server-side execution, user device changes           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Model Changes

**Current schema stores:**
```typescript
timezone: text("timezone").default("UTC").notNull()
```

**Enhanced approach - NO schema change needed:**
```typescript
// Store "local::Europe/Istanbul" format
// This preserves:
// 1. The fact user chose "local" (for UI display)
// 2. The detected timezone at save time (for server execution)

// Examples:
// "local::America/New_York" - User chose local, detected as NY
// "Europe/London"           - User explicitly chose London
// "UTC"                     - User explicitly chose UTC
```

**Why this format?**
- Server-side execution needs a concrete timezone (can't call browser API)
- If user travels/changes device, we have a fallback
- UI can still show "Local Time" if value starts with `local::`
- Zero database migration required

### 1.3 Implementation Components

#### A. Timezone Detection Hook

**File:** `lib/hooks/use-local-timezone.ts` (new)

```typescript
/**
 * Hook to detect and cache local timezone
 * 
 * Key behaviors:
 * - Detects on mount using Intl API
 * - Caches in state to avoid repeated calls
 * - Returns null during SSR (no window)
 * - Provides formatted display string
 */

export function useLocalTimezone() {
  const [timezone, setTimezone] = useState<string | null>(null);
  
  useEffect(() => {
    // Only runs client-side
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(detected);
  }, []);
  
  return {
    timezone,                    // "Europe/Istanbul"
    isDetected: timezone !== null,
    displayName: timezone ? formatTimezoneDisplay(timezone) : null,
    // "Istanbul (GMT+3)"
  };
}

// Helper to format timezone for display
function formatTimezoneDisplay(tz: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: tz,
    timeZoneName: "shortOffset"  // "GMT+3"
  });
  
  const parts = formatter.formatToParts(now);
  const offset = parts.find(p => p.type === "timeZoneName")?.value || "";
  const city = tz.split("/").pop()?.replace(/_/g, " ") || tz;
  
  return `${city} (${offset})`;  // "Istanbul (GMT+3)"
}
```

#### B. Timezone Selector Enhancement

**File:** Existing timezone selector component (likely in schedule form)

**Changes needed:**

```typescript
/**
 * Enhanced timezone selector with local detection
 * 
 * Structure:
 * ┌─────────────────────────────────────┐
 * │ 🌍 Local Time (Istanbul, GMT+3)    │  ← NEW: Detected option
 * │    Detected from your device        │
 * ├─────────────────────────────────────┤
 * │ Common Timezones                    │  ← Existing section
 * │   UTC                               │
 * │   America/New_York                  │
 * │   Europe/London                     │
 * ├─────────────────────────────────────┤
 * │ All Timezones                       │  ← Existing section
 * │   ...                               │
 * └─────────────────────────────────────┘
 */

interface TimezoneOption {
  value: string;           // "local::Europe/Istanbul" or "America/New_York"
  label: string;           // "Local Time (Istanbul, GMT+3)"
  sublabel?: string;       // "Detected from your device"
  isLocal?: boolean;       // For styling
}

function TimezoneSelector({ value, onChange }: Props) {
  const { timezone: localTz, displayName } = useLocalTimezone();
  const { t } = useTranslation();
  
  // Build options list with local at top
  const options = useMemo(() => {
    const opts: TimezoneOption[] = [];
    
    // Add local option if detected
    if (localTz) {
      opts.push({
        value: `local::${localTz}`,
        label: t("scheduledTasks.form.timezoneLocal", { timezone: displayName }),
        sublabel: t("scheduledTasks.form.timezoneDetected"),
        isLocal: true,
      });
    }
    
    // Add separator + common timezones
    opts.push(...COMMON_TIMEZONES);
    
    // Add all timezones
    opts.push(...ALL_TIMEZONES);
    
    return opts;
  }, [localTz, displayName, t]);
  
  // Parse current value to check if it's local
  const isCurrentLocal = value?.startsWith("local::");
  const displayValue = isCurrentLocal 
    ? `local::${localTz}` // Update to current local if device changed
    : value;
  
  return (
    <Select value={displayValue} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue>
          {isCurrentLocal && <Globe className="w-4 h-4 mr-2 text-blue-500" />}
          {getDisplayLabel(displayValue, options)}
        </SelectValue>
      </SelectTrigger>
      
      <SelectContent>
        {options.map((opt, idx) => (
          <Fragment key={opt.value}>
            {/* Add separator after local option */}
            {idx === 1 && localTz && <SelectSeparator />}
            
            <SelectItem value={opt.value} className={opt.isLocal ? "bg-blue-50" : ""}>
              <div className="flex flex-col">
                <span className="flex items-center gap-2">
                  {opt.isLocal && <Globe className="w-4 h-4 text-blue-500" />}
                  {opt.label}
                </span>
                {opt.sublabel && (
                  <span className="text-xs text-muted-foreground">
                    {opt.sublabel}
                  </span>
                )}
              </div>
            </SelectItem>
          </Fragment>
        ))}
      </SelectContent>
    </Select>
  );
}
```

#### C. Task Executor Timezone Resolution

**File:** `lib/scheduler/task-executor.ts`

**Changes needed:**

```typescript
/**
 * Resolve timezone value before scheduling
 * 
 * Handles:
 * - "local::America/New_York" → "America/New_York"
 * - "Europe/London" → "Europe/London" (passthrough)
 * - "UTC" → "UTC" (passthrough)
 */

function resolveTimezone(storedValue: string): string {
  if (storedValue.startsWith("local::")) {
    // Extract the concrete timezone stored at save time
    return storedValue.replace("local::", "");
  }
  return storedValue;
}

// In schedule execution:
async function scheduleTask(task: ScheduledTask) {
  const concreteTimezone = resolveTimezone(task.timezone);
  
  // Use concrete timezone for cron scheduling
  const cronJob = new CronJob(
    task.cronExpression,
    () => executeTask(task),
    null,
    true,
    concreteTimezone  // "America/New_York", not "local::..."
  );
}
```

### 1.4 Locale Additions

**File:** `locales/en.json`

```json
{
  "scheduledTasks": {
    "form": {
      "timezone": "Timezone",
      "timezoneLocal": "Local Time ({{timezone}})",
      "timezoneDetected": "Detected from your device",
      "timezoneLocalNote": "Task will run at this time in your current timezone",
      "timezoneExplicitNote": "Task will always run in {{timezone}}, regardless of your location"
    }
  }
}
```

**File:** `locales/tr.json`

```json
{
  "scheduledTasks": {
    "form": {
      "timezone": "Saat Dilimi",
      "timezoneLocal": "Yerel Saat ({{timezone}})",
      "timezoneDetected": "Cihazınızdan algılandı",
      "timezoneLocalNote": "Görev mevcut saat diliminizde bu saatte çalışacak",
      "timezoneExplicitNote": "Görev konumunuzdan bağımsız olarak her zaman {{timezone}} saatinde çalışacak"
    }
  }
}
```

### 1.5 Edge Cases & Handling

| Scenario | Handling |
|----------|----------|
| **SSR/Server render** | Hook returns `null`, show loading state or hide local option |
| **User travels to new timezone** | Stored `local::OldTZ` still executes at OldTZ time; user can re-save to update |
| **Browser doesn't support Intl** | Fallback to not showing local option (very rare - 99%+ support) |
| **Invalid timezone stored** | Executor falls back to UTC with warning log |
| **User wants explicit TZ** | They select from list instead of "Local Time" option |

### 1.6 Visual Design

```
┌─────────────────────────────────────────────────────────────────┐
│ Timezone                                                        │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🌍 Local Time (Istanbul, GMT+3)                          ▼ │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ 🌍 Local Time (Istanbul, GMT+3)               ✓        │ │ │
│ │ │    Detected from your device                           │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ │ ─────────────────────────────────────────────────────────── │ │
│ │   UTC (GMT+0)                                              │ │
│ │   New York (GMT-5)                                         │ │
│ │   London (GMT+0)                                           │ │
│ │   Tokyo (GMT+9)                                            │ │
│ │ ─────────────────────────────────────────────────────────── │ │
│ │   All Timezones...                                         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ℹ️ Task will run at 9:00 AM in your current timezone            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Task Visibility & Navigation from Chat

### 2.1 Architecture Decision: Global Toast vs Embedded UI

**Recommendation: Hybrid Approach - Global Toast with Persistent Indicator**

| Approach | Pros | Cons |
|----------|------|------|
| **Global Toast Only** | Non-intrusive, familiar pattern | Disappears, easy to miss |
| **Embedded in Chat** | Always visible, contextual | Clutters chat UI, complex |
| **Hybrid (Recommended)** | Best of both - notification + persistent access | Slightly more complex |

**Hybrid approach:**
1. **Toast notification** when task starts (attention-grabbing, dismissible)
2. **Persistent indicator** in header/sidebar showing active tasks (always accessible)
3. **Deep link navigation** to scheduled tasks tab with highlight

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TASK VISIBILITY ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        CHAT SESSION VIEW                            │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │ Header                                    [🔔 2 tasks] [...] │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  │                              │                                      │    │
│  │                              ▼                                      │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │              TOAST (appears on task start)                   │   │    │
│  │  │  ┌───────────────────────────────────────────────────────┐  │   │    │
│  │  │  │ ⏰ Scheduled task "Daily Linear Summary" is running    │  │   │    │
│  │  │  │                                        [View Task →]   │  │   │    │
│  │  │  └───────────────────────────────────────────────────────┘  │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                     │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │                     Chat Messages                            │   │    │
│  │  │  ...                                                         │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│                              │ Click "View Task"                             │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    SCHEDULED TASKS TAB                              │    │
│  │  URL: /scheduled-tasks?highlight=task_123&expandHistory=true        │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │ Daily Linear Summary                          [highlighted] │   │    │
│  │  │ ┌─────────────────────────────────────────────────────────┐ │   │    │
│  │  │ │ Execution History (auto-expanded)                       │ │   │    │
│  │  │ │ • 9:00 AM - Running... ← auto-scrolled here             │ │   │    │
│  │  │ │ • Yesterday 9:00 AM - Succeeded                         │ │   │    │
│  │  │ └─────────────────────────────────────────────────────────┘ │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow for Task Notifications

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NOTIFICATION DATA FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Task Executor                 Event System                  UI Layer        │
│  ┌─────────────────┐          ┌─────────────────┐          ┌─────────────┐  │
│  │ 1. Task starts  │          │ 2. Broadcast    │          │ 3. Receive  │  │
│  │    execution    │─────────▶│    event via    │─────────▶│    & show   │  │
│  │                 │          │    EventEmitter │          │    toast    │  │
│  │ Creates:        │          │    or WebSocket │          │             │  │
│  │ - agentRun      │          │                 │          │ Update:     │  │
│  │ - sessionId     │          │ Event payload:  │          │ - Toast     │  │
│  │                 │          │ {taskId, name,  │          │ - Header    │  │
│  │                 │          │  status, runId} │          │   indicator │  │
│  └─────────────────┘          └─────────────────┘          └─────────────┘  │
│                                                                              │
│  Key distinction from manual runs:                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ agentRun.triggerType = "cron"  ← This identifies scheduled runs     │    │
│  │ agentRun.triggerType = "user"  ← This identifies manual runs        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Implementation Components

#### A. Task Event Emitter (Server-Side)

**File:** `lib/scheduler/task-events.ts` (new)

```typescript
/**
 * Event emitter for scheduled task lifecycle events
 * 
 * Events:
 * - task:started   - Task execution began
 * - task:completed - Task finished (success or failure)
 * - task:progress  - Optional progress updates
 * 
 * Consumers:
 * - WebSocket broadcaster (for real-time UI updates)
 * - Notification service (for toast triggers)
 */

import { EventEmitter } from "events";

export interface TaskEvent {
  type: "started" | "completed" | "progress";
  taskId: string;
  taskName: string;
  runId: string;
  userId: string;
  status: "running" | "succeeded" | "failed";
  sessionId?: string;      // The chat session created for this run
  startedAt: string;
  completedAt?: string;
  error?: string;
}

class TaskEventEmitter extends EventEmitter {
  emitTaskStarted(event: Omit<TaskEvent, "type">) {
    this.emit("task:started", { ...event, type: "started" });
    this.emit(`task:started:${event.userId}`, { ...event, type: "started" });
  }
  
  emitTaskCompleted(event: Omit<TaskEvent, "type">) {
    this.emit("task:completed", { ...event, type: "completed" });
    this.emit(`task:completed:${event.userId}`, { ...event, type: "completed" });
  }
}

export const taskEvents = new TaskEventEmitter();
```

#### B. Active Tasks Store (Client-Side)

**File:** `lib/stores/active-tasks-store.ts` (new)

```typescript
/**
 * Zustand store for tracking active scheduled tasks
 * 
 * Persists across components without prop drilling
 * Updates via WebSocket or polling
 */

import { create } from "zustand";

interface ActiveTask {
  taskId: string;
  taskName: string;
  runId: string;
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  sessionId?: string;
}

interface ActiveTasksStore {
  tasks: ActiveTask[];
  addTask: (task: ActiveTask) => void;
  updateTask: (runId: string, updates: Partial<ActiveTask>) => void;
  removeTask: (runId: string) => void;
  getRunningCount: () => number;
}

export const useActiveTasksStore = create<ActiveTasksStore>((set, get) => ({
  tasks: [],
  
  addTask: (task) => set((state) => ({
    tasks: [...state.tasks.filter(t => t.runId !== task.runId), task]
  })),
  
  updateTask: (runId, updates) => set((state) => ({
    tasks: state.tasks.map(t => 
      t.runId === runId ? { ...t, ...updates } : t
    )
  })),
  
  removeTask: (runId) => set((state) => ({
    tasks: state.tasks.filter(t => t.runId !== runId)
  })),
  
  getRunningCount: () => get().tasks.filter(t => t.status === "running").length,
}));
```

#### C. Task Notification Hook

**File:** `lib/hooks/use-task-notifications.ts` (new)

```typescript
/**
 * Hook to subscribe to task events and show notifications
 * 
 * Should be mounted at app root level (layout)
 * Uses toast system for notifications
 */

import { useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { useActiveTasksStore } from "@/lib/stores/active-tasks-store";
import { useTranslation } from "next-i18next";

export function useTaskNotifications() {
  const { toast } = useToast();
  const router = useRouter();
  const { t } = useTranslation();
  const { addTask, updateTask } = useActiveTasksStore();
  
  useEffect(() => {
    // Subscribe to task events (via WebSocket or SSE)
    const eventSource = new EventSource("/api/schedules/events");
    
    eventSource.addEventListener("task:started", (event) => {
      const data = JSON.parse(event.data) as TaskEvent;
      
      // Update store
      addTask({
        taskId: data.taskId,
        taskName: data.taskName,
        runId: data.runId,
        status: "running",
        startedAt: data.startedAt,
        sessionId: data.sessionId,
      });
      
      // Show toast
      toast({
        title: t("scheduledTasks.notifications.taskRunning", { 
          taskName: data.taskName 
        }),
        description: t("scheduledTasks.notifications.taskStartedAt", {
          time: formatTime(data.startedAt)
        }),
        action: (
          <ToastAction
            altText={t("scheduledTasks.notifications.viewTask")}
            onClick={() => navigateToTask(data.taskId, data.runId)}
          >
            {t("scheduledTasks.notifications.viewTask")} →
          </ToastAction>
        ),
        duration: 10000, // 10 seconds - longer than default
      });
    });
    
    eventSource.addEventListener("task:completed", (event) => {
      const data = JSON.parse(event.data) as TaskEvent;
      
      updateTask(data.runId, { 
        status: data.status as "succeeded" | "failed" 
      });
      
      // Optional: Show completion toast for failures
      if (data.status === "failed") {
        toast({
          title: t("scheduledTasks.notifications.taskFailed", {
            taskName: data.taskName
          }),
          variant: "destructive",
          action: (
            <ToastAction onClick={() => navigateToTask(data.taskId, data.runId)}>
              {t("scheduledTasks.notifications.viewDetails")}
            </ToastAction>
          ),
        });
      }
    });
    
    return () => eventSource.close();
  }, []);
  
  function navigateToTask(taskId: string, runId: string) {
    router.push(`/scheduled-tasks?highlight=${taskId}&run=${runId}&expandHistory=true`);
  }
}
```

#### D. Header Active Tasks Indicator

**File:** `components/layout/active-tasks-indicator.tsx` (new)

```typescript
/**
 * Persistent indicator showing running scheduled tasks
 * 
 * Displays in header/toolbar area
 * Click opens dropdown with task list + navigation
 */

export function ActiveTasksIndicator() {
  const { tasks, getRunningCount } = useActiveTasksStore();
  const runningCount = getRunningCount();
  const { t } = useTranslation();
  
  if (runningCount === 0) return null;
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Clock className="w-4 h-4 animate-pulse" />
          <span className="ml-1">{runningCount}</span>
          {/* Pulsing dot indicator */}
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-ping" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-80">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">
            {t("scheduledTasks.notifications.activeTasks", { count: runningCount })}
          </h4>
          
          {tasks.filter(t => t.status === "running").map((task) => (
            <div 
              key={task.runId}
              className="flex items-center justify-between p-2 rounded-md bg-muted"
            >
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <div>
                  <p className="text-sm font-medium">{task.taskName}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("scheduledTasks.notifications.startedAgo", {
                      time: formatRelativeTime(task.startedAt)
                    })}
                  </p>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateToTask(task.taskId, task.runId)}
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

#### E. Scheduled Tasks Tab - Highlight Support

**File:** Existing scheduled tasks page component

**Changes needed:**

```typescript
/**
 * Add URL parameter handling for deep linking
 * 
 * URL params:
 * - highlight: taskId to highlight
 * - run: specific runId to show
 * - expandHistory: boolean to auto-expand history section
 */

export function ScheduledTasksPage() {
  const searchParams = useSearchParams();
  const highlightTaskId = searchParams.get("highlight");
  const highlightRunId = searchParams.get("run");
  const expandHistory = searchParams.get("expandHistory") === "true";
  
  const highlightedTaskRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to highlighted task
  useEffect(() => {
    if (highlightTaskId && highlightedTaskRef.current) {
      highlightedTaskRef.current.scrollIntoView({ 
        behavior: "smooth", 
        block: "center" 
      });
    }
  }, [highlightTaskId]);
  
  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          ref={task.id === highlightTaskId ? highlightedTaskRef : undefined}
          task={task}
          isHighlighted={task.id === highlightTaskId}
          defaultExpandHistory={task.id === highlightTaskId && expandHistory}
          highlightRunId={task.id === highlightTaskId ? highlightRunId : undefined}
        />
      ))}
    </div>
  );
}

// In TaskCard component:
function TaskCard({ 
  task, 
  isHighlighted, 
  defaultExpandHistory,
  highlightRunId 
}: TaskCardProps) {
  const [historyExpanded, setHistoryExpanded] = useState(defaultExpandHistory);
  
  return (
    <Card className={cn(
      "transition-all duration-500",
      isHighlighted && "ring-2 ring-blue-500 ring-offset-2 bg-blue-50/50"
    )}>
      {/* ... card content ... */}
      
      <Collapsible open={historyExpanded} onOpenChange={setHistoryExpanded}>
        <CollapsibleContent>
          <TaskRunHistory 
            taskId={task.id} 
            highlightRunId={highlightRunId}
          />
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
```

#### F. Server-Sent Events Endpoint

**File:** `app/api/schedules/events/route.ts` (new)

```typescript
/**
 * SSE endpoint for real-time task events
 * 
 * Client subscribes to receive task:started and task:completed events
 * Filtered to current user's tasks only
 */

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      // Send heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 30000);
      
      // Subscribe to user's task events
      const onTaskStarted = (event: TaskEvent) => {
        const data = `event: task:started\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };
      
      const onTaskCompleted = (event: TaskEvent) => {
        const data = `event: task:completed\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };
      
      taskEvents.on(`task:started:${user.id}`, onTaskStarted);
      taskEvents.on(`task:completed:${user.id}`, onTaskCompleted);
      
      // Cleanup on close
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        taskEvents.off(`task:started:${user.id}`, onTaskStarted);
        taskEvents.off(`task:completed:${user.id}`, onTaskCompleted);
        controller.close();
      });
    }
  });
  
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

### 2.4 Locale Additions

**File:** `locales/en.json`

```json
{
  "scheduledTasks": {
    "notifications": {
      "taskRunning": "Scheduled task '{{taskName}}' is running",
      "taskStartedAt": "Started at {{time}}",
      "taskCompleted": "Task '{{taskName}}' completed",
      "taskFailed": "Task '{{taskName}}' failed",
      "viewTask": "View Task",
      "viewDetails": "View Details",
      "activeTasks": "{{count}} active task(s)",
      "startedAgo": "Started {{time}}"
    }
  }
}
```

**File:** `locales/tr.json`

```json
{
  "scheduledTasks": {
    "notifications": {
      "taskRunning": "Zamanlanmış görev '{{taskName}}' çalışıyor",
      "taskStartedAt": "{{time}} başladı",
      "taskCompleted": "'{{taskName}}' görevi tamamlandı",
      "taskFailed": "'{{taskName}}' görevi başarısız oldu",
      "viewTask": "Görevi Görüntüle",
      "viewDetails": "Detayları Görüntüle",
      "activeTasks": "{{count}} aktif görev",
      "startedAgo": "{{time}} önce başladı"
    }
  }
}
```

### 2.5 Integration Points

**Where to mount the notification hook:**

```typescript
// app/layout.tsx or equivalent root layout
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <TaskNotificationProvider>  {/* NEW: Wraps app */}
          <Header>
            <ActiveTasksIndicator />  {/* NEW: In header */}
          </Header>
          {children}
          <Toaster />  {/* Existing toast container */}
        </TaskNotificationProvider>
      </body>
    </html>
  );
}

// TaskNotificationProvider simply mounts the hook
function TaskNotificationProvider({ children }) {
  useTaskNotifications();  // Subscribe to events
  return children;
}
```

### 2.6 Visual Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER EXPERIENCE FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. USER IS IN CHAT SESSION                                                  │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │ [Logo]  Chat with Agent              [🔔 0 tasks] [Settings]    │     │
│     │ ─────────────────────────────────────────────────────────────── │     │
│     │ User: Help me with...                                           │     │
│     │ Agent: Sure, I can...                                           │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  2. SCHEDULED TASK STARTS (9:00 AM)                                          │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │ [Logo]  Chat with Agent              [🔔 1 task ●] [Settings]   │     │
│     │ ─────────────────────────────────────────────────────────────── │     │
│     │                                                                  │     │
│     │  ┌────────────────────────────────────────────────────────────┐ │     │
│     │  │ ⏰ Scheduled task "Daily Linear Summary" is running        │ │     │
│     │  │    Started at 9:00 AM                    [View Task →]     │ │     │
│     │  └────────────────────────────────────────────────────────────┘ │     │
│     │                                                                  │     │
│     │ User: Help me with...                                           │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  3. USER CLICKS "View Task →"                                                │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │ [Logo]  Scheduled Tasks              [🔔 1 task ●] [Settings]   │     │
│     │ ─────────────────────────────────────────────────────────────── │     │
│     │                                                                  │     │
│     │  ┌─────────────────────────────────────────────────────────┐   │     │
│     │  │ Daily Linear Summary                    [highlighted]   │   │     │
│     │  │ Every weekday at 9:00 AM                                │   │     │
│     │  │                                                          │   │     │
│     │  │ ▼ Execution History                                      │   │     │
│     │  │   ┌──────────────────────────────────────────────────┐  │   │     │
│     │  │   │ ● 9:00 AM Today - Running...  ← [highlighted]    │  │   │     │
│     │  │   │   Duration: 45s so far                           │  │   │     │
│     │  │   │   [View Session]                                 │  │   │     │
│     │  │   ├──────────────────────────────────────────────────┤  │   │     │
│     │  │   │ ✓ 9:00 AM Yesterday - Succeeded                  │  │   │     │
│     │  │   │   Duration: 1m 23s                               │  │   │     │
│     │  │   └──────────────────────────────────────────────────┘  │   │     │
│     │  └─────────────────────────────────────────────────────────┘   │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Implementation Checklist

### 3.1 Timezone Detection (2 days)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Create `useLocalTimezone` hook | High | 2h | None |
| Update timezone selector with local option | High | 4h | Hook |
| Add `local::` format parsing in executor | High | 2h | None |
| Add locale strings (en, tr) | Medium | 1h | None |
| Add timezone info tooltip in form | Low | 2h | Selector |
| Test SSR handling | Medium | 2h | Hook |
| Test cross-timezone scenarios | Medium | 2h | All |

### 3.2 Task Visibility (3 days)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Create `TaskEventEmitter` | High | 2h | None |
| Emit events from task executor | High | 2h | Emitter |
| Create SSE endpoint | High | 3h | Emitter |
| Create `useActiveTasksStore` | High | 2h | None |
| Create `useTaskNotifications` hook | High | 3h | Store, SSE |
| Create `ActiveTasksIndicator` component | High | 3h | Store |
| Add URL param handling to tasks page | High | 2h | None |
| Add highlight/scroll behavior | Medium | 2h | URL params |
| Add locale strings (en, tr) | Medium | 1h | None |
| Mount provider in root layout | High | 1h | All hooks |
| Test real-time updates | High | 2h | All |
| Test navigation flow | High | 2h | All |

---

## 4. Open Questions for Developer

### Timezone Feature

1. **Should we show a confirmation when user changes from explicit to local timezone?**
   - "This task will now run at 9:00 AM in your current timezone instead of fixed UTC" Sure. 

2. **Should we store timezone change history for audit?**
   - Useful for debugging "why did this run at wrong time?" Yes. 

3. **Should we warn if detected timezone differs from stored `local::` timezone?**
   - User saved with `local::America/New_York` but now in `Europe/London`. Yes. 

### Task Visibility Feature

4. **Should completed tasks remain in the header indicator? For how long?**
   - Suggestion: Remove after 5 minutes or on navigation. Yes. Appropriately. 

5. **Should we show task notifications when user is on the scheduled tasks page already?**
   - Might be redundant since they can see the list. Yes. 

6. **Should clicking a running task's "View Session" open the chat session created for that run?**
   - This would let users see the agent's actual output in real-time. Yes. 

7. **What happens if SSE connection drops?**
   - Suggestion: Auto-reconnect with exponential backoff + fetch missed events on reconnect. Handle nicely and appropriately. 

8. **Should we add browser notifications (with permission) for task events when tab is backgrounded?**
   - Nice-to-have for truly important scheduled tasks. Sure. 

---

## 5. Testing Considerations

### Timezone Testing

```typescript
// Test cases for timezone detection
describe("useLocalTimezone", () => {
  it("returns null during SSR");
  it("detects browser timezone on mount");
  it("formats display name correctly");
  it("handles unusual timezones (e.g., UTC+5:30)");
});

describe("Timezone selector", () => {
  it("shows local option at top when detected");
  it("hides local option during SSR");
  it("stores local:: prefix when local selected");
  it("shows explicit timezone when non-local selected");
});

describe("Task executor timezone", () => {
  it("resolves local:: prefix to concrete timezone");
  it("passes through explicit timezones unchanged");
  it("falls back to UTC for invalid timezone");
});
```

### Task Visibility Testing

```typescript
// Test cases for notifications
describe("Task notifications", () => {
  it("shows toast when task starts");
  it("updates header indicator count");
  it("navigates to correct task on click");
  it("highlights task card after navigation");
  it("auto-expands history section");
  it("scrolls to highlighted task");
  it("removes task from indicator after completion");
  it("reconnects SSE after disconnect");
});
```

---

## 6. Summary

This plan provides two focused UX enhancements:

| Enhancement | User Benefit | Complexity |
|-------------|--------------|------------|
| **Local Timezone Detection** | Zero friction timezone selection - just works | Low-Medium |
| **Task Visibility** | Full awareness of background task execution | Medium |

Both enhancements follow existing patterns in the codebase and require no database migrations. The timezone feature is self-contained, while the visibility feature introduces a lightweight real-time event system that can be extended for other notifications in the future.