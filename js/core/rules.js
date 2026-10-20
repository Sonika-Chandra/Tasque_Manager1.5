// Offline grouping, used when there's no Gemini key (or Gemini fails).
// Simple keyword rules; Gemini does much better, but this keeps the app useful.

import { findDateInText } from './dates.js';

const RULES = [
  { group: 'Registrations', words: ['register', 'registration', 'sign up', 'signup', 'rsvp', 'enrol', 'enroll', 'apply by', 'form'] , action: 'register' },
  { group: 'Club events', words: ['event', 'workshop', 'webinar', 'seminar', 'fest', 'hackathon', 'meetup', 'session', 'talk', 'competition', 'club'], action: 'attend' },
  { group: 'Campus admin', words: ['deadline', 'due', 'submit', 'submission', 'last date', 'fee', 'payment'], action: 'submit' },
  { group: 'Exams & classes', words: ['exam', 'test', 'quiz', 'midterm', 'viva', 'timetable', 'hall ticket'], action: 'attend' },
  { group: 'Career', words: ['internship', 'job', 'opportunity', 'scholarship', 'placement', 'hiring'], action: 'register' },
];

export function ruleInfo(item, now = new Date()) {
  const text = `${item.title} ${item.snippet ?? ''}`.toLowerCase();

  if (item.source === 'classroom') {
    const exams = /quiz|exam|test|mid-?sem|viva|class (moved|cancel)|extra class/i.test(`${item.title} ${item.snippet ?? ''}`);
    const group = item.kind === 'assignment' ? 'Coursework' : exams ? 'Exams & classes' : 'Coursework';
    return {
      group,
      eventDate: item.due ?? null,
      action: item.kind === 'assignment' ? 'submit' : 'read',
      priority: item.kind === 'assignment' ? 1 : 2,
      by: 'rules',
    };
  }

  const rule = RULES.find((r) => r.words.some((w) => text.includes(w)));
  const date = findDateInText(text, now);
  return {
    group: rule?.group ?? 'Low priority',
    eventDate: date ? date.toISOString() : null,
    action: rule?.action ?? 'read',
    priority: rule ? (date ? 1 : 2) : 3,
    by: 'rules',
  };
}
