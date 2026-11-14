/** Pure booking rules for brettsmom.com. No DOM, no storage, no network. */

export const SERVICES = [
  {
    id: "advice",
    name: "Advice Session",
    minutes: 45,
    price: "Priceless",
    blurb:
      "She listens, then tells you the thing you already knew, which will somehow be new.",
  },
  {
    id: "casserole",
    name: "Casserole Consultation",
    minutes: 60,
    price: "One returned Tupperware",
    blurb:
      "A guided look at your oven, your guests, and the decisions that led you here. Lasagna will be involved.",
  },
  {
    id: "childhood",
    name: "Ask About Brett's Childhood",
    minutes: 30,
    price: "Complimentary",
    blurb:
      "Stories with dates. At least one Brett has formally requested stay in the family.",
  },
  {
    id: "peptalk",
    name: "Emergency Pep Talk",
    minutes: 15,
    price: "On the house",
    blurb: "For when you need someone certain you can handle it. She is certain.",
  },
  {
    id: "lasagna",
    name: "Lasagna Intensive",
    minutes: 90,
    price: "By referral",
    blurb:
      "The long session. Sauce, assembly, and several life decisions, none of them rushed.",
  },
];

export const REASONS = [
  "Bridge club",
  "Watching her shows",
  "On the phone with Aunt Linda",
  "Casserole in the oven",
  "Book club",
  "At the good grocery store",
  "A nap, do not disturb",
  "Helping a neighbor, real quick",
  "Brett's laundry, allegedly his",
  "Church committee",
  "Walking a dog that is not hers",
  "The puzzle is almost done",
  "Annual Tupperware inventory",
  "Holding someone's spare key",
  "Rewinding her shows",
];

/** Minutes from midnight. Midday is intentionally absent. */
export const SLOT_STARTS = [9 * 60, 10 * 60, 11 * 60, 13 * 60, 14 * 60, 15 * 60 + 30, 17 * 60, 18 * 60];

export const DAY_END = 19 * 60;

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function getService(id) {
  return SERVICES.find((service) => service.id === id) || null;
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function atMinutes(day, minutes) {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
    0,
    0,
  );
}

export function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatRange(startMinutes, duration) {
  return `${formatTime(startMinutes)} – ${formatTime(startMinutes + duration)}`;
}

export function formatLongDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatShortDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatMonth(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!rest) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${hours} hr ${rest} min`;
}

export function daySlots(day, durationMin, now = new Date()) {
  const key = dateKey(day);
  const starts = SLOT_STARTS.filter((start) => start + durationMin <= DAY_END);
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isPast = dayStart < todayStart;
  const isToday = key === dateKey(now);
  const dow = dayStart.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const rng = mulberry32(hashString(`${key}:${durationMin}:open`));
  let openCount;
  if (dow === 0) openCount = rng() < 0.22 ? 1 : 0;
  else if (dow === 6) openCount = 1;
  else openCount = 1 + Math.floor(rng() * 3);
  if (dow >= 1 && dow <= 5 && rng() < 0.12) openCount = 0;

  const openIdx = new Set();
  let guard = 0;
  while (openIdx.size < openCount && openIdx.size < starts.length && guard < 40) {
    openIdx.add(Math.floor(rng() * starts.length));
    guard += 1;
  }

  const reasonRng = mulberry32(hashString(`${key}:reasons`));
  const bag = [...REASONS];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(reasonRng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  let reasonCursor = 0;

  return starts.map((start, index) => {
    const passed = isPast || (isToday && start <= nowMin);
    const available = !passed && openIdx.has(index);
    let reason = null;
    if (!available) {
      if (passed) reason = "Already passed";
      else if (dow === 0 && start < 12 * 60) reason = "Church";
      else if (dow === 0 && start >= 15 * 60) reason = "Sunday dinner";
      else if (dow === 3 && start >= 17 * 60) reason = "Watching her shows";
      else {
        reason = bag[reasonCursor % bag.length];
        reasonCursor += 1;
      }
    }
    return { start, available, reason };
  });
}

export function nextOpenDate(durationMin, from = new Date(), horizon = 60) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < horizon; i += 1) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (daySlots(day, durationMin, from).some((slot) => slot.available)) return day;
  }
  return null;
}

export function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const lead = first.getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let day = 1; day <= count; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function validateGuest(name, email) {
  const trimmedName = String(name ?? "").trim();
  const trimmedEmail = String(email ?? "").trim();
  const errors = {};
  if (trimmedName.length < 2) {
    errors.name = "She would like a name to announce at the door.";
  } else if (trimmedName.length > 80) {
    errors.name = "That name might need its own place card. Try a shorter one.";
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) && trimmedEmail.length <= 120;
  if (!emailOk) errors.email = "That email does not look finished.";
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    name: trimmedName,
    email: trimmedEmail,
  };
}

export function makeReference(startDate, guestName, now = new Date()) {
  let h = hashString(`${startDate.toISOString()}|${guestName}|${now.getTime()}`);
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    code += REFERENCE_ALPHABET[h % REFERENCE_ALPHABET.length];
  }
  return `BM-${startDate.getFullYear()}-${code}`;
}

export function toUtcStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function icsEscape(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Fold one logical ICS line so no physical line exceeds 75 octets. */
export function foldIcsLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    if (end === start) end = Math.min(start + limit, bytes.length);
    const text = new TextDecoder().decode(bytes.slice(start, end));
    parts.push(start === 0 ? text : ` ${text}`);
    start = end;
    limit = 74;
  }
  return parts.join("\r\n");
}

export function buildIcs({ reference, serviceName, guestName, start, end, stamp = new Date() }) {
  const description = [
    "Audience with Brett's Mom",
    `Guest: ${guestName}`,
    `Service: ${serviceName}`,
    `Reference: ${reference}`,
    "Brett has been notified. He is not happy.",
    "",
    "Parody calendar event from https://brettsmom.com. Nothing was emailed.",
  ].join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//brettsmom.com//Parody Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${reference}@brettsmom.com`,
    `DTSTAMP:${toUtcStamp(stamp)}`,
    `DTSTART:${toUtcStamp(start)}`,
    `DTEND:${toUtcStamp(end)}`,
    `SUMMARY:${icsEscape(`${serviceName} with Brett's Mom`)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `LOCATION:${icsEscape("Brett's Mom's kitchen table")}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "URL:https://brettsmom.com/",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function icsFilename(reference) {
  return `bretts-mom-${reference}.ics`;
}
