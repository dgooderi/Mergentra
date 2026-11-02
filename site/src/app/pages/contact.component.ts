import { Component, ElementRef, OnDestroy, ViewChild, afterNextRender } from '@angular/core';
import { FormsModule } from '@angular/forms';

// Public Cloudflare Turnstile site key (create a widget with action "contact"). Empty disables the form.
const TURNSTILE_SITE_KEY = '';

interface TurnstileApi {
  render(
    element: HTMLElement,
    options: { sitekey: string; action: string; callback: (token: string) => void }
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

@Component({
  selector: 'app-contact',
  imports: [FormsModule],
  template: `
    <section class="page-hero shell">
      <p class="eyebrow">Contact</p>
      <h1>Send a message.</h1>
      <p>
        Questions, bug reports and feedback on the experimental builds are welcome. Please use plain
        text; markup and code snippets are not accepted.
      </p>
    </section>
    <section class="shell contact-section">
      <form class="contact-form" #form="ngForm" (ngSubmit)="submit(form)" novalidate>
        <label for="contact-name">Name</label>
        <input
          id="contact-name"
          name="name"
          type="text"
          maxlength="100"
          autocomplete="name"
          required
          [(ngModel)]="model.name"
        />

        <label for="contact-email">Email</label>
        <input
          id="contact-email"
          name="email"
          type="email"
          maxlength="254"
          autocomplete="email"
          required
          [(ngModel)]="model.email"
        />

        <label for="contact-category">Topic</label>
        <select id="contact-category" name="category" required [(ngModel)]="model.category">
          @for (option of categories; track option) {
            <option [value]="option">{{ option }}</option>
          }
        </select>

        <label for="contact-message">Message</label>
        <textarea
          id="contact-message"
          name="message"
          rows="8"
          maxlength="4000"
          required
          [(ngModel)]="model.message"
        ></textarea>

        <div class="contact-trap" aria-hidden="true">
          <label for="contact-website">Leave this field empty</label>
          <input
            id="contact-website"
            name="website"
            type="text"
            tabindex="-1"
            autocomplete="off"
            [(ngModel)]="model.website"
          />
        </div>

        <div #widget class="contact-widget"></div>

        <button class="button button-primary" type="submit" [disabled]="!configured || sending">
          {{ sending ? 'Sending…' : 'Send message' }}
        </button>

        <p class="contact-status" role="status" aria-live="polite" [class.error]="isError">
          {{ status }}
        </p>
        @if (!configured) {
          <p class="contact-status error">The contact form is not available yet.</p>
        }
      </form>
    </section>
  `
})
export class ContactComponent implements OnDestroy {
  @ViewChild('widget') widget?: ElementRef<HTMLElement>;

  readonly categories = [
    'Question',
    'Bug report',
    'Feature request',
    'Testing an experimental build',
    'Other'
  ];
  readonly configured = TURNSTILE_SITE_KEY !== '';
  model = { name: '', email: '', category: 'Question', message: '', website: '' };
  status = '';
  isError = false;
  sending = false;
  private token = '';
  private widgetId?: string;

  constructor() {
    afterNextRender(() => {
      if (this.configured) {
        this.loadTurnstile();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.widgetId && window.turnstile) {
      window.turnstile.remove(this.widgetId);
    }
  }

  async submit(form: { invalid: boolean | null }): Promise<void> {
    if (this.sending || !this.configured) {
      return;
    }
    if (form.invalid) {
      this.report('Please fill in every field.', true);
      return;
    }
    if (!this.token) {
      this.report('Please complete the human check.', true);
      return;
    }
    this.sending = true;
    this.report('', false);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...this.model, turnstileToken: this.token })
      });
      const result: { ok?: boolean; message?: string } = await response.json().catch(() => ({}));
      if (response.ok && result.ok) {
        this.model = { name: '', email: '', category: 'Question', message: '', website: '' };
        form.invalid = false;
        this.report('Thank you. Your message has been sent.', false);
      } else {
        this.report(result.message ?? 'The message could not be sent. Please try again.', true);
      }
    } catch {
      this.report('The message could not be sent. Please try again.', true);
    } finally {
      this.sending = false;
      this.resetWidget();
    }
  }

  private report(message: string, error: boolean): void {
    this.status = message;
    this.isError = error;
  }

  private resetWidget(): void {
    this.token = '';
    if (this.widgetId && window.turnstile) {
      window.turnstile.reset(this.widgetId);
    }
  }

  private loadTurnstile(): void {
    const render = () => {
      if (!window.turnstile || !this.widget) {
        return;
      }
      this.widgetId = window.turnstile.render(this.widget.nativeElement, {
        sitekey: TURNSTILE_SITE_KEY,
        action: 'contact',
        callback: (token) => (this.token = token)
      });
    };
    if (window.turnstile) {
      render();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }
}
