// power: station battery, is there power, outages for 7 days, controls
import { send, request, on, last, ready, connected } from "../bus.js";
import { $, $$, esc, loading, screen, open, isOpen, toast } from "../ui.js";
import { ask } from "./answer.js";

const REFRESH_MS = 30000;
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

const el = screen("power", "⚡ Живлення");
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

function ring(pct, cls, size = 132) {
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct ?? 0));
  return `<svg class="ring ${cls}" viewBox="0 0 120 120" width="${size}" height="${size}">
    <circle cx="60" cy="60" r="${r}" class="track"/>
    <circle cx="60" cy="60" r="${r}" class="fill" stroke-dasharray="${c * v / 100} ${c}" transform="rotate(-90 60 60)"/>
    <text x="60" y="${size > 80 ? 66 : 70}" text-anchor="middle" class="pct">${pct ?? "—"}<tspan class="unit">%</tspan></text></svg>`;
}

function stationLine(d) {
  const s = d.station;
  if (!d.configured) return "станція не підключена";
  if (!s) return "немає даних";
  if (!s.online) return "станція вимкнена або без Wi-Fi";
  if (s.mode === "supply") return `живить від батареї · вистачить ≈ ${hm(d.est)}`;
  if (s.mode === "charging") return s.charge ? `заряджається · до 100% ≈ ${hm(s.charge)}` : "від мережі";
  return "простоює";
}

// home card: one look tells if there is power and how long the station lasts
function renderCard(d) {
  const h = headline(d), s = d.station;
  $("#powerCard").innerHTML = `<div class="power-mini">
    ${ring(s?.online ? s.pct : null, h.cls, 56)}
    <div class="grow"><div class="state ${h.cls}">${h.text}${h.sub && h.cls === "off" ? ` · ${h.sub}` : ""}</div>
    <div class="muted">${esc(stationLine(d))}${d.ups ? " · UPS" : ""}</div></div>
    <span class="arrow">›</span></div>`;
}

function flow(d) {
  const s = d.station, on = s?.online;
  return `<div class="flow">
    <div class="flow-side"><span class="muted">з мережі</span><b>${on ? s.in : "—"} <small>W</small></b></div>
    ${ring(on ? s.pct : null, headline(d).cls)}
    <div class="flow-side"><span class="muted">на пристрої</span><b>${on ? s.out : "—"} <small>W</small></b></div></div>
    <div class="center muted">${esc(stationLine(d))}</div>`;
}

function chips(d) {
  const s = d.station, l = d.laptop;
  const chip = (text, cls = "") => `<span class="chip ${cls}">${text}</span>`;
  return `<div class="chips-row">
    ${chip(d.ups ? "UPS увімкнено" : "UPS вимкнено", d.ups ? "ok" : "")}
    ${s?.online ? chip(s.ac ? "розетка AC увімк." : "розетка AC вимк.", s.ac ? "" : "warn") : ""}
    ${chip(`ноут ${l.ac ? "від мережі" : "на батареї " + l.pct + "%"}`, l.ac ? "" : "warn")}
    ${chip(l.eco ? "Еко" : "звичайний режим")}
    ${s?.online && s.temp != null ? chip(`${s.temp}°`) : ""}</div>`;
}

function controls(d) {
  const s = d.station;
  return `<div class="card"><div class="title">Керування</div>
    <div class="setting"><span>Розетка AC</span><div class="seg">
      <button data-cmd="ac:on" class="${s?.ac ? "on" : ""}">Увімк.</button>
      <button data-cmd="ac:off" class="${s && !s.ac ? "on" : ""}">Вимк.</button></div></div>
    <div class="setting"><span>Режим UPS<div class="muted">станція постійно в розетці</div></span><div class="seg">
      <button data-cmd="ups on" class="${d.ups ? "on" : ""}">Так</button>
      <button data-cmd="ups off" class="${d.ups ? "" : "on"}">Ні</button></div></div>
    <div class="setting"><span>Ноут</span><div class="seg">
      <button data-cmd="🔋 Еко" class="${d.laptop.eco ? "on" : ""}">Еко</button>
      <button data-cmd="⚡ Звичайний" class="${d.laptop.eco ? "" : "on"}">Звичайний</button></div></div></div>`;
}

function battery(hist) {
  if (hist.length < 2) return "";
  const w = 320, h = 90, t0 = hist[0][0], t1 = hist[hist.length - 1][0];
  const x = t => 4 + (t - t0) / Math.max(1, t1 - t0) * (w - 8);
  const y = v => 6 + (100 - v) / 100 * (h - 22);
  const pts = hist.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const time = t => new Date(t * 1000).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  return `<div class="card"><div class="line"><span>Заряд станції</span><span class="muted push">24 год</span></div>
    <svg viewBox="0 0 ${w} ${h}" width="100%">
      <line x1="4" x2="${w - 4}" y1="${y(50)}" y2="${y(50)}" class="grid-line"/>
      <polyline points="${pts}" class="pct-line"/>
      <text x="4" y="${h - 2}">${time(t0)}</text><text x="${w - 4}" y="${h - 2}" text-anchor="end">${time(t1)}</text>
      <text x="${w - 4}" y="${y(50) - 3}" text-anchor="end">50%</text></svg></div>`;
}

// one row per day: what the schedule said (outline) and what really happened (filled)
function outages(d) {
  const seg = (list, cls) => list.map(([a, b]) =>
    `<i class="${cls}" style="left:${a / 14.4}%;width:${Math.max(0.6, (b - a) / 14.4)}%"></i>`).join("");
  const rows = d.days.map(day => `<div class="day"><span>${DAYS[day.w]} ${day.d.slice(0, 2)}</span>
    <div class="track24">${seg(day.plan, "plan")}${seg(day.off, "fact")}</div></div>`).join("");
  const facts = [`${d.count} разів`, `${String(d.hours).replace(".", ",")} год без світла`];
  if (d.drain) facts.push(`станція −${String(d.drain).replace(".", ",")}%/год`);
  if (d.charge_rate) facts.push(`заряд +${d.charge_rate}%/год`);
  return `<div class="card"><div class="line"><span>Відключення</span><span class="muted push">7 днів</span></div>
    <div class="muted gap">${facts.join(" · ")}</div>
    <div class="days">${rows}<div class="day axis"><span></span><div class="ticks"><b>0</b><b>6</b><b>12</b><b>18</b><b>24</b></div></div></div>
    <div class="legend muted"><span><i class="fact"></i>було</span><span><i class="plan"></i>за графіком${d.group ? " " + esc(d.group) : ""}</span></div>
    ${d.next ? `<div class="muted gap">Наступне за графіком: ${d.next[0]}–${d.next[1]}</div>` : ""}</div>`;
}

function render(d) {
  data = d;
  renderCard(d);
  if (!isOpen("power")) return;
  const h = headline(d);
  $("[data-note]", el).textContent = "оновлено " + d.upd;
  body.innerHTML = `<div class="card hero">
      <div class="state big-state ${h.cls}">${h.text}</div>${h.sub ? `<div class="muted center">${esc(h.sub)}</div>` : ""}
      ${flow(d)}${chips(d)}
      ${d.error && d.station && !d.station.online ? `<div class="muted center gap">${esc(d.error)}</div>` : ""}</div>
    ${controls(d)}${battery(d.hist)}${outages(d)}
    <button class="wide" id="statsText">Підсумок текстом</button>`;
  $$("[data-cmd]", body).forEach(b => b.onclick = () => press(b));
  $("#statsText").onclick = () => ask("station_stats", "📊 Статистика");
}

function press(b) {
  $$(`[data-cmd]`, b.parentElement).forEach(x => x.classList.toggle("on", x === b));
  send(b.dataset.cmd, reply => {
    toast(reply.text.split("\n")[0]);
    setTimeout(refresh, 1500);
  });
}

const refresh = () => request("station-panel");

export async function openPower() {
  if (!connected) return toast("Відкрий панель з кнопки бота");
  open("power");
  if (data) render(data);
  else body.innerHTML = `<div class="card">${loading}</div>`;
  refresh();
  clearInterval(timer);
  timer = setInterval(() => isOpen("power") ? refresh() : clearInterval(timer), REFRESH_MS);
}

export function mount(home) {
  home.insertAdjacentHTML("beforeend", `<div class="card tap" id="powerCard">
    <div class="power-mini"><div class="grow muted">${loading}</div></div></div>`);
  $("#powerCard").onclick = openPower;
  on("station", render);
  // show the last known state at once, then ask the bot for a fresh one
  ready.then(async () => {
    const cached = await last("station").catch(() => null);
    if (cached && !data) render(cached);
    refresh();
  });
}
