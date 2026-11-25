import { tg } from "./tg.js";
import { icon } from "./icons.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const money = n => Math.round(n).toLocaleString("uk-UA").replace(/,/g, " ");
export const loading = '<span class="spin">⟳</span> завантажую…';

export function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

export function card(title, body, extra = "") {
  return `<div class="card" ${extra}><div class="title">${title}</div>${body}</div>`;
}

// home card head: colored icon, title, one line of state, something on the right (chevron or a switch)
export function head(ico, title, sub = "", right = icon("chevron", 18), tone = "blue") {
  return `<div class="head-row"><span class="ico ${tone}">${icon(ico)}</span>
    <div class="grow"><div class="h-title">${title}</div><div class="h-sub" data-sub>${sub}</div></div>
    <div class="h-right">${right}</div></div>`;
}

// screens: home is always at the bottom of the stack, each entry keeps its scroll position
const stack = [{ id: "home", y: 0 }];

export function screen(id, title, { refresh } = {}) {
  document.body.insertAdjacentHTML("beforeend", `<section class="screen" id="${id}" hidden>
    <div class="screen-head"><button class="icon-btn back" aria-label="Назад">${icon("back")}</button>
      <div class="grow"><div class="h-title" data-title>${title}</div><div class="h-sub" data-note></div></div>
      ${refresh ? `<button class="icon-btn" data-refresh aria-label="Оновити">${icon("refresh", 18)}</button>` : ""}</div>
    <div data-body></div></section>`);
  const el = $("#" + id);
  if (refresh) $("[data-refresh]", el).onclick = () => { busy(el, true); refresh(); };
  return el;
}

// refresh button spins until the data comes
export function busy(el, on) {
  $("[data-refresh]", el)?.classList.toggle("spinning", on);
}

const top = () => stack[stack.length - 1];

export function isOpen(id) {
  return top().id === id;
}

export function open(id) {
  if (isOpen(id)) return;
  top().y = window.scrollY;  // come back to the same place
  stack.push({ id, y: 0 });
  show();
}

export function back() {
  if (stack.length > 1) stack.pop();
  show();
}

function show() {
  const { id, y } = top();
  $$(".screen").forEach(s => s.hidden = s.id !== id);
  stack.length > 1 ? tg.BackButton.show() : tg.BackButton.hide();
  window.scrollTo(0, y);
}

tg.BackButton.onClick(back);
document.addEventListener("click", e => e.target.closest(".back") && back());
