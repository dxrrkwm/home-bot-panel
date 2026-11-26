import { request, send, on, last, ready, connected } from "../bus.js";
import { icon } from "../icons.js";
import { $, $$, esc, loading, screen, open, isOpen, toast, busy, head } from "../ui.js";
import { hm, openSleep } from "./sleep.js";

// the band as a remote: "сплю" / "встав" (also as quick replies on the band), bedtime for the shifts,
// a week of sleep laid over the work hours, and the shift calendar
const scr = screen("band", "Браслет", { refresh: () => request("band-panel") });
const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
let data = null;
let month = null;  // first day of the month shown in the calendar
let selected = null;  // the date being edited

async function openBand() {
  if (!connected) return toast("Відкрий панель з кнопки бота");
  open("band");
  if (!data) $("[data-body]", scr).innerHTML = `<div class="card">${loading}</div>`;
  request("band-panel");
}

on("band", d => {
  data = d;
  renderCard(d);
  if (isOpen("band")) render(d);
});

function renderCard(d) {
  const sub = d.sleeping ? `спиш з ${d.sleeping}` : d.next ? `зміна ${d.next}` : "сон, зміни, режим сну";
  $("[data-sub]", $("#bandCard")).textContent = sub;
}

export function mount(home) {
  home.insertAdjacentHTML("beforeend", `<div class="card tap" id="bandCard">${head("watch", "Браслет", "…")}</div>`);
  $("#bandCard").onclick = openBand;
  ready.then(async () => {
    const cached = await last("band", "48h").catch(() => null);
    if (cached && !data) {
      data = cached;
      renderCard(cached);
    }
  });
}

const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (day, n) => { const t = new Date(day + "T12:00:00"); t.setDate(t.getDate() + n); return iso(t); };

function stateCard(d) {
  const asleep = Boolean(d.sleeping);
  const text = asleep ? `Спиш з ${d.sleeping} · ${hm(d.slept)}` : "Не спиш";
  const note = asleep ? "Бот пише без звуку, нагадування й таблетки чекають до «встав»."
                      : "«Сплю» вимикає лампу, переводить ноут в Еко і глушить бота до ранку.";
  return `<div class="card"><div class="band-state"><span class="ico ${asleep ? "blue" : "amber"}">${icon(asleep ? "moon" : "sun")}</span>
      <div class="grow"><div class="h-title">${text}</div><div class="muted">${note}</div></div></div>
    <button class="main gap" data-mode="${asleep ? "band:wake" : "band:sleep"}">${asleep ? "Встав" : "Сплю"}</button></div>`;
}

function shiftCard(d) {
  const debt = d.debt ? (d.debt.min ? `Недосип за ${d.debt.days} дн. з браслета: ${hm(d.debt.min)}` : "За тиждень висипаєшся") : "";
  const body = d.advice || (Object.keys(d.shifts).length ? "Найближчими днями змін немає." : "Познач зміни в календарі нижче — бот підкаже, коли лягати.");
  return `<div class="card"><div class="line"><span>Сон під зміни</span><span class="muted push">${esc(d.next || "")}</span></div>
    <div class="gap">${esc(body)}</div>${debt ? `<div class="muted gap">${esc(debt)}</div>` : ""}</div>`;
}

// a week back and a week ahead: sleep from the band (blue, naps pink) over the work hours (amber)
function week(d) {
  const sleepTl = d.sleep?.timeline || {};
  const rows = [];
  for (let i = -6; i <= 7; i++) {
    const day = addDays(d.today, i);
    const work = (d.work[day] || []).map(([a, b, extra]) => `<i class="work${extra ? " extra" : ""}" style="left:${100 * a / 1440}%;width:${100 * (b - a) / 1440}%"></i>`);
    const slept = (sleepTl[day] || []).map(([a, b, main]) =>
      `<i class="${main ? "main" : "nap"}" style="left:${100 * a / 1440}%;width:${Math.max(0.6, 100 * (b - a) / 1440)}%"></i>`);
    const cls = day === d.today ? "muted today" : "muted";
    rows.push(`<div class="tl-row"><span class="${cls}">${day.slice(8)}.${day.slice(5, 7)}</span><div class="tl">${work.join("")}${slept.join("")}</div></div>`);
  }
  const ticks = [0, 6, 12, 18, 24].map(h => `<span style="left:${100 * h / 24}%">${h}</span>`).join("");
  return `<div class="card"><div class="line"><span>Сон і зміни</span><span class="muted push">±7 днів</span></div>
    <div class="tl-row"><span></span><div class="tl-ticks">${ticks}</div></div>${rows.join("")}
    <div class="legend"><span><b class="dot ph-deep"></b>сон</span><span><b class="dot ph-rem"></b>дрімота</span><span><b class="dot work"></b>зміна</span></div></div>`;
}

// a month of shifts: green = the main shift with its hours, blue = extra hours, moon = night shift
function cell(day, n, s, today) {
  const extra = s.extras?.length;
  const hours = s.main ? `<span class="h">${esc(s.main)}</span>` : extra ? `<span class="h x">${esc(s.extras[0])}</span>` : `<span class="h"></span>`;
  const plus = s.main && extra ? `<span class="x">+${s.extra_h}</span>` : "";
  const cls = ["cal-day", s.main ? "work" : extra ? "extra" : "", day === today && "today", day === selected && "sel"].filter(Boolean).join(" ");
  return `<button class="${cls}" data-day="${day}"><span class="n">${n}</span>${hours}
    <span class="ic">${s.night ? icon("moon", 11) : ""}${plus}</span></button>`;
}

function calendar(d) {
  const first = month || new Date(d.today.slice(0, 7) + "-01T12:00:00");
  month = first;
  const lead = (first.getDay() + 6) % 7;  // monday first
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: lead }, () => "<span></span>");
  for (let n = 1; n <= days; n++) {
    const day = iso(new Date(first.getFullYear(), first.getMonth(), n));
    cells.push(cell(day, n, d.shifts[day] || {}, d.today));
  }
  const week = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map(w => `<span class="muted">${w}</span>`).join("");
  return `<div class="card"><div class="line"><button class="icon-btn" data-month="-1">${icon("back", 18)}</button>
      <span class="grow center">${MONTHS[first.getMonth()]} ${first.getFullYear()}</span>
      <button class="icon-btn" data-month="1">${icon("chevron", 18)}</button></div>
    <div class="cal">${week}${cells.join("")}</div>
    <div class="legend cal-legend"><span><b class="dot work"></b>зміна</span><span>${icon("moon", 12)}нічна</span>
      <span><b class="x">+1</b>допка, год</span></div>
    ${selected ? editor(d) : `<div class="muted gap">Тапни день, щоб змінити. Графік на місяць — CSV з таблиці infocus у чат бота, допку — «допка 21.12 9-21».</div>`}</div>`;
}

// the selected day: the main shift from the usual ones or own hours, extra hours added or removed
const HOURS = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${h}:00</option>`).join("");
let adding = null;  // "main" or "extra" while the own hours row is open

function editor(d) {
  const s = d.shifts[selected] || { extras: [] };
  const [, m, n] = selected.split("-");
  const chip = (hours, on) => `<button class="chip ${on ? "on" : ""}" data-main="${hours}">${hours}</button>`;
  const usual = d.common.map(h => chip(h, s.main === h)).join("")
    + (s.main && !d.common.includes(s.main) ? chip(s.main, true) : "")
    + `<button class="chip ${s.main ? "" : "on"}" data-main="off">вихідний</button>`
    + `<button class="chip" data-own="main">свої…</button>`;
  const extras = (s.extras || []).map(h => `<button class="chip x" data-del="${h}">+${h} ✕</button>`).join("")
    + `<button class="chip" data-own="extra">+ допка</button>`;
  const own = adding ? `<div class="line gap own"><span class="muted">${adding === "main" ? "Зміна" : "Допка"} з</span>
      <select id="ownFrom">${HOURS}</select><span class="muted">до</span><select id="ownTo">${HOURS}</select>
      <button class="chip on" id="ownOk">OK</button></div>` : "";
  return `<div class="cal-edit gap"><div class="line"><b>${n}.${m}</b><span class="muted push">тап по дню ще раз — закрити</span></div>
    <div class="muted gap">Зміна</div><div class="cal-chips">${usual}</div>
    <div class="muted gap">Допки</div><div class="cal-chips">${extras}</div>${own}</div>`;
}

function lastSleep(d) {
  const l = d.sleep?.last;
  if (!l) return "";
  const score = l.score ? ` · оцінка ${l.score}` : "";
  return `<div class="card tap" id="sleepMore">${head("moon", "Сон з браслета", `${hm(l.dur)}${score} · ${l.date}`)}</div>`;
}

function render(d) {
  busy(scr, false);
  $("[data-note]", scr).textContent = d.sleep ? `Mi Fitness · ${d.sleep.upd}` : "";
  const body = $("[data-body]", scr);
  body.innerHTML = stateCard(d) + shiftCard(d) + week(d) + calendar(d) + lastSleep(d)
    + `<div class="muted center">На браслеті: Mi Fitness → Сповіщення → Telegram → Швидкі відповіді, додай «сплю» і «встав».</div>`;
  $("[data-mode]", body).onclick = e => {
    const cmd = e.currentTarget.dataset.mode;
    e.currentTarget.disabled = true;
    send(cmd, answer => toast(answer.text.split("\n")[0]));
  };
  $$("[data-day]", body).forEach(b => b.onclick = () => {
    selected = selected === b.dataset.day ? null : b.dataset.day;
    adding = null;
    render(d);
  });
  const span = h => h.replace("–", "-");
  const hoursOf = (a, b) => `${Number(a)}–${Number(b)}`;
  const extraHours = list => list.reduce((n, h) => { const [a, b] = h.split("–").map(Number); return n + ((b - a + 24) % 24 || 24); }, 0);
  const update = (patch, cmd) => {
    const s = d.shifts[selected] || { extras: [] };
    d.shifts[selected] = { ...s, ...patch };
    d.shifts[selected].extra_h = extraHours(d.shifts[selected].extras || []);
    adding = null;
    request(cmd);
    render(d);  // at once, the bot confirms with fresh data
  };
  $$("[data-main]", body).forEach(b => b.onclick = () => {
    const h = b.dataset.main;
    update({ main: h === "off" ? null : h, night: h !== "off" && Number(h.split("–")[1]) < Number(h.split("–")[0]) },
      `shiftset:${selected}:${h === "off" ? "off" : span(h)}`);
  });
  $$("[data-del]", body).forEach(b => b.onclick = () => {
    const h = b.dataset.del, s = d.shifts[selected];
    update({ extras: s.extras.filter(x => x !== h) }, `extradel:${selected}:${span(h)}`);
  });
  $$("[data-own]", body).forEach(b => b.onclick = () => { adding = b.dataset.own; render(d); });
  $("#ownOk", body)?.addEventListener("click", () => {
    const h = hoursOf($("#ownFrom", body).value, $("#ownTo", body).value), s = d.shifts[selected] || { extras: [] };
    if (adding === "main") {
      update({ main: h, night: Number($("#ownTo", body).value) < Number($("#ownFrom", body).value) }, `shiftset:${selected}:${span(h)}`);
    } else {
      update({ extras: [...(s.extras || []), h] }, `extraadd:${selected}:${span(h)}`);
    }
  });
  if (adding) {
    // extra hours usually follow the shift (stayed late), own hours start as a usual day shift
    const end = Number((d.shifts[selected]?.main || "9–21").split("–")[1]);
    $("#ownFrom", body).value = adding === "main" ? 9 : end;
    $("#ownTo", body).value = adding === "main" ? 21 : (end + 1) % 24;
  }
  $$("[data-month]", body).forEach(b => b.onclick = () => {
    month = new Date(month.getFullYear(), month.getMonth() + Number(b.dataset.month), 1, 12);
    render(d);
  });
  $("#sleepMore")?.addEventListener("click", openSleep);
}
