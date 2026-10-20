// Google sign-in (OAuth) using Google Identity Services.
//
// Why not just an email + Gemini key? Google never lets a website read
// someone's Gmail or Classroom from their address alone. The person signs in
// with Google in a popup and approves exactly what may be read ("scopes").
// Google then gives this page a short-lived ACCESS TOKEN (about 1 hour).
// The token stays in this browser tab (sessionStorage) and is sent only to Google.

const SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/gmail.readonly',                     // read mail (no sending, no deleting)
  'https://www.googleapis.com/auth/classroom.courses.readonly',          // your classes
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',    // your assignments + whether you turned them in
  'https://www.googleapis.com/auth/classroom.announcements.readonly',   // class announcements
];

export const SCOPE = {
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
  classroom: 'https://www.googleapis.com/auth/classroom.courses.readonly',
};

const CLIENT_ID_KEY = 'tasque-client-id';
const SESSION_KEY = 'tasque-session';

function safeGet(store, key) { try { return store.getItem(key); } catch { return null; } }
function safeSet(store, key, value) { try { store.setItem(key, value); } catch { /* blocked */ } }
function safeRemove(store, key) { try { store.removeItem(key); } catch { /* blocked */ } }

export const getClientId = () => safeGet(localStorage, CLIENT_ID_KEY) ?? '';
export const saveClientId = (id) => safeSet(localStorage, CLIENT_ID_KEY, id.trim());

// ---------- the session (who's signed in, in this tab) ----------
export function getSession() {
  try { return JSON.parse(safeGet(sessionStorage, SESSION_KEY) ?? 'null'); } catch { return null; }
}
export function saveSession(session) {
  safeSet(sessionStorage, SESSION_KEY, JSON.stringify(session));
}
export function clearSession() {
  const s = getSession();
  if (s?.token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(s.token, () => {});
  safeRemove(sessionStorage, SESSION_KEY);
}
export const tokenExpired = (s) => !s?.token || Date.now() > s.expiresAt - 60_000;

// ---------- loading Google's sign-in script ----------
let gisPromise = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisPromise = null; reject(new Error('Could not load Google sign-in. Are you online?')); };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

// Opens Google's popup. Must be called from a click (browsers block popups otherwise).
// hint: the email typed on the login page, so Google pre-selects that account.
export async function signIn({ hint = '', prompt = 'consent' } = {}) {
  const clientId = getClientId();
  if (!clientId) throw new Error('Google sign-in isn\'t set up yet. Add your Client ID first (see SETUP.md).');
  await loadGis();

  const response = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES.join(' '),
      hint,
      prompt,
      callback: (r) => (r.error ? reject(new Error(explainOAuthError(r.error, r.error_description))) : resolve(r)),
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'The sign-in window was closed.' : `Sign-in failed (${e.type}).`)),
    });
    client.requestAccessToken();
  });

  // Google lets people untick permissions; remember which ones we really got
  const granted = {
    gmail: window.google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE.gmail),
    classroom: window.google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE.classroom),
  };
  const token = response.access_token;
  const profile = await googleGet('https://www.googleapis.com/oauth2/v3/userinfo', token);

  const session = {
    mode: 'google',
    token,
    expiresAt: Date.now() + Number(response.expires_in ?? 3600) * 1000,
    email: profile.email,
    name: profile.name ?? profile.email,
    picture: profile.picture ?? null,
    granted,
  };
  saveSession(session);
  return session;
}

function explainOAuthError(code, description) {
  if (code === 'access_denied') return 'Access was not allowed. If this is a school account, your school may block outside apps. Try Demo mode or a personal account.';
  if (code === 'admin_policy_enforced') return 'Your school\'s Google admin blocks this app. Ask IT to allow it, or use Demo mode.';
  return description || code;
}

// ---------- calling Google APIs ----------
export class GoogleError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function googleGet(url, token) {
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new GoogleError('Could not reach Google. Are you online?', 0);
  }
  if (res.ok) return res.json();

  let reason = '';
  try { reason = (await res.json())?.error?.message ?? ''; } catch { /* no body */ }
  if (res.status === 401) throw new GoogleError('Your Google sign-in has expired. Press Reconnect.', 401);
  if (res.status === 403) {
    if (/has not been used|is disabled/i.test(reason)) {
      throw new GoogleError('This API isn\'t turned on in your Google Cloud project (see SETUP.md, step 2).', 403);
    }
    throw new GoogleError('Google refused access. A school account may block this for outside apps.', 403);
  }
  throw new GoogleError(`Google error ${res.status}${reason ? `: ${reason}` : ''}`, res.status);
}
