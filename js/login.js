// Login page: Google sign-in (with the typed email as a hint) or Demo mode.

import { signIn, getSession, saveSession, getClientId, saveClientId, tokenExpired } from './sources/google.js';

const $ = (id) => document.getElementById(id);
const message = $('message');
const LAST_EMAIL = 'tasque-last-email';

function say(text, ok = false) {
  message.textContent = text;
  message.classList.toggle('ok', ok);
}

// Already signed in (in this tab)? Go straight to the app.
const existing = getSession();
if (existing && (existing.mode === 'demo' || !tokenExpired(existing))) location.replace('app.html');

try { $('email').value = localStorage.getItem(LAST_EMAIL) ?? ''; } catch { /* storage blocked */ }

// ---------- Google sign-in ----------
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) { say('Type your student email first.'); $('email').focus(); return; }
  try { localStorage.setItem(LAST_EMAIL, email); } catch { /* storage blocked */ }

  if (!getClientId()) { say('Google sign-in needs a one-time setup first.'); openSetup(); return; }

  const btn = $('google-btn');
  btn.disabled = true;
  say('A Google window should open. Choose your account and allow access…', true);
  try {
    const session = await signIn({ hint: email });
    if (session.email.toLowerCase() !== email.toLowerCase()) {
      session.note = `You typed ${email} but signed in as ${session.email}.`;
      saveSession(session);
    }
    location.href = 'app.html';
  } catch (err) {
    say(err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- Demo mode ----------
$('demo-btn').addEventListener('click', () => {
  const typed = $('email').value.trim();
  saveSession({ mode: 'demo', email: 'demo@tasque.app', name: typed ? `Demo (${typed})` : 'Demo student', picture: null });
  location.href = 'app.html';
});

// ---------- Client ID setup ----------
const dialog = $('client-dialog');
function openSetup() {
  $('origin').textContent = location.origin;
  $('client-id').value = getClientId();
  dialog.showModal();
}
$('setup-btn').addEventListener('click', openSetup);
dialog.addEventListener('close', () => {
  if (dialog.returnValue !== 'save') return;
  const id = $('client-id').value.trim();
  if (!id) return;
  if (!/\.apps\.googleusercontent\.com$/.test(id)) { say('That doesn\'t look like a Client ID (it ends in .apps.googleusercontent.com).'); return; }
  saveClientId(id);
  say('Saved. Now press "Sign in with Google".', true);
});
