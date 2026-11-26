import { request, on, last, ready, connected } from "../bus.js";
import { icon } from "../icons.js";
import { $, esc, loading, screen, open, isOpen, toast, busy, head } from "../ui.js";

// sleep from the smart band (mi fitness cloud): the last sleep, 14 days of hours and when the sleep was
const scr = screen("sleep", "Сон", { refresh: () => request("sleep-panel:force") });
const PHASES = [["deep", "Глибокий"], ["light", "Легкий"], ["rem", "REM"], ["awake", "Прокидання"]];
const DAYS = 14;

const hm = m => m >= 60 ? `${Math.floor(m / 60)} год ${String(m % 60).padStart(2, "0")} хв` : `${m} хв`;
const short = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

async function openSleep() {
  if (!connected) return toast("Відкрий панель з кнопки бота");
  open("sleep");
  if (!$("[data-body]", scr).innerHTML) $("[data-body]", scr).innerHTML = `<div class="card">${loading}</div>`;
  const cached = await last("sleep", "48h").catch(() => null);
  if (cached) render(cached);
  request("sleep-panel");
}

on("sleep", data => {
  renderCard(data);
  if (isOpen("sleep")) render(data);
});

function renderCard(d) {
  const l = d.last;
  $("[data-sub]", $("#sleepCard")).textContent = [hm(l.dur), l.score && `оцінка ${l.score}`, l.date].filter(Boolean).join(" · ");
}

export function mount(home) {
  home.insertAdjacentHTML("beforeend", `<div class="card tap" id="sleepCard">${head("moon", "Сон", "…")}</div>`);
  $("#sleepCard").onclick = openSleep;
  ready.then(async () => {
    const cached = await last("sleep", "48h").catch(() => null);
    if (cached) renderCard(cached);
  });
}

// the dates of the window, oldest first, so days without sleep still get a column and a row
function dates(since) {
  const start = new Date(since + "T00:00:00Z");
  return Array.from({ length: DAYS }, (_, i) => new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10));
}

function phases(s) {
  const total = PHASES.reduce((n, [k]) => n + (s[k] || 0), 0);
  if (!total) return "";
  const bar = PHASES.map(([k]) => s[k] ? `<i class="ph-${k}" style="width:${100 * s[k] / total}%"></i>` : "").join("");
  const legend = PHASES.filter(([k]) => s[k]).map(([k, name]) =>
    `<span><b class="dot ph-${k}"></b>${name} ${hm(s[k])}</span>`).join("");
  return `<div class="phases">${bar}</div><div class="legend">${legend}</div>`;
}

function lastCard(l) {
  const wakes = l.wakes ? ` · прокидався ${l.wakes} р.` : "";
  const hr = l.hr ? `<div class="muted gap">Пульс ${l.hr} (${l.hr_min}–${l.hr_max})${wakes}</div>` : "";
  return `<div class="card"><div class="line"><span>Останній сон</span><span class="muted push">${esc(l.date)}</span></div>
    <div class="sleep-big"><b>${hm(l.dur)}</b>${l.score ? `<span class="score">${l.score}<small>/100</small></span>` : ""}</div>
    <div class="muted">${esc(l.from)} → ${esc(l.to)}</div>${phases(l)}${hr}</div>`;
}

// hours a day, split into phases (naps count too)
function chart(days, all) {
  const byDay = Object.fromEntries(days.map(d => [d.day, d]));
  const w = 320, h = 130, bw = w / all.length;
  const max = Math.max(600, ...days.map(d => d.total));
  const y = m => h - 14 - (m / max) * (h - 24);
  const bars = all.map((day, i) => {
    const d = byDay[day];
    let top = h - 14;
    const rects = d ? PHASES.map(([k]) => {
      const hgt = (d[k] || 0) / max * (h - 24);
      top -= hgt;
      return hgt ? `<rect x="${i * bw + 3}" y="${top}" width="${bw - 6}" height="${hgt}" class="ph-${k}"/>` : "";
    }).join("") : "";
    const label = i % 2 === all.length % 2 ? `<text x="${i * bw + bw / 2}" y="${h - 2}" text-anchor="middle">${day.slice(8)}</text>` : "";
    return rects + label;
  }).join("");
  const goal = y(480);
  return `<svg class="sleep-chart" viewBox="0 0 ${w} ${h}" width="100%">${bars}
    <line x1="0" x2="${w}" y1="${goal}" y2="${goal}" stroke="#8b8fa3" stroke-dasharray="4 4"/>
    <text x="${w - 2}" y="${goal - 3}" text-anchor="end">8 год</text></svg>`;
}

// when the sleep was: one row per date, 0–24 h, so night shifts show as daytime sleep
function timeline(t, all) {
  const rows = all.slice().reverse().map(day => {
    const parts = (t[day] || []).map(([a, b, main]) =>
      `<i class="${main ? "main" : "nap"}" style="left:${100 * a / 1440}%;width:${Math.max(0.6, 100 * (b - a) / 1440)}%"></i>`).join("");
    return `<div class="tl-row"><span class="muted">${day.slice(8)}.${day.slice(5, 7)}</span><div class="tl">${parts}</div></div>`;
  }).join("");
  const ticks = [0, 6, 12, 18, 24].map(hh => `<span style="left:${100 * hh / 24}%">${hh}</span>`).join("");
  return `<div class="tl-row"><span></span><div class="tl-ticks">${ticks}</div></div>${rows}`;
}

function render(d) {
  busy(scr, Boolean(d.syncing));
  $("[data-note]", scr).textContent = d.syncing ? "тягну з Mi Fitness…" : `Mi Fitness · ${d.upd}`;
  const all = dates(d.since);
  const avg = d.avg ? `в середньому ${short(d.avg)}/добу` : "";
  $("[data-body]", scr).innerHTML = lastCard(d.last)
    + `<div class="card"><div class="line"><span>${DAYS} днів</span><span class="muted push">${avg}</span></div>${chart(d.days, all)}</div>`
    + `<div class="card"><div class="line"><span>Коли спав</span><span class="muted push">дрімота — рожевим</span></div>${timeline(d.timeline, all)}</div>`;
}
