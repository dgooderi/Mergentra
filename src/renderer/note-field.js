import { renderMarkdown } from './markdown.js';

// Wraps a note textarea with an Edit/Preview toggle. The stored value stays plain Markdown text.
export function enhanceNoteField(textarea, { label, previewTestId }) {
  const element = document.createElement('div');
  element.className = 'markdown-note';
  const toggle = document.createElement('button');
  const preview = document.createElement('div');
  toggle.type = 'button';
  toggle.className = 'note-view-toggle secondary';
  preview.className = 'note-preview';
  preview.dataset.testid = previewTestId;
  preview.hidden = true;

  let previewing = false;
  const update = () => {
    if (previewing) {
      renderMarkdown(textarea.value, preview);
    }
    textarea.hidden = previewing;
    preview.hidden = !previewing;
    toggle.textContent = previewing ? 'Edit' : 'Preview';
    toggle.setAttribute('aria-label', `${previewing ? 'Edit' : 'Preview'} ${label}`);
  };
  toggle.addEventListener('click', () => {
    previewing = !previewing;
    update();
  });

  textarea.replaceWith(element);
  element.append(textarea, toggle, preview);
  update();
  return {
    element,
    showEditor() {
      previewing = false;
      update();
    }
  };
}
