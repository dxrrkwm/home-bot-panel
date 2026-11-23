import { send, connected } from "../bus.js";
import { $, $$, card } from "../ui.js";

const PRESETS = [["💡 Увімкнути", "Увімкнути"], ["🌑 Вимкнути", "Вимкнути"], ["🌙 Нічник", "Нічник"],
                 ["🕯 Тепле", "🕯 Тепле"], ["🌤 Денне", "🌤 Денне"], ["❄️ Холодне", "❄️ Холодне"]];
const COLORS = ["#F7C4D4", "#9FD0F2", "#FF8C69", "#C3A6EF", "#A8E0B0"];

export function mount(home) {
  home.insertAdjacentHTML("beforeend", card('💡 Лампа <small id="bv">60%</small>', `
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
  const state = d => $("#lampState").textContent = d.text.replace(/^💡 /, "").split("\n").slice(0, 3).join(" · ");
  let color = null;

  const pick = (dot, value) => {
    $$(".dot", root).forEach(d => d.classList.toggle("on", d === dot));
    color = value;
    send(`${value} ${bright.value}%`, state);
  };

  $$("[data-cmd]", root).forEach(b => b.onclick = () => send(b.dataset.cmd, state));
  $$("[data-color]", root).forEach(b => b.onclick = () => pick(b, b.dataset.color));
  $("#color").onchange = e => {
    $("#pickerDot").style.background = e.target.value;
    pick($("#pickerDot"), e.target.value.toUpperCase());
  };
  bright.oninput = () => $("#bv").textContent = bright.value + "%";
  bright.onchange = () => send(`${color ? color + " " : ""}${bright.value}%`, state);

  if (connected) setTimeout(() => send("lamp?", state), 500);
}
