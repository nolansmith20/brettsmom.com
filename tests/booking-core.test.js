import assert from "node:assert/strict";
import test from "node:test";
import {
  DAY_END,
  REASONS,
  SERVICES,
  buildIcs,
  dateKey,
  daySlots,
  foldIcsLine,
  formatTime,
  makeReference,
  nextOpenDate,
  toUtcStamp,
  validateGuest,
} from "../js/booking-core.js";

test("time labels use kitchen-clock English", () => {
  assert.equal(formatTime(0), "12:00 AM");
  assert.equal(formatTime(9 * 60), "9:00 AM");
  assert.equal(formatTime(12 * 60), "12:00 PM");
  assert.equal(formatTime(15 * 60 + 30), "3:30 PM");
});

test("date keys stay on the local calendar", () => {
  const day = new Date(2026, 10, 14);
  assert.equal(dateKey(day), "2026-11-14");
  assert.equal(day.getDate(), 14);
});

test("past days are closed and today hides times already reached", () => {
  const now = new Date(2026, 10, 14, 15, 0, 0);
  const past = daySlots(new Date(2020, 0, 15), 45, now);
  assert.ok(past.length > 0);
  assert.ok(past.every((slot) => !slot.available && slot.reason === "Already passed"));

  const today = daySlots(new Date(2026, 10, 14), 45, now);
  for (const slot of today) {
    if (slot.start <= 15 * 60) assert.equal(slot.available, false);
  }
});

test("a day keeps a stable plan and most of it is spoken for", () => {
  const day = new Date(2026, 10, 16);
  const now = new Date(2026, 10, 14, 9, 0, 0);
  const first = daySlots(day, 45, now);
  const second = daySlots(day, 45, now);
  assert.deepEqual(first, second);
  const open = first.filter((slot) => slot.available);
  assert.ok(open.length < first.length / 2, "scarcity is the joke");
  for (const slot of first) {
    if (slot.available) assert.equal(slot.reason, null);
    else assert.ok(REASONS.includes(slot.reason) || ["Church", "Sunday dinner", "Watching her shows", "Already passed"].includes(slot.reason));
  }
});

test("Sunday mornings that are taken belong to church", () => {
  const sunday = new Date(2026, 10, 15);
  assert.equal(sunday.getDay(), 0);
  const slots = daySlots(sunday, 45, new Date(2026, 10, 14, 12, 0, 0));
  const morning = slots.filter((slot) => slot.start < 12 * 60 && !slot.available);
  assert.ok(morning.length >= 1);
  assert.ok(morning.every((slot) => slot.reason === "Church"));
});

test("longer visits still end by seven", () => {
  const slots = daySlots(new Date(2026, 10, 18), 90, new Date(2026, 10, 14, 8, 0, 0));
  assert.ok(slots.length >= 1);
  assert.ok(slots.every((slot) => slot.start + 90 <= DAY_END));
});

test("an opening usually exists inside the season", () => {
  const found = nextOpenDate(45, new Date(2026, 10, 14, 8, 0, 0), 21);
  assert.ok(found);
  const slots = daySlots(found, 45, new Date(2026, 10, 14, 8, 0, 0));
  assert.ok(slots.some((slot) => slot.available));
});

test("guest validation is strict about the form and loose about real names", () => {
  assert.equal(validateGuest("  ", "nope").ok, false);
  assert.equal(validateGuest("N", "nolan@example.com").ok, false);
  assert.equal(validateGuest("Nolan", "nolan@example").ok, false);
  const ok = validateGuest("  José María  ", "jose@example.com");
  assert.equal(ok.ok, true);
  assert.equal(ok.name, "José María");
  assert.equal(ok.email, "jose@example.com");
  assert.equal(validateGuest("Nolan", `${"a".repeat(50)}@example.com`).ok, true);
  assert.equal(validateGuest("Nolan", `${"a".repeat(121)}@example.com`).ok, false);
});

test("references look official and avoid ambiguous characters", () => {
  const start = new Date(2026, 10, 20, 14, 0, 0);
  const now = new Date(2026, 10, 14, 12, 0, 0);
  const ref = makeReference(start, "Nolan", now);
  assert.match(ref, /^BM-2026-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
  assert.equal(makeReference(start, "Nolan", now), ref);
  assert.ok(SERVICES.some((service) => service.name === "Advice Session"));
  assert.ok(SERVICES.some((service) => service.name === "Ask About Brett's Childhood"));
});

test("calendar files are valid, escaped, folded, and timed", () => {
  const start = new Date(2026, 10, 20, 14, 0, 0);
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  const stamp = new Date(Date.UTC(2026, 10, 1, 15, 4, 5));
  const guest = 'Ada, "Aunt" Fan; Jr. \\ José';
  const ics = buildIcs({
    reference: "BM-2026-TEST",
    serviceName: "Advice Session",
    guestName: guest,
    start,
    end,
    stamp,
  });

  const unfolded = ics.replace(/\r\n[ \t]/g, "");
  assert.ok(ics.endsWith("\r\n"));
  assert.ok(unfolded.includes("BEGIN:VCALENDAR"));
  assert.ok(unfolded.includes("END:VCALENDAR"));
  assert.ok(unfolded.includes("BEGIN:VEVENT"));
  assert.ok(unfolded.includes("END:VEVENT"));
  assert.ok(unfolded.includes("UID:BM-2026-TEST@brettsmom.com"));
  assert.ok(unfolded.includes(`DTSTAMP:${toUtcStamp(stamp)}`));
  assert.ok(unfolded.includes(`DTSTART:${toUtcStamp(start)}`));
  assert.ok(unfolded.includes(`DTEND:${toUtcStamp(end)}`));
  assert.ok(unfolded.includes("SUMMARY:Advice Session with Brett's Mom"));
  assert.ok(unfolded.includes("Brett has been notified. He is not happy."));
  assert.ok(unfolded.includes("Ada\\,"));
  assert.ok(unfolded.includes("Fan\\;"));
  assert.ok(unfolded.includes("\\\\"));
  assert.ok(unfolded.includes("José"));
  assert.equal(unfolded.includes("mailto:"), false);
  assert.equal(unfolded.toLowerCase().includes("@example.com"), false);

  const back = new Date(start.toISOString());
  assert.equal(back.getHours(), 14);
  assert.equal(back.getMinutes(), 0);
  assert.equal(end.getTime() - start.getTime(), 45 * 60 * 1000);

  for (const line of ics.split("\r\n").filter(Boolean)) {
    assert.ok(new TextEncoder().encode(line).length <= 75, line);
  }
});

test("folding respects octet boundaries", () => {
  const folded = foldIcsLine(`DESCRIPTION:${"é".repeat(80)}`);
  for (const line of folded.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).length <= 75);
  }
  assert.ok(folded.includes("\r\n "));
});
