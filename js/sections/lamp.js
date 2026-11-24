import { send, request, on, ready } from "../bus.js";
import { $, $$, card } from "../ui.js";

const PRESETS = [["💡 Увімкнути", "Увімкнути"], ["🌑 Вимкнути", "Вимкнути"], ["🌙 Нічник", "Нічник"],
                 ["🕯 Тепле", "🕯 Тепле"], ["🌤 Денне", "🌤 Денне"], ["❄️ Холодне", "❄️ Холодне"]];
const COLORS = ["#F7C4D4", "#9FD0F2", "#FF8C69", "#C3A6EF", "#A8E0B0"];

let color = null;

function describe(s) {
  if (s.error) return "недоступна: " + s.error;
  if (!s.on) return "вимкнена";
  return `увімкнена · ${s.bright}% · ${s.rgb || s.ct + " K"}`;
}

// put the real lamp state into the controls, so the slider and colors are not always the defaults
function show(s) {
  $("#lampState").textContent = describe(s);
  if (s.error) return;
  $("#bright").value = s.bright;
  $("#bv").textContent = s.bright + "%";
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
  home.insertAdjacentHTML("beforeend", card('💡 Лампа <small id="bv">…</small>', `
    <div class="muted" id="lampState">…</div>
    <div class="grid">${PRESETS.map(([cmd, label]) => `<button data-cmd="${cmd}">${label}</button>`).join("")}</div>
    <div class="dots">
      ${COLORS.map(c => `<button class="dot" style="background:${c}" data-color="${c}"></button>`).join("")}
      <button class="dot picker" id="pickerDot"><input type="color" id="color" value="#ff8c69"></button>
    </div>
    <div class="line gap"><span>🔅</span><input type="range" id="bright" min="1" max="100" value="60"><span>🔆</span></div>`,
    'id="lamp"'));

  const root = $("#lamp");
  const bright = $("#bright");

  const pick = value => send(`${value} ${bright.value}%`, refresh);

  $$("[data-cmd]", root).forEach(b => b.onclick = () => send(b.dataset.cmd, refresh));
  $$("[data-color]", root).forEach(b => b.onclick = () => pick(b.dataset.color));
  $("#color").onchange = e => pick(e.target.value.toUpperCase());
  bright.oninput = () => $("#bv").textContent = bright.value + "%";
  bright.onchange = () => send(`${color ? color + " " : ""}${bright.value}%`, refresh);

  on("lamp", show);
  ready.then(refresh);
}
