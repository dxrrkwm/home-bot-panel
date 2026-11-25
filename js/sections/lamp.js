// lamp: the most used thing, so all controls stay right on the home card
import { send, request, on, ready } from "../bus.js";
import { $, $$, head } from "../ui.js";

const PRESETS = [["🌙 Нічник", "Нічник"], ["🕯 Тепле", "Тепле"], ["🌤 Денне", "Денне"], ["❄️ Холодне", "Холодне"]];
const COLORS = ["#F7C4D4", "#9FD0F2", "#FF8C69", "#C3A6EF", "#A8E0B0"];

let color = null;
let lampOn = false;

function describe(s) {
  if (s.error) return "недоступна";
  if (!s.on) return "вимкнена";
  return `${s.bright}% · ${s.rgb || s.ct + " K"}`;
}

// put the real lamp state into the controls, so the slider and colors are not always the defaults
function show(s) {
  const root = $("#lamp");
  lampOn = Boolean(s.on);
  $("[data-sub]", root).textContent = describe(s);
  $("#lampSwitch").classList.toggle("on", lampOn);
  $(".ico", root).className = `ico ${lampOn ? "amber" : ""}`;
  if (s.error) return;
  $("#bright").value = s.bright;
  color = s.rgb;
  const preset = $$("[data-color]").find(d => d.dataset.color === s.rgb);
  if (s.rgb && !preset) {
    $("#color").value = s.rgb.toLowerCase();
    $("#pickerDot").style.background = s.rgb;
  }
  $$(".dot").forEach(d => d.classList.toggle("on", Boolean(s.rgb) && d === (preset || $("#pickerDot"))));
}

// after a command the bot answers with text, then we ask for the fresh state
const refresh = () => request("lamp-state");

export function mount(home) {
  home.insertAdjacentHTML("beforeend", `<div class="card" id="lamp">
    ${head("bulb", "Лампа", "…", '<button class="switch" id="lampSwitch" aria-label="Увімкнути або вимкнути"></button>', "")}
    <div class="line"><input type="range" id="bright" min="1" max="100" value="60"></div>
    <div class="dots gap">
      ${COLORS.map(c => `<button class="dot" style="background:${c}" data-color="${c}"></button>`).join("")}
      <button class="dot picker" id="pickerDot"><input type="color" id="color" value="#ff8c69"></button>
    </div>
    <div class="chips gap">${PRESETS.map(([cmd, label]) => `<button data-cmd="${cmd}">${label}</button>`).join("")}</div>
  </div>`);

  const root = $("#lamp");
  const bright = $("#bright");
  const pick = value => send(`${value} ${bright.value}%`, refresh);

  $("#lampSwitch").onclick = () => {
    lampOn = !lampOn;
    $("#lampSwitch").classList.toggle("on", lampOn);
    send(lampOn ? "💡 Увімкнути" : "🌑 Вимкнути", refresh);
  };
  $$("[data-cmd]", root).forEach(b => b.onclick = () => send(b.dataset.cmd, refresh));
  $$("[data-color]", root).forEach(b => b.onclick = () => pick(b.dataset.color));
  $("#color").onchange = e => pick(e.target.value.toUpperCase());
  bright.oninput = () => $("[data-sub]", root).textContent = bright.value + "%";
  bright.onchange = () => send(`${color ? color + " " : ""}${bright.value}%`, refresh);

  on("lamp", show);
  ready.then(refresh);
}
