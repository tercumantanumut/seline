export function parseAsUTC(dateStr: string): Date {
  const normalized =
    dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("-", 10)
      ? dateStr
      : dateStr.replace(" ", "T") + "Z";
  return new Date(normalized);
}

/**
 * Count the number of calendar days between two dates in the user's local
 * timezone.  Unlike a raw millisecond diff this correctly handles the
 * midnight boundary — e.g. 23:52 yesterday is 1 day ago even if it was
 * only 2 hours before now (01:52 today).
 */
export function calendarDaysAgo(date: Date, now: Date = new Date()): number {
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateMidnight  = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((todayMidnight.getTime() - dateMidnight.getTime()) / (1000 * 60 * 60 * 24));
}

export function getDateBucket(date: Date): "today" | "week" | "older" {
  const days = calendarDaysAgo(date);
  if (days <= 0) return "today";
  if (days < 7) return "week";
  return "older";
}
