// panel <-> bot through ntfy: commands go to <topic>, encrypted answers come back from <topic>d
import { tg, haptic } from "./tg.js";
import { unseal } from "./seal.js";

const params = new URLSearchParams(location.search);
export const topic = params.get("t");
const key = params.get("k");
export const connected = Boolean(topic && key);

const listeners = {};
let waiting = null;
let opened;
// resolves when the answer stream is connected, earlier answers would be lost
export const ready = new Promise(resolve => opened = resolve);

export function on(kind, fn) {
  listeners[kind] = fn;
}

export async function send(cmd, onAnswer) {
  haptic();
  if (!topic) return tg.sendData(cmd);  // opened from an old button
  waiting = onAnswer || null;
  await fetch(`https://ntfy.sh/${topic}`, { method: "POST", body: cmd });
}

// data request: the answer comes to the on(kind) listener, not to send() callbacks
export async function request(cmd) {
  if (connected) await fetch(`https://ntfy.sh/${topic}`, { method: "POST", body: cmd });
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
    if (m.title === "reply" && waiting) {
      const fn = waiting;
      waiting = null;
      return fn(data);
    }
    listeners[m.title]?.(data);
  };
}
