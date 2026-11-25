// bot encrypts data with hmac-sha256 keystream + 16 byte tag, payload is zlib json

const bytes = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

function join(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function macOf(key) {
  const k = await crypto.subtle.importKey("raw", bytes(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return async data => new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

async function xor(mac, nonce, data) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i * 32 < data.length; i++) {
    const block = await mac(join([101], nonce, new Uint8Array([i >>> 24, i >>> 16, i >>> 8, i].map(x => x & 255))));
    for (let j = 0; j < 32 && i * 32 + j < data.length; j++) out[i * 32 + j] = data[i * 32 + j] ^ block[j];
  }
  return out;
}

const pipe = async (data, stream) => new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer());

export async function unseal(text, key) {
  const mac = await macOf(key);
  const raw = bytes(text);
  const nonce = raw.slice(0, 16), body = raw.slice(16, -16), tag = raw.slice(-16);
  const want = (await mac(join([109], nonce, body))).slice(0, 16);
  if (want.some((b, i) => b !== tag[i])) throw new Error("bad tag");
  const data = await pipe(await xor(mac, nonce, body), new DecompressionStream("deflate"));
  return JSON.parse(new TextDecoder().decode(data));
}

// the same format the other way: commands are sealed too, so only someone with the key can send them
export async function seal(obj, key) {
  const mac = await macOf(key);
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const data = await pipe(new TextEncoder().encode(JSON.stringify(obj)), new CompressionStream("deflate"));
  const body = await xor(mac, nonce, data);
  const tag = (await mac(join([109], nonce, body))).slice(0, 16);
  return btoa(String.fromCharCode(...join(nonce, body, tag)));
}
