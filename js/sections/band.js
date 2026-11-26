import { request, send, on, last, ready, connected } from "../bus.js";
import { icon } from "../icons.js";
import { $, $$, esc, loading, screen, open, isOpen, toast, busy, head } from "../ui.js";
import { hm, openSleep } from "./sleep.js";

// the band as a remote: "сплю" / "встав" (also as quick replies on the band), bedtime for the shifts,
// a week of sleep laid over the work hours, and the shift calendar
const scr = screen("band", "Браслет", { refresh: () => request("band-panel") });
const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const NEXT = { undefined: "day", day: "night", night: undefined };
let data = null;
let month = null;  // first day of the month shown in the calendar

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

function calendar(d) {
  const first = month || new Date(d.today.slice(0, 7) + "-01T12:00:00");
  month = first;
  const lead = (first.getDay() + 6) % 7;  // monday first
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: lead }, () => "<span></span>");
  for (let n = 1; n <= days; n++) {
    const day = iso(new Date(first.getFullYear(), first.getMonth(), n));
    // the mark is the start hour (of the main shift, else of the extra hours), "+" when there are extra hours
    const s = d.shifts[day] || {};
    const mark = (s.from ?? "") + (s.extra ? "+" : "");
    cells.push(`<button class="cal-day ${s.p || (s.extra ? "extra" : "")} ${day === d.today ? "today" : ""}" data-day="${day}">${n}<small>${mark}</small></button>`);
  }
  const week = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map(w => `<span class="muted">${w}</span>`).join("");
  return `<div class="card"><div class="line"><button class="icon-btn" data-month="-1">${icon("back", 18)}</button>
      <span class="grow center">${MONTHS[first.getMonth()]} ${first.getFullYear()}</span>
      <button class="icon-btn" data-month="1">${icon("chevron", 18)}</button></div>
    <div class="cal">${week}${cells.join("")}</div>
    <div class="muted gap">Число — початок зміни, «+» — додаткові години. Тап: денна 9–21 → нічна 21–9 → вихідний.
      Графік на місяць — CSV з таблиці infocus у чат бота.</div></div>`;
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
    const day = b.dataset.day;
    const s = d.shifts[day] || { extra: false };
    const kind = NEXT[s.p];
    d.shifts[day] = { ...s, p: kind, from: kind ? (kind === "day" ? "9" : "21") : undefined };
    render(d);  // at once, the bot confirms with fresh data
    request("shift:" + day);
  });
  $$("[data-month]", body).forEach(b => b.onclick = () => {
    month = new Date(month.getFullYear(), month.getMonth() + Number(b.dataset.month), 1, 12);
    render(d);
  });
  $("#sleepMore")?.addEventListener("click", openSleep);
}
