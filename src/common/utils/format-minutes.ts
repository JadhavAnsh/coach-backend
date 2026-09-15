function normalizeMinutes(totalMinutes: number) {
  const n = Number(totalMinutes);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function formatMinutesAsHrMin(totalMinutes: number) {
  const m = normalizeMinutes(totalMinutes);
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  if (hours === 0) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hourLabel = hours === 1 ? "hour" : "hours";
  if (minutes === 0) return `${hours} ${hourLabel}`;
  return `${hours} ${hourLabel} ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

export function formatMinutesAsPaddedHHMM(totalMinutes: number) {
  const m = normalizeMinutes(totalMinutes);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
