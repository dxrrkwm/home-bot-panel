import { send } from "../bus.js";
import { icon } from "../icons.js";
import { $, $$, head, toast } from "../ui.js";
import { ask } from "./answer.js";
import { openList } from "./remlist.js";

const SOON = ["15 хв", "30 хв", "1 год", "2 год"];
// repeat until "done" in the chat; minutes, 0 = once, "" = own value
const REPEAT = [["5", "5 хв"], ["10", "10 хв"], ["30", "30 хв"], ["60", "1 год"], ["0", "раз"], ["", "…"]];
const REPEAT_DEFAULT = "10";

export function mount(home) {
  home.insertAdjacentHTML("beforeend", `<div class="card" id="reminders">
    ${head("bell", "Нагадування", "", "", "pink")}
    <div class="line"><input type="text" id="what" placeholder="Що нагадати?"></div>
    <div class="muted gap">Коли</div>
    <div class="chips gap">
      ${SOON.map(s => `<button data-in="${s}" class="${s === "30 хв" ? "on" : ""}">${s}</button>`).join("")}
      <button data-in="">о…</button>
    </div>
    <div class="line gap" id="atLine" hidden>
      <input type="text" id="at" inputmode="numeric" placeholder="20:00" maxlength="5">
      <div class="chips"><button id="tomorrow">завтра</button></div>
    </div>
    <div class="muted gap">Повтор, поки не натиснеш «Зроблено»</div>
    <div class="chips gap">
      ${REPEAT.map(([v, label]) => `<button data-every="${v}" class="${v === REPEAT_DEFAULT ? "on" : ""}">${label}</button>`).join("")}
    </div>
    <div class="line gap" id="everyLine" hidden>
      <input type="text" id="every" inputmode="numeric" placeholder="кожні … хв" maxlength="3">
    </div>
    <div class="line gap"><button class="main" id="remind">Нагадати</button></div>
    <div class="chips gap">
      <button id="remList">${icon("list", 16)} Мої нагадування</button>
      <button data-ask="💊 Таблетки" data-title="Таблетки">${icon("pill", 16)} Таблетки</button>
    </div></div>`);

  const root = $("#reminders");
  let when = "30 хв", tomorrow = false, every = REPEAT_DEFAULT;

  $$("[data-every]", root).forEach(b => b.onclick = () => {
    $$("[data-every]", root).forEach(x => x.classList.toggle("on", x === b));
    every = b.dataset.every;
    $("#everyLine").hidden = every !== "";
    if (every === "") $("#every").focus();
  });
  $("#every").oninput = e => e.target.value = e.target.value.replace(/\D/g, "");

  const repeat = () => {
    const min = every === "" ? $("#every").value : every;
    if (!min) return null;
    return min === "0" ? " без повтору" : ` кожні ${min} хв`;
  };

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
    const rep = repeat();
    if (rep === null) return toast("Вкажи, як часто повторювати, напр. 15");
    send(`нагадай ${at} ${what}${rep}`, d => toast(d.text.split("\n")[0]));
    $("#what").value = "";
  };
  $("#remList").onclick = openList;
  $$("[data-ask]", root).forEach(b => b.onclick = () => ask(b.dataset.ask, b.dataset.title));
}
