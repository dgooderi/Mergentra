import { EmailMessage } from 'cloudflare:email';
import { buildMessage, validateContact } from '../../../functions/_lib/contact.js';

// Reachable only through the Pages project's service binding; it has no public route.
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    let data;
    try {
      data = await request.json();
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    const result = validateContact(data);
    if (!result.ok) {
      return new Response('Rejected', { status: 422 });
    }
    const raw = buildMessage({
      from: env.CONTACT_FROM,
      to: env.CONTACT_TO,
      submission: result.value
    });
    await env.EMAIL.send(new EmailMessage(env.CONTACT_FROM, env.CONTACT_TO, raw));
    return new Response('Sent', { status: 200 });
  }
};
