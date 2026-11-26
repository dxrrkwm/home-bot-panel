import { request, send, on, last, ready, connected } from "../bus.js";
import { icon } from "../icons.js";
import { $, $$, esc, loading, screen, open, isOpen, toast, busy, head } from "../ui.js";
import { hm, openSleep } from "./sleep.js";

// the band as a remote: "сплю" / "встав" (also as quick replies on the band), bedtime for the shifts,
// a week of sleep laid over the work hours, and the shift calendar
const scr = screen("band", "Браслет", { refresh: () => request("band-panel") });
const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const PRESET = { day: "9–21", night: "20–8" };
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

// a month of shifts: green = work with its hours, moon = night shift, flame = extra hours
function cell(day, n, s, today) {
  const work = s.main || s.extra;
  const icons = (s.p === "night" ? icon("moon", 11) : "") + (s.extra ? `<span class="flame">${icon("flame", 11)}</span>` : "");
  const cls = ["cal-day", work && "work", day === today && "today", day === selected && "sel"].filter(Boolean).join(" ");
  return `<button class="${cls}" data-day="${day}"><span class="n">${n}</span>
    <span class="h">${esc(s.main || s.extra || "")}</span><span class="ic">${icons}</span></button>`;
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
      <span><i class="flame">${icon("flame", 12)}</i>допка</span></div>
    ${selected ? editor(d) : `<div class="muted gap">Тапни день, щоб змінити. Графік на місяць — CSV з таблиці infocus у чат бота, допку — «допка 21.12 9-21».</div>`}</div>`;
}

// the selected day: what is there and the three choices for its main shift
function editor(d) {
  const s = d.shifts[selected] || {};
  const [, m, n] = selected.split("-");
  const what = [s.main && `зміна ${s.main}${s.p === "night" ? " (нічна)" : ""}`, s.extra && `допка ${s.extra}`].filter(Boolean).join(", ") || "вихідний";
  const pick = (kind, label) => `<button data-set="${kind}" class="${(s.p || "off") === kind ? "on" : ""}">${label}</button>`;
  return `<div class="cal-edit gap"><div class="line"><span>${n}.${m}</span><span class="muted push">${esc(what)}</span></div>
    <div class="grid gap">${pick("day", "Денна 9–21")}${pick("night", "Нічна 20–8")}${pick("off", "Вихідний")}</div></div>`;
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
    render(d);
  });
  $$("[data-set]", body).forEach(b => b.onclick = () => {
    const kind = b.dataset.set, s = d.shifts[selected] || {};
    d.shifts[selected] = { ...s, p: kind === "off" ? null : kind, main: PRESET[kind] || null };
    request(`shiftset:${selected}:${kind}`);
    render(d);  // at once, the bot confirms with fresh data
  });
  $$("[data-month]", body).forEach(b => b.onclick = () => {
    month = new Date(month.getFullYear(), month.getMonth() + Number(b.dataset.month), 1, 12);
    render(d);
  });
  $("#sleepMore")?.addEventListener("click", openSleep);
}
