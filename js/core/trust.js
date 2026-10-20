// Is this email really from the college?
//
// Two checks:
//  1. The sender's address ends in a trusted domain (@rvce.edu.in, or a
//     sub-domain like @cse.rvce.edu.in).
//  2. Gmail's own security check agrees. Anyone can TYPE "accounts@rvce.edu.in"
//     as the From address of a fake email. When an email arrives, Gmail checks
//     whether it really came from that domain's mail servers (SPF / DKIM /
//     DMARC) and writes the result in the "Authentication-Results" header.
//     If that says "fail", the From address is fake even though it looks right.

// Add more domains here if you like, e.g. 'classroom.google.com'
export const TRUSTED_DOMAINS = ['rvce.edu.in'];

// "Robotics Club <robotics@rvce.edu.in>" -> "robotics@rvce.edu.in"
export function emailAddress(from = '') {
  const angle = from.match(/<([^>]+)>/);
  const plain = from.match(/[^\s<>"]+@[^\s<>"]+/);
  return (angle?.[1] ?? plain?.[0] ?? '').trim().toLowerCase();
}

export const domainOf = (email = '') => email.split('@')[1]?.toLowerCase() ?? '';

export function isTrustedDomain(domain, trusted = TRUSTED_DOMAINS) {
  return trusted.some((d) => domain === d || domain.endsWith(`.${d}`));
}

// Reads Gmail's Authentication-Results header. 'pass', 'fail' or null (unknown).
// DMARC is the overall verdict; if it isn't there, a failed SPF *and* DKIM also counts as fail.
export function authVerdict(header = '') {
  const h = header.toLowerCase();
  const result = (name) => h.match(new RegExp(`\\b${name}=(\\w+)`))?.[1] ?? null;
  const dmarc = result('dmarc');
  if (dmarc) return dmarc === 'pass' ? 'pass' : (dmarc === 'fail' ? 'fail' : null);
  const spf = result('spf');
  const dkim = result('dkim');
  if (spf === 'pass' || dkim === 'pass') return 'pass';
  if (spf === 'fail' || spf === 'softfail' || dkim === 'fail') return 'fail';
  return null;
}

// What the badge on the card should say
//   verified   - from the college and Gmail's check is fine
//   spoofed    - CLAIMS to be from the college but Gmail's check failed (danger!)
//   outside    - from some other address (flagged)
//   classroom  - came through Google Classroom itself
export function senderTrust(item, trusted = TRUSTED_DOMAINS) {
  if (item.source === 'classroom') return { level: 'classroom', label: 'Classroom', domain: null };
  const domain = domainOf(item.fromEmail);
  if (!domain) return { level: 'outside', label: 'Unknown sender', domain: '' };
  if (isTrustedDomain(domain, trusted)) {
    return item.auth === 'fail'
      ? { level: 'spoofed', label: 'Fake sender?', domain }
      : { level: 'verified', label: domain, domain };
  }
  return { level: 'outside', label: `Not ${trusted[0]}`, domain };
}
