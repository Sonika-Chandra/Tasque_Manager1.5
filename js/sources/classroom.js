// Google Classroom (read-only): assignments, announcements, and whether
// you've turned each assignment in.
//
// For each active class: its coursework, its announcements, and your
// submissions. Then keep the 20 most recently updated items.

import { googleGet } from './google.js';

const API = 'https://classroom.googleapis.com/v1';

export async function fetchClassroom(session, count = 20) {
  const { courses = [] } = await googleGet(`${API}/courses?studentId=me&courseStates=ACTIVE&pageSize=20`, session.token);
  const perCourse = await Promise.allSettled(courses.slice(0, 12).map((c) => fetchCourse(c, session.token)));
  // One class failing (e.g. you're the teacher there) shouldn't hide the others
  const items = perCourse.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  return items.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, count);
}

async function fetchCourse(course, token) {
  const base = `${API}/courses/${course.id}`;
  const [work, news, subs] = await Promise.all([
    googleGet(`${base}/courseWork?orderBy=${encodeURIComponent('updateTime desc')}&pageSize=10`, token).catch(() => ({})),
    googleGet(`${base}/announcements?orderBy=${encodeURIComponent('updateTime desc')}&pageSize=5`, token).catch(() => ({})),
    googleGet(`${base}/courseWork/-/studentSubmissions?userId=me&pageSize=30`, token).catch(() => ({})),
  ]);

  const turnedIn = new Set((subs.studentSubmissions ?? [])
    .filter((s) => s.state === 'TURNED_IN' || s.state === 'RETURNED')
    .map((s) => s.courseWorkId));

  const assignments = (work.courseWork ?? []).map((w) => ({
    id: `classroom:${w.id}`,
    source: 'classroom',
    kind: w.workType === 'MATERIAL' ? 'material' : 'assignment',
    from: course.name,
    title: w.title,
    snippet: (w.description ?? '').slice(0, 300),
    body: w.description ?? '',            // the full text, for "Read more"
    date: w.updateTime ?? w.creationTime,
    due: dueDate(w),
    unread: false,
    turnedIn: turnedIn.has(w.id),
    link: w.alternateLink,
  }));

  const announcements = (news.announcements ?? []).map((a) => ({
    id: `classroom:${a.id}`,
    source: 'classroom',
    kind: 'announcement',
    from: course.name,
    title: firstLine(a.text),
    snippet: (a.text ?? '').slice(0, 300),
    body: a.text ?? '',                   // the full announcement, for "Read more"
    date: a.updateTime ?? a.creationTime,
    due: null,
    unread: false,
    turnedIn: false,
    link: a.alternateLink,
  }));

  return [...assignments, ...announcements];
}

// Classroom gives due dates as { year, month, day } + { hours, minutes } in UTC
function dueDate(w) {
  if (!w.dueDate) return null;
  const { year, month, day } = w.dueDate;
  const { hours = 23, minutes = 59 } = w.dueTime ?? {};
  return new Date(Date.UTC(year, month - 1, day, hours, minutes)).toISOString();
}

function firstLine(text = '') {
  const line = text.split('\n').find((l) => l.trim()) ?? 'Announcement';
  return line.length > 90 ? `${line.slice(0, 87)}…` : line;
}
