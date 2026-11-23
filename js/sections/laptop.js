import { send } from "../bus.js";
import { $, $$, card } from "../ui.js";
import { ask } from "./answer.js";
import { openFinance } from "./finance.js";

const TILES = [
  ["🔋", "Еко", { cmd: "🔋 Еко" }],
  ["⚡", "Звичайний", { cmd: "⚡ Звичайний" }],
  ["📊", "Статус", { view: "📊 Статус" }],
  ["🔌", "Станція", { view: "🔌 Станція" }],
  ["🗓", "Графік", { view: "графік" }],
  ["💰", "Фінанси", { open: openFinance }],
];

export function mount(home) {
  home.insertAdjacentHTML("beforeend", card("💻 Ноут",
    `<div class="grid">${TILES.map(([icon, label], i) =>
      `<button class="tile" data-tile="${i}"><b>${icon}</b>${label}</button>`).join("")}</div>`, 'id="laptop"'));

  $$("[data-tile]", $("#laptop")).forEach(b => b.onclick = () => {
    const [, label, act] = TILES[b.dataset.tile];
    if (act.cmd) send(act.cmd);
    else if (act.view) ask(act.view, label);
    else act.open();
  });
}
