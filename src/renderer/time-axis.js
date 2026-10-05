// Each visible commit gets a tick with its own date and time. Commits are laid out in
// history order, not strictly by time, so every label carries enough detail to be read
// on its own. The time is dropped for long spans and the year when it is the current one.
export function computeTimeAxisTicks(commits, commitPositions, now = new Date()) {
  const dated = commits.filter((commit) => commit.committerTimestamp > 0);
  if (dated.length === 0) {
    return { showTime: false, ticks: [] };
  }
  const timestamps = dated.map((commit) => commit.committerTimestamp * 1000);
  const spanMs = Math.max(...timestamps) - Math.min(...timestamps);
  const showTime = spanMs < 60 * 24 * 60 * 60 * 1000;
  const currentYear = now.getFullYear();
  const withYear = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const withoutYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

  const ticks = [];
  for (const commit of dated) {
    const position = commitPositions.get(commit.hash);
    if (!position) {
      continue;
    }
    const date = new Date(commit.committerTimestamp * 1000);
    ticks.push({
      x: position.x,
      timestamp: commit.committerTimestamp,
      dateText: (date.getFullYear() === currentYear ? withoutYear : withYear).format(date),
      timeText: showTime ? timeFormat.format(date) : ''
    });
  }
  return { showTime, ticks };
}
