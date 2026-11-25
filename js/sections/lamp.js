// lamp: the most used thing, so all controls stay right on the home card
import { send, request, on, ready } from "../bus.js";
import { $, $$, head } from "../ui.js";

const PRESETS = [["🌙 Нічник", "Нічник"], ["🕯 Тепле", "Тепле"], ["🌤 Денне", "Денне"], ["❄️ Холодне", "Холодне"]];
const COLORS = ["#F7C4D4", "#9FD0F2", "#FF8C69", "#C3A6EF", "#A8E0B0"];
const MY_COLORS = "lampColors";  // colors picked by hand, kept on this device
const MY_MAX = 4;
const PICK_MS = 500;  // the picker fires on every move, apply when it stops

let color = null;
let lampOn = false;

const mine = () => JSON.parse(localStorage.getItem(MY_COLORS) || "[]");

function remember(c) {
  if (COLORS.includes(c)) return;
  localStorage.setItem(MY_COLORS, JSON.stringify([c, ...mine().filter(x => x !== c)].slice(0, MY_MAX)));
  drawDots();
}

function describe(s) {
  if (s.error) return "недоступна";
  if (!s.on) return "вимкнена";
  return `${s.bright}% · ${s.rgb || s.ct + " K"}`;
}

function drawDots() {
  const dots = [...COLORS, ...mine()];
  $("#lampDots").innerHTML = dots.map(c => `<button class="dot" style="background:${c}" data-color="${c}"></button>`).join("") +
    `<button class="dot picker" id="pickerDot"><input type="color" id="color" value="#ff8c69"></button>`;
  $$("[data-color]", $("#lampDots")).forEach(b => b.onclick = () => pick(b.dataset.color));
  const input = $("#color");
  let timer;
  input.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => pick(input.value.toUpperCase(), true), PICK_MS);
  };
  input.onchange = () => {
    clearTimeout(timer);
    pick(input.value.toUpperCase(), true);
  };
  markDot();
}

function markDot() {
  const dot = $$("[data-color]").find(d => d.dataset.color === color);
  $$(".dot").forEach(d => d.classList.toggle("on", Boolean(color) && d === dot));
}

// put the real lamp state into the controls, so the sliders and colors are not always the defaults
function show(s) {
  const root = $("#lamp");
  lampOn = Boolean(s.on);
  $("[data-sub]", root).textContent = describe(s);
  $("#lampSwitch").classList.toggle("on", lampOn);
  $(".ico", root).className = `ico ${lampOn ? "amber" : ""}`;
  if (s.error) return;
  $("#bright").value = s.bright;
  if (s.ct) $("#ct").value = s.ct;
  color = s.rgb;
  markDot();
}

// after a command the bot answers with text, then we ask for the fresh state
const refresh = () => request("lamp-state");

function pick(c, custom = false) {
  color = c;
  if (custom) remember(c);
  markDot();
  send(`${c} ${$("#bright").value}%`, refresh);
}

export function mount(home) {
  home.insertAdjacentHTML("beforeend", `<div class="card" id="lamp">
    ${head("bulb", "Лампа", "…", '<button class="switch" id="lampSwitch" aria-label="Увімкнути або вимкнути"></button>', "")}
    <div class="slider-row"><span class="muted">Яскравість</span><input type="range" id="bright" min="1" max="100" value="60"></div>
    <div class="slider-row"><span class="muted">Тепло · холод</span><input type="range" id="ct" class="ct" min="1700" max="6500" step="100" value="4000"></div>
    <div class="dots gap" id="lampDots"></div>
    <div class="chips gap">${PRESETS.map(([cmd, label]) => `<button data-cmd="${cmd}">${label}</button>`).join("")}</div>
  </div>`);

  const root = $("#lamp");
  const bright = $("#bright");
  const ct = $("#ct");
  drawDots();

  $("#lampSwitch").onclick = () => {
    lampOn = !lampOn;
    $("#lampSwitch").classList.toggle("on", lampOn);
    send(lampOn ? "💡 Увімкнути" : "🌑 Вимкнути", refresh);
  };
  $$("[data-cmd]", root).forEach(b => b.onclick = () => send(b.dataset.cmd, refresh));
  bright.oninput = () => $("[data-sub]", root).textContent = bright.value + "%";
  bright.onchange = () => send(`${color ? color + " " : ""}${bright.value}%`, refresh);
  ct.oninput = () => $("[data-sub]", root).textContent = ct.value + " K";
  ct.onchange = () => {
    color = null;  // white light, not a color any more
    markDot();
    send(`${ct.value}K`, refresh);
  };

  on("lamp", show);
  ready.then(refresh);
}
