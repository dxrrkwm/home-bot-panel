// my reminders: tap one to change its text, time or repeat, or delete it
import { send, request, on, connected } from "../bus.js";
import { confirm } from "../tg.js";
import { $, $$, esc, loading, screen, open, isOpen, toast, busy } from "../ui.js";

const REPEAT = [[5, "5 хв"], [10, "10 хв"], [30, "30 хв"], [60, "1 год"], [0, "раз"]];

const el = screen("remlist", "Мої нагадування", { refresh: () => request("rem-list") });
const body = $("[data-body]", el);
let items = [];
let editing = null;

const pad = n => String(n).padStart(2, "0");
const local = ts => {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const when = ts => {
  const d = new Date(ts * 1000), today = new Date();
  const day = d.toDateString() === today.toDateString() ? "сьогодні"
    : d.toDateString() === new Date(today.getTime() + 864e5).toDateString() ? "завтра"
    : d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  return `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const repeatText = m => !m ? "без повтору" : m % 60 ? `кожні ${m} хв` : `кожні ${m / 60} год`;

function form(r) {
  return `<div class="edit">
    <input type="text" data-f="text" value="${esc(r.text)}">
    <input type="datetime-local" data-f="ts" value="${local(r.ts)}">
    <div class="muted">Повтор, поки не натиснеш «Зроблено»</div>
    <div class="chips">${REPEAT.map(([m, label]) =>
      `<button data-every="${m}" class="${m === r.every ? "on" : ""}">${label}</button>`).join("")}</div>
    <div class="grid two"><button class="danger" data-del>Видалити</button><button class="main" data-save>Зберегти</button></div>
  </div>`;
}

function render() {
  busy(el, false);
  if (!isOpen("remlist")) return;
  if (!items.length) {
    body.innerHTML = `<div class="card muted">Нагадувань немає</div>`;
    return;
  }
  body.innerHTML = `<div class="card">${items.map(r => `<div class="item rem" data-id="${esc(r.id)}">
      <div class="line"><b>${when(r.ts)}</b><span class="muted push">${repeatText(r.every)}</span></div>
      <div>${esc(r.text)}</div>
      ${editing === r.id ? form(r) : ""}</div>`).join("")}</div>`;
  $$(".rem", body).forEach(row => row.onclick = e => {
    if (e.target.closest(".edit")) return;
    editing = editing === row.dataset.id ? null : row.dataset.id;
    render();
  });
  const box = $(".edit", body);
  if (box) wire(box, items.find(r => r.id === editing));
}

function wire(box, r) {
  let every = r.every;
  $$("[data-every]", box).forEach(b => b.onclick = () => {
    every = Number(b.dataset.every);
    $$("[data-every]", box).forEach(x => x.classList.toggle("on", x === b));
  });
  $("[data-save]", box).onclick = () => {
    const ts = Math.round(new Date($("[data-f=ts]", box).value).getTime() / 1000);
    const text = $("[data-f=text]", box).value.trim();
    if (!text || !ts) return toast("Вкажи текст і час");
    editing = null;
    send("remedit:" + JSON.stringify({ id: r.id, text, ts, every }), done);
  };
  $("[data-del]", box).onclick = async () => {
    if (!await confirm("Видалити?\n" + r.text)) return;
    editing = null;
    send("delrem:" + r.id, done);
  };
}

function done(reply) {
  toast(reply.text.split("\n")[0]);
  request("rem-list");
}

on("reminders", data => {
  items = data;
  render();
});

export function openList() {
  if (!connected) return toast("Відкрий панель з кнопки бота");
  editing = null;
  if (!items.length) body.innerHTML = `<div class="card">${loading}</div>`;
  open("remlist");
  render();
  request("rem-list");
}
