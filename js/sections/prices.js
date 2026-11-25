import { request, on, last, ready, connected } from "../bus.js";
import { icon } from "../icons.js";
import { tg } from "../tg.js";
import { $, $$, esc, loading, screen, open, isOpen, toast, busy, head } from "../ui.js";

// energy drinks 0.5 and bars at silpo and novus, cheapest first; green price = at or below the target
const scr = screen("prices", "Перекус", { refresh: () => request("prices-panel:force") });
const uah = n => n.toFixed(2).replace(".", ",");

async function openPrices() {
  if (!connected) return toast("Відкрий панель з кнопки бота");
  open("prices");
  if (!$("[data-body]", scr).innerHTML) $("[data-body]", scr).innerHTML = `<div class="card">${loading}</div>`;
  const cached = await last("prices", "48h").catch(() => null);
  if (cached) render(cached);
  request("prices-panel");
}

on("prices", data => {
  renderCard(data);
  if (isOpen("prices")) render(data);
});

const value = (g, i) => g.per === "шт" ? `${uah(i.v)} ₴` : `${Math.round(i.v)} ₴/100г`;

// home card: the cheapest of each group and how many are at the target now
function renderCard(d) {
  const deals = d.groups.reduce((n, g) => n + g.items.filter(i => i.deal).length, 0);
  const best = d.groups.filter(g => g.items.length).map(g => `${g.key === "drinks" ? "банка" : "батончик"} ${value(g, g.items[0])}`);
  $("[data-sub]", $("#pricesCard")).textContent = best.join(" · ") || "нічого не знайшов";
  $("#pricesDeals").textContent = deals ? `${deals} за ціллю` : "";
}

export function mount(home) {
  home.insertAdjacentHTML("beforeend", `<div class="card tap" id="pricesCard">
    ${head("cart", "Перекус", "…", `<span class="deals" id="pricesDeals"></span>${icon("chevron", 18)}`, "amber")}</div>`);
  $("#pricesCard").onclick = openPrices;
  ready.then(async () => {
    const cached = await last("prices", "48h").catch(() => null);
    if (cached) renderCard(cached);
  });
}

function item(g, i, pack) {
  const old = i.old ? `<s class="muted">${uah(i.old)}</s> <span class="cut">−${Math.round(100 - 100 * i.p / i.old)}%</span>` : "";
  const bulk = i.bulk ? `<div class="muted">від ${i.bulk[0]} шт — ${uah(i.bulk[1])} ₴</div>` : "";
  const per = g.per === "шт" ? "" : ` · ${Math.round(i.v)} ₴/100г`;
  return `<div class="good-item" data-url="${esc(i.url)}">
    ${i.img ? `<img src="${esc(i.img)}" alt="" loading="lazy">` : '<div class="noimg"></div>'}
    <div class="grow"><div class="name">${esc(i.t)} <span class="muted">${esc(i.size)}</span></div>
      <div class="muted">${esc(i.shop)}${per} · ${pack} шт ≈ ${Math.round(i.one * pack)} ₴</div>${bulk}</div>
    <div class="price"><b class="${i.deal ? "deal" : ""}">${uah(i.p)}</b>${old}</div></div>`;
}

function render(d) {
  busy(scr, Boolean(d.checking));
  $("[data-note]", scr).textContent = d.checking ? "перевіряю ціни…" : `Сільпо, Novus · ${d.upd}`;
  const body = $("[data-body]", scr);
  body.innerHTML = d.groups.map(g => `<div class="card">
    <div class="line"><span>${esc(g.name)}</span><span class="muted push">ціль ≤ ${g.target} ₴${g.per === "шт" ? "" : "/100г"}</span></div>
    ${g.items.map(i => item(g, i, d.pack)).join("") || '<div class="muted gap">Нічого не знайшов</div>'}</div>`).join("")
    + `<div class="muted center">Ціль міняється в чаті: «ціль енергетик 33», «ціль батончик 55»</div>`;
  $$("[data-url]", body).forEach(el => el.onclick = () => tg.openLink(el.dataset.url));
}
