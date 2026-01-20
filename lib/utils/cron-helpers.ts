/**
 * Cron Expression Utilities
 * 
 * Helpers for converting between UI day selections and cron expressions.
 */

/**
 * Convert array of selected days to cron day-of-week field
 * @param days Array of day numbers (0=Sunday, 1=Monday, ..., 6=Saturday)
 * @returns Cron-compatible day-of-week string
 */
export function daysToCron(days: number[]): string {
    if (days.length === 0) return "*";
    if (days.length === 7) return "*";
    return days.sort((a, b) => a - b).join(",");
}

/**
 * Convert cron day-of-week field to array of day numbers
 * @param cronDayField Cron day-of-week field (e.g., "1,3,5" or "*")
 * @returns Array of day numbers (0=Sunday, 1=Monday, ..., 6=Saturday)
 */
export function cronToDays(cronDayField: string): number[] {
    if (cronDayField === "*") return [0, 1, 2, 3, 4, 5, 6];

    const days: number[] = [];
    const parts = cronDayField.split(",");

    for (const part of parts) {
        if (part.includes("-")) {
            // Handle ranges like "1-5"
            const [start, end] = part.split("-").map(Number);
            for (let i = start; i <= end; i++) {
                days.push(i);
            }
        } else {
            days.push(Number(part));
        }
    }

    return [...new Set(days)].sort((a, b) => a - b);
}

/**
 * Build a cron expression from time and days
 * @param time Time string in HH:MM format
 * @param days Array of day numbers, or undefined for "every day"
 * @returns Complete cron expression
 */
export function buildCronExpression(time: string, days?: number[]): string {
    const [hours, minutes] = time.split(":").map(Number);
    const dayField = days && days.length > 0 && days.length < 7
        ? daysToCron(days)
        : "*";
    return `${minutes} ${hours} * * ${dayField}`;
}

/**
 * Parse a cron expression to extract time and days
 * @param cronExpression Full cron expression
 * @returns Object with time string and days array
 */
export function parseCronExpression(cronExpression: string): {
    time: string;
    days: number[];
    isSimple: boolean;
} {
    const parts = cronExpression.split(" ");
    if (parts.length !== 5) {
        return { time: "09:00", days: [1, 2, 3, 4, 5], isSimple: false };
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Check if it's a simple schedule (only minute, hour, dayOfWeek vary)
    const isSimple = dayOfMonth === "*" && month === "*" &&
        !minute.includes(",") && !minute.includes("-") && !minute.includes("/") &&
        !hour.includes(",") && !hour.includes("-") && !hour.includes("/");

    const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
    const days = cronToDays(dayOfWeek);

    return { time, days, isSimple };
}

/**
 * Get human-readable description of selected days
 * @param days Array of day numbers
 * @returns Human-readable string
 */
export function describeDays(days: number[]): string {
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const shortNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    if (days.length === 0) return "No days selected";
    if (days.length === 7) return "every day";
    if (arraysEqual(days, [1, 2, 3, 4, 5])) return "weekdays";
    if (arraysEqual(days, [0, 6])) return "weekends";

    // Sort days starting from Monday for display
    const sortedDays = [...days].sort((a, b) => {
        // Convert Sunday (0) to 7 for sorting purposes
        const aVal = a === 0 ? 7 : a;
        const bVal = b === 0 ? 7 : b;
        return aVal - bVal;
    });

    return sortedDays.map(d => shortNames[d]).join(", ");
}

/**
 * Calculate next run time from cron expression
 * @param cronExpression Cron expression
 * @param timezone Timezone string
 * @returns Next run date or null if unable to calculate
 */
export function getNextRunDate(cronExpression: string, timezone: string): Date | null {
    try {
        const { time, days } = parseCronExpression(cronExpression);
        const [hours, minutes] = time.split(":").map(Number);

        const now = new Date();
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });

        // Start from today
        const candidate = new Date(now);

        // Check up to 8 days ahead
        for (let i = 0; i < 8; i++) {
            candidate.setDate(now.getDate() + i);
            const dayOfWeek = candidate.getDay();

            if (days.includes(dayOfWeek)) {
                // Set the time
                candidate.setHours(hours, minutes, 0, 0);

                // If it's today and time has passed, continue to next day
                if (i === 0 && candidate <= now) {
                    continue;
                }

                return candidate;
            }
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Format next run date for display
 * @param date Date object
 * @param timezone Timezone string
 * @returns Formatted string like "Mon, Jan 14 at 08:00"
 */
export function formatNextRun(date: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });

    return formatter.format(date).replace(",", " at");
}

// Helper function
function arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
}
