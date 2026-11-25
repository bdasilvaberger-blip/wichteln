/* Wichteln 2026: Server Logik.
   Speicher: ein Schlüssel pro Figur (atomar mit onlyIfNew), ein Schlüssel pro Name, die Kette einmalig.
   Keine Liste wird gelesen und wieder geschrieben, damit sich gleichzeitige Anmeldungen nie überschreiben. */
import { randomBytes, randomInt, createHash, scryptSync, timingSafeEqual } from 'node:crypto';

export const MAX = 24;
export const DEADLINE = Date.parse('2026-12-01T12:00:00+01:00');
/* Verwaltung: nur der Hash des Schlüssels steht im Code, der Schlüssel selbst nirgends */
const ADMIN_HASH = 'f9bcb3c083ccfa56718f83d3786af8d224aaa1ff284859596faa11459b4e3dc1';
const NAME_MAX = 24, PIN_TRIES = 5, PIN_WINDOW = 60 * 60 * 1000, ADMIN_TRIES = 10;

const sha = s => createHash('sha256').update(s).digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const pinHash = (pin, salt) => scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');

/* Namen: Buchstaben, Ziffern, Leerzeichen, Punkt, Bindestrich, Apostroph; Länge 1 bis 24 */
export function cleanName(raw){
  if (typeof raw !== 'string') return null;
  const n = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!n || [...n].length > NAME_MAX) return null;
  if (!/^[\p{L}\p{M}0-9 .'’-]+$/u.test(n)) return null;
  return n;
}
const nameKey = n => 'name/' + sha(n.toLocaleLowerCase('de-CH'));

function json(body, status = 200){
  return new Response(JSON.stringify(body), { status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  } });
}
const fail = (msg, status) => json({ error: msg }, status);

async function readBody(req){
  if (!(req.headers.get('content-type') || '').includes('application/json')) return null;
  const len = Number(req.headers.get('content-length') || 0);
  if (len > 2048) return null;
  const t = await req.text();
  if (t.length > 2048) return null;
  try { const o = JSON.parse(t); return o && typeof o === 'object' ? o : null; } catch { return null; }
}

async function claims(store){
  const { blobs } = await store.list({ prefix: 'fig/' });
  const out = {};
  await Promise.all(blobs.map(async b => { const v = await store.get(b.key, { type: 'json' }); if (v) out[b.key.slice(4)] = v; }));
  return out;
}

/* Kette: einmal nach Anmeldeschluss gebildet und nie mehr verändert */
async function chain(store, now){
  if (now < DEADLINE) return null;
  const have = await store.get('chain', { type: 'json' });
  if (have) return have;
  const ids = Object.keys(await claims(store)).map(Number);
  if (ids.length < 2) return null;
  for (let k = ids.length - 1; k > 0; k--) { const j = randomInt(k + 1); [ids[k], ids[j]] = [ids[j], ids[k]]; }
  const map = {}; ids.forEach((g, k) => { map[g] = ids[(k + 1) % ids.length]; });
  await store.setJSON('chain', { map, at: now }, { onlyIfNew: true });
  return await store.get('chain', { type: 'json' });
}

async function recentFails(store, prefix, now){
  const { blobs } = await store.list({ prefix });
  let n = 0;
  for (const b of blobs) { const t = Number(b.key.slice(prefix.length).split('-')[0]); if (now - t < PIN_WINDOW) n++; else store.delete(b.key).catch(() => {}); }
  return n;
}
const noteFail = (store, prefix, now) => store.setJSON(prefix + now + '-' + randomBytes(4).toString('hex'), 1);

const figOf = v => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n < MAX ? n : null; };

/* Zugriff mit Figur und geheimem Schlüssel des Geräts */
async function auth(store, body){
  const fig = figOf(body.fig);
  if (fig === null || typeof body.token !== 'string' || body.token.length > 100) return null;
  const rec = await store.get('fig/' + fig, { type: 'json' });
  const h = sha(body.token), hs = rec ? (rec.tokens || [rec.tokenHash]) : [];
  if (!rec || !hs.some(x => same(x, h))) return null;
  return { fig, rec };
}

export function makeHandler({ getStore, env = () => undefined, now = () => Date.now() }){
  return async (req) => {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^.*\/api\//, '');
    const store = getStore(url.hostname);
    const t = now();
    try {
      if (req.method === 'GET' && route === 'state') {
        const c = await claims(store), ch = await chain(store, t);
        const names = {}; for (const k in c) names[k] = c[k].name;
        return json({ open: t < DEADLINE, deadline: DEADLINE, now: t, max: MAX, claims: names, drawn: !!ch });
      }
      if (req.method !== 'POST') return fail('Nicht gefunden.', 404);
      const body = await readBody(req);
      if (!body) return fail('Ungültige Anfrage.', 400);

      if (route === 'join') {
        if (t >= DEADLINE) return fail('Die Anmeldung ist geschlossen.', 403);
        const fig = figOf(body.fig), name = cleanName(body.name);
        if (fig === null) return fail('Diese Figur gibt es nicht.', 400);
        if (!name) return fail('Bitte nur Buchstaben, Zahlen und Leerzeichen, höchstens 24 Zeichen.', 400);
        const c = await claims(store);
        if (Object.keys(c).length >= MAX) return fail('Alle Plätze sind vergeben.', 409);
        const nk = nameKey(name);
        const n1 = await store.setJSON(nk, { fig, at: t }, { onlyIfNew: true });
        if (!n1.modified) return fail(`${name} ist schon auf dem Platz. Nimm zum Beispiel noch den ersten Buchstaben vom Nachnamen dazu.`, 409);
        const token = randomBytes(32).toString('base64url'), pin = String(randomInt(10000)).padStart(4, '0'), salt = randomBytes(16).toString('hex');
        const f1 = await store.setJSON('fig/' + fig, { name, tokens: [sha(token)], pinHash: pinHash(pin, salt), salt, at: t }, { onlyIfNew: true });
        if (!f1.modified) { await store.delete(nk); return fail('Diese Figur hat gerade jemand anderes genommen. Wähle eine andere.', 409); }
        return json({ fig, name, token, pin });
      }

      if (route === 'me') {
        const a = await auth(store, body);
        if (!a) return fail('Unbekannt.', 401);
        const out = { fig: a.fig, name: a.rec.name, open: t < DEADLINE };
        if (t >= DEADLINE) { const ch = await chain(store, t); const to = ch ? ch.map[a.fig] : undefined;
          if (to !== undefined) { const r = await store.get('fig/' + to, { type: 'json' }); out.target = to; out.targetName = r ? r.name : ''; } }
        return json(out);
      }

      if (route === 'recover') {
        const fig = figOf(body.fig), pin = typeof body.pin === 'string' && /^\d{4}$/.test(body.pin) ? body.pin : null;
        if (fig === null || !pin) return fail('Bitte gib deinen 4-stelligen Code ein.', 400);
        const fp = 'fail/' + fig + '/';
        if (await recentFails(store, fp, t) >= PIN_TRIES) return fail('Zu viele Versuche. Versuch es in einer Stunde nochmals.', 429);
        const e = await store.getWithMetadata('fig/' + fig, { type: 'json' });
        if (!e || !e.data || !same(e.data.pinHash, pinHash(pin, e.data.salt))) { await noteFail(store, fp, t); return fail('Der Code stimmt nicht.', 401); }
        const token = randomBytes(32).toString('base64url');
        /* neues Gerät dazu; die letzten vier Geräte bleiben angemeldet */
        const tokens = [...(e.data.tokens || [e.data.tokenHash]).filter(Boolean), sha(token)].slice(-4);
        const w = await store.setJSON('fig/' + fig, { ...e.data, tokens, tokenHash: undefined }, { onlyIfMatch: e.etag });
        if (!w.modified) return fail('Bitte versuch es gleich nochmals.', 409);
        return json({ fig, name: e.data.name, token });
      }

      if (route.startsWith('admin/')) {
        const keyHash = env('ADMIN_KEY') ? sha(env('ADMIN_KEY')) : ADMIN_HASH;
        if (await recentFails(store, 'afail/', t) >= ADMIN_TRIES) return fail('Gesperrt. Versuch es später.', 429);
        if (typeof body.key !== 'string' || body.key.length > 200 || !same(sha(body.key), keyHash)) { await noteFail(store, 'afail/', t); return fail('Falscher Schlüssel.', 401); }
        const c = await claims(store);
        if (route === 'admin/list') { const ch = await store.get('chain', { type: 'json' });
          return json({ open: t < DEADLINE, drawn: !!ch, people: Object.entries(c).map(([k, v]) => ({ fig: Number(k), name: v.name, at: v.at })).sort((a, b) => a.at - b.at) }); }
        if (route === 'admin/remove') {
          if (await store.get('chain', { type: 'json' })) return fail('Schon ausgelost, entfernen geht nicht mehr.', 409);
          const fig = figOf(body.fig); if (fig === null || !c[fig]) return fail('Nicht gefunden.', 404);
          await store.delete('fig/' + fig); await store.delete(nameKey(c[fig].name));
          return json({ ok: true });
        }
        if (route === 'admin/reset') {
          if (body.confirm !== 'ALLES LOESCHEN') return fail('Bestätigung fehlt.', 400);
          const { blobs } = await store.list(); await Promise.all(blobs.map(b => store.delete(b.key)));
          return json({ ok: true });
        }
      }
      return fail('Nicht gefunden.', 404);
    } catch (err) {
      console.error(err);
      return fail('Da ist etwas schiefgelaufen. Versuch es gleich nochmals.', 500);
    }
  };
}
