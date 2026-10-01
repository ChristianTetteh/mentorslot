export function dayTabLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function dayKey(dateStr) {
  const d = new Date(dateStr);
  return d.toISOString().slice(0, 10);
}

export function timeLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function fullDateTimeLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }) + " at " + timeLabel(dateStr);
}

// "9:00 AM – 9:45 AM" — sessions now run 30/45/60 minutes, so anywhere a
// single start time used to be shown, the full range is clearer.
export function timeRangeLabel(startStr, endStr) {
  return `${timeLabel(startStr)} – ${timeLabel(endStr)}`;
}

// "Thursday, 2 October at 9:00 AM – 9:45 AM"
export function fullDateTimeRangeLabel(startStr, endStr) {
  const d = new Date(startStr);
  return (
    d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) +
    " at " +
    timeRangeLabel(startStr, endStr)
  );
}

// Groups a flat list of slots (each with start_time) into an array of
// { key, label, slots } ordered by day, preserving slot order within a day.
export function groupSlotsByDay(slots) {
  const groups = new Map();
  for (const slot of slots) {
    const key = dayKey(slot.start_time);
    if (!groups.has(key)) {
      groups.set(key, { key, label: dayTabLabel(slot.start_time), slots: [] });
    }
    groups.get(key).slots.push(slot);
  }
  return Array.from(groups.values());
}
