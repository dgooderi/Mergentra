import { state } from './state.js';
import { saveViewState } from './view-state.js';
import { getPresetRange, localDateString } from './time-range.js';

let renderFilteredGraph = () => {};

export function syncCustomInputsToRange() {
  state.customRangeValues = {
    start: localDateString(state.timeRange.start),
    end: localDateString(state.timeRange.end - 1)
  };
  document.getElementById('time-range-start').value = state.customRangeValues.start;
  document.getElementById('time-range-end').value = state.customRangeValues.end;
}

function setAdjustedRange(start, end) {
  state.timeRange = { start, end };
  state.rangeAdjusted = true;
  if (state.selectedTimePreset === 'custom') {
    syncCustomInputsToRange();
  }
  saveViewState();
  renderFilteredGraph();
}

function shiftTimeRange(direction) {
  if (!state.timeRange) {
    return;
  }
  const span = state.timeRange.end - state.timeRange.start;
  let start = state.timeRange.start + direction * span;
  // The range cannot move past the present.
  start = Math.min(start, Date.now() - span);
  setAdjustedRange(start, start + span);
}

function centreTimeRangeOnSelection() {
  if (!state.timeRange || !state.selectedCommit?.committerTimestamp) {
    return;
  }
  const span = state.timeRange.end - state.timeRange.start;
  const middle = state.selectedCommit.committerTimestamp * 1000;
  setAdjustedRange(middle - span / 2, middle + span / 2);
  const node = document.querySelector(`[data-commit-hash="${state.selectedCommit.hash}"]`);
  node?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

export function updateTimeNavigation() {
  const hasRange = Boolean(state.timeRange);
  document.getElementById('time-earlier').disabled = !hasRange;
  document.getElementById('time-later').disabled = !hasRange || state.timeRange.end >= Date.now();
  document.getElementById('time-centre').disabled =
    !hasRange || !state.selectedCommit?.committerTimestamp;
}

function applyCustomTimeRange() {
  const startValue = document.getElementById('time-range-start').value;
  const endValue = document.getElementById('time-range-end').value;
  const status = document.getElementById('time-range-status');
  const startDate = new Date(`${startValue}T00:00:00`);
  const endDate = new Date(`${endValue}T00:00:00`);

  if (
    !startValue ||
    !endValue ||
    !Number.isFinite(startDate.getTime()) ||
    !Number.isFinite(endDate.getTime())
  ) {
    status.textContent = 'Choose a valid start and end date.';
    return;
  }
  if (endDate < startDate) {
    status.textContent = 'The end date must be on or after the start date.';
    return;
  }

  endDate.setDate(endDate.getDate() + 1);
  state.timeRange = { start: startDate.getTime(), end: endDate.getTime() };
  state.selectedTimePreset = 'custom';
  state.customRangeValues = { start: startValue, end: endValue };
  state.rangeAdjusted = false;
  saveViewState();
  status.textContent = '';
  renderFilteredGraph();
}

export function initTimeToolbar(handlers) {
  renderFilteredGraph = handlers.renderFilteredGraph;
  document.getElementById('time-earlier').addEventListener('click', () => shiftTimeRange(-1));
  document.getElementById('time-later').addEventListener('click', () => shiftTimeRange(1));
  document.getElementById('time-centre').addEventListener('click', centreTimeRangeOnSelection);

  document.getElementById('time-range').addEventListener('change', (event) => {
    state.selectedTimePreset = event.target.value;
    const customRange = document.getElementById('custom-time-range');
    const status = document.getElementById('time-range-status');
    status.textContent = '';

    if (state.selectedTimePreset === 'custom') {
      customRange.hidden = false;
      return;
    }

    customRange.hidden = true;
    state.rangeAdjusted = false;
    state.timeRange = getPresetRange(state.selectedTimePreset, new Date());
    if (state.timeRange && state.selectedCommit?.committerTimestamp) {
      // Keep the selected commit in the middle of the new range.
      const half = (state.timeRange.end - state.timeRange.start) / 2;
      const middle = state.selectedCommit.committerTimestamp * 1000;
      state.timeRange = { start: middle - half, end: middle + half };
      state.rangeAdjusted = true;
    }
    saveViewState();
    renderFilteredGraph();
    if (state.rangeAdjusted) {
      document
        .querySelector(`[data-commit-hash="${state.selectedCommit.hash}"]`)
        ?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  });

  document.getElementById('custom-time-range').addEventListener('submit', (event) => {
    event.preventDefault();
    applyCustomTimeRange();
  });
}
