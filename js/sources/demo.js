// Demo mode: realistic sample mail and Classroom items, dated relative to
// today, so the app works for anyone (no Google account needed).
// Also a sample grouping, like Gemini might invent, for when there's no key.

import { addDays, startOfDay } from '../core/dates.js';
import { DEFAULT_GROUPS } from '../core/categories.js';

function at(now, days, h = 0, m = 0) {
  const d = addDays(startOfDay(now), days);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
const hoursAgo = (now, h) => new Date(now.getTime() - h * 3600e3).toISOString();

// Who each demo email is from. Most are college addresses; a few are outside ones.
const DEMO_ADDRESSES = {
  'Robotics Club': 'robotics@rvce.edu.in',
  'Tech Fest Team': 'techfest@rvce.edu.in',
  'Accounts Office': 'accounts@rvce.edu.in',
  'Placement Cell': 'placements@rvce.edu.in',
  'GDG On Campus': 'gdg-oncampus@example.org',
  'Library': 'library@rvce.edu.in',
  'Exam Cell': 'coe@rvce.edu.in',
  'Medium Daily Digest': 'noreply@medium.com',
  'Coding Club': 'codingclub@rvce.edu.in',
  'Student Council': 'studentcouncil@rvce.edu.in',
  'Prof. Rao': 'rao.cse@rvce.edu.in',
  'Google Classroom': 'no-reply@classroom.google.com',
  'Scholarship Office': 'scholarships@rvce.edu.in',
  'Hostel Office': 'hostel@rvce.edu.in',
  'LinkedIn': 'messages-noreply@linkedin.com',
  'NSS Unit': 'nss@rvce.edu.in',
  'Amazon': 'shipment-tracking@amazon.in',
  'Department Office': 'cse.office@cse.rvce.edu.in',
};
// Demo email 14 pretends to be the Scholarship Office, but Gmail's check failed: a fake
const FAKE = new Set([14]);

export function demoMail(now = new Date()) {
  const mail = [
    ['Robotics Club', 'Robo-Wars 2026: registrations close Friday', 'Teams of up to 4 can register on the club portal. The event is next Saturday at the main auditorium, 10am. Register by this Friday!', 2, [5, 23, 59]],
    ['Tech Fest Team', 'TechFest schedule is out', 'Day 1 keynote 9:30am, hackathon kickoff 11am. Full schedule attached. See you on the 1st day!', 5, null],
    ['Accounts Office', 'Reminder: semester fee payment due', 'The last date for paying the semester fee without a fine is tomorrow. Pay via the student portal.', 8, [1, 17, 0]],
    ['Placement Cell', 'Internship drive: Data Analyst roles', 'Eligible students must apply through the form by 30 Oct. Shortlisted students will be interviewed in the first week of November.', 20, null],
    ['GDG On Campus', 'Workshop: Build with Gemini (free)', 'Hands-on workshop this Thursday 4pm in Lab 3. RSVP on the event page so we can arrange laptops.', 26, [3, 16, 0]],
    ['Library', 'Your borrowed books are due soon', 'Two books are due for return on Monday. Renew online to avoid late fees.', 30, null],
    ['Exam Cell', 'Mid-semester exam timetable published', 'Mid-sems start 3 Nov. Hall tickets will be available next week on the portal.', 36, null],
    ['Robotics Club', 'Robo-Wars: team list confirmed?', 'If you registered, check your team name on the list. Reply if anything is wrong. Event: next Saturday.', 40, null],
    ['Medium Daily Digest', 'Stories picked for you', '10 stories about JavaScript, design and productivity.', 44, null],
    ['Coding Club', 'Weekly contest this Sunday 8pm', 'Contest on the club judge, 2 hours, 5 problems. Register with your roll number.', 50, null],
    ['Student Council', 'Cultural night volunteers needed', 'We need volunteers for cultural night on the same day as Robo-Wars. Sign up using the form.', 58, null],
    ['Prof. Rao', 'Project review moved', 'The mini-project review is moved to tomorrow 2pm, room 204. Bring your demo.', 3, null],
    ['Google Classroom', 'Due tomorrow: DBMS Lab 6', 'This is a reminder that DBMS Lab 6 is due tomorrow at 11:59pm.', 6, null],
    ['Scholarship Office', 'Merit scholarship: confirm your bank details', 'Your scholarship is approved! Enter your bank details at the link before 15 Nov or it will be cancelled.', 70, null],
    ['Hostel Office', 'Water supply maintenance today', 'Water supply will be off from 2pm to 4pm today in Block B.', 1, null],
    ['LinkedIn', 'You appeared in 12 searches this week', 'See who is looking at your profile.', 75, null],
    ['NSS Unit', 'Blood donation camp next Saturday', 'Volunteers and donors welcome. Register at the NSS desk.', 80, null],
    ['Placement Cell', 'Resume workshop on Monday', 'Bring a printed resume. Session in the seminar hall, 3pm. RSVP needed.', 90, null],
    ['Amazon', 'Your order has shipped', 'Your order of "Clean Code" will arrive by Thursday.', 95, null],
    ['Department Office', 'Lab attendance shortage list', 'Check whether your name is on the list and meet your mentor this week.', 100, null],
  ];
  return mail.map(([from, title, snippet, hrs], i) => ({
    id: `mail:demo${i + 1}`,
    source: 'mail',
    kind: 'email',
    from,
    fromEmail: DEMO_ADDRESSES[from],
    auth: FAKE.has(i + 1) ? 'fail' : 'pass',
    title,
    snippet,
    date: hoursAgo(now, hrs),
    due: null,
    unread: hrs < 30,
    link: null,
  }));
}

export function demoClassroom(now = new Date()) {
  const list = [
    ['DBMS', 'assignment', 'Lab 6: Joins and subqueries', 'Write queries for all 10 questions and upload a PDF.', 6, at(now, 1, 23, 59), false],
    ['Operating Systems', 'assignment', 'Assignment 3: Scheduling algorithms', 'Simulate FCFS, SJF and Round Robin. Report + code.', 30, at(now, 4, 23, 59), false],
    ['Operating Systems', 'announcement', 'Quiz 2 on Monday', 'Quiz 2 covers chapters 4 to 6. 20 minutes, in class.', 12, null, false],
    ['Computer Networks', 'assignment', 'Packet tracer lab 4', 'Configure VLANs as shown in the handout.', 50, at(now, 6, 23, 59), false],
    ['Computer Networks', 'announcement', 'Class moved online tomorrow', 'Tomorrow\'s class will be on Meet at the same time.', 4, null, false],
    ['Mini Project', 'assignment', 'Upload review 1 slides', 'Slides for the first project review.', 70, at(now, 1, 14, 0), false],
    ['Mathematics', 'assignment', 'Tutorial sheet 7', 'Solve all problems; submit a scanned copy.', 120, at(now, -1, 23, 59), true],
    ['Mathematics', 'announcement', 'Extra class on Saturday', 'Doubt-clearing session this Saturday 10am, room 101.', 26, null, false],
    ['DBMS', 'announcement', 'Mid-sem syllabus', 'Units 1 to 3. Normalisation is important.', 60, null, false],
    ['Operating Systems', 'material', 'Lecture slides: Deadlocks', 'Slides for this week\'s lectures.', 80, null, false],
  ];
  return list.map(([course, kind, title, snippet, hrs, due, turnedIn], i) => ({
    id: `classroom:demo${i + 1}`,
    source: 'classroom',
    kind,
    from: course,
    title,
    snippet,
    date: hoursAgo(now, hrs),
    due,
    unread: hrs < 24,
    turnedIn,
    link: null,
  }));
}

// Longer full texts for a few demo items, so you can try "Read more"
const LONG = {
  'mail:demo1': `Hi everyone,

Robo-Wars 2026 is here! Teams of up to 4 can register on the club portal.

Event: next Saturday, main auditorium, 10am to 5pm
Registration closes: this Friday, 11:59pm
Fee: Rs 200 per team (pay at the club desk or online)

Rules:
1. Bots must fit in a 45 x 45 x 45 cm box and weigh under 8 kg.
2. No flame, liquid or projectile weapons.
3. Each team must bring its own batteries and charger.

A safety check happens on the morning of the event at 8:30am. Teams that miss it can't compete.

Questions? Reply to this email or find us in Lab 2.

Robotics Club`,
  'mail:demo4': `Dear students,

The Placement Cell is running an internship drive for Data Analyst roles with three partner companies.

Eligibility: 3rd year, CGPA 7.0 or above, no active backlogs.
Stipend: Rs 20,000 to 30,000 per month. Duration: 6 months (Jan to Jun).

Apply through the form by 30 Oct. Attach a one-page resume as a PDF named RollNo_Name.pdf.
Shortlisted students will get an online test link, then interviews in the first week of November.

Placement Cell`,
  'classroom:demo3': `Quiz 2 on Monday.

Covers chapters 4 to 6: process synchronisation, semaphores, monitors and deadlocks.
20 minutes, in class, closed book. Bring a pen; answer sheets will be given.

If you have a clash with a lab, tell me before Friday so I can arrange a slot.`,
  'classroom:demo8': `Extra class on Saturday.

Doubt-clearing session this Saturday 10am, room 101. We'll go through tutorial sheets 5 to 7 and last year's mid-sem paper.

Attendance is optional but strongly recommended. Bring your questions written down so we can get through more of them.`,
};
export function withLongText(items) {
  return items.map((it) => (LONG[it.id] ? { ...it, body: LONG[it.id] } : it));
}

// A new item that "arrives" a little while after you open the demo,
// so you can see notifications work
export function demoNewItem(now = new Date()) {
  return {
    id: `classroom:demo-new-${now.getTime()}`,
    source: 'classroom',
    kind: 'assignment',
    from: 'Computer Networks',
    title: 'NEW: Surprise quiz posted',
    snippet: 'Short quiz on routing, open until the day after tomorrow.',
    date: now.toISOString(),
    due: at(now, 2, 23, 59),
    unread: true,
    turnedIn: false,
    link: null,
  };
}

// What a Gemini grouping of the demo data looks like (used without a key)
export function demoGrouping(items, now = new Date()) {
  const groups = [...DEFAULT_GROUPS];
  const pick = {
    demo1: ['Registrations', at(now, daysUntilWeekday(now, 5), 23, 59), 'register', 1, 'Robo-Wars'],
    demo2: ['Club events', null, 'read', 2, 'TechFest'],
    demo3: ['Campus admin', at(now, 1, 17, 0), 'submit', 1, 'Fee payment'],
    demo4: ['Career', at(now, daysUntil(now, 10, 30), 23, 59), 'register', 1, 'Internship drive'],
    demo5: ['Club events', at(now, daysUntilWeekday(now, 4), 16, 0), 'register', 2, 'Gemini workshop'],
    demo6: ['Campus admin', at(now, daysUntilWeekday(now, 1), 0, 0), 'submit', 2, 'Library books'],
    demo7: ['Exams & classes', at(now, daysUntil(now, 10, 3), 0, 0), 'read', 1, 'Mid-sems'],
    demo8: ['Club events', at(now, daysUntilWeekday(now, 6) + 7, 10, 0), 'check', 2, 'Robo-Wars'],
    demo9: ['Low priority', null, 'none', 3, null],
    demo10: ['Club events', at(now, daysUntilWeekday(now, 0), 20, 0), 'register', 2, 'Weekly contest'],
    demo11: ['Registrations', at(now, daysUntilWeekday(now, 6) + 7, 0, 0), 'register', 2, 'Cultural night'],
    demo12: ['Exams & classes', at(now, 1, 14, 0), 'attend', 1, 'Project review'],
    demo13: ['Coursework', at(now, 1, 23, 59), 'submit', 1, 'DBMS Lab 6'],
    demo14: ['Career', at(now, daysUntil(now, 10, 15), 23, 59), 'register', 2, 'Scholarship'],
    demo15: ['Campus admin', at(now, 0, 14, 0), 'read', 2, 'Water supply'],
    demo16: ['Low priority', null, 'none', 3, null],
    demo17: ['Club events', at(now, daysUntilWeekday(now, 6) + 7, 0, 0), 'register', 2, 'Blood donation'],
    demo18: ['Career', at(now, daysUntilWeekday(now, 1), 15, 0), 'register', 2, 'Resume workshop'],
    demo19: ['Low priority', null, 'none', 3, null],
    demo20: ['Campus admin', null, 'check', 2, 'Attendance list'],
  };
  const infos = {};
  for (const item of items) {
    const n = item.id.split(':')[1];
    if (item.source === 'mail' && pick[n]) {
      const [group, eventDate, action, priority, event] = pick[n];
      infos[item.id] = { group, eventDate, action, priority, event, by: 'sample' };
    } else if (item.source === 'classroom') {
      const exams = /quiz|exam|mid-sem|class moved|extra class/i.test(item.title);
      infos[item.id] = {
        group: item.kind === 'assignment' ? 'Coursework' : exams ? 'Exams & classes' : 'Coursework',
        eventDate: item.due ?? (/monday/i.test(item.title) ? at(now, daysUntilWeekday(now, 1), 0, 0) : null),
        action: item.kind === 'assignment' ? 'submit' : 'read',
        priority: item.kind === 'assignment' ? 1 : 2,
        event: null,
        by: 'sample',
      };
    }
  }
  return { groups, infos };
}

// Days from today until the given weekday (0 = Sunday), 1..7
function daysUntilWeekday(now, weekday) {
  const diff = (weekday - now.getDay() + 7) % 7;
  return diff === 0 ? 7 : diff;
}
// Days from today until a month/day (month 1-12)
function daysUntil(now, month, day) {
  let d = new Date(now.getFullYear(), month - 1, day);
  if (d < startOfDay(now)) d = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
}
