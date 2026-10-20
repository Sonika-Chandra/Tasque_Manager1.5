// Date helpers. Pure logic: no page, no network.

const DAY = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function sameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

// Whole days from `now` to `d` (0 = today, 1 = tomorrow, -1 = yesterday)
export function daysFrom(now, d) {
  return Math.round((startOfDay(d) - startOfDay(now)) / DAY);
}

export function dayKey(d) {
  const x = startOfDay(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

// "Fri 24 Oct"
export function formatDay(d) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// "Today", "Tomorrow", "Fri 24 Oct"
export function friendlyDay(d, now = new Date()) {
  const n = daysFrom(now, d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return formatDay(d);
}

// Only show a time if it isn't midnight (a date-only event)
export function hasTime(d) {
  const x = new Date(d);
  return x.getHours() !== 0 || x.getMinutes() !== 0;
}

export function formatTime(d) {
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// "5 min ago", "3 h ago", "2 days ago"
export function ago(d, now = new Date()) {
  const s = Math.max(0, (now - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// Find a date mentioned in text, relative to `now`. Returns a Date (midnight,
// or with a time if one is written next to it) or null.
// Understands: today, tomorrow, (this|next) friday, 24 Oct, Oct 24, 24/10, 24-10-2026
export function findDateInText(text, now = new Date()) {
  const t = ` ${String(text).toLowerCase()} `;
  let found = null;

  if (/\btoday\b|\btonight\b/.test(t)) found = startOfDay(now);
  else if (/\btomorrow\b/.test(t)) found = addDays(startOfDay(now), 1);

  if (!found) {
    const wd = t.match(/\b(this|next|on|by|coming)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (wd) {
      const target = WEEKDAYS.indexOf(wd[2]);
      let diff = (target - now.getDay() + 7) % 7;
      if (diff === 0) diff = 7; // "on friday" said on a Friday means next week
      found = addDays(startOfDay(now), diff);
    }
  }

  if (!found) {
    // 24 Oct / 24th October / Oct 24 / October 24th
    const m1 = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
    const m2 = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    let day = null;
    let month = null;
    if (m1) { day = Number(m1[1]); month = MONTHS.indexOf(m1[2]); }
    else if (m2) { day = Number(m2[2]); month = MONTHS.indexOf(m2[1]); }
    if (day !== null && day >= 1 && day <= 31) found = nearestFuture(now, month, day);
  }

  if (!found) {
    // 24/10, 24-10-2026, 24.10.26 (day first, as in India and the UK)
    const m = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
    if (m) {
      const day = Number(m[1]);
      const month = Number(m[2]) - 1;
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        if (m[3]) {
          const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
          found = new Date(year, month, day);
        } else {
          found = nearestFuture(now, month, day);
        }
      }
    }
  }

  if (found) {
    // a time nearby: 5pm, 5:30 pm, 17:00
    const tm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) || t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (tm) {
      let h = Number(tm[1]);
      const min = Number(tm[2] ?? 0);
      if (tm[3] === 'pm' && h < 12) h += 12;
      if (tm[3] === 'am' && h === 12) h = 0;
      found.setHours(h, min, 0, 0);
    }
  }
  return found;
}

// A day+month with no year: pick this year, or next year if it's long past
function nearestFuture(now, month, day) {
  const d = new Date(now.getFullYear(), month, day);
  if (d < addDays(startOfDay(now), -60)) d.setFullYear(d.getFullYear() + 1);
  return d;
}
