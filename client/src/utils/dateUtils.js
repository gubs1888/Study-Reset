export const localDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const dateOnlyKey = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return localDateKey(value);
};

export const isToday = (value, dateOnly = false) => Boolean(value)
  && (dateOnly ? dateOnlyKey(value) : localDateKey(value)) === localDateKey();

export const dateForDisplay = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return value ? new Date(value) : new Date();
};

export const formatDate = (date, options = {}) => new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  ...options,
}).format(dateForDisplay(date));

export const calendarDayNumber = (value) => {
  const key = dateOnlyKey(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000;
};

export const calendarDaysFromToday = (value) => calendarDayNumber(value) - calendarDayNumber(localDateKey());

export const relativeDayLabel = (value, noun = "day") => {
  const days = calendarDaysFromToday(value);
  if (!Number.isFinite(days)) return "Date unavailable";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1) return `${days} ${noun}${days === 1 ? "" : "s"} remaining`;
  return `${Math.abs(days)} ${noun}${Math.abs(days) === 1 ? "" : "s"} overdue`;
};

export const formatMinutes = (minutes = 0) => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

export const initials = (name = "Student") => name
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase();

export const focusHistoryRange = () => {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 6);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
};

export const formatTimerClock = (seconds) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const remainder = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
};

export const formatSessionDate = (session) => {
  const value = session.endedAt || session.startedAt || session.createdAt;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};
