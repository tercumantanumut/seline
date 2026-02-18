/**
 * Date/Time Context Injection for AI Requests
 * 
 * Provides accurate temporal awareness for all AI model invocations.
 * This ensures the AI always has the correct current date/time context.
 */

/**
 * Get the day of week name from a date
 */
function getDayOfWeek(date: Date): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[date.getDay()];
}

/**
 * Format time in 24-hour format (HH:MM:SS)
 */
function formatTime24(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Get timezone abbreviation and offset
 */
function getTimezoneInfo(date: Date): { abbreviation: string; ianaName: string } {
  // Get IANA timezone name
  const ianaName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Get timezone abbreviation (e.g., PST, EST, UTC)
  const abbreviation = date.toLocaleTimeString("en-US", {
    timeZoneName: "short",
  }).split(" ").pop() || "UTC";
  
  return { abbreviation, ianaName };
}

/**
 * Generate the current date/time context string for AI requests.
 * 
 * This should be called fresh for each request to ensure accuracy.
 * 
 * @returns A formatted string with current date/time information
 * 
 * @example
 * // Returns something like:
 * // "Current Date & Time: 2025-12-06 (Friday) 14:23:45 PST (America/Los_Angeles)"
 */
export function getCurrentDateTimeContext(): string {
  const now = new Date();
  
  // ISO 8601 date (YYYY-MM-DD)
  const isoDate = now.toISOString().split("T")[0];
  
  // Day of week
  const dayOfWeek = getDayOfWeek(now);
  
  // 24-hour time
  const time24 = formatTime24(now);
  
  // Timezone info
  const { abbreviation, ianaName } = getTimezoneInfo(now);
  
  return `Current Date & Time: ${isoDate} (${dayOfWeek}) ${time24} ${abbreviation} (${ianaName})`;
}

/**
 * Generate a full temporal context block for system prompts.
 * Includes additional context that helps the AI reason about time.
 */
export function getTemporalContextBlock(): string {
  const now = new Date();
  
  // Core datetime context
  const dateTimeContext = getCurrentDateTimeContext();
  
  // Additional temporal metadata
  const year = now.getFullYear();
  const month = now.toLocaleString("en-US", { month: "long" });
  const quarter = `Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  
  return `## Current Date & Time Context

${dateTimeContext}
Year: ${year} | Month: ${month} | Quarter: ${quarter}

Use this information for:
- Time-sensitive queries and recommendations
- Web searches (search for current/recent information from ${year})
- Relative time calculations ("this year", "last month", "recently")
- Understanding temporal references in user messages

Important: This is a snapshot generated at request start. For reminders/scheduling, backend validation uses runtime server time.`;
}

