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

export async function unseal(text, key) {
  const k = await crypto.subtle.importKey("raw", bytes(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = async data => new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
  const raw = bytes(text);
  const nonce = raw.slice(0, 16), body = raw.slice(16, -16), tag = raw.slice(-16);

  const want = (await mac(join([109], nonce, body))).slice(0, 16);
  if (want.some((b, i) => b !== tag[i])) throw new Error("bad tag");

  const out = new Uint8Array(body.length);
  for (let i = 0; i * 32 < body.length; i++) {
    const block = await mac(join([101], nonce, new Uint8Array([i >>> 24, i >>> 16, i >>> 8, i].map(x => x & 255))));
    for (let j = 0; j < 32 && i * 32 + j < body.length; j++) out[i * 32 + j] = body[i * 32 + j] ^ block[j];
  }
  const stream = new Blob([out]).stream().pipeThrough(new DecompressionStream("deflate"));
  return JSON.parse(await new Response(stream).text());
}
