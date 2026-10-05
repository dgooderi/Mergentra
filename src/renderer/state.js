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
  ownerFilter: '',
  notes: { commits: {}, branches: {} },
  zoomLevel: 1,
  displayOptions: { tags: true, hashes: true, releases: true },
  compactedMembership: new Map(),
  availableReferenceNames: null
};
