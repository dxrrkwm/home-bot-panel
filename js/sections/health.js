// system status: every part of the bot with a colored dot, problems on top (like a status page)
import { request, on, last, ready, connected, send } from "../bus.js";
import { $, $$, esc, loading, screen, open, isOpen, toast, busy, head } from "../ui.js";

const ORDER = ["bad", "warn", "ok", "off"];
const WORDS = { bad: "не працює", warn: "увага", ok: "працює", off: "вимкнено" };
// what can be fixed right from the row
const FIX = {
  mono: ["🔄 Оновити виписку", "Оновити виписку"],
  band: ["оновити сон", "Оновити сон"],
  prices: ["оновити ціни", "Оновити ціни"],
  station: ["station-panel:force", "Оновити станцію", true],
  quiet: ["тиша вимк", "Зняти тишу"],
};

const el = screen("health", "Стан системи", { refresh: () => request("health") });
const body = $("[data-body]", el);

function summary(d) {
  const n = d.items.filter(i => i.state === "bad" || i.state === "warn").length;
  return n ? `${n} ${n === 1 ? "потребує" : "потребують"} уваги` : "усе працює";
}

function renderCard(d) {
  $("[data-sub]", $("#healthCard")).textContent = `${summary(d)} · ${d.upd}`;
  $("#healthDot").className = "status-dot " + d.worst;
}

function render(d) {
  busy(el, false);
  $("[data-note]", el).textContent = `перевірено о ${d.upd}`;
  const items = [...d.items].sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));
  const fix = i => FIX[i.k] && (i.state === "bad" || i.state === "warn" || i.k === "quiet")
    ? `<button class="fix" data-fix="${i.k}">${FIX[i.k][1]}</button>` : "";
  body.innerHTML = `<div class="card status-hero ${d.worst}"><span class="status-dot big ${d.worst}"></span>
      <div><div class="h-title">${d.worst === "ok" || d.worst === "off" ? "Усе працює" : summary(d)}</div>
      <div class="muted">${d.items.filter(i => i.state === "ok").length} з ${d.items.length} у нормі</div></div></div>
    <div class="card">${items.map(i => `<div class="status-row">
      <span class="status-dot ${i.state}" title="${WORDS[i.state]}"></span>
      <div class="grow"><div>${esc(i.name)}</div><div class="muted">${esc(i.text)}</div></div>${fix(i)}</div>`).join("")}</div>`;
  $$("[data-fix]", body).forEach(b => b.onclick = () => {
    const [cmd, , isRequest] = FIX[b.dataset.fix];
    b.disabled = true;
    if (isRequest) {
      request(cmd);
      setTimeout(() => request("health"), 4000);
      return;
    }
    send(cmd, reply => { toast(reply.text.split("\n")[0]); request("health"); });
  });
}

on("health", d => {
  renderCard(d);
  if (isOpen("health")) render(d);
});

export function mount(home) {
  home.insertAdjacentHTML("beforeend", `<div class="card tap" id="healthCard">
    ${head("activity", "Стан системи", "…", `<span id="healthDot" class="status-dot"></span>`, "blue")}</div>`);
  $("#healthCard").onclick = async () => {
    if (!connected) return toast("Відкрий панель з кнопки бота");
    open("health");
    const cached = await last("health", "1h").catch(() => null);
    if (cached) render(cached);
    else body.innerHTML = `<div class="card">${loading}</div>`;
    busy(el, true);
    request("health");
  };
  ready.then(async () => {
    const cached = await last("health", "6h").catch(() => null);
    if (cached) renderCard(cached);
    request("health");
  });
}
