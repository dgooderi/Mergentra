export function subtractCalendarMonths(date, months) {
  const targetMonth = date.getMonth() - months;
  const firstOfTargetMonth = new Date(
    date.getFullYear(),
    targetMonth,
    1,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  );
  const daysInTargetMonth = new Date(
    firstOfTargetMonth.getFullYear(),
    firstOfTargetMonth.getMonth() + 1,
    0
  ).getDate();
  firstOfTargetMonth.setDate(Math.min(date.getDate(), daysInTargetMonth));
  return firstOfTargetMonth;
}

export function getPresetRange(preset, now) {
  const durations = {
    '1d': 24 * 60 * 60 * 1000,
    '5d': 5 * 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '2w': 14 * 24 * 60 * 60 * 1000
  };
  if (Object.hasOwn(durations, preset)) {
    return { start: now.getTime() - durations[preset], end: now.getTime() };
  }

  const calendarMonths = {
    '1m': 1,
    '3m': 3,
    '6m': 6,
    '9m': 9,
    '1y': 12
  };
  if (Object.hasOwn(calendarMonths, preset)) {
    return {
      start: subtractCalendarMonths(now, calendarMonths[preset]).getTime(),
      end: now.getTime()
    };
  }

  return null;
}

export function localDateString(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// A range chosen by dragging on the axis blocks further axis selections until the visible
// range is zoomed out wider than it (or becomes unbounded, as with All history).
export function isAxisSelectionAvailable(timeRange, lockedSpan) {
  if (lockedSpan === null || !timeRange) {
    return true;
  }
  return timeRange.end - timeRange.start > lockedSpan;
}
