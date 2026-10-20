// Core logic tests: node --test tests/core.test.js (no browser, no Google, no Gemini)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDateInText, dayKey, addDays, startOfDay } from '../js/core/dates.js';
import { arrange, sectionFor, assignColors } from '../js/core/priority.js';
import { ruleInfo } from '../js/core/rules.js';
import { demoMail, demoClassroom, demoGrouping } from '../js/sources/demo.js';

const NOW = new Date(2026, 9, 20, 15, 0); // Tue 20 Oct 2026, 3pm

test('finds dates written in different ways', () => {
  assert.equal(dayKey(findDateInText('due tomorrow', NOW)), '2026-10-21');
  assert.equal(dayKey(findDateInText('on 24 Oct', NOW)), '2026-10-24');
  assert.equal(dayKey(findDateInText('October 30th', NOW)), '2026-10-30');
  assert.equal(dayKey(findDateInText('by 3/11', NOW)), '2026-11-03');
  assert.equal(dayKey(findDateInText('this Friday', NOW)), '2026-10-23');
  assert.equal(findDateInText('no date here', NOW), null);
  const withTime = findDateInText('workshop tomorrow 4:30 pm', NOW);
  assert.equal(withTime.getHours(), 16);
  assert.equal(withTime.getMinutes(), 30);
});

test('a date early in the year means next year once it has long passed', () => {
  assert.equal(dayKey(findDateInText('on 5 Jan', NOW)), '2027-01-05');
});

test('sections: today, tomorrow, this week, later, past', () => {
  assert.equal(sectionFor(NOW, NOW), 'Today');
  assert.equal(sectionFor(addDays(NOW, 1), NOW), 'Tomorrow');
  assert.equal(sectionFor(addDays(NOW, 5), NOW), 'This week');
  assert.equal(sectionFor(addDays(NOW, 20), NOW), 'Later');
  assert.equal(sectionFor(addDays(NOW, -2), NOW), 'Past');
  assert.equal(sectionFor(null, NOW), 'No date');
});

test('upcoming items come soonest first, and same-day items are clubbed', () => {
  const day3 = addDays(startOfDay(NOW), 3).toISOString();
  const items = [
    { id: 'a', date: NOW.toISOString() },
    { id: 'b', date: NOW.toISOString() },
    { id: 'c', date: NOW.toISOString() },
    { id: 'd', date: addDays(NOW, -1).toISOString() },
  ];
  const info = {
    a: { eventDate: day3 },
    b: { eventDate: addDays(startOfDay(NOW), 1).toISOString() },
    c: { eventDate: day3, priority: 1 },
    d: {},
  };
  const sections = arrange(items, info, NOW);
  assert.deepEqual(sections.map((s) => s.section), ['Tomorrow', 'This week', 'No date']);
  const week = sections[1].clusters;
  assert.equal(week.length, 1, 'a and c share a day, so one cluster');
  assert.deepEqual(week[0].items.map((e) => e.item.id), ['c', 'a'], 'higher priority first inside the day');
});

test('group colours stay the same and never repeat while there are free ones', () => {
  const first = assignColors(['Events', 'Exams']);
  const second = assignColors(['Exams', 'Career', 'Events'], first);
  assert.equal(second.Events, first.Events);
  assert.equal(second.Exams, first.Exams);
  assert.equal(new Set(Object.values(second)).size, 3);
});

test('offline rules group mail and Classroom sensibly', () => {
  const reg = ruleInfo({ source: 'mail', title: 'Register for the hackathon', snippet: 'by 24 Oct' }, NOW);
  assert.equal(reg.group, 'Registrations');
  assert.equal(dayKey(reg.eventDate), '2026-10-24');
  const hw = ruleInfo({ source: 'classroom', kind: 'assignment', title: 'Lab 6', due: NOW.toISOString() }, NOW);
  assert.equal(hw.group, 'Coursework');
});

test('demo data is complete and every demo item gets a sample group', () => {
  const items = [...demoMail(NOW), ...demoClassroom(NOW)];
  assert.equal(demoMail(NOW).length, 20);
  assert.equal(new Set(items.map((i) => i.id)).size, items.length, 'ids are unique');
  const { infos, groups } = demoGrouping(items, NOW);
  for (const item of items) {
    assert.ok(infos[item.id], item.id);
    assert.ok(groups.includes(infos[item.id].group), `${item.id} -> ${infos[item.id].group}`);
  }
});

test('offline rules only ever use the default categories', async () => {
  const { DEFAULT_GROUPS } = await import('../js/core/categories.js');
  const items = [...demoMail(NOW), ...demoClassroom(NOW)];
  for (const item of items) {
    const { group } = ruleInfo(item, NOW);
    assert.ok(DEFAULT_GROUPS.includes(group), `${item.title} -> ${group}`);
  }
});

test('sender check: college addresses, outside addresses and fakes', async () => {
  const { senderTrust, emailAddress, authVerdict } = await import('../js/core/trust.js');
  assert.equal(emailAddress('"Robotics Club" <Robotics@RVCE.edu.in>'), 'robotics@rvce.edu.in');
  assert.equal(emailAddress('plain@rvce.edu.in'), 'plain@rvce.edu.in');

  const mail = (fromEmail, auth = null) => ({ source: 'mail', fromEmail, auth });
  assert.equal(senderTrust(mail('coe@rvce.edu.in', 'pass')).level, 'verified');
  assert.equal(senderTrust(mail('office@cse.rvce.edu.in')).level, 'verified');        // sub-domain is fine
  assert.equal(senderTrust(mail('coe@rvce.edu.in', 'fail')).level, 'spoofed');        // looks right, isn't
  assert.equal(senderTrust(mail('someone@gmail.com')).level, 'outside');
  assert.equal(senderTrust(mail('x@fakervce.edu.in')).level, 'outside');               // must be a real sub-domain
  assert.equal(senderTrust(mail('x@rvce.edu.in.evil.com')).level, 'outside');
  assert.equal(senderTrust({ source: 'classroom' }).level, 'classroom');

  assert.equal(authVerdict('mx.google.com; dkim=pass header.i=@rvce.edu.in; spf=pass; dmarc=pass (p=NONE)'), 'pass');
  assert.equal(authVerdict('mx.google.com; spf=fail smtp.mailfrom=rvce.edu.in; dmarc=fail (p=REJECT)'), 'fail');
  assert.equal(authVerdict('mx.google.com; spf=softfail; dkim=none'), 'fail');
  assert.equal(authVerdict(''), null);
});

test('To do and Star remember items (and Clear history only clears history)', async () => {
  const { createStore } = await import('../js/core/store.js');
  const store = createStore('test@rvce.edu.in');
  const item = { id: 'mail:1', source: 'mail', title: 'Hello', from: 'Prof', fromEmail: 'p@rvce.edu.in', date: NOW.toISOString(), extra: 'not kept' };
  assert.equal(store.toggle('stars', item), true);
  assert.equal(store.has('stars', 'mail:1'), true);
  assert.equal(store.list('stars')[0].fromEmail, 'p@rvce.edu.in');
  assert.equal(store.list('stars')[0].extra, undefined);
  assert.equal(store.toggle('todo', item), true);
  store.setStatus('mail:1', 'done', item);
  store.clearHistory();
  assert.equal(store.status('mail:1'), null);
  assert.equal(store.has('stars', 'mail:1'), true);
  assert.equal(store.toggle('stars', item), false);
  assert.equal(store.has('stars', 'mail:1'), false);
});
