export function parseAsUTC(dateStr: string): Date {
  const normalized =
    dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("-", 10)
      ? dateStr
      : dateStr.replace(" ", "T") + "Z";
  return new Date(normalized);
}

export function getDateBucket(date: Date): "today" | "week" | "older" {
  const now = new Date();
  // Compare calendar days (midnight-to-midnight) so that yesterday 23:52
  // isn't bucketed as "today" when current time is e.g. 01:30.
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysDiff = Math.round(
    (todayStart.getTime() - dateStart.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysDiff <= 0) return "today";
  if (daysDiff < 7) return "week";
  return "older";
}
