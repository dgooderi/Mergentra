export function explainHistoryBoundary(type, facts = {}) {
  if (type === 'shallow') {
    return {
      title: 'Shallow history boundary',
      explanation:
        'Git marks this commit as a shallow boundary. Its parent history was intentionally left out of this clone.',
      nextSteps:
        'To add history, run `git fetch --deepen <number>` in a terminal in this repository. To request the full history, run `git fetch --unshallow`. Mergentra will not run these commands.'
    };
  }

  if (type !== 'missing-object') {
    return null;
  }
  if (facts.partialClone === true) {
    return {
      title: 'Missing object at history boundary',
      explanation:
        'Git cannot read an object referenced by this commit. This repository is configured as a partial clone, where some objects are intentionally omitted. That configuration does not prove this particular missing object is expected.',
      nextSteps:
        'If you need the missing objects, review the repository remote settings and run `git fetch` yourself from a terminal. Mergentra has not fetched and will not fetch automatically.'
    };
  }

  return {
    title: 'Missing object at history boundary',
    explanation:
      facts.partialClone === false
        ? 'Git cannot read an object referenced by this commit. No local configuration confirms a partial clone, so the cause is uncertain; the object may be omitted or the repository may be incomplete.'
        : 'Git cannot read an object referenced by this commit. Mergentra could not confirm whether this repository is configured as a partial clone, so the cause of the missing object is unknown.',
    nextSteps:
      'Review the repository remote settings. You can check object integrity with `git fsck --full`; if objects are needed, run `git fetch` manually after reviewing the remote configuration. Mergentra will not fetch.'
  };
}
