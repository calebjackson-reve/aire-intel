/** Returns today's date as YYYY-MM-DD in Central Time (America/Chicago). */
export function getTodayCT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Returns a Date object representing midnight CT for a given YYYY-MM-DD string. */
export function parseBriefDate(date: string): Date {
  return new Date(`${date}T06:00:00.000Z`); // midnight CT = 06:00 UTC (CST)
}
