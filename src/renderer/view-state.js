import { state } from './state.js';
import { viewStorage } from './app-storage.js';

export function loadViewState() {
  return viewStorage.loadViewState(state.currentRepositoryPath);
}

export function saveViewState() {
  if (!state.currentRepositoryPath || !state.currentGraph) {
    return;
  }
  const hidden = state.currentGraph.references
    .filter((reference) => !state.visibleReferences.has(reference.name))
    .map((reference) => reference.name);
  viewStorage.saveViewState(state.currentRepositoryPath, {
    hidden,
    preset: state.selectedTimePreset,
    display: state.displayOptions,
    custom: state.selectedTimePreset === 'custom' ? state.customRangeValues : null,
    range: state.rangeAdjusted && state.timeRange ? state.timeRange : null
  });
}
