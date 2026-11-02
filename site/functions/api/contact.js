import { MAX_BODY_BYTES, messageFor, validateContact, verifyTurnstile } from '../_lib/contact.js';

function reply(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders
    }
  });
}

export async function onRequestPost({ request, env }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return reply(403, { ok: false, error: 'forbidden' });
  }
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return reply(415, { ok: false, error: 'unsupported' });
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return reply(413, { ok: false, error: 'too_large' });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return reply(413, { ok: false, error: 'too_large' });
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, error: 'invalid_message', message: messageFor('invalid') });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return reply(400, { ok: false, error: 'invalid_message', message: messageFor('invalid') });
  }

  // Hidden field that people never see; any value means a bot. Answer as if it worked.
  if (typeof data.website === 'string' && data.website.trim() !== '') {
    return reply(200, { ok: true });
  }

  const result = validateContact(data);
  if (!result.ok) {
    return reply(422, { ok: false, error: result.error, message: messageFor(result.error) });
  }

  if (!env.TURNSTILE_SECRET || !env.CONTACT_MAILER) {
    return reply(503, { ok: false, error: 'unavailable', message: messageFor('unavailable') });
  }
  const human = await verifyTurnstile(
    data.turnstileToken,
    env.TURNSTILE_SECRET,
    request.headers.get('cf-connecting-ip')
  );
  if (!human) {
    return reply(400, {
      ok: false,
      error: 'bot_check',
      message: 'The human check failed. Please try again.'
    });
  }

  try {
    const sent = await env.CONTACT_MAILER.fetch('https://contact-mailer.internal/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(result.value)
    });
    if (!sent.ok) {
      throw new Error('mailer rejected the message');
    }
  } catch {
    return reply(502, { ok: false, error: 'send_failed', message: messageFor('send_failed') });
  }
  return reply(200, { ok: true });
}

export function onRequest() {
  return reply(405, { ok: false, error: 'method_not_allowed' }, { allow: 'POST' });
}
