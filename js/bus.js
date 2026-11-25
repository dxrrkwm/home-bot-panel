// panel <-> bot: mqtt on a public broker (no daily limits, the broker keeps the last state),
// ntfy.sh when mqtt is not reachable. Everything is sealed with the key from the button url.
import { tg, haptic } from "./tg.js";
import { seal, unseal } from "./seal.js";

const params = new URLSearchParams(location.search);
export const topic = params.get("t");
const key = params.get("k");
export const connected = Boolean(topic && key);

const BROKER = "wss://broker.hivemq.com:8884/mqtt";
const MQTT_WAIT_MS = 6000;
const ANSWER_MS = 20000;
// bot answers that mean "did not work"; the panel shows them as an error toast
const FAILED = /не вийшло|не вдалось|помилка|недоступн|не відповідає|не в мережі/i;

const listeners = {};
const latest = {};   // last data of each kind, retained ones come right after connecting
const waiting = {};  // command id -> callback for the bot answer
let client = null;
let onError = () => {};
let opened;
// resolves when answers can be received, earlier ones would be lost
export const ready = new Promise(resolve => opened = resolve);

export function on(kind, fn) {
  listeners[kind] = fn;
}

// how to show failures, set once by main.js
export function onFailure(fn) {
  onError = fn;
}

export const failed = data => FAILED.test(data.text.split("\n")[0]);

const viaMqtt = () => client?.connected;

async function post(cmd, id = crypto.randomUUID()) {
  const body = await seal({ c: cmd, id, ts: Date.now() }, key);
  if (viaMqtt()) {
    client.publish(`hb/${topic}/cmd`, body, { qos: 1 });
    return id;
  }
  const r = await fetch(`https://ntfy.sh/${topic}`, { method: "POST", body });
  if (r.status === 429) throw new Error("MQTT недоступний, а запасний ntfy вичерпав денний ліміт");
  if (!r.ok) throw new Error(`запасний канал ntfy: ${r.status}`);
  return id;
}

// command: onAnswer gets the bot text answer for exactly this command
export async function send(cmd, onAnswer) {
  haptic();
  if (!topic) return tg.sendData(cmd);  // opened from an old button
  const id = crypto.randomUUID();
  waiting[id] = onAnswer || null;
  try {
    await post(cmd, id);
  } catch (e) {
    delete waiting[id];
    return onError({ text: `Немає зв'язку з ботом: ${e.message}` });
  }
  setTimeout(() => {
    if (!(id in waiting)) return;
    delete waiting[id];
    onError({ text: `Бот не відповідає (${viaMqtt() ? "MQTT" : "ntfy"}) — можливо, ноут спить або без інтернету` });
  }, ANSWER_MS);
}

// data request: the answer comes to the on(kind) listener, not to send() callbacks
export async function request(cmd) {
  if (connected) await post(cmd).catch(e => onError({ text: `Немає зв'язку з ботом: ${e.message}` }));
}

// last known data of a kind: from the broker memory, or from the ntfy cache
export async function last(kind, since = "12h") {
  await ready;
  if (viaMqtt()) {
    if (!(kind in latest)) await new Promise(r => setTimeout(r, 1200));
    return latest[kind] ?? null;
  }
  const r = await fetch(`https://ntfy.sh/${topic}d/json?poll=1&since=${since}`);
  const lines = (await r.text()).trim().split("\n").filter(Boolean).map(JSON.parse);
  const m = lines.filter(e => e.title === kind).pop();
  return m ? unseal(m.message, key) : null;
}

async function deliver(kind, text) {
  if (!text) return;  // an empty retained message just clears the topic
  const data = await unseal(text, key).catch(() => null);
  if (!data) return;
  if (kind !== "reply") {
    latest[kind] = data;
    return listeners[kind]?.(data);
  }
  if (failed(data)) onError(data);
  if (data.re in waiting) {
    const fn = waiting[data.re];
    delete waiting[data.re];
    fn?.(data);
  }
}

function listenNtfy() {
  const es = new EventSource(`https://ntfy.sh/${topic}d/sse`);
  es.onopen = () => opened();
  es.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.event === "message") deliver(m.title, m.message);
  };
}

export function listen() {
  if (!connected) return;
  if (!window.mqtt) return listenNtfy();
  const fallback = setTimeout(() => !client.connected && listenNtfy(), MQTT_WAIT_MS);
  client = window.mqtt.connect(BROKER, { clientId: "panel-" + crypto.randomUUID().slice(0, 8), reconnectPeriod: 3000 });
  client.on("connect", () => {
    clearTimeout(fallback);
    client.subscribe(`hb/${topic}/d/#`, { qos: 1 }, () => opened());
  });
  client.on("message", (t, payload) => deliver(t.split("/").pop(), payload.toString()));
}
