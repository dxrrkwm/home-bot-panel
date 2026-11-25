// panel <-> bot through ntfy: commands go to <topic>, encrypted answers come back from <topic>d
import { tg, haptic } from "./tg.js";
import { unseal } from "./seal.js";

const params = new URLSearchParams(location.search);
export const topic = params.get("t");
const key = params.get("k");
export const connected = Boolean(topic && key);

const ANSWER_MS = 20000;
// bot answers that mean "did not work"; the panel shows them as an error toast
const FAILED = /не вийшло|не вдалось|помилка|недоступн|не відповідає|не в мережі/i;

const listeners = {};
const waiting = {};  // ntfy message id -> callback for the bot answer
const early = {};    // answers that came before we knew the id of our message
let onError = () => {};
let opened;
// resolves when the answer stream is connected, earlier answers would be lost
export const ready = new Promise(resolve => opened = resolve);

export function on(kind, fn) {
  listeners[kind] = fn;
}

// how to show failures, set once by main.js
export function onFailure(fn) {
  onError = fn;
}

export const failed = data => FAILED.test(data.text.split("\n")[0]);

async function post(cmd) {
  const r = await fetch(`https://ntfy.sh/${topic}`, { method: "POST", body: cmd });
  return (await r.json()).id;
}

// command: onAnswer gets the bot text answer for exactly this command
export async function send(cmd, onAnswer) {
  haptic();
  if (!topic) return tg.sendData(cmd);  // opened from an old button
  let id;
  try {
    id = await post(cmd);
  } catch {
    return onError({ text: "Немає зв'язку з ботом" });
  }
  if (early[id]) return deliver(early[id], onAnswer);
  waiting[id] = onAnswer || null;
  setTimeout(() => {
    if (!(id in waiting)) return;
    delete waiting[id];
    onError({ text: "Бот не відповідає — можливо, ноут спить або без інтернету" });
  }, ANSWER_MS);
}

function deliver(data, fn) {
  if (failed(data)) onError(data);
  fn?.(data);
}

// data request: the answer comes to the on(kind) listener, not to send() callbacks
export async function request(cmd) {
  if (connected) await post(cmd).catch(() => onError({ text: "Немає зв'язку з ботом" }));
}

export async function last(kind, since = "12h") {
  const r = await fetch(`https://ntfy.sh/${topic}d/json?poll=1&since=${since}`);
  const lines = (await r.text()).trim().split("\n").filter(Boolean).map(JSON.parse);
  const m = lines.filter(e => e.title === kind).pop();
  return m ? unseal(m.message, key) : null;
}

export function listen() {
  if (!connected) return;
  const es = new EventSource(`https://ntfy.sh/${topic}d/sse`);
  es.onopen = () => opened();
  es.onmessage = async e => {
    const m = JSON.parse(e.data);
    if (m.event !== "message") return;
    const data = await unseal(m.message, key).catch(() => null);
    if (!data) return;
    if (m.title === "reply") {
      if (data.re in waiting) {
        const fn = waiting[data.re];
        delete waiting[data.re];
        return deliver(data, fn);
      }
      if (data.re) early[data.re] = data;
      else deliver(data, null);  // answer to a command from somewhere else
      return;
    }
    listeners[m.title]?.(data);
  };
}
