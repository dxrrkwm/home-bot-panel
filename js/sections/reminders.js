import { send } from "../bus.js";
import { $, $$, card, toast } from "../ui.js";
import { ask } from "./answer.js";

const SOON = ["15 хв", "30 хв", "1 год", "2 год"];

export function mount(home) {
  home.insertAdjacentHTML("beforeend", card("⏰ Нагадування", `
    <div class="line"><input type="text" id="what" placeholder="Що нагадати?"></div>
    <div class="chips gap">
      ${SOON.map(s => `<button data-in="${s}" class="${s === "30 хв" ? "on" : ""}">${s}</button>`).join("")}
      <button data-in="">о…</button>
    </div>
    <div class="line gap" id="atLine" hidden>
      <input type="text" id="at" inputmode="numeric" placeholder="20:00" maxlength="5">
      <div class="chips"><button id="tomorrow">завтра</button></div>
    </div>
    <div class="line gap"><button class="main" id="remind">Нагадати</button></div>
    <div class="grid two gap">
      <button data-ask="📋 Список">📋 Мої нагадування</button>
      <button data-ask="💊 Таблетки">💊 Таблетки</button>
    </div>`, 'id="reminders"'));

  const root = $("#reminders");
  let when = "30 хв", tomorrow = false;

  $$("[data-in]", root).forEach(b => b.onclick = () => {
    $$("[data-in]", root).forEach(x => x.classList.toggle("on", x === b));
    when = b.dataset.in;
    $("#atLine").hidden = Boolean(when);
    if (!when) $("#at").focus();
  });
  $("#tomorrow").onclick = e => {
    tomorrow = !tomorrow;
    e.target.classList.toggle("on", tomorrow);
  };
  $("#at").oninput = e => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
    e.target.value = v.length > 2 ? v.slice(0, 2) + ":" + v.slice(2) : v;
  };
  $("#remind").onclick = () => {
    const what = $("#what").value.trim();
    if (!what) return toast("Напиши, що нагадати");
    let at = "через " + when;
    if (!when) {
      if (!/^\d{1,2}:\d{2}$/.test($("#at").value)) return toast("Вкажи час, напр. 20:00");
      at = (tomorrow ? "завтра " : "") + $("#at").value;
    }
    send(`нагадай ${at} ${what}`, d => toast(d.text.split("\n")[0]));
    $("#what").value = "";
  };
  $$("[data-ask]", root).forEach(b => b.onclick = () => ask(b.dataset.ask, b.textContent));
}
