// Gemini: sorts your mail and Classroom items into groups it invents,
// and pulls out event / due dates so the list can be put in date order.
//
// Privacy: only subject, sender/class, dates and a short preview are sent,
// never whole emails. The key stays in this browser and only goes to Google.

const KEY_STORE = 'tasque-gemini-key';
const MODEL_STORE = 'tasque-gemini-model';
export const DEFAULT_MODEL = 'gemini-3.5-flash';

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked */ } }
function safeRemove(k) { try { localStorage.removeItem(k); } catch { /* blocked */ } }

export function getSettings() {
  return { key: safeGet(KEY_STORE) ?? '', model: safeGet(MODEL_STORE) || DEFAULT_MODEL };
}
export function saveSettings({ key, model }) {
  if (key) safeSet(KEY_STORE, key.trim());
  safeSet(MODEL_STORE, (model || DEFAULT_MODEL).trim());
}
export function clearKey() { safeRemove(KEY_STORE); }

// Busy-server errors are worth retrying, waiting a bit longer each time
const RETRYABLE = new Set([500, 502, 503, 504]);
const DELAYS = [800, 1600, 3200];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGemini(prompt, { key, model }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      });
    } catch {
      throw new Error('Could not reach Gemini (are you online?).');
    }
    if (RETRYABLE.has(res.status) && attempt < DELAYS.length) { await wait(DELAYS[attempt]); continue; }
    break;
  }
  if (!res.ok) {
    if (res.status === 400 || res.status === 403) throw new Error('Gemini rejected the API key.');
    if (res.status === 404) throw new Error('That Gemini model wasn\'t found. Change it with "Gemini key".');
    if (res.status === 429) throw new Error('Gemini rate limit reached. Wait a minute.');
    if (RETRYABLE.has(res.status)) throw new Error(`Gemini is overloaded (error ${res.status}). Try again in a minute.`);
    throw new Error(`Gemini error ${res.status}.`);
  }
  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  try { return JSON.parse(raw); } catch { throw new Error('Gemini sent back something that was not JSON.'); }
}

const ACTIONS = ['register', 'submit', 'attend', 'reply', 'check', 'read', 'none'];

// Local date-time as "2026-10-24T16:00", the format we ask Gemini to use too
function localStamp(d) {
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
}

// items: the new items to group. existingGroups: the default categories + ones made before (Gemini reuses these first)
// Returns { groups: [...names], infos: { [id]: { group, eventDate, action, priority, event } } }
export async function groupWithGemini(items, existingGroups, settings, now = new Date()) {
  const compact = items.map((it, i) => ({
    n: i,
    source: it.source === 'mail' ? 'gmail' : 'classroom',
    type: it.kind,
    from: it.from,
    title: it.title,
    preview: (it.snippet ?? '').slice(0, 200),
    received: localStamp(it.date),
    due: it.due ? localStamp(it.due) : null,
    turnedIn: it.turnedIn ?? undefined,
  }));

  const prompt = `You organise a student's Gmail and Google Classroom.
Today is ${now.toDateString()} (local time ${localStamp(now)}).

Sort these items into CATEGORIES. Use these categories whenever an item fits one of them: ${JSON.stringify(existingGroups)}.
Only if an item clearly fits none of them, create a new short category (1-3 words, e.g. "Sports", "Hostel") and reuse it for similar items. Put newsletters, ads, shopping and social updates in "Low priority".

For EACH item return:
- "n": the item's number
- "group": its category name
- "eventDate": when the thing actually happens or is due, as "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" in local time, worked out from the text (e.g. "this Friday 4pm"); for Classroom use "due" if given; null if there's no date
- "event": a short name for the event or task (e.g. "Robo-Wars"), the SAME name for every item about the same event, or null
- "action": one of ${JSON.stringify(ACTIONS)} - what the student needs to do
- "priority": 1 (urgent / important), 2 (normal) or 3 (can ignore)

Return JSON only: {"groups": ["every category you used"], "items": [{"n": 0, "group": "...", "eventDate": null, "event": null, "action": "read", "priority": 2}]}

Items:
${JSON.stringify(compact)}`;

  const parsed = await callGemini(prompt, settings);
  const groups = Array.isArray(parsed.groups) ? parsed.groups.map(String).slice(0, 8) : [];
  const infos = {};
  for (const r of parsed.items ?? []) {
    const item = items[Number(r.n)];
    if (!item) continue;
    const group = String(r.group ?? 'Other').slice(0, 30);
    if (!groups.includes(group)) groups.push(group);
    infos[item.id] = {
      group,
      eventDate: parseLocal(r.eventDate),
      event: r.event ? String(r.event).slice(0, 40) : null,
      action: ACTIONS.includes(r.action) ? r.action : 'read',
      priority: [1, 2, 3].includes(Number(r.priority)) ? Number(r.priority) : 2,
      by: 'gemini',
    };
  }
  return { groups, infos };
}

// "2026-10-24" or "2026-10-24T16:00" as LOCAL time (new Date("2026-10-24") would be UTC)
function parseLocal(s) {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)).toISOString();
}
