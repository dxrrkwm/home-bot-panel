import { request, on, last, ready, connected } from "../bus.js";
import { $, $$, esc, money, loading, screen, open, isOpen, toast, busy, head } from "../ui.js";

// manual refresh also pulls a fresh monobank statement
const fin = screen("finance", "Фінанси", { refresh: () => request("fin-panel:force") });
const detail = screen("detail", "");

export async function openFinance() {
  if (!connected) return toast("Відкрий панель з кнопки бота");
  open("finance");
  if (!$("[data-body]", fin).innerHTML) $("[data-body]", fin).innerHTML = `<div class="card">${loading}</div>`;
  const cached = await last("fin").catch(() => null);
  if (cached) render(cached);
  request("fin-panel");
}

on("fin", data => {
  renderCard(data);
  if (isOpen("finance")) render(data);
});

// home card: today against the daily budget
function renderCard(d) {
  const spent = d.days[d.days.length - 1][1], over = spent > d.budget;
  $("[data-sub]", $("#finCard")).textContent = d.allow
    ? `сьогодні ${money(spent)} з ${money(d.budget)} · до ЗП ${d.allow.days} дн`
    : `сьогодні ${money(spent)} з ${d.budget} грн · місяць ${money(d.mspent)}`;
  $("#finBar").innerHTML = `<i class="${over ? "bad" : "good"}" style="width:${Math.min(100, 100 * spent / d.budget)}%"></i>`;
}

export function mount(home) {
  home.insertAdjacentHTML("beforeend", `<div class="card tap" id="finCard">
    ${head("wallet", "Фінанси", "…", undefined, "green")}<div class="bar" id="finBar"></div></div>`);
  $("#finCard").onclick = openFinance;
  // only the cached summary here: asking the bot would start a bank sync on every panel open
  ready.then(async () => {
    const cached = await last("fin", "48h").catch(() => null);
    if (cached) renderCard(cached);
  });
}
on("detail", data => isOpen("detail") && renderDetail(data));

function openDetail(id, title) {
  $("[data-title]", detail).textContent = title;
  $("[data-note]", detail).textContent = "";
  $("[data-body]", detail).innerHTML = `<div class="card">${loading}</div>`;
  open("detail");
  request("fin-detail:" + id);
}

function renderDetail(d) {
  $("[data-note]", detail).textContent = `${d.count} шт · ${money(Math.abs(d.total))} грн`;
  const rows = d.items.map(([when, what, amount]) => `<div class="row"><div><div>${esc(what)}</div><div class="muted">${when}</div></div>
    <b class="${amount > 0 ? "plus" : ""}">${amount > 0 ? "+" : ""}${money(amount)}</b></div>`).join("");
  const more = d.count > d.items.length ? `<div class="muted gap">і ще ${d.count - d.items.length}…</div>` : "";
  $("[data-body]", detail).innerHTML = `<div class="card">${rows || '<div class="muted">Нічого немає</div>'}${more}</div>`;
}

function chart(days, budget) {
  const w = 320, h = 120, bw = w / days.length;
  const max = Math.max(budget * 1.2, ...days.map(d => d[1]));
  const y = v => h - 14 - (v / max) * (h - 24);
  const bars = days.map(([day, v], i) =>
    `<rect x="${i * bw + 3}" y="${y(v)}" width="${bw - 6}" height="${h - 14 - y(v)}" rx="3" class="${v > budget ? "over" : "ok"}"/>` +
    (i % 2 === days.length % 2 ? `<text x="${i * bw + bw / 2}" y="${h - 2}" text-anchor="middle">${day.slice(0, 2)}</text>` : "")).join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%">${bars}
    <line x1="0" x2="${w}" y1="${y(budget)}" y2="${y(budget)}" stroke="#8b8fa3" stroke-dasharray="4 4"/>
    <text x="${w - 2}" y="${y(budget) - 3}" text-anchor="end">${budget}</text></svg>`;
}

function cards(d) {
  return d.cards.map(c => c.lim
    ? `<div class="card"><div class="muted">⚫ ${esc(c.n)} · борг</div><div class="big">${money(c.debt)}</div>
       <div class="bar"><i class="bad" style="width:${100 * c.debt / c.lim}%"></i></div><div class="muted">з ${money(c.lim)}</div></div>`
    : `<div class="card"><div class="muted">⚪ ${esc(c.n)}</div><div class="big">${money(c.bal)}</div><div class="muted">грн</div></div>`).join("");
}

// today against what is left till the salary: the white card minus the bills before payday and the goals, per day
function today(d) {
  const spent = d.days[d.days.length - 1][1], left = d.budget - spent, a = d.allow;
  const till = a ? `<div class="allow gap">
      <div class="line"><span class="muted">до зарплати ${esc(a.payday)} · ${a.days} дн</span>
        <span class="push">вільних <b class="${a.free < 0 ? "minus" : ""}">${money(a.free)}</b></span></div>
      ${a.reserve.map(r => `<div class="line muted"><span>− ${esc(r.n)}</span><span class="push">${money(r.sum)} · ${esc(r.when)}</span></div>`).join("")}
      ${a.free < 0 ? `<div class="goal-need late">на обов'язкове не вистачає ${money(-a.free)} грн</div>` : ""}</div>` : "";
  return `<div class="card"><div class="line"><span>${a ? "Сьогодні можна" : "Сьогодні"}</span>
      <span class="muted" style="margin-left:auto">${left >= 0 ? "ще можна " + money(left) : "понад на " + money(-left)}</span></div>
    <div class="big">${money(spent)} <span class="muted">/ ${money(d.budget)} грн</span></div>
    <div class="bar"><i class="${left < 0 ? "bad" : "good"}" style="width:${Math.min(100, 100 * spent / Math.max(1, d.budget))}%"></i></div>${till}</div>`;
}

function month(d) {
  const top = d.cats.length ? d.cats[0][1] : 1;
  const cats = d.cats.map(([name, v]) => `<div class="cat" data-detail="cat:${esc(name)}" data-name="${esc(name)}">
    <span>${esc(name)}</span><div class="bar"><i style="width:${100 * v / top}%"></i></div><span>${money(v)}</span><span class="arrow">›</span></div>`).join("");
  return `<div class="card"><div>Цей місяць</div>
    <div class="pair gap"><div><div class="muted">витрати</div><div class="big">${money(d.mspent)}</div></div>
    <div><div class="muted">надходження</div><div class="big plus">${money(d.mincome)}</div></div></div>${cats}</div>`;
}

function items(list, amountClass) {
  return list.map(t => `<div class="item" ${t.id ? `data-detail="${esc(t.id)}" data-name="${esc(t.t)}"` : ""}>
      <div class="line"><b>${esc(t.t)}</b>${t.v != null ? `<span class="${amountClass}" style="margin-left:auto">${money(t.v)} грн</span>` : ""}
      ${t.id ? '<span class="arrow">›</span>' : ""}</div>
      <div class="muted">${esc(t.d)}</div>
      ${t.save ? `<div class="plus muted">≈ −${money(t.save)} грн/міс</div>` : ""}</div>`).join("");
}

function goods(list) {
  if (!list.length) return "";
  return `<div class="card"><div class="line"><span>✅ Що добре — тримай так</span><span class="muted" style="margin-left:auto">30 днів</span></div>
    ${items(list, "plus")}</div>`;
}

function tips(list) {
  if (!list.length) return "";
  const save = list.reduce((n, t) => n + t.save, 0);
  return `<div class="card"><div class="line"><span>💡 Зайве і як краще</span><span class="muted" style="margin-left:auto">30 днів</span></div>
    ${save ? `<div class="save">Можна зберегти <b class="plus">≈ ${money(save)} грн/міс</b> — це ${money(save * 12)} на рік</div>` : ""}
    ${items(list, "muted")}</div>`;
}

// goals: jars with a goal and the black card debt, with the pace of the last 30 days and when it gets there
function goals(d) {
  if (!d.goals?.length) return jars(d);
  const row = g => {
    const debt = g.kind === "debt";
    const done = debt ? 1 - g.bal / g.goal : g.bal / g.goal;
    const pace = g.month == null ? "темп з'явиться за кілька днів"
      : debt ? (g.month > 0 ? `−${money(g.month)} за місяць` : g.month < 0 ? `+${money(-g.month)} боргу за місяць` : "за місяць без змін")
      : g.month > 0 ? `+${money(g.month)} за 30 днів` : "за 30 днів нічого";
    const when = g.bal === 0 && debt ? "закрито 🎉"
      : g.eta ? `у такому темпі — ${esc(g.eta)}` : g.month > 0 ? "" : "поки без прогнозу";
    const need = g.deadline ? `<div class="goal-need ${g.late ? "late" : "ok"}">до ${esc(g.deadline)} треба ≈ ${money(g.need)}/міс${g.late ? ` · зараз ${money(Math.max(g.month, 0))}` : " · встигаєш"}</div>` : "";
    return `<div class="goal">
      <div class="line"><span>${debt ? "⚫ " : "🎯 "}${esc(g.n)}</span>
        <span class="push">${debt ? `борг <b>${money(g.bal)}</b>` : `<b>${money(g.bal)}</b> <span class="muted">/ ${money(g.goal)}</span>`}</span></div>
      <div class="bar"><i class="${debt ? (done > 0.5 ? "good" : "bad") : "good"}" style="width:${Math.max(2, 100 * done)}%"></i></div>
      <div class="muted">${pace}${when ? " · " + when : ""}</div>${need}</div>`;
  };
  return `<div class="card"><div class="line"><span>Цілі</span><span class="muted push">${Math.round(100 * d.goals.filter(g => g.kind === "jar").reduce((n, g) => n + g.bal, 0) / Math.max(1, d.goals.filter(g => g.kind === "jar").reduce((n, g) => n + g.goal, 0)))}% зібрано</span></div>
    ${d.goals.map(row).join("")}</div>`;
}

function jars(d) {
  if (!d.jars.length) return "";
  return `<div class="card"><div>Банки</div>${d.jars.map(j => `<div class="gap">
    <div class="line"><span>🫙 ${esc(j.n)}</span><span class="muted" style="margin-left:auto">${money(j.bal)}${j.goal ? " / " + money(j.goal) : ""}</span></div>
    ${j.goal ? `<div class="bar"><i style="width:${Math.min(100, 100 * j.bal / j.goal)}%"></i></div>` : ""}</div>`).join("")}</div>`;
}

function operations(d) {
  return `<div class="card"><div>Останні операції</div>${d.tx.map(([when, what, a]) =>
    `<div class="row"><div><div>${esc(what)}</div><div class="muted">${when}</div></div>
     <b class="${a > 0 ? "plus" : ""}">${a > 0 ? "+" : ""}${money(a)}</b></div>`).join("")}</div>`;
}

// salary from the shift schedule: hours of the month at the rates, extra hours and KPI on top
function salary(d) {
  if (!d.salary?.length) return "";
  const rows = d.salary.map(s => `<div class="gap"><div class="line"><span>${esc(s.month)}</span>
      <span class="push big plus">${money(s.total)}</span></div>
    <div class="muted">${s.hours} год${s.extra_hours ? `, з них доп. ${s.extra_hours}` : ""} · основні ${money(s.base)}${s.extra ? ` + доп ${money(s.extra)}` : ""} + KPI ${money(s.kpi)} · прийде ~${s.paid}</div></div>`).join("");
  return `<div class="card"><div class="line"><span>Зарплата за графіком</span><span class="muted push">орієнтовно</span></div>${rows}</div>`;
}

function render(d) {
  busy(fin, Boolean(d.syncing));
  $("[data-note]", fin).textContent = d.syncing ? "оновлюю виписку…" : "оновлено " + d.upd;
  const body = $("[data-body]", fin);
  body.innerHTML = `<div class="pair">${cards(d)}</div>${today(d)}${goals(d)}
    <div class="card"><div class="line"><span>14 днів</span><span class="muted" style="margin-left:auto">в середньому ${money(d.avg7)}/день</span></div>${chart(d.days, d.budget)}</div>
    ${month(d)}${salary(d)}${goods(d.goods || [])}${tips(d.tips || [])}${operations(d)}`;
  $$("[data-detail]", body).forEach(el => el.onclick = () => openDetail(el.dataset.detail, el.dataset.name));
}
