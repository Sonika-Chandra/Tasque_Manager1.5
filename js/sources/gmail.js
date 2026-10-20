// Gmail: the last ~20 emails in your inbox (read-only).
// Two steps, because Gmail's list only returns ids:
//   1. list the newest message ids
//   2. fetch each one's subject, sender, date and preview text ("snippet")
// The full email is only downloaded when you press "Read more" (fetchMailBody).

import { googleGet } from './google.js';
import { emailAddress, authVerdict } from '../core/trust.js';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export async function fetchMail(session, count = 20) {
  const list = await googleGet(`${API}/messages?maxResults=${count}&q=${encodeURIComponent('in:inbox')}`, session.token);
  const ids = (list.messages ?? []).map((m) => m.id);
  const fields = ['Subject', 'From', 'Date', 'Authentication-Results'].map((h) => `metadataHeaders=${h}`).join('&');
  const messages = await Promise.all(ids.map((id) => googleGet(`${API}/messages/${id}?format=metadata&${fields}`, session.token)));
  return messages.map((m) => toItem(m, session.email));
}

function header(m, name) {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

// "Robotics Club <robotics@college.edu>" -> "Robotics Club"
function senderName(from) {
  const match = from.match(/^\s*"?([^"<]+?)"?\s*</);
  return (match ? match[1] : from).trim();
}

// Gmail snippets come with HTML entities like &#39; for '
function decodeEntities(text) {
  const t = document.createElement('textarea');
  t.innerHTML = text;
  return t.value;
}

function toItem(m, email) {
  return {
    id: `mail:${m.id}`,
    gmailId: m.id,
    source: 'mail',
    kind: 'email',
    from: senderName(header(m, 'From')),
    fromEmail: emailAddress(header(m, 'From')),
    auth: authVerdict(header(m, 'Authentication-Results')), // Gmail's check: 'pass' / 'fail' / null
    title: header(m, 'Subject') || '(no subject)',
    snippet: decodeEntities(m.snippet ?? ''),
    date: new Date(Number(m.internalDate)).toISOString(),
    due: null,
    unread: (m.labelIds ?? []).includes('UNREAD'),
    link: `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${m.threadId}`,
  };
}

// ---------- "Read more": one whole email ----------
// format=full gives the email as a tree of parts (plain text, HTML, attachments).
// Each part's text is base64url-encoded, so we find the best part and decode it.
export async function fetchMailBody(session, gmailId) {
  const m = await googleGet(`${API}/messages/${gmailId}?format=full`, session.token);
  const plain = findPart(m.payload, 'text/plain');
  if (plain) return tidy(decodeBase64Url(plain));
  const html = findPart(m.payload, 'text/html');
  if (html) return tidy(htmlToText(decodeBase64Url(html)));
  return m.snippet ? decodeEntities(m.snippet) : '';
}

// Depth-first search through the parts for the first one of this type that has data
function findPart(part, type) {
  if (!part) return null;
  if (part.mimeType === type && part.body?.data) return part.body.data;
  for (const p of part.parts ?? []) {
    const found = findPart(p, type);
    if (found) return found;
  }
  return null;
}

// base64url uses - and _ instead of + and /. atob gives bytes; TextDecoder turns
// the bytes into text properly (so emoji and accents survive).
function decodeBase64Url(data) {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// DOMParser reads the HTML without running it or loading its images
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, script, head').forEach((n) => n.remove());
  doc.querySelectorAll('br').forEach((n) => n.replaceWith('\n'));
  doc.querySelectorAll('p, div, li, tr, h1, h2, h3').forEach((n) => n.append('\n'));
  return doc.body?.textContent ?? '';
}

// Squash runs of blank lines and trailing spaces
function tidy(text) {
  return text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
