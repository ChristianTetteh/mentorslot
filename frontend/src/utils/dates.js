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

// The viewer's timezone, for labelling every time we show. Slots arrive as
// UTC instants and are rendered in the browser's zone, so say which zone.
// "Africa/Accra (GMT)" — falls back to a short offset name, then to nothing.
export function viewerTimeZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const short = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    const name = zone ? zone.replace(/_/g, " ") : "";
    if (name && short && short !== name) return `${name} (${short})`;
    return name || short || "";
  } catch {
    return "";
  }
}

// Pieces for the date "stub" on a booking: { weekday: "Mon", day: "5", month: "Oct" }
export function dateParts(dateStr) {
  const d = new Date(dateStr);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
    day: d.toLocaleDateString(undefined, { day: "numeric" }),
    month: d.toLocaleDateString(undefined, { month: "short" }),
  };
}

// "Monday 5 October" without the time, for headings above a list of times.
export function longDayLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function initials(name) {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}
