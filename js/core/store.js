// What Tasque remembers, per signed-in account, in this browser (localStorage):
//   statuses - what you marked: registered / done / checked / dismissed (+ when)
//   seen     - item ids already shown, so NEW ones can trigger a notification
//   infos    - grouping results per item, so Gemini isn't asked twice about the same email
//   colors   - group name -> colour, so colours stay the same between visits
//   todo     - items you pinned to complete (yellow "To do" button)
//   stars    - starred items, kept even after they drop out of the last 20
//
// Nothing here resets on its own. It lasts until you press "Clear history",
// clear this site's data in the browser, or use a different browser/device.

const blank = () => ({ statuses: {}, seen: [], infos: {}, colors: {}, groups: [], todo: {}, stars: {} });

// What we keep about a pinned/starred item, so it can still be shown later
function snapshot(item) {
  const keep = ['id', 'source', 'kind', 'from', 'fromEmail', 'auth', 'title', 'snippet', 'body', 'date', 'due', 'link', 'gmailId'];
  return Object.fromEntries(keep.filter((k) => item[k] !== undefined).map((k) => [k, item[k]]));
}

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } }

export function createStore(account) {
  const key = `tasque-state:${account}`;
  let data = blank();
  try { data = { ...blank(), ...JSON.parse(safeGet(key) ?? '{}') }; } catch { /* bad data: start fresh */ }
  const save = () => safeSet(key, JSON.stringify(data));

  return {
    get data() { return data; },

    setStatus(id, status, item) {
      if (status) data.statuses[id] = { status, at: new Date().toISOString(), title: item?.title, source: item?.source, link: item?.link };
      else delete data.statuses[id];
      save();
    },
    status(id) { return data.statuses[id]?.status ?? null; },
    history() {
      return Object.entries(data.statuses)
        .map(([id, s]) => ({ id, ...s }))
        .sort((a, b) => new Date(b.at) - new Date(a.at));
    },

    // Returns the ids in `ids` that were never seen before, and remembers them
    markSeen(ids) {
      const seen = new Set(data.seen);
      const fresh = ids.filter((id) => !seen.has(id));
      data.seen = [...seen, ...fresh].slice(-500);
      save();
      return fresh;
    },
    hasSeenAnything() { return data.seen.length > 0; },

    saveInfos(infos, groups) {
      Object.assign(data.infos, infos);
      if (groups) data.groups = groups;
      save();
    },
    saveColors(colors) { data.colors = colors; save(); },

    // kind: 'todo' or 'stars'. Returns true if the item is now on the list.
    toggle(kind, item) {
      const on = !data[kind][item.id];
      if (on) data[kind][item.id] = { ...snapshot(item), at: new Date().toISOString() };
      else delete data[kind][item.id];
      save();
      return on;
    },
    remove(kind, id) { if (data[kind][id]) { delete data[kind][id]; save(); } },
    has(kind, id) { return !!data[kind][id]; },
    list(kind) { return Object.values(data[kind]).sort((a, b) => new Date(b.at) - new Date(a.at)); },

    clearHistory() { data.statuses = {}; save(); },

    // Forget grouping results for items we'll never show again (keeps storage small)
    prune() {
      const keep = new Set([...data.seen, ...Object.keys(data.statuses), ...Object.keys(data.todo), ...Object.keys(data.stars)]);
      for (const id of Object.keys(data.infos)) if (!keep.has(id)) delete data.infos[id];
      save();
    },
    clear() { data = blank(); save(); },
  };
}
