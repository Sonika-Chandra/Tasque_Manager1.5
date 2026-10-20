// The app page: loads mail + Classroom, groups them, shows them in
// date order, and turns the lotus into the menu.
//
//   load()      get items (demo data, or Gmail + Classroom)
//   group()     ask Gemini (or the offline rules) which group each item is in
//   render()    lotus options + the list for the selected option
//   notify()    toast + browser notification when something new turns up

import { getSession, clearSession, signIn, tokenExpired, GoogleError } from './sources/google.js';
import { fetchMail, fetchMailBody } from './sources/gmail.js';
import { fetchClassroom } from './sources/classroom.js';
import { demoMail, demoClassroom, demoNewItem, demoGrouping, withLongText } from './sources/demo.js';
import { groupWithGemini, getSettings, saveSettings, clearKey, DEFAULT_MODEL } from './ai/gemini.js';
import { ruleInfo } from './core/rules.js';
import { arrange, keyDate, assignColors } from './core/priority.js';
import { friendlyDay, formatTime, hasTime, ago } from './core/dates.js';
import { createStore } from './core/store.js';
import { DEFAULT_GROUPS } from './core/categories.js';
import { senderTrust, TRUSTED_DOMAINS } from './core/trust.js';
import { createLotus, ICONS } from './ui/lotus.js';

const $ = (id) => document.getElementById(id);
const YELLOW = '#facc15';
const POLL_MS = 3 * 60 * 1000;                        // check Google every 3 minutes
const params = new URLSearchParams(location.search);
const DEMO_NEW_AFTER = Number(params.get('newIn') ?? 20) * 1000; // demo: a "new" item arrives after 20 s

// ---------- who's signed in ----------
let session = getSession();
if (!session) location.replace('index.html');
const demo = session?.mode === 'demo';
const store = createStore(session?.email ?? 'nobody');

// ---------- state ----------
let items = [];               // everything loaded
let groupNames = [];          // groups that currently have items
let colors = {};              // group -> colour
let groupedBy = '';           // 'gemini' | 'sample' | 'rules'
let lastLoaded = null;
const fresh = new Set();      // ids that arrived while the page was open (badges + glow)
const expanded = new Set();   // cards opened with "Read more"
const bodies = new Map();     // full email texts fetched for "Read more" (id -> text)
const demoExtras = [];        // demo items that "arrived" later
let loading = false;

const lotus = createLotus($('lotus'), { onSelect: () => { clearFreshFor(lotus.selected); render(); $('content').scrollTop = 0; } });

// ---------- small helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(title, text = '') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<strong>${esc(title)}</strong>${esc(text)}`;
  $('toasts').appendChild(t);
  while ($('toasts').children.length > 3) $('toasts').firstElementChild.remove(); // only the newest 3
  setTimeout(() => t.remove(), 4500);
}

function banner(html) {
  const b = $('banner');
  b.hidden = !html;
  b.innerHTML = html ?? '';
}

const infoOf = (item) => store.data.infos[item.id] ?? {};

// "registered" / "done" / "checked" / "dismissed" (from you), or "turned in" (from Classroom)
function handled(item) {
  return store.status(item.id) ?? (item.turnedIn ? 'turned in' : null);
}

function matches(item, optionId) {
  if (optionId === 'all') return true;
  if (optionId === 'mail' || optionId === 'classroom') return item.source === optionId;
  if (optionId.startsWith('group:')) return infoOf(item).group === optionId.slice(6);
  if (optionId === 'todo') return store.has('todo', item.id);
  if (optionId === 'starred') return store.has('stars', item.id);
  return false;
}

// Loaded items, plus saved copies of pinned/starred items that are no longer
// in the last 20 (so they don't vanish from To do / Starred)
function pool() {
  const loaded = new Set(items.map((it) => it.id));
  const saved = [...store.list('todo'), ...store.list('stars')].filter((s) => !loaded.has(s.id));
  const unique = new Map(saved.map((s) => [s.id, { ...s, saved: true }]));
  return [...items, ...unique.values()];
}

// ---------- 1. load ----------
async function fetchAll() {
  if (demo) {
    const now = new Date();
    return { items: withLongText([...demoMail(now), ...demoClassroom(now), ...demoExtras]), problems: [] };
  }
  if (tokenExpired(session)) throw new GoogleError('Your Google sign-in has expired (they last about an hour).', 401);

  const want = [
    session.granted?.gmail ? fetchMail(session) : Promise.resolve([]),
    session.granted?.classroom ? fetchClassroom(session) : Promise.resolve([]),
  ];
  const [mail, classroom] = await Promise.allSettled(want);
  const problems = [];
  if (mail.status === 'rejected') problems.push(['Mail', mail.reason]);
  if (classroom.status === 'rejected') problems.push(['Classroom', classroom.reason]);
  const expired = problems.find(([, e]) => e?.status === 401);
  if (expired) throw expired[1];
  return {
    items: [...(mail.value ?? []), ...(classroom.value ?? [])],
    problems,
  };
}

async function load({ quiet = false } = {}) {
  if (loading) return;
  loading = true;
  if (!quiet) $('list').innerHTML = '<div class="loading"><div class="spinner"></div>Fetching your mail and Classroom…</div>';
  try {
    const result = await fetchAll();
    items = result.items;
    lastLoaded = new Date();
    showSourceState(result.problems);
    await group();
    findNew();
  } catch (err) {
    if (err?.status === 401) showReconnect(err.message);
    else banner(`<span>⚠ ${esc(err.message)}</span>`);
  } finally {
    loading = false;
    render();
  }
}

function showSourceState(problems) {
  const pill = (id, granted, failed) => {
    $(id).classList.toggle('on', granted && !failed);
    $(id).classList.toggle('off', !granted || failed);
  };
  const failed = (name) => problems.some(([n]) => n === name);
  pill('mail-pill', demo || session.granted?.gmail, failed('Mail'));
  pill('class-pill', demo || session.granted?.classroom, failed('Classroom'));

  const notes = [];
  if (session.note) notes.push(esc(session.note));
  if (!demo && !session.granted?.gmail) notes.push('Mail access wasn\'t allowed at sign-in.');
  if (!demo && !session.granted?.classroom) notes.push('Classroom access wasn\'t allowed at sign-in.');
  for (const [name, e] of problems) notes.push(`${name}: ${esc(e?.message ?? e)}`);
  banner(notes.length ? `<span>⚠ ${notes.join('<br>')}</span>` : null);
}

function showReconnect(text) {
  banner(`<span>🔑 ${esc(text)}</span><span class="spacer"></span><button class="btn small primary" id="reconnect-btn" type="button">Reconnect</button>`);
  $('reconnect-btn').addEventListener('click', async () => {
    try {
      session = await signIn({ hint: session.email, prompt: '' });
      banner(null);
      load();
    } catch (e) { toast('Could not reconnect', e.message); }
  });
}

// ---------- 2. group ----------
async function group() {
  const settings = getSettings();
  const infos = store.data.infos;
  // With a key, anything not yet grouped by Gemini gets sent (only new items, so it's cheap)
  const todo = items.filter((it) => !infos[it.id] || (settings.key && infos[it.id].by !== 'gemini'));

  if (todo.length && settings.key) {
    $('status-line').innerHTML = '✨ Gemini is sorting your items…';
    try {
      const known = [...new Set([...DEFAULT_GROUPS, ...store.data.groups])];
      const { groups, infos: got } = await groupWithGemini(todo, known, settings);
      store.saveInfos(got, [...new Set([...store.data.groups, ...groups])]);
    } catch (err) {
      toast('Gemini couldn\'t sort the new items', `${err.message} Using simple rules for now.`);
    }
  }

  // Anything still missing: sample grouping (demo) or keyword rules
  const missing = items.filter((it) => !infos[it.id]);
  if (missing.length) {
    const fallback = demo ? demoGrouping(missing).infos : {};
    const add = {};
    for (const it of missing) add[it.id] = fallback[it.id] ?? ruleInfo(it);
    store.saveInfos(add);
  }

  // The default categories always show (even when empty); extra ones only while they have items
  const used = new Set(items.map((it) => infoOf(it).group));
  groupNames = [...new Set([...DEFAULT_GROUPS, ...store.data.groups.filter((g) => used.has(g)), ...used])];
  colors = assignColors(groupNames, store.data.colors);
  store.saveColors(colors);

  const by = items.map((it) => infoOf(it).by);
  groupedBy = by.includes('gemini') ? 'gemini' : by.includes('sample') ? 'sample' : 'rules';
}

// ---------- 3. what's new? ----------
function findNew() {
  const ids = items.map((it) => it.id);
  const first = !store.hasSeenAnything();
  const brandNew = store.markSeen(ids);
  store.prune();
  if (first || !brandNew.length) return; // the very first visit isn't "new", it's everything
  const newItems = items.filter((it) => brandNew.includes(it.id));
  newItems.forEach((it) => fresh.add(it.id));
  notify(newItems);
}

function notify(newItems) {
  const one = newItems[0];
  const title = newItems.length === 1 ? `New in ${one.source === 'mail' ? 'Mail' : 'Classroom'}` : `${newItems.length} new items`;
  const text = newItems.length === 1 ? `${one.from}: ${one.title}` : newItems.map((it) => it.title).slice(0, 3).join(' · ');
  toast(title, text);
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(`Tasque · ${title}`, { body: text, tag: 'tasque' }); } catch { /* some browsers need a service worker */ }
  }
  if (document.hidden) document.title = `(${fresh.size}) Tasque`;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = 'Tasque'; });

// Looking at Mail / Classroom / a group "reads" its new items (All doesn't)
function clearFreshFor(optionId) {
  if (!optionId || optionId === 'all' || optionId === 'history') return;
  for (const it of items) if (fresh.has(it.id) && matches(it, optionId)) setTimeout(() => fresh.delete(it.id), 4000);
  setTimeout(updateBadges, 4100);
}

// ---------- 4. render ----------
function lotusOptions() {
  const open = items.filter((it) => !handled(it));
  const count = (id) => open.filter((it) => matches(it, id)).length;
  const todoCount = pool().filter((it) => matches(it, 'todo') && !handled(it)).length;
  return [
    { id: 'all', label: 'All', sub: `${open.length} to do`, icon: 'all' },
    { id: 'mail', label: 'Mail', sub: `${count('mail')} open`, icon: 'mail' },
    { id: 'classroom', label: 'Classroom', sub: `${count('classroom')} open`, icon: 'classroom' },
    { id: 'todo', label: 'To do', sub: `${todoCount} to complete`, icon: 'todo', color: YELLOW },
    { id: 'starred', label: 'Starred', sub: `${store.list('stars').length} starred`, icon: 'star', color: YELLOW },
    ...groupNames.map((g) => ({ id: `group:${g}`, label: g, sub: `${count(`group:${g}`)} open`, icon: 'group', color: colors[g] })),
    { id: 'history', label: 'History', sub: `${store.history().length + items.filter((it) => !store.status(it.id) && it.turnedIn).length} handled`, icon: 'history' },
  ];
}

function updateBadges() {
  const counts = {};
  for (const opt of lotusOptions()) {
    counts[opt.id] = opt.id === 'history' ? 0 : items.filter((it) => fresh.has(it.id) && !handled(it) && matches(it, opt.id)).length;
  }
  lotus.setBadges(counts);
}

function render() {
  const selected = lotus.setOptions(lotusOptions(), lotus.selected ?? 'all');
  updateBadges();
  renderUser();
  renderKeyPill();
  renderStatusLine();

  const opt = lotusOptions().find((o) => o.id === selected);
  const color = opt?.color;
  $('view-title').innerHTML = `${color ? `<span class="swatch" style="background:${color};color:${color}"></span>` : ''}${esc(opt?.label ?? 'All')}`;

  $('show-handled').parentElement.hidden = selected === 'history' || selected === 'starred';
  if (selected === 'history') { renderHistory(); return; }
  if (!lastLoaded && !items.length) return; // still loading / failed before anything loaded

  const showHandled = $('show-handled').checked || selected === 'starred';
  const source = selected === 'todo' || selected === 'starred' ? pool() : items;
  const list = source.filter((it) => matches(it, selected) && (showHandled || !handled(it)));
  const contacts = selected === 'starred' ? contactsHtml() : '';
  if (!list.length) {
    const hint = { todo: 'Press the yellow 📌 To do button on anything you need to complete.', starred: 'Press ☆ on an email to keep it here, with the sender saved as a contact.' }[selected];
    $('list').innerHTML = contacts + `<div class="empty">${source.some((it) => matches(it, selected)) ? '🎉 All handled here. Turn on "Show handled" to see them.' : (hint ?? 'Nothing here yet.')}</div>`;
    return;
  }

  const now = new Date();
  const infos = Object.fromEntries(list.map((it) => [it.id, infoOf(it)]));
  $('list').innerHTML = contacts + arrange(list, infos, now).map((sec) => `
    <section class="section">
      <h2>${esc(sec.section)}</h2>
      ${sec.clusters.map((c) => (c.items.length > 1 ? clusterHtml(c) : cardHtml(c.items[0], now))).join('')}
    </section>`).join('');
}

function clusterHtml(c) {
  const events = [...new Set(c.items.map((e) => e.info.event).filter(Boolean))];
  return `<div class="cluster">
    <div class="cluster-head">📅 ${esc(c.label)} <small>${c.items.length} things on this day${events.length ? ` · ${esc(events.join(', '))}` : ''}</small></div>
    ${c.items.map((e) => cardHtml(e, new Date())).join('')}
  </div>`;
}

// What the main button says, by what Gemini thinks you need to do
const PRIMARY = {
  register: ['registered', 'Registered ✓'],
  attend: ['registered', 'Going ✓'],
  submit: ['done', 'Done ✓'],
  reply: ['done', 'Replied ✓'],
  check: ['checked', 'Checked ✓'],
  read: ['checked', 'Checked ✓'],
  none: ['checked', 'Checked ✓'],
};

// ---------- "Read more" ----------
// Classroom gives the full text straight away (item.body). Gmail only gives a
// ~200-character preview, so the whole email is fetched when you ask for it.
function fullText(item) {
  return bodies.get(item.id) ?? item.body ?? null;
}
function canExpand(item) {
  const full = fullText(item);
  if (full != null) return full.trim().length > (item.snippet ?? '').trim().length + 10;
  return item.source === 'mail' && !demo && !!item.gmailId; // not fetched yet
}
function textHtml(item) {
  const open = expanded.has(item.id);
  const full = fullText(item);
  const text = open && full != null
    ? `<div class="full-text">${linkify(esc(full))}</div>`
    : (item.snippet ? `<p class="snippet">${esc(item.snippet)}</p>` : '');
  const more = canExpand(item)
    ? `<button class="more-btn" type="button" data-more="${esc(item.id)}" aria-expanded="${open}">${open ? 'Show less ▴' : 'Read more ▾'}</button>`
    : '';
  return text + more;
}
// Turn web addresses in the (already escaped) text into links
function linkify(html) {
  return html.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)'"]/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}

async function toggleMore(btn) {
  const id = btn.dataset.more;
  if (expanded.has(id)) { expanded.delete(id); render(); return; }
  const item = items.find((it) => it.id === id);
  if (!item) return;
  if (fullText(item) == null) {
    btn.disabled = true;
    btn.textContent = 'Loading…';
    try {
      bodies.set(id, await fetchMailBody(session, item.gmailId));
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Read more ▾';
      if (err?.status === 401) showReconnect(err.message);
      else toast('Couldn\'t load the full email', err.message);
      return;
    }
  }
  expanded.add(id);
  render();
}

function cardHtml({ item, info, key }, now) {
  const color = colors[info.group] ?? '#a855ff';
  const state = handled(item);
  const [status, label] = PRIMARY[info.action] ?? PRIMARY.read;
  const when = key ? `${info.eventDate && !item.due ? 'Event' : 'Due'} ${friendlyDay(key, now)}${hasTime(key) ? ` ${formatTime(key)}` : ''}` : null;
  const urgent = key && (key - now) < 2 * 86400e3 && key > now;
  const title = item.link ? `<a href="${esc(item.link)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title);
  const icon = item.source === 'mail' ? ICONS.mail : ICONS.classroom;
  const todo = store.has('todo', item.id);
  const star = store.has('stars', item.id);

  return `<article class="card${fresh.has(item.id) ? ' new' : ''}${todo ? ' todo' : ''}" data-id="${esc(item.id)}">
    <div class="bar" style="background:${color};color:${color}"></div>
    <div>
      <div class="card-top">
        ${item.unread ? '<span class="unread" title="Unread"></span>' : ''}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg>
        <span title="${esc(item.fromEmail ?? '')}">${esc(item.from)}</span> · <span>${ago(item.date, now)}</span>
        ${fresh.has(item.id) ? '<span class="chip date">NEW</span>' : ''}
        ${item.saved ? '<span class="chip">saved copy</span>' : ''}
        <span class="card-side">
        ${trustHtml(item)}
        <button class="star-btn${star ? ' on' : ''}" type="button" data-star title="${star ? 'Unstar' : 'Star: keep for quick access and save the sender as a contact'}" aria-pressed="${star}">${star ? '★' : '☆'}</button>
        </span>
      </div>
      <h3>${title}</h3>
      ${textHtml(item)}
      <div class="chips">
        <span class="chip" style="border-color:${color};color:${color}">${esc(info.group ?? 'Other')}</span>
        ${when ? `<span class="chip date${urgent ? ' urgent' : ''}">${esc(when)}</span>` : ''}
        ${info.priority === 1 ? '<span class="chip urgent">Important</span>' : ''}
        ${info.event ? `<span class="chip">${esc(info.event)}</span>` : ''}
        ${state ? `<span class="chip done">✓ ${esc(state)}</span>` : ''}
      </div>
      <div class="card-actions">
        ${state
          ? (store.status(item.id) ? '<button class="btn small" data-act="undo">Undo</button>' : '')
          : `<button class="btn small todo-btn${todo ? ' on' : ''}" data-todo aria-pressed="${todo}">📌 ${todo ? 'On to-do list' : 'To do'}</button>
             <button class="btn small primary" data-act="${status}">${label}</button>
             ${status !== 'done' ? '<button class="btn small" data-act="done">Done</button>' : ''}
             <button class="btn small" data-act="dismissed">Dismiss</button>`}
      </div>
    </div>
  </article>`;
}

// The badge on the right of each card: is the sender really from the college?
function trustHtml(item) {
  const t = senderTrust(item);
  const tips = {
    verified: `Sent from ${item.fromEmail}, a college address`,
    spoofed: `Claims to be ${item.fromEmail}, but Gmail's security check FAILED. This may be a fake. Don't click links or share details.`,
    outside: `Sent from ${item.fromEmail || 'an unknown address'}, which is not a ${TRUSTED_DOMAINS[0]} address. Be careful with links and personal details.`,
    classroom: 'Posted in your Google Classroom',
  };
  const icon = { verified: '✔', spoofed: '⛔', outside: '⚠', classroom: '✔' }[t.level];
  return `<span class="trust ${t.level}" title="${esc(tips[t.level])}">${icon} ${esc(t.label)}</span>`;
}

// Starred view: everyone you starred an email from, so you can contact them later
function contactsHtml() {
  const people = new Map();
  for (const s of store.list('stars')) {
    if (s.source !== 'mail' || !s.fromEmail) continue;
    const p = people.get(s.fromEmail) ?? { name: s.from, email: s.fromEmail, count: 0, item: s };
    p.count++;
    people.set(s.fromEmail, p);
  }
  if (!people.size) return '';
  return `<section class="section">
    <h2>Saved contacts</h2>
    <div class="contacts">
      ${[...people.values()].map((p) => `<div class="contact">
        <span class="avatar">${esc((p.name || p.email)[0].toUpperCase())}</span>
        <div class="who"><b>${esc(p.name)}</b><small>${esc(p.email)} · ${p.count} starred</small></div>
        ${trustHtml(p.item)}
        <a class="btn small" href="mailto:${esc(p.email)}">✉ Email</a>
        <button class="btn small" type="button" data-copy="${esc(p.email)}">Copy</button>
      </div>`).join('')}
    </div>
  </section>`;
}

function renderHistory() {
  const byId = new Map(items.map((it) => [it.id, it]));
  const rows = [
    ...store.history(),
    ...items.filter((it) => it.turnedIn && !store.status(it.id))
      .map((it) => ({ id: it.id, status: 'turned in', at: null, title: it.title, source: 'classroom', link: it.link, auto: true })),
  ];
  if (!rows.length) {
    $('list').innerHTML = '<div class="empty">Nothing here yet. Mark things as Registered, Done or Checked and they show up here.</div>';
    return;
  }
  const clear = store.history().length
    ? '<div class="history-tools"><button class="btn small" type="button" data-clear>🗑 Clear history</button></div>'
    : '';
  $('list').innerHTML = clear + rows.map((r) => {
    const it = byId.get(r.id);
    const group = it ? infoOf(it).group : null;
    const title = r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.title)}</a>` : esc(r.title);
    return `<div class="history-row" data-id="${esc(r.id)}">
      <span class="chip done">✓ ${esc(r.status)}</span>
      <div class="what">${title}
        <small>${r.source === 'mail' ? 'Mail' : 'Classroom'}${group ? ` · ${esc(group)}` : ''}${r.at ? ` · ${ago(r.at)}` : ' · from Classroom'}</small></div>
      ${r.auto ? '' : '<button class="btn small" data-act="undo">Undo</button>'}
    </div>`;
  }).join('');
}

function renderUser() {
  const s = session;
  const face = s.picture ? `<img src="${esc(s.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${esc((s.name ?? '?')[0].toUpperCase())}</span>`;
  $('user').innerHTML = `${face}<span>${esc(demo ? s.name : s.email)}</span>`;
}

function renderKeyPill() {
  const { key } = getSettings();
  $('key-pill').classList.toggle('on', !!key);
  $('key-text').textContent = key ? 'Gemini key ✓' : 'Add Gemini key';
}

function renderStatusLine() {
  if (!lastLoaded) return;
  const mail = items.filter((it) => it.source === 'mail').length;
  const cls = items.length - mail;
  const how = { gemini: '✨ grouped by Gemini', sample: 'sample groups (add a Gemini key for real ones)', rules: 'grouped by keyword rules (add a Gemini key for smarter groups)' }[groupedBy];
  $('status-line').innerHTML = `${demo ? '<b>Demo</b> · ' : ''}${mail} emails · ${cls} Classroom items · ${how} · updated ${ago(lastLoaded)}`;
}

// ---------- actions (one listener for every card button) ----------
$('list').addEventListener('click', (e) => {
  const more = e.target.closest('button[data-more]');
  if (more) { toggleMore(more); return; }

  const copy = e.target.closest('button[data-copy]');
  if (copy) {
    navigator.clipboard?.writeText(copy.dataset.copy).then(() => toast('Copied', copy.dataset.copy), () => toast('Couldn\'t copy', copy.dataset.copy));
    return;
  }

  // Two clicks to clear, so it can't happen by accident
  const clear = e.target.closest('button[data-clear]');
  if (clear) {
    if (clear.dataset.sure) { store.clearHistory(); toast('History cleared'); render(); }
    else { clear.dataset.sure = '1'; clear.textContent = 'Click again to clear everything'; }
    return;
  }

  const card = e.target.closest('[data-id]');
  if (!card) return;
  const id = card.dataset.id;
  const item = pool().find((it) => it.id === id) ?? { id, title: store.data.statuses[id]?.title };

  if (e.target.closest('button[data-star]')) {
    const on = store.toggle('stars', item);
    toast(on ? '★ Starred' : 'Unstarred', on && item.fromEmail ? `${item.from} saved to your contacts` : (item.title ?? ''));
    render();
    return;
  }
  if (e.target.closest('button[data-todo]')) {
    const on = store.toggle('todo', item);
    toast(on ? '📌 Added to To do' : 'Removed from To do', item.title ?? '');
    render();
    return;
  }

  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'undo') store.setStatus(id, null);
  else {
    store.setStatus(id, act, item);
    store.remove('todo', id);          // finished, so it leaves the to-do list
    fresh.delete(id);
    toast(`Marked ${act}`, item.title ?? '');
  }
  render();
});

$('show-handled').addEventListener('change', render);
$('refresh-btn').addEventListener('click', () => load());

$('signout-btn').addEventListener('click', () => {
  clearSession();
  location.href = 'index.html';
});

function renderAlertsBtn() {
  const btn = $('alerts-btn');
  if (!('Notification' in window)) { btn.hidden = true; return; }
  btn.textContent = Notification.permission === 'granted' ? '🔔 Alerts on' : Notification.permission === 'denied' ? '🔕 Alerts blocked' : '🔔 Turn on alerts';
}
$('alerts-btn').addEventListener('click', async () => {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  else if (Notification.permission === 'granted') toast('Alerts are on', `You'll get a notification for new items while this tab is open.`);
  else toast('Alerts are blocked', 'Allow notifications for this site in your browser settings.');
  renderAlertsBtn();
});

// ---------- Gemini key dialog (same idea as Neon's) ----------
const keyDialog = $('key-dialog');
$('key-pill').addEventListener('click', () => {
  const s = getSettings();
  $('key-input').value = s.key;
  $('model-input').value = s.model;
  $('model-input').placeholder = DEFAULT_MODEL;
  keyDialog.showModal();
});
keyDialog.addEventListener('close', async () => {
  const before = getSettings().key;
  if (keyDialog.returnValue === 'save') saveSettings({ key: $('key-input').value, model: $('model-input').value });
  else if (keyDialog.returnValue === 'remove') clearKey();
  else return;
  renderKeyPill();
  if (getSettings().key && getSettings().key !== before) {
    await group();   // re-sort what's already loaded with the new key
    render();
  }
});

// ---------- keep checking for new things ----------
if (demo) {
  setTimeout(() => {
    demoExtras.push(demoNewItem(new Date()));
    load({ quiet: true });
  }, DEMO_NEW_AFTER);
} else {
  setInterval(() => { if (!tokenExpired(session)) load({ quiet: true }); }, POLL_MS);
}
setInterval(renderStatusLine, 60_000);

// ---------- go ----------
if (session) {
  renderAlertsBtn();
  load();
}
