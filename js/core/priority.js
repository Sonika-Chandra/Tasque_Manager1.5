// Priority order and "same day" clubbing. Pure logic.
//
// Every item has a KEY DATE: the event or due date if it has one,
// otherwise nothing. The list is ordered like a planner:
//   1. upcoming items, soonest first (today, tomorrow, this week, later)
//   2. items with no date, newest first
//   3. past events, most recent first
// Items whose key date falls on the same day are clubbed together.

import { startOfDay, daysFrom, dayKey, friendlyDay } from './dates.js';

// item: { id, date (received), due? }   info: { eventDate?, priority? } (from Gemini or rules)
export function keyDate(item, info) {
  const d = info?.eventDate ?? item.due ?? null;
  return d ? new Date(d) : null;
}

export function sectionFor(key, now) {
  if (!key) return 'No date';
  const n = daysFrom(now, key);
  if (n < 0) return 'Past';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n <= 7) return 'This week';
  return 'Later';
}

export const SECTION_ORDER = ['Today', 'Tomorrow', 'This week', 'Later', 'No date', 'Past'];

// Returns [{ section, clusters: [{ day, label, items: [...] }] }]
// Each list entry is { item, info, key }.
export function arrange(items, infoById, now = new Date()) {
  const entries = items.map((item) => {
    const info = infoById[item.id] ?? {};
    return { item, info, key: keyDate(item, info) };
  });

  const bySection = new Map(SECTION_ORDER.map((s) => [s, []]));
  for (const e of entries) bySection.get(sectionFor(e.key, now)).push(e);

  const prio = (e) => e.info.priority ?? 2; // 1 = high, 3 = low
  const received = (e) => new Date(e.item.date).getTime();

  const out = [];
  for (const section of SECTION_ORDER) {
    const list = bySection.get(section);
    if (!list.length) continue;

    if (section === 'No date') {
      list.sort((a, b) => prio(a) - prio(b) || received(b) - received(a));
      out.push({ section, clusters: list.map((e) => ({ day: null, label: null, items: [e] })) });
      continue;
    }

    // soonest first (or, for the past, most recent first); then priority; then time of day
    const dir = section === 'Past' ? -1 : 1;
    list.sort((a, b) => dir * (startOfDay(a.key) - startOfDay(b.key)) || prio(a) - prio(b) || a.key - b.key);

    // club items on the same day
    const clusters = [];
    for (const e of list) {
      const day = dayKey(e.key);
      const last = clusters[clusters.length - 1];
      if (last && last.day === day) last.items.push(e);
      else clusters.push({ day, label: friendlyDay(e.key, now), items: [e] });
    }
    out.push({ section, clusters });
  }
  return out;
}

// Stable colours for groups: the same group name always gets the same colour
export const GROUP_COLORS = ['#ff2fd0', '#a855ff', '#22d3ee', '#facc15', '#34d399', '#fb7185', '#60a5fa', '#f97316', '#e879f9', '#a3e635', '#2dd4bf', '#fda4af'];

export function assignColors(groupNames, saved = {}) {
  const colors = { ...saved };
  const used = new Set(Object.values(colors));
  for (const name of groupNames) {
    if (colors[name]) continue;
    const free = GROUP_COLORS.find((c) => !used.has(c)) ?? GROUP_COLORS[Object.keys(colors).length % GROUP_COLORS.length];
    colors[name] = free;
    used.add(free);
  }
  return colors;
}
