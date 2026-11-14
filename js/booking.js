import {
  SERVICES,
  atMinutes,
  buildIcs,
  dateKey,
  daySlots,
  formatDuration,
  formatLongDate,
  formatMonth,
  formatRange,
  formatShortDate,
  formatTime,
  getService,
  hashString,
  icsFilename,
  makeReference,
  monthCells,
  mulberry32,
  nextOpenDate,
  parseKey,
  validateGuest,
} from "./booking-core.js";

const STORAGE_KEY = "brettsmom.lastVisit";
const LINES = [
  "Checking the family calendar...",
  "Checking with Brett...",
  "Brett said no, overriding...",
  "Warming up the casserole...",
  "Noting it on the good stationery...",
];

const overlay = document.querySelector("#booking");
const dialog = overlay?.querySelector(".booking-dialog");
const layout = overlay?.querySelector(".booking-layout");
const summary = overlay?.querySelector("#booking-summary");
const main = overlay?.querySelector("#booking-root");
const closeBtn = overlay?.querySelector("[data-close]");

const timers = [];
let lastTrigger = null;
let historyPushed = false;
let renderedStep = null;
let scrollY = 0;

let state = blankState();

function blankState() {
  const now = new Date();
  return {
    step: "service",
    serviceId: null,
    dateKey: null,
    startMin: null,
    guestName: "",
    emailDraft: "",
    month: new Date(now.getFullYear(), now.getMonth(), 1),
    token: null,
    booking: null,
    bookedAt: null,
  };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function clearTimers() {
  while (timers.length) window.clearTimeout(timers.pop());
}

function loadBooking() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !data.reference || !data.startISO || !data.serviceName) return null;
    const start = new Date(data.startISO);
    if (Number.isNaN(start.getTime())) return null;
    const end = start.getTime() + (Number(data.minutes) || 30) * 60000;
    if (end < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function saveBooking(booking) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(booking));
  } catch {
    /* Storage can be blocked. The confirmation still stands. */
  }
}

function refreshBanner() {
  const banner = document.getElementById("return-banner");
  const copy = document.getElementById("return-copy");
  if (!banner || !copy) return;
  const booking = loadBooking();
  if (!booking) {
    banner.hidden = true;
    return;
  }
  const start = new Date(booking.startISO);
  const minutes = start.getHours() * 60 + start.getMinutes();
  copy.textContent = `${booking.guestName} · ${booking.serviceName} · ${formatShortDate(start)} · ${formatRange(minutes, booking.minutes)}`;
  banner.hidden = false;
}

function paintWhisper() {
  const node = document.getElementById("next-opening");
  if (!node) return;
  const advice = getService("advice");
  const day = nextOpenDate(advice.minutes, new Date(), 50);
  if (!day) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  node.textContent = `Next rumored opening for an advice session: ${formatLongDate(day)}. Hesitate, and it goes to bridge club.`;
}

function currentSlot(now = new Date()) {
  const service = getService(state.serviceId);
  if (!service || !state.dateKey || state.startMin == null) return null;
  return (
    daySlots(parseKey(state.dateKey), service.minutes, now).find(
      (slot) => slot.available && slot.start === state.startMin,
    ) || null
  );
}

function lock(on) {
  if (on) {
    scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    return;
  }
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, scrollY);
}

function setInert(on) {
  document.querySelectorAll("[data-inert-root]").forEach((el) => {
    el.inert = on;
  });
}

function visible(el) {
  return el.getClientRects().length > 0;
}

function trapTab(event) {
  const nodes = [...overlay.querySelectorAll("button, a[href], input, [tabindex]")].filter(
    (el) => !el.disabled && el.tabIndex !== -1 && visible(el),
  );
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openOverlay() {
  document.getElementById("return-banner")?.setAttribute("hidden", "");
  overlay.hidden = false;
  lock(true);
  setInert(true);
  if (!historyPushed) {
    history.pushState({ booking: 1 }, "");
    historyPushed = true;
  }
  render();
}

function closeOverlay({ fromPop = false } = {}) {
  clearTimers();
  state.token = null;
  overlay.hidden = true;
  lock(false);
  setInert(false);
  renderedStep = null;
  refreshBanner();
  if (historyPushed && !fromPop) {
    historyPushed = false;
    history.back();
  } else {
    historyPushed = false;
  }
  lastTrigger?.focus?.();
}

function openBooking(serviceId, trigger) {
  lastTrigger = trigger || document.activeElement;
  clearTimers();
  state = blankState();
  const service = serviceId ? getService(serviceId) : null;
  if (service) {
    state.serviceId = service.id;
    state.step = "datetime";
  }
  openOverlay();
}

function openStored(trigger) {
  const booking = loadBooking();
  if (!booking) return;
  lastTrigger = trigger || document.activeElement;
  clearTimers();
  const start = new Date(booking.startISO);
  state = blankState();
  state.step = "confirmed";
  state.serviceId = booking.serviceId;
  state.dateKey = dateKey(start);
  state.startMin = start.getHours() * 60 + start.getMinutes();
  state.guestName = booking.guestName || "";
  state.month = new Date(start.getFullYear(), start.getMonth(), 1);
  state.booking = booking;
  openOverlay();
}

function stepsHtml() {
  const steps = [
    ["service", "Service"],
    ["datetime", "Date"],
    ["details", "Details"],
  ];
  const current = steps.findIndex(([id]) => id === state.step);
  return `<ol class="steps">${steps
    .map(([id, label], index) => {
      const cls = index < current ? "is-done" : index === current ? "is-current" : "";
      return `<li class="${cls}" ${index === current ? 'aria-current="step"' : ""}>${label}</li>`;
    })
    .join("")}</ol>`;
}

function renderSummary() {
  const service = getService(state.serviceId);
  const day = state.dateKey ? parseKey(state.dateKey) : null;
  let when = "Not chosen yet";
  if (day && state.startMin != null && service) {
    when = `${esc(formatLongDate(day))}<br>${esc(formatRange(state.startMin, service.minutes))}`;
  } else if (day) {
    when = esc(formatLongDate(day));
  }
  return `
    <p class="summary-kicker">Audience request</p>
    <p class="summary-title">Brett's Mom</p>
    <p class="summary-copy">Kitchen table. Extremely limited availability. Brett has already objected.</p>
    <div class="summary-block">
      <p class="summary-label">Service</p>
      <p class="summary-value">${service ? esc(service.name) : "Choose one"}</p>
      ${service ? `<p class="summary-meta">${esc(formatDuration(service.minutes))} · ${esc(service.price)}</p>` : ""}
    </div>
    <div class="summary-block">
      <p class="summary-label">When</p>
      <p class="summary-value">${when}</p>
    </div>
    ${
      state.guestName.trim()
        ? `<div class="summary-block"><p class="summary-label">Guest</p><p class="summary-value">${esc(state.guestName.trim())}</p></div>`
        : ""
    }
  `;
}

function renderService() {
  return `
    ${stepsHtml()}
    <h2 id="booking-title" tabindex="-1">Choose a service</h2>
    <p class="step-lead">She does not do packages. She does send people home with food.</p>
    <div class="service-list">
      ${SERVICES.map(
        (service) => `
        <button type="button" class="service-option${state.serviceId === service.id ? " is-selected" : ""}" data-pick="${service.id}" aria-pressed="${state.serviceId === service.id}">
          <span class="service-name">${esc(service.name)}</span>
          <span class="service-price">${esc(service.price)}</span>
          <span class="service-meta">${esc(formatDuration(service.minutes))}</span>
          <span class="service-blurb">${esc(service.blurb)}</span>
        </button>`,
      ).join("")}
    </div>
    <div class="step-actions">
      <span></span>
      <button type="button" class="btn btn-solid" data-continue ${state.serviceId ? "" : "disabled"}>Continue</button>
    </div>
  `;
}

function chevron(dir) {
  const d = dir === "left" ? "M14 5 L7 12 L14 19" : "M10 5 L17 12 L10 19";
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

function renderDateTime() {
  const service = getService(state.serviceId);
  if (!service) return renderService();
  const now = new Date();
  const year = state.month.getFullYear();
  const month = state.month.getMonth();
  const cells = monthCells(year, month);
  const firstMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() + 4, 1);
  const canPrev = state.month > firstMonth;
  const canNext = state.month < lastMonth;
  const todayKey = dateKey(now);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const body = weeks
    .map((week, row) => {
      const days = week
        .map((day, col) => {
          if (!day) return '<td class="day-empty"></td>';
          const key = dateKey(day);
          const past = day < todayStart;
          const slots = past ? [] : daySlots(day, service.minutes, now);
          const openings = slots.filter((slot) => slot.available).length;
          const selected = key === state.dateKey;
          const status = past ? "already passed" : openings ? `${openings} opening${openings === 1 ? "" : "s"}` : "fully spoken for";
          return `<td><button type="button" class="day${selected ? " is-selected" : ""}${key === todayKey ? " is-today" : ""}" data-date="${key}" data-row="${row}" data-col="${col}" ${past ? "disabled" : ""} aria-pressed="${selected}" aria-label="${esc(`${formatLongDate(day)}, ${status}`)}"><span>${day.getDate()}</span>${openings ? '<i class="dot" aria-hidden="true"></i>' : ""}</button></td>`;
        })
        .join("");
      return `<tr>${days}</tr>`;
    })
    .join("");

  const next = nextOpenDate(service.minutes, now, 120);
  const jump = next
    ? '<button type="button" class="text-button" data-jump>Jump to the next opening</button>'
    : '<p class="fine">She has not left an opening in the coming season.</p>';

  let slotCol = `<p class="slot-empty">Choose a day. A small mark means she has an opening. Everything else is spoken for.</p>`;
  if (state.dateKey) {
    const slots = daySlots(parseKey(state.dateKey), service.minutes, now);
    slotCol = `
      <p class="slot-heading">${esc(formatLongDate(parseKey(state.dateKey)))}</p>
      <ul class="slot-list">
        ${slots
          .map((slot) =>
            slot.available
              ? `<li><button type="button" class="slot${state.startMin === slot.start ? " is-selected" : ""}" data-start="${slot.start}" aria-pressed="${state.startMin === slot.start}"><span>${formatTime(slot.start)}</span><span>${state.startMin === slot.start ? "Selected" : "Open"}</span></button></li>`
              : `<li class="slot-booked"><span>${formatTime(slot.start)}</span><span class="reason">${esc(slot.reason)}</span></li>`,
          )
          .join("")}
      </ul>
    `;
  }

  return `
    ${stepsHtml()}
    <h2 id="booking-title" tabindex="-1">Pick a day and a time</h2>
    <p class="step-lead">Times are shown in your local time. She will convert them to kitchen time. Midday is not offered — someone is already at the table.</p>
    <div class="dt-grid">
      <div>
        <div class="cal-head">
          <button type="button" class="icon-btn" data-prev aria-label="Previous month" ${canPrev ? "" : "disabled"}>${chevron("left")}</button>
          <h3 id="cal-month">${esc(formatMonth(state.month))}</h3>
          <button type="button" class="icon-btn" data-next aria-label="Next month" ${canNext ? "" : "disabled"}>${chevron("right")}</button>
        </div>
        <table class="calendar">
          <caption class="sr-only">${esc(formatMonth(state.month))}</caption>
          <thead><tr>${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((label) => `<th scope="col">${label}</th>`).join("")}</tr></thead>
          <tbody>${body}</tbody>
        </table>
        <p class="cal-legend"><i class="dot" aria-hidden="true"></i> Has an opening</p>
        ${jump}
      </div>
      <div class="slot-col">${slotCol}</div>
    </div>
    <div class="step-actions">
      <button type="button" class="btn btn-quiet" data-back>Back</button>
      <button type="button" class="btn btn-solid" data-continue ${state.startMin == null ? "disabled" : ""}>Continue</button>
    </div>
  `;
}

function renderDetails() {
  const service = getService(state.serviceId);
  if (!service || !state.dateKey || state.startMin == null) return renderDateTime();
  const day = parseKey(state.dateKey);
  return `
    ${stepsHtml()}
    <h2 id="booking-title" tabindex="-1">Who should she expect?</h2>
    <p class="step-lead">${esc(service.name)} · ${esc(formatLongDate(day))} · ${esc(formatRange(state.startMin, service.minutes))}</p>
    <form novalidate data-details>
      <div class="error-summary" data-error-summary role="alert" hidden></div>
      <div class="field">
        <label for="guest-name">Your name</label>
        <input id="guest-name" name="name" autocomplete="name" maxlength="80" required value="${esc(state.guestName)}" aria-describedby="name-error">
        <p class="error" id="name-error" data-error-for="name"></p>
      </div>
      <div class="field">
        <label for="guest-email">Email</label>
        <input id="guest-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="120" required value="${esc(state.emailDraft)}" aria-describedby="email-help email-error">
        <p class="fine" id="email-help">Checked so the form feels finished, then forgotten. It is not saved in this browser and it is not sent anywhere.</p>
        <p class="error" id="email-error" data-error-for="email"></p>
      </div>
      <div class="step-actions">
        <button type="button" class="btn btn-quiet" data-back>Back</button>
        <button type="submit" class="btn btn-solid">Confirm this visit</button>
      </div>
    </form>
  `;
}

function renderProcessing() {
  return `
    <div class="process">
      <h2 id="booking-title" tabindex="-1">One moment. She is being informed.</h2>
      <div class="progress" aria-hidden="true"><span></span></div>
      <ol class="status-list" aria-live="polite">
        ${LINES.map((line) => `<li>${esc(line)}</li>`).join("")}
      </ol>
    </div>
  `;
}

function decorativeMark(seed) {
  const size = 21;
  const rng = mulberry32(hashString(String(seed)));
  const on = Array.from({ length: size * size }, () => rng() > 0.58);
  const stamp = (ox, oy) => {
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        on[(oy + y) * size + (ox + x)] = edge || core;
      }
    }
  };
  stamp(0, 0);
  stamp(size - 7, 0);
  stamp(0, size - 7);
  const rects = [];
  on.forEach((filled, index) => {
    if (!filled) return;
    rects.push(`<rect x="${index % size}" y="${Math.floor(index / size)}" width="1" height="1"/>`);
  });
  return `<svg class="qr" viewBox="0 0 21 21" role="img" aria-label="Decorative confirmation mark. It is not a scannable code."><rect width="21" height="21" fill="#fffdf9"/><g fill="#1c1814">${rects.join("")}</g></svg>`;
}

const miniSeal = `<svg class="mini-seal" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#4e1c2a"/><circle cx="32" cy="32" r="26" fill="none" stroke="#e0c48a"/><circle cx="32" cy="25" r="8" fill="#f6f1e7"/><path d="M14 50c3-11 9-16 18-16s15 5 18 16" fill="#f6f1e7"/></svg>`;

function renderConfirmed() {
  const booking = state.booking;
  const start = new Date(booking.startISO);
  const minutes = start.getHours() * 60 + start.getMinutes();
  return `
    <article class="ticket">
      <div class="ticket-top">
        ${miniSeal}
        <p class="ticket-kicker">Official visit</p>
      </div>
      <h2 id="booking-title" tabindex="-1">You're on her calendar.</h2>
      <p class="ticket-ref">${esc(booking.reference)}</p>
      <dl class="ticket-dl">
        <div><dt>Service</dt><dd>${esc(booking.serviceName)}</dd></div>
        <div><dt>When</dt><dd>${esc(formatLongDate(start))}</dd></div>
        <div><dt>Time</dt><dd>${esc(formatRange(minutes, booking.minutes))}</dd></div>
        <div><dt>Guest</dt><dd>${esc(booking.guestName)}</dd></div>
        <div><dt>Offering</dt><dd>${esc(booking.price)}</dd></div>
      </dl>
      <div class="qr-wrap">${decorativeMark(booking.reference)}</div>
      <p class="qr-caption">A decorative mark, for the look of the thing. She does not scan codes.</p>
      <p class="brett-note">Brett has been notified. He is not happy.</p>
      <p class="fine center">Nothing was emailed. This browser will remember the visit, not the address.</p>
      <div class="ticket-actions">
        <button type="button" class="btn btn-solid" data-ics>Add to calendar</button>
        <button type="button" class="btn btn-quiet" data-another>Book another visit</button>
        <button type="button" class="btn btn-quiet" data-done>Done</button>
      </div>
    </article>
  `;
}

function renderStep() {
  if (state.step === "datetime") return renderDateTime();
  if (state.step === "details") return renderDetails();
  if (state.step === "processing") return renderProcessing();
  if (state.step === "confirmed") return renderConfirmed();
  return renderService();
}

function showErrors(errors) {
  const summaryEl = main.querySelector("[data-error-summary]");
  const messages = Object.values(errors);
  if (summaryEl) {
    summaryEl.hidden = messages.length === 0;
    summaryEl.textContent = messages.join(" ");
  }
  for (const key of ["name", "email"]) {
    const note = main.querySelector(`[data-error-for="${key}"]`);
    const input = main.querySelector(`[name="${key}"]`);
    if (note) note.textContent = errors[key] || "";
    if (input) input.setAttribute("aria-invalid", errors[key] ? "true" : "false");
  }
}

function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const result = validateGuest(form.name.value, form.email.value);
  state.guestName = result.name;
  state.emailDraft = result.email;
  if (!result.ok) {
    showErrors(result.errors);
    (result.errors.name ? form.name : form.email).focus();
    return;
  }
  state.bookedAt = new Date();
  if (!currentSlot(state.bookedAt)) {
    state.step = "datetime";
    state.startMin = null;
    render();
    return;
  }
  state.emailDraft = "";
  state.step = "processing";
  render();
  runProcessing();
}

function finalize() {
  const service = getService(state.serviceId);
  const slot = currentSlot(state.bookedAt || new Date());
  if (!service || !slot) {
    state.step = "datetime";
    state.startMin = null;
    render();
    return;
  }
  const start = atMinutes(parseKey(state.dateKey), state.startMin);
  const reference = makeReference(start, state.guestName, new Date());
  state.booking = {
    version: 1,
    reference,
    serviceId: service.id,
    serviceName: service.name,
    minutes: service.minutes,
    price: service.price,
    startISO: start.toISOString(),
    guestName: state.guestName,
  };
  saveBooking(state.booking);
  state.step = "confirmed";
  render();
}

function runProcessing() {
  clearTimers();
  const token = Symbol();
  state.token = token;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gap = reduce ? 40 : 560;
  const items = [...main.querySelectorAll(".status-list li")];
  const bar = main.querySelector(".progress > span");
  LINES.forEach((_, index) => {
    timers.push(
      window.setTimeout(() => {
        if (state.token !== token) return;
        items.forEach((item, itemIndex) => {
          item.classList.toggle("is-done", itemIndex < index);
          item.classList.toggle("is-active", itemIndex === index);
        });
        if (bar) bar.style.width = `${((index + 1) / LINES.length) * 100}%`;
        if (index === LINES.length - 1) {
          timers.push(
            window.setTimeout(() => {
              if (state.token !== token) return;
              finalize();
            }, gap),
          );
        }
      }, gap * index),
    );
  });
}

function downloadIcs(booking) {
  const start = new Date(booking.startISO);
  const end = new Date(start.getTime() + booking.minutes * 60000);
  const ics = buildIcs({
    reference: booking.reference,
    serviceName: booking.serviceName,
    guestName: booking.guestName,
    start,
    end,
  });
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = icsFilename(booking.reference);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function bookAnother() {
  const now = new Date();
  state.step = "service";
  state.serviceId = null;
  state.dateKey = null;
  state.startMin = null;
  state.guestName = "";
  state.emailDraft = "";
  state.booking = null;
  state.month = new Date(now.getFullYear(), now.getMonth(), 1);
  render();
}

function onCalendarKey(event) {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const buttons = [...main.querySelectorAll("[data-date]")];
  const current = document.activeElement;
  if (!buttons.includes(current)) return;
  const row = Number(current.dataset.row);
  const col = Number(current.dataset.col);
  const map = new Map(buttons.map((button) => [`${button.dataset.row}-${button.dataset.col}`, button]));
  let hit = null;
  if (event.key === "Home" || event.key === "End") {
    const rowButtons = buttons.filter((button) => Number(button.dataset.row) === row);
    hit = event.key === "Home" ? rowButtons[0] : rowButtons[rowButtons.length - 1];
  } else {
    const delta = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    }[event.key];
    let r = row + delta[0];
    let c = col + delta[1];
    while (r >= 0 && r < 6 && c >= 0 && c < 7) {
      const found = map.get(`${r}-${c}`);
      if (found) {
        hit = found;
        break;
      }
      r += delta[0];
      c += delta[1];
    }
  }
  if (!hit) return;
  event.preventDefault();
  buttons.forEach((button) => {
    button.tabIndex = -1;
  });
  hit.tabIndex = 0;
  hit.focus();
}

function bindStep() {
  main.querySelectorAll("[data-pick]").forEach((button) => {
    button.addEventListener("click", () => {
      state.serviceId = button.dataset.pick;
      if (state.dateKey && state.startMin != null) {
        const service = getService(state.serviceId);
        const still = daySlots(parseKey(state.dateKey), service.minutes, new Date()).some(
          (slot) => slot.available && slot.start === state.startMin,
        );
        if (!still) state.startMin = null;
      }
      render({ focusSelector: `[data-pick="${state.serviceId}"]` });
    });
  });

  main.querySelector("[data-continue]")?.addEventListener("click", () => {
    if (state.step === "service" && state.serviceId) {
      state.step = "datetime";
      render();
      return;
    }
    if (state.step === "datetime" && currentSlot()) {
      state.step = "details";
      render();
    }
  });

  main.querySelector("[data-back]")?.addEventListener("click", () => {
    if (state.step === "details") state.step = "datetime";
    else if (state.step === "datetime") state.step = "service";
    render();
  });

  main.querySelector("[data-prev]")?.addEventListener("click", () => {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
    render();
    (main.querySelector("[data-prev]:not(:disabled)") || main.querySelector("[data-next]"))?.focus();
  });

  main.querySelector("[data-next]")?.addEventListener("click", () => {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
    render();
    (main.querySelector("[data-next]:not(:disabled)") || main.querySelector("[data-prev]"))?.focus();
  });

  main.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      state.dateKey = button.dataset.date;
      state.startMin = null;
      render({ focusSelector: `[data-date="${CSS.escape(state.dateKey)}"]` });
    });
  });

  const days = [...main.querySelectorAll("[data-date]")];
  if (days.length) {
    const preferred =
      days.find((button) => button.classList.contains("is-selected") && !button.disabled) ||
      days.find((button) => !button.disabled) ||
      days[0];
    days.forEach((button) => {
      button.tabIndex = button === preferred ? 0 : -1;
    });
  }
  main.querySelector(".calendar")?.addEventListener("keydown", onCalendarKey);

  main.querySelectorAll("[data-start]").forEach((button) => {
    button.addEventListener("click", () => {
      state.startMin = Number(button.dataset.start);
      render({ focusSelector: `[data-start="${state.startMin}"]` });
    });
  });

  main.querySelector("[data-jump]")?.addEventListener("click", () => {
    const service = getService(state.serviceId);
    const day = nextOpenDate(service.minutes, new Date(), 120);
    if (!day) return;
    state.month = new Date(day.getFullYear(), day.getMonth(), 1);
    state.dateKey = dateKey(day);
    state.startMin = null;
    render({ focusSelector: `[data-date="${dateKey(day)}"]` });
  });

  const form = main.querySelector("[data-details]");
  form?.addEventListener("submit", onSubmit);
  form?.elements.name?.addEventListener("input", () => {
    state.guestName = form.elements.name.value;
    summary.innerHTML = renderSummary();
  });
  form?.elements.email?.addEventListener("input", () => {
    state.emailDraft = form.elements.email.value;
  });

  main.querySelector("[data-ics]")?.addEventListener("click", () => {
    if (state.booking) downloadIcs(state.booking);
  });
  main.querySelector("[data-another]")?.addEventListener("click", bookAnother);
  main.querySelector("[data-done]")?.addEventListener("click", () => closeOverlay());
}

function render(options = {}) {
  const stepChanged = renderedStep !== state.step;
  renderedStep = state.step;
  const finale = state.step === "processing" || state.step === "confirmed";
  layout.classList.toggle("is-single", finale);
  summary.hidden = finale;
  summary.innerHTML = renderSummary();
  main.innerHTML = renderStep();
  if (closeBtn) closeBtn.disabled = state.step === "processing";
  bindStep();
  if (stepChanged) {
    main.scrollTop = 0;
    layout.scrollTop = 0;
  }
  if (options.focusSelector) {
    main.querySelector(options.focusSelector)?.focus();
    if (options.focusSelector.startsWith("[data-date")) {
      main.querySelector(".slot-heading, .slot-col")?.scrollIntoView({ block: "nearest" });
    }
    return;
  }
  if (stepChanged) main.querySelector("#booking-title")?.focus();
}

if (overlay && main && summary) {
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-book]");
    if (!trigger) return;
    event.preventDefault();
    openBooking(trigger.dataset.service || null, trigger);
  });

  document.getElementById("return-view")?.addEventListener("click", (event) => {
    openStored(event.currentTarget);
  });

  closeBtn?.addEventListener("click", () => {
    if (state.step === "processing") return;
    closeOverlay();
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && state.step !== "processing") closeOverlay();
  });

  dialog?.addEventListener("click", (event) => event.stopPropagation());

  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.key === "Escape" && state.step !== "processing") {
      event.preventDefault();
      closeOverlay();
      return;
    }
    if (event.key === "Tab") trapTab(event);
  });

  window.addEventListener("popstate", () => {
    if (!overlay.hidden) closeOverlay({ fromPop: true });
  });

  refreshBanner();
  paintWhisper();
}
