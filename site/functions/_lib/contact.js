export const CATEGORIES = [
  'Question',
  'Bug report',
  'Feature request',
  'Testing an experimental build',
  'Other'
];

export const MAX_BODY_BYTES = 16 * 1024;

const LIMITS = { name: 100, email: 254, message: 4000 };
const MESSAGES = {
  invalid_name: 'Please enter your name using letters, spaces, apostrophes, dots or hyphens.',
  invalid_email: 'Please enter a valid email address.',
  invalid_category: 'Please choose one of the listed topics.',
  invalid_message: 'Please enter a message of up to 4000 characters.',
  blocked_content:
    'The message contains markup, script or database syntax that cannot be accepted. Please describe the problem in plain text.'
};

const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const EMAIL_PATTERN =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
// eslint-disable-next-line no-control-regex
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/;

const UNSAFE_PATTERNS = [
  /<\s*\/?\s*[a-z!?]/i,
  /&(?:lt|gt|#x?[0-9a-f]+);/i,
  /\b(?:javascript|vbscript|data)\s*:/i,
  /\bon[a-z]{3,20}\s*=/i,
  /\bunion\b[\s\S]{0,30}\bselect\b/i,
  /;\s*(?:drop|delete|insert|update|alter|truncate|exec|select)\b/i,
  /\b(?:drop|truncate)\s+(?:table|database)\b/i,
  /\b(?:or|and)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i,
  /['"]\s*(?:or|and)\s+['"\d]/i,
  /\b(?:xp_cmdshell|sleep\s*\(\s*\d+\s*\)|benchmark\s*\()/i,
  /\/\*[\s\S]*?\*\//,
  /(?:^|\s)--\s*(?:$|\w)/m
];

export function messageFor(error) {
  return MESSAGES[error] ?? 'The message could not be sent. Please try again later.';
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

export function validateContact(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'invalid_message' };
  }
  const name = text(input.name).normalize('NFC').trim();
  const email = text(input.email).trim();
  const category = text(input.category);
  const message = text(input.message).normalize('NFC').replace(/\r\n?/g, '\n').trim();

  if (!name || name.length > LIMITS.name || !NAME_PATTERN.test(name)) {
    return { ok: false, error: 'invalid_name' };
  }
  if (!email || email.length > LIMITS.email || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'invalid_email' };
  }
  if (!CATEGORIES.includes(category)) {
    return { ok: false, error: 'invalid_category' };
  }
  if (!message || message.length > LIMITS.message || CONTROL_PATTERN.test(message)) {
    return { ok: false, error: 'invalid_message' };
  }
  if (UNSAFE_PATTERNS.some((pattern) => pattern.test(message))) {
    return { ok: false, error: 'blocked_content' };
  }
  return { ok: true, value: { name, email, category, message } };
}

export async function verifyTurnstile(token, secret, remoteIp, fetchImpl = fetch) {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048 || !secret) {
    return false;
  }
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (remoteIp) {
    body.append('remoteip', remoteIp);
  }
  try {
    const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body
    });
    if (!response.ok) {
      return false;
    }
    const result = await response.json();
    return result.success === true && result.action === 'contact';
  } catch {
    return false;
  }
}

function assertAddress(address) {
  if (typeof address !== 'string' || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/.test(address)) {
    throw new Error('Invalid mail address configuration');
  }
  return address;
}

function toBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary)
    .replace(/(.{76})/g, '$1\r\n')
    .trimEnd();
}

export function buildMessage({
  from,
  to,
  submission,
  date = new Date(),
  id = crypto.randomUUID()
}) {
  const sender = assertAddress(from);
  const recipient = assertAddress(to);
  const { name, email, category, message } = submission;
  const body = [`Name: ${name}`, `Email: ${email}`, `Topic: ${category}`, '', message].join('\r\n');
  return [
    `From: Mergentra website <${sender}>`,
    `To: ${recipient}`,
    `Reply-To: "${name}" <${email}>`,
    `Subject: Mergentra contact: ${category}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <${id}@${sender.split('@')[1]}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    toBase64(body),
    ''
  ].join('\r\n');
}
