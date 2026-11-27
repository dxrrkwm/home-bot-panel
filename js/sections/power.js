// power: is there power, station battery, controls, outages for 7 days vs the schedule
import { send, request, on, last, ready, connected } from "../bus.js";
import { icon } from "../icons.js";
import { $, $$, esc, loading, screen, open, isOpen, toast, busy } from "../ui.js";
import { ask } from "./answer.js";
import { confirm } from "../tg.js";

// what a command does to the things plugged into the station: asked before it runs
const WARN = {
  "ac:off": "Вимкнути розетку AC на станції?\n\nУсе, що в неї ввімкнено (ноут, роутер), лишиться без живлення: " +
            "ноут перейде на свою батарею, інтернет зникне.",
  "ups off": "Вимкнути режим UPS?\n\nБот перестане бачити відключення по станції і не перемикатиме Еко сам. " +
             "Це треба, лише якщо станція більше не стоїть у розетці.",
};

const REFRESH_MS = 30000;
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

const el = screen("power", "Живлення", { refresh: () => request("station-panel:force") });
const body = $("[data-body]", el);
let data = null;
let timer = null;

const hm = mins => {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return h ? `${h} год ${String(m).padStart(2, "0")} хв` : `${m} хв`;
};
const since = ts => hm((Date.now() / 1000 - ts) / 60);

function headline(d) {
  if (d.grid === false) return { text: "Світла немає", sub: d.since ? since(d.since) : "", cls: "off" };
  if (d.grid === true) return { text: "Світло є", sub: d.ups ? "станція на підстраховці" : "", cls: "ok" };
  return { text: "Світло: невідомо", sub: "станція не на зв'язку", cls: "" };
}

function ring(pct, cls, size = 132, temp = null) {
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct ?? 0));
  return `<svg class="ring ${cls}" viewBox="0 0 120 120" width="${size}" height="${size}">
    <circle cx="60" cy="60" r="${r}" class="track"/>
    <circle cx="60" cy="60" r="${r}" class="fill" stroke-dasharray="${c * v / 100} ${c}" transform="rotate(-90 60 60)"/>
    <text x="60" y="${size > 80 ? 64 : 72}" text-anchor="middle" class="pct">${pct ?? "—"}${size > 80 ? '<tspan class="unit">%</tspan>' : ""}</text>
    ${temp != null ? `<text x="60" y="84" text-anchor="middle" class="temp">${temp}°C</text>` : ""}</svg>`;
}

function stationLine(d) {
  const s = d.station;
  if (!d.configured) return "станція не підключена";
  if (!s) return "немає даних";
  if (!s.online) return "станція вимкнена або без Wi-Fi";
  if (s.mode === "supply") return `станція живить ноут і роутер · вистачить ≈ ${hm(d.est)}`;
  if (s.mode === "charging") return s.charge ? `станція заряджається · до 100% ≈ ${hm(s.charge)}` : "станція від розетки, батарея повна";
  return "станція нічого не живить";
}

// home card: one look tells if there is power and how long the station lasts
function renderCard(d) {
  const h = headline(d), s = d.station;
  $("#powerCard").innerHTML = `<div class="head-row">${ring(s?.online ? s.pct : null, h.cls, 44)}
    <div class="grow"><div class="h-title state ${h.cls}">${h.text}${h.cls === "off" && h.sub ? ` · ${h.sub}` : ""}</div>
    <div class="h-sub">${esc(s?.online && s.mode === "supply" ? `все від станції · вистачить ≈ ${hm(d.est)}` : stationLine(d))}</div></div><div class="h-right">${icon("chevron", 18)}</div></div>`;
}

function flow(d) {
  const s = d.station, on = s?.online;
  return `<div class="flow">
    <div class="flow-side"><span class="muted">з розетки</span><b>${on ? s.in : "—"} <small>W</small></b></div>
    ${ring(on ? s.pct : null, headline(d).cls, 132, on ? s.temp : null)}
    <div class="flow-side"><span class="muted">віддає</span><b>${on ? s.out : "—"} <small>W</small></b></div></div>
    <div class="center muted">${esc(stationLine(d))}</div>`;
}

function chips(d) {
  const s = d.station, l = d.laptop;
  const chip = (text, cls = "") => `<span class="chip ${cls}">${text}</span>`;
  return `<div class="chips-row">
    ${s?.online ? chip(s.ac ? "розетка AC увімк." : "розетка AC вимк.", s.ac ? "" : "warn") : ""}
    ${chip(l.ac ? `батарея ноута ${l.pct ?? "—"}%` : `ноут на своїй батареї · ${l.pct ?? "—"}%`, l.ac ? "" : "warn")}</div>`;
}

function seg(cmdOn, cmdOff, isOn, labels = ["Увімк.", "Вимк."]) {
  return `<div class="seg"><button data-cmd="${cmdOn}" class="${isOn ? "on" : ""}">${labels[0]}</button>
    <button data-cmd="${cmdOff}" class="${isOn === false ? "on" : ""}">${labels[1]}</button></div>`;
}

function controls(d) {
  const s = d.station;
  return `<div class="card">
    <div class="setting"><span>Розетка AC</span>${seg("ac:on", "ac:off", s ? s.ac : null)}</div>
    <div class="setting"><span>Режим UPS<div class="muted">станція постійно в розетці</div></span>${seg("ups on", "ups off", d.ups, ["Так", "Ні"])}</div>
    <div class="setting"><span>Ліхтар</span><div class="seg">
      ${[[0, "Вимк."], [1, "Світло"], [2, "Блимає"]].map(([m, label]) =>
        `<button data-cmd="led:${m}" class="${s?.online && s.led === m ? "on" : ""}">${label}</button>`).join("")}</div></div>
    <div class="setting"><span>Ноут</span>${laptopModes(d.laptop)}</div></div>`;
}

function laptopModes(l) {
  const mode = l.mode || (l.eco ? "eco" : "normal");
  return `<div class="seg">${[["⚡ Звичайний", "normal", "Звичайний"], ["🔋 Еко", "eco", "Еко"], ["🌑 Мінімум", "min", "Мінімум"]]
    .map(([cmd, m, label]) => `<button data-cmd="${cmd}" class="${l.ac !== null && mode === m ? "on" : ""}">${label}</button>`).join("")}</div>`;
}

function battery(hist) {
  if (hist.length < 2) return "";
  const w = 320, h = 90, t0 = hist[0][0], t1 = hist[hist.length - 1][0];
  const x = t => 4 + (t - t0) / Math.max(1, t1 - t0) * (w - 8);
  const y = v => 6 + (100 - v) / 100 * (h - 22);
  const pts = hist.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const time = t => {
    const d = new Date(t * 1000), hm = d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === new Date().toDateString() ? hm : "вчора " + hm;
  };
  return `<div class="card"><div class="line"><span>Заряд станції</span><span class="muted push">24 год</span></div>
    <svg viewBox="0 0 ${w} ${h}" width="100%">
      <line x1="4" x2="${w - 4}" y1="${y(50)}" y2="${y(50)}" class="grid-line"/>
      <polyline points="${pts}" class="pct-line"/>
      <text x="4" y="${h - 2}">${time(t0)}</text><text x="${w - 4}" y="${h - 2}" text-anchor="end">${time(t1)}</text>
      <text x="${w - 4}" y="${y(50) - 3}" text-anchor="end">50%</text></svg></div>`;
}

// one row per day: what the schedule said (outline) and what really happened (filled)
function outages(d) {
  const segs = (list, cls) => list.map(([a, b]) =>
    `<i class="${cls}" style="left:${a / 14.4}%;width:${Math.max(0.6, (b - a) / 14.4)}%"></i>`).join("");
  const rows = d.days.map(day => `<div class="day"><span>${DAYS[day.w]} ${day.d.slice(0, 2)}</span>
    <div class="track24">${segs(day.plan, "plan")}${segs(day.off, "fact")}</div></div>`).join("");
  const facts = [`${d.count} разів`, `${String(d.hours).replace(".", ",")} год без світла`];
  if (d.drain) facts.push(`станція −${String(d.drain).replace(".", ",")}%/год`);
  if (d.charge_rate) facts.push(`заряд +${d.charge_rate}%/год`);
  const plan = (d.plan || []).map(([day, a, b]) => `<div class="row"><div>${day}</div><div>${a}–${b}</div></div>`).join("");
  return `<div class="card"><div class="line"><span>Відключення</span><span class="muted push">7 днів</span></div>
    <div class="muted gap">${facts.join(" · ")}</div>
    <div class="days">${rows}<div class="day"><span></span><div class="ticks"><b>0</b><b>6</b><b>12</b><b>18</b><b>24</b></div></div></div>
    <div class="legend muted"><span><i class="fact"></i>було</span><span><i class="plan"></i>за графіком</span></div></div>
    <div class="card"><div class="line"><span>За графіком${d.group ? " · черга " + esc(d.group) : ""}</span></div>
    ${plan ? `<div class="plan-list">${plan}</div>` : '<div class="muted gap">відключень не заплановано</div>'}</div>`;
}

function render(d) {
  data = d;
  busy(el, false);
  renderCard(d);
  if (!isOpen("power")) return;
  const h = headline(d);
  $("[data-note]", el).textContent = "оновлено " + d.upd;
  body.innerHTML = `<div class="card">
      <div class="state big-state ${h.cls}">${h.text}</div>${h.sub ? `<div class="muted center">${esc(h.sub)}</div>` : ""}
      ${flow(d)}${chips(d)}
      ${d.error && d.station && !d.station.online ? `<div class="muted center gap">${esc(d.error)}</div>` : ""}</div>
    ${controls(d)}${battery(d.hist)}${outages(d)}
    <button class="wide" id="statsText">${icon("text", 18)} Підсумок текстом</button>`;
  $$("[data-cmd]", body).forEach(b => b.onclick = () => press(b));
  $("#statsText").onclick = () => ask("station_stats", "Підсумок");
}

async function press(b) {
  const warn = WARN[b.dataset.cmd];
  if (warn && !await confirm(warn)) return;
  $$("button", b.parentElement).forEach(x => x.classList.toggle("on", x === b));
  send(b.dataset.cmd, reply => {
    toast(reply.text.split("\n")[0]);
    setTimeout(() => request("station-panel"), 1500);
  });
}

export async function openPower() {
  if (!connected) return toast("Відкрий панель з кнопки бота");
  open("power");
  if (data) render(data);
  else body.innerHTML = `<div class="card">${loading}</div>`;
  request("station-panel");
  clearInterval(timer);
  timer = setInterval(() => isOpen("power") ? request("station-panel") : clearInterval(timer), REFRESH_MS);
}

export function mount(home) {
  home.insertAdjacentHTML("beforeend", `<div class="card tap" id="powerCard">
    <div class="head-row"><span class="ico">${icon("zap")}</span><div class="grow muted">${loading}</div></div></div>`);
  $("#powerCard").onclick = openPower;
  on("station", render);
  // show the last known state at once, then ask the bot for a fresh one
  ready.then(async () => {
    const cached = await last("station").catch(() => null);
    if (cached && !data) render(cached);
    request("station-panel");
  });
}
