export interface TemplateVariable {
    syntax: string;
    label: string;
    description: string;
    example: string;
    category: "time" | "context" | "custom";
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
    {
        syntax: "{{NOW}}",
        label: "Now",
        description: "Current ISO timestamp when the task runs",
        example: "2026-01-20T20:39:30.000Z",
        category: "time",
    },
    {
        syntax: "{{TODAY}}",
        label: "Today",
        description: "Today's date in YYYY-MM-DD format",
        example: "2026-01-20",
        category: "time",
    },
    {
        syntax: "{{YESTERDAY}}",
        label: "Yesterday",
        description: "Yesterday's date in YYYY-MM-DD format",
        example: "2026-01-19",
        category: "time",
    },
    {
        syntax: "{{LAST_7_DAYS}}",
        label: "Last 7 Days",
        description: "Date range covering the past 7 days",
        example: "2026-01-13 to 2026-01-20",
        category: "time",
    },
    {
        syntax: "{{LAST_30_DAYS}}",
        label: "Last 30 Days",
        description: "Date range covering the past 30 days",
        example: "2025-12-21 to 2026-01-20",
        category: "time",
    },
    {
        syntax: "{{WEEKDAY}}",
        label: "Weekday",
        description: "Current day name (e.g., Monday, Tuesday)",
        example: "Tuesday",
        category: "time",
    },
    {
        syntax: "{{MONTH}}",
        label: "Month",
        description: "Current month name (e.g., January, February)",
        example: "January",
        category: "time",
    },
    {
        syntax: "{{AGENT_NAME}}",
        label: "Agent Name",
        description: "The name of the agent running this task",
        example: "Research Assistant",
        category: "context",
    },
    {
        syntax: "{{LAST_RUN}}",
        label: "Last Run",
        description: "Timestamp of the previous execution (or 'Never' if first run)",
        example: "2026-01-19T08:00:00.000Z",
        category: "context",
    },
];
