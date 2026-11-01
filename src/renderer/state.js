// The one place the renderer's mutable view state lives.
export const state = {
  selectedCommit: null,
  currentGraph: null,
  visibleReferences: new Set(),
  selectedTimePreset: 'all',
  timeRange: null,
  currentRepositoryPath: null,
  customRangeValues: null,
  rangeAdjusted: false,
  axisSelectedSpan: null,
  ownerFilter: '',
  fileHistoryHashes: null,
  notes: { commits: {}, branches: {}, colors: {} },
  zoomLevel: 1,
  compactedMembership: new Map(),
  availableReferenceNames: null,
  targetBranchName: null,
  visibleReferencesBeforeTarget: null
};
