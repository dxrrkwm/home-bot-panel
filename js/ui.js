import { tg } from "./tg.js";

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

// screens: home is always at the bottom of the stack, each entry keeps its scroll position
const stack = [{ id: "home", y: 0 }];

export function screen(id, title) {
  document.body.insertAdjacentHTML("beforeend", `<section class="screen" id="${id}" hidden>
    <div class="title head"><button class="back">←</button> <span data-title>${title}</span> <small data-note></small></div>
    <div data-body></div></section>`);
  return $("#" + id);
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
