// screen that shows a bot answer as is: text and its inline buttons
import { send } from "../bus.js";
import { confirm } from "../tg.js";
import { $, $$, esc, loading, screen, open } from "../ui.js";

const el = screen("answer", "");
const body = $("[data-body]", el);

function show(data) {
  const buttons = data.buttons.flat();
  body.innerHTML = `<div class="card text">${esc(data.text)}</div>` +
    (buttons.length ? `<div class="card list">${buttons.map(b =>
      `<button data-cb="${esc(b.callback_data)}">${esc(b.text)}</button>`).join("")}</div>` : "");
  $$("[data-cb]", body).forEach(b => b.onclick = () => press(b));
}

async function press(button) {
  const cmd = button.dataset.cb;
  if (/^(del|clear)/.test(cmd) && !await confirm("Видалити?\n" + button.textContent.replace(/^❌ /, ""))) return;
  body.innerHTML = `<div class="card">${loading}</div>`;
  send(cmd, show);
}

export function ask(cmd, title) {
  $("[data-title]", el).textContent = title;
  body.innerHTML = `<div class="card">${loading}</div>`;
  open("answer");
  send(cmd, show);
}
