export function getCurrentWeekRangeUTC(): { week_start: Date; week_end: Date } {
  return getWeekRangeForDayUTC(new Date());
}

export function getPreviousWeekRangeUTC(): {
  week_start: Date;
  week_end: Date;
} {
  const now = new Date();
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const week_start = new Date(now);
  week_start.setUTCHours(0, 0, 0, 0);
  week_start.setUTCDate(week_start.getUTCDate() - daysSinceMonday - 7);
  const week_end = new Date(week_start);
  week_end.setUTCDate(week_end.getUTCDate() + 6);
  week_end.setUTCHours(23, 59, 59, 999);
  return { week_start, week_end };
}

export function getCurrentMonthRangeUTC() {
  const now = new Date();
  return {
    month_start: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    ),
    month_end: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    ),
  };
}

export function getPreviousMonthRangeUTC() {
  const now = new Date();
  return {
    month_start: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0),
    ),
    month_end: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999),
    ),
  };
}

export function getCurrentQuarterRangeUTC() {
  const now = new Date();
  const quarter = Math.floor(now.getUTCMonth() / 3);
  return {
    quarter_start: new Date(
      Date.UTC(now.getUTCFullYear(), quarter * 3, 1, 0, 0, 0, 0),
    ),
    quarter_end: new Date(
      Date.UTC(now.getUTCFullYear(), (quarter + 1) * 3, 0, 23, 59, 59, 999),
    ),
  };
}

export function getPreviousQuarterRangeUTC() {
  const now = new Date();
  const quarter = Math.floor(now.getUTCMonth() / 3) - 1;
  return {
    quarter_start: new Date(
      Date.UTC(now.getUTCFullYear(), quarter * 3, 1, 0, 0, 0, 0),
    ),
    quarter_end: new Date(
      Date.UTC(now.getUTCFullYear(), (quarter + 1) * 3, 0, 23, 59, 59, 999),
    ),
  };
}

export function getCurrentYearRangeUTC() {
  const y = new Date().getUTCFullYear();
  return {
    year_start: new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0)),
    year_end: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)),
  };
}

export function getPreviousYearRangeUTC() {
  const y = new Date().getUTCFullYear() - 1;
  return {
    year_start: new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0)),
    year_end: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)),
  };
}

export function getWeekRangeForDayUTC(now: Date) {
  const distanceToMonday = (now.getUTCDay() + 6) % 7;
  const week_start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - distanceToMonday,
      0,
      0,
      0,
      0,
    ),
  );
  const week_end = new Date(week_start);
  week_end.setUTCDate(week_end.getUTCDate() + 6);
  week_end.setUTCHours(23, 59, 59, 999);
  return { week_start, week_end };
}

export type ChangeDirection = "up" | "down" | "no change";

export function getChange(previous: number, current: number) {
  if (previous === 0) {
    if (current === 0) return { percent: "0.00", direction: "no change" as const };
    return { percent: "100.00", direction: "up" as const };
  }
  const change = ((current - previous) / previous) * 100;
  const direction: ChangeDirection =
    change > 0 ? "up" : change < 0 ? "down" : "no change";
  return { percent: Math.abs(change).toFixed(2), direction };
}
