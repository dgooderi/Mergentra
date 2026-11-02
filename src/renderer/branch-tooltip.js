// One floating label that follows the pointer, shown immediately instead of after the slow
// delay of a native tooltip.
let tooltip = null;

function element() {
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'branch-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.append(tooltip);
  }
  return tooltip;
}

function place(event) {
  const label = element();
  const margin = 14;
  const left = Math.min(event.clientX + margin, window.innerWidth - label.offsetWidth - 8);
  const top = Math.min(event.clientY + margin, window.innerHeight - label.offsetHeight - 8);
  label.style.left = `${Math.max(8, left)}px`;
  label.style.top = `${Math.max(8, top)}px`;
}

export function showBranchTooltip(event, name, note) {
  const label = element();
  label.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = name;
  label.append(title);
  if (note) {
    const body = document.createElement('span');
    body.textContent = note;
    label.append(body);
  }
  label.hidden = false;
  place(event);
}

export function moveBranchTooltip(event) {
  if (tooltip && !tooltip.hidden) {
    place(event);
  }
}

export function hideBranchTooltip() {
  if (tooltip) {
    tooltip.hidden = true;
  }
}
