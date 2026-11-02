import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest, onRequestPost } from '../../site/functions/api/contact.js';
import { buildMessage, validateContact } from '../../site/functions/_lib/contact.js';

const valid = {
  name: "Ada O'Neil-Smith",
  email: 'ada@example.test',
  category: 'Bug report',
  message: 'The graph looks wrong when I select a commit.'
};

function request(body, headers = {}) {
  return new Request('https://site.test/api/contact', {
    method: 'POST',
    headers: { origin: 'https://site.test', 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

function environment(overrides = {}) {
  return {
    TURNSTILE_SECRET: 'secret',
    CONTACT_MAILER: { fetch: vi.fn(async () => new Response('Sent')) },
    ...overrides
  };
}

function turnstileReplies(result) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(result), { status: 200 }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('validateContact', () => {
  it('accepts a normal message, including ordinary words that look like SQL', () => {
    expect(validateContact(valid).ok).toBe(true);
    expect(
      validateContact({
        ...valid,
        message: "I can't select the commit I want to open, or delete from the list."
      }).ok
    ).toBe(true);
  });

  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    'click javascript:alert(1)',
    'a onclick=steal()',
    "' OR 1=1 --",
    "x' or '1'='1",
    '1 UNION SELECT password FROM users',
    '"; DROP TABLE users; --',
    'name; delete from users',
    '&lt;b&gt;',
    '/* comment */ hello'
  ])('blocks %s', (message) => {
    expect(validateContact({ ...valid, message })).toEqual({ ok: false, error: 'blocked_content' });
  });

  it('rejects bad names, emails, topics and sizes', () => {
    expect(validateContact({ ...valid, name: '<b>x</b>' }).error).toBe('invalid_name');
    expect(validateContact({ ...valid, name: 'Ada\r\nBcc: x@y.test' }).error).toBe('invalid_name');
    expect(validateContact({ ...valid, email: 'ada@example.test\r\nBcc: x@y.test' }).error).toBe(
      'invalid_email'
    );
    expect(validateContact({ ...valid, email: 'not-an-email' }).error).toBe('invalid_email');
    expect(validateContact({ ...valid, category: 'Other\r\nX: y' }).error).toBe('invalid_category');
    expect(validateContact({ ...valid, message: 'x'.repeat(4001) }).error).toBe('invalid_message');
    expect(validateContact({ ...valid, message: '   ' }).error).toBe('invalid_message');
    expect(validateContact({ ...valid, message: 'a\u0000b' }).error).toBe('invalid_message');
    expect(validateContact({ ...valid, name: 42 }).error).toBe('invalid_name');
    expect(validateContact(null).ok).toBe(false);
  });
});

describe('buildMessage', () => {
  it('builds a plain-text base64 message with only the expected headers', () => {
    const raw = buildMessage({
      from: 'site@example.test',
      to: 'inbox@example.test',
      submission: validateContact(valid).value,
      date: new Date('2026-11-03T00:00:00Z'),
      id: 'fixed-id'
    });
    const [headers, body] = raw.split('\r\n\r\n');
    expect(headers.split('\r\n').map((line) => line.split(':')[0])).toEqual([
      'From',
      'To',
      'Reply-To',
      'Subject',
      'Date',
      'Message-ID',
      'MIME-Version',
      'Content-Type',
      'Content-Transfer-Encoding'
    ]);
    expect(atob(body.replace(/\r\n/g, ''))).toContain(valid.message);
  });

  it('refuses addresses that could inject headers', () => {
    expect(() =>
      buildMessage({
        from: 'site@example.test\r\nBcc: x@y.test',
        to: 'inbox@example.test',
        submission: validateContact(valid).value
      })
    ).toThrow();
  });
});

describe('contact endpoint', () => {
  it('rejects cross-origin and non-JSON requests', async () => {
    const env = environment();
    expect(
      (await onRequestPost({ request: request(valid, { origin: 'https://evil.test' }), env }))
        .status
    ).toBe(403);
    expect(
      (await onRequestPost({ request: request(valid, { 'content-type': 'text/plain' }), env }))
        .status
    ).toBe(415);
    expect((await onRequestPost({ request: request('x'.repeat(20_000)), env })).status).toBe(413);
    expect((await onRequestPost({ request: request('{not json'), env })).status).toBe(400);
    expect((await onRequestPost({ request: request('[]'), env })).status).toBe(400);
    expect(env.CONTACT_MAILER.fetch).not.toHaveBeenCalled();
  });

  it('answers a filled honeypot as a success without sending anything', async () => {
    const env = environment();
    turnstileReplies({ success: true, action: 'contact' });
    const response = await onRequestPost({
      request: request({ ...valid, website: 'http://spam.test', turnstileToken: 't' }),
      env
    });
    expect(response.status).toBe(200);
    expect(env.CONTACT_MAILER.fetch).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not spend the human-check token when the form is invalid', async () => {
    const env = environment();
    turnstileReplies({ success: true, action: 'contact' });
    const response = await onRequestPost({
      request: request({ ...valid, message: '<script>x</script>', turnstileToken: 't' }),
      env
    });
    expect(response.status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects submissions that fail the human check', async () => {
    const env = environment();
    turnstileReplies({ success: false });
    const response = await onRequestPost({
      request: request({ ...valid, turnstileToken: 'bad' }),
      env
    });
    expect(response.status).toBe(400);
    expect(env.CONTACT_MAILER.fetch).not.toHaveBeenCalled();
  });

  it('requires the action to match', async () => {
    const env = environment();
    turnstileReplies({ success: true, action: 'something-else' });
    const response = await onRequestPost({
      request: request({ ...valid, turnstileToken: 't' }),
      env
    });
    expect(response.status).toBe(400);
  });

  it('sends one cleaned message to the mailer on success', async () => {
    const env = environment();
    turnstileReplies({ success: true, action: 'contact' });
    const response = await onRequestPost({
      request: request({ ...valid, turnstileToken: 't', extra: 'ignored' }),
      env
    });
    expect(response.status).toBe(200);
    expect(env.CONTACT_MAILER.fetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(env.CONTACT_MAILER.fetch.mock.calls[0][1].body);
    expect(Object.keys(payload).sort()).toEqual(['category', 'email', 'message', 'name']);
  });

  it('reports a mailer failure and a missing configuration', async () => {
    turnstileReplies({ success: true, action: 'contact' });
    const failing = environment({
      CONTACT_MAILER: { fetch: vi.fn(async () => new Response('no', { status: 500 })) }
    });
    expect(
      (await onRequestPost({ request: request({ ...valid, turnstileToken: 't' }), env: failing }))
        .status
    ).toBe(502);
    expect(
      (
        await onRequestPost({
          request: request({ ...valid, turnstileToken: 't' }),
          env: environment({ TURNSTILE_SECRET: '' })
        })
      ).status
    ).toBe(503);
  });

  it('only allows POST', () => {
    expect(onRequest().status).toBe(405);
  });
});
