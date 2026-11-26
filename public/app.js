{
const $ = id => document.getElementById(id);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PINK = '#ff4fa8', INK = '#000';
const N = 24, FREE = 10;
/* Anmeldung offen bis 1. Dezember, 12 Uhr (Zürich). Zum Testen: ?phase=los oder ?phase=offen */
let DEADLINE = new Date('2026-12-01T12:00:00+01:00').getTime(), SKEW = 0, SKEWN = 0, SKEWRT = 1e9;
const srvNow = () => Date.now() + SKEW;
const isOpen = () => srvNow() < DEADLINE;

/* Zustand kommt vom Server. Auf dem Gerät liegt nur: welche Figur, ein geheimer Schlüssel und der Code */
let S = { claims: {}, me: null, draws: {} };
const IDK = 'wichteln26-id';
let ID = null; try { ID = JSON.parse(localStorage.getItem(IDK)); } catch (e) {}
if (!ID || typeof ID.token !== 'string' || !Number.isInteger(ID.fig)) ID = null;
const saveId = () => { try { ID ? localStorage.setItem(IDK, JSON.stringify(ID)) : localStorage.removeItem(IDK); } catch (e) {} };
async function api(path, body){
  const r = await fetch('/wichteln26/api/' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' } : { cache: 'no-store' });
  let d = null; try { d = await r.json(); } catch (e) {}
  if (!r.ok) { const err = new Error((d && d.error) || 'No connection. Please try again in a moment.'); err.status = r.status; throw err; }
  return d;
}
const NET = 'No connection. Please try again in a moment.';
async function refresh(){
  const t0 = Date.now(), d = await api('state'), t1 = Date.now();
  /* Serverzeit mit halber Laufzeit: so laufen die Aktionen auf allen Geräten im selben Takt */
  const sk = d.now - (t0 + t1) / 2;
  if (!SKEWN || t1 - t0 < SKEWRT || Math.abs(sk - SKEW) > 2000) { SKEW = sk; SKEWRT = t1 - t0; } else SKEW += (sk - SKEW) * .2;
  SKEWN++; DEADLINE = d.deadline;
  const c = {}; for (const k in d.claims) c[Number(k)] = d.claims[k];
  S.claims = c;
  if (ID && S.me == null) {
    try { const m = await api('me', ID); S.me = m.fig; } catch (e) { if (e.status === 401) { ID = null; saveId(); } }
  }
  if (S.me != null && S.claims[S.me] == null) { S.me = null; ID = null; saveId(); }
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Aussehen: Oberteil, Hose, Frisur, Statur */
const LOOKS = Array.from({length:N}, (_,i) => ({
  shirt: [1,0,1,1,0,1,0,1,1,0,1,0,1,0][i % 14], pants: [0,1,0,0,1,0,0,0,0,1,0,1,0,1][(i * 3) % 14],
  hair: [0,1,2,0,3,1,4,0,2,1,0,3,4,1][(i * 5) % 14], build: [1,0,.5,1,0,.6,0,.3,1,0,.8,0,.4,1][(i * 9) % 14], h: [1,.95,.97,1.03,.94,1.02,.96,1,1.04,.95,1,.97,.93,1.01][(i * 11) % 14]
}));
/* welche Figuren auf dem Platz sind: alle Angemeldeten, und solange offen 6 freie dazu */
function wantedFigs(){
  const claimed = Object.keys(S.claims).map(Number);
  if (!isOpen()) return claimed;
  const free = []; for (let i = 0; i < N && free.length < FREE && claimed.length + free.length < N; i++) if (S.claims[i] == null) free.push(i);
  return claimed.concat(free).sort((a, b) => a - b);
}
const fig = i => Fs.find(F => F.i === i);

/* ---------- Projektion: Blick schräg von oben, orthografisch wie eine Zeichnung ---------- */
const EL = 42 * Math.PI / 180, C = Math.sin(EL), HZ = Math.cos(EL);
/* Weltpunkt relativ zur Figur: dx, dv (Bodentiefe), z (Höhe) -> Bildschirm */
const sy = (G, dv, z) => G + dv * C - z * HZ;
const depth = (dv, z) => dv * HZ + z * C;

/* ---------- Mathe ---------- */
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (k, a, b) => cl((k - a) / ((b - a) || 1));
const ez = t => t * t * (3 - 2 * t);
const v3 = (x, y, z) => ({x, y, z});
const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z), sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, s) => v3(a.x * s, a.y * s, a.z * s), dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const len = a => Math.hypot(a.x, a.y, a.z), nrm = a => { const l = len(a) || 1; return mul(a, 1 / l); };
/* Zwei Knochen IK: Gelenk biegt Richtung bend */
function ik(a, c, l1, l2, bend){
  let d = sub(c, a), dl = len(d);
  const mx = (l1 + l2) * .999;
  if (dl > mx) { d = mul(d, mx / dl); c = add(a, d); dl = mx; }
  const u = mul(d, 1 / (dl || 1));
  let f = sub(bend, mul(u, dot(bend, u)));
  f = len(f) < 1e-4 ? v3(0, 0, 1) : nrm(f);
  const x = (l1 * l1 - l2 * l2 + dl * dl) / (2 * (dl || 1)), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  return { j: add(add(a, mul(u, x)), mul(f, h)), end: c };
}
/* Catmull Rom über Keyframes mit Zeiten */
function spline(keys, k, get){
  let i = 0; while (i < keys.length - 2 && k > keys[i + 1].t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const t = cl((k - k1.t) / (k2.t - k1.t || 1));
  const p0 = get(k0), p1 = get(k1), p2 = get(k2), p3 = get(k3);
  const m1 = (p2 - p0) * .5 * (k2.t - k1.t) / ((k2.t - k0.t) || 1) * 2, m2 = (p3 - p1) * .5 * (k2.t - k1.t) / ((k3.t - k1.t) || 1) * 2;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
}

/* ---------- Canvas ---------- */
const GLYPHS = {"i":{"w":17.6,"h":101.4,"c":[["M",-8.8,-42.6],["L",-8.8,-42.6],["Q",-8.8,-39.0,-6.2,-36.7],["Q",-3.6,-34.4,0,-34.4],["L",0,-34.4],["Q",3.7,-34.4,6.3,-36.7],["Q",8.8,-39.0,8.8,-42.6],["L",8.8,-42.6],["Q",8.8,-46.2,6.3,-48.4],["Q",3.7,-50.7,0,-50.7],["L",0,-50.7],["Q",-3.6,-50.7,-6.2,-48.4],["Q",-8.8,-46.2,-8.8,-42.6],["M",7.3,4.7],["L",-7.3,4.7],["L",-7.3,50.7],["L",7.3,50.7],["L",7.3,4.7]]},"0":{"w":58.2,"h":72.6,"c":[["M",-12.8,0],["L",-12.8,0],["Q",-12.8,-4.9,-11.9,-9],["Q",-11,-13,-9.3,-15.8],["Q",-7.6,-18.7,-5.2,-20.2],["Q",-2.9,-21.8,0,-21.8],["L",0,-21.8],["Q",2.9,-21.8,5.3,-20.2],["Q",7.6,-18.7,9.3,-15.8],["Q",11,-13,11.9,-9],["Q",12.8,-4.9,12.8,0],["L",12.8,0],["Q",12.8,4.9,11.9,9],["Q",11,13,9.3,15.8],["Q",7.6,18.7,5.3,20.3],["Q",2.9,21.8,0,21.8],["L",0,21.8],["Q",-2.9,21.8,-5.2,20.3],["Q",-7.6,18.7,-9.3,15.8],["Q",-11,13,-11.9,9],["Q",-12.8,4.9,-12.8,0],["M",-29.1,0],["L",-29.1,0],["Q",-29.1,11.4,-25.5,19.5],["Q",-21.8,27.6,-15.2,32],["Q",-8.6,36.3,0,36.3],["L",0,36.3],["Q",9,36.3,15.5,32],["Q",22,27.6,25.6,19.5],["Q",29.1,11.4,29.1,0],["L",29.1,0],["Q",29.1,-11.4,25.6,-19.5],["Q",22,-27.6,15.5,-31.9],["Q",9,-36.3,0,-36.3],["L",0,-36.3],["Q",-8.6,-36.3,-15.2,-31.9],["Q",-21.8,-27.6,-25.5,-19.5],["Q",-29.1,-11.4,-29.1,0]]},"2":{"w":59.3,"h":71.4,"c":[["M",1.6,3.4],["L",-29.6,35.7],["L",29.7,35.7],["L",29.7,20.2],["L",1.7,20.2],["L",18,5.6],["Q",22.5,1.7,25.3,-3],["Q",28.1,-7.8,28.1,-13.5],["L",28.1,-13.5],["Q",28.1,-17.5,26.4,-21.4],["Q",24.7,-25.3,21.3,-28.5],["Q",18,-31.8,13,-33.7],["Q",8,-35.7,1.4,-35.7],["L",1.4,-35.7],["Q",-7.5,-35.7,-13.8,-32],["Q",-20,-28.3,-23.2,-22.1],["Q",-26.2,-15.9,-26.2,-8.4],["L",-26.2,-8.4],["L",-9.7,-8.4],["Q",-9.7,-12.2,-8.4,-15.1],["Q",-7.2,-18,-4.7,-19.6],["Q",-2.2,-21.2,0.9,-21.2],["L",0.9,-21.2],["Q",3.3,-21.2,5.2,-20.5],["Q",7,-19.7,8.2,-18.5],["Q",9.3,-17.2,10,-15.6],["Q",10.6,-14,10.6,-12.4],["L",10.6,-12.4],["Q",10.6,-9.6,9.5,-7.1],["Q",8.5,-4.7,6.4,-2.2],["Q",4.3,0.3,1.6,3.4],["L",1.6,3.4]]},"6":{"w":56.9,"h":71.3,"c":[["M",21.3,-35.6],["L",-0.1,-35.6],["L",-20.3,-9.9],["Q",-23.7,-5.7,-26.1,-0.9],["Q",-28.4,3.9,-28.4,9.5],["L",-28.4,9.5],["Q",-28.4,18.1,-24.6,23.9],["Q",-20.7,29.8,-14.3,32.7],["Q",-7.9,35.7,0,35.7],["L",0,35.7],["Q",7.9,35.7,14.3,32.7],["Q",20.8,29.8,24.6,23.9],["Q",28.5,18.1,28.5,9.5],["L",28.5,9.5],["Q",28.5,4.2,26.6,0],["Q",24.8,-4.2,21.6,-7.2],["Q",18.5,-10.1,14.6,-11.7],["Q",10.8,-13.2,6.9,-13.2],["L",6.9,-13.2],["Q",3,-13.2,0.5,-12.4],["L",0.5,-12.4],["L",21.3,-35.6],["M",-11.7,9.5],["L",-11.7,9.5],["Q",-11.7,6,-10.2,3.3],["Q",-8.7,0.6,-6,-0.9],["Q",-3.4,-2.4,0,-2.4],["L",0,-2.4],["Q",3.4,-2.4,6,-0.9],["Q",8.6,0.6,10.2,3.3],["Q",11.8,6,11.8,9.5],["L",11.8,9.5],["Q",11.8,13.1,10.2,15.7],["Q",8.6,18.4,6,19.8],["Q",3.4,21.3,0,21.3],["L",0,21.3],["Q",-3.4,21.3,-6,19.8],["Q",-8.7,18.4,-10.2,15.7],["Q",-11.7,13.1,-11.7,9.5]]},"W":{"w":105.7,"h":77.6,"c":[["M",32.7,-35.3],["L",19.2,4.6],["L",-0.1,-38.8],["L",-19.1,4.6],["L",-32.9,-35.3],["L",-52.9,-35.3],["L",-22.6,38.8],["L",-0.1,-3.4],["L",22.5,38.8],["L",52.9,-35.3],["L",32.7,-35.3]]},"I":{"w":17.2,"h":70,"c":[["M",8.6,-35],["L",-8.6,-35],["L",-8.6,35],["L",8.6,35],["L",8.6,-35]]},"C":{"w":60.3,"h":73.2,"c":[["M",-11.8,0],["L",-11.8,0],["Q",-11.8,-6.5,-8.9,-11.1],["Q",-6,-15.7,-1.2,-18.1],["Q",3.5,-20.5,9.3,-20.5],["L",9.3,-20.5],["Q",14.3,-20.5,18,-19.2],["Q",21.9,-18,24.9,-15.8],["Q",27.9,-13.7,30.2,-11.3],["L",30.2,-11.3],["L",30.2,-29.5],["Q",25.9,-32.8,20.9,-34.7],["Q",15.9,-36.6,8.3,-36.6],["L",8.3,-36.6],["Q",-0.2,-36.6,-7.3,-34],["Q",-14.3,-31.4,-19.5,-26.5],["Q",-24.6,-21.6,-27.4,-14.9],["Q",-30.2,-8.2,-30.2,0],["L",-30.2,0],["Q",-30.2,8.2,-27.4,14.9],["Q",-24.6,21.6,-19.5,26.5],["Q",-14.3,31.4,-7.3,34],["Q",-0.2,36.6,8.3,36.6],["L",8.3,36.6],["Q",15.9,36.6,20.9,34.7],["Q",25.9,32.8,30.2,29.5],["L",30.2,29.5],["L",30.2,11.3],["Q",27.9,13.7,24.9,15.8],["Q",21.9,17.9,18,19.2],["Q",14.3,20.5,9.3,20.5],["L",9.3,20.5],["Q",3.5,20.5,-1.2,18.1],["Q",-6,15.7,-8.9,11.1],["Q",-11.8,6.4,-11.8,0]]},"H":{"w":63.9,"h":70,"c":[["M",31.9,-35],["L",15.1,-35],["L",15.1,-9.5],["L",-15,-9.5],["L",-15,-35],["L",-31.9,-35],["L",-31.9,35],["L",-15,35],["L",-15,5.7],["L",15.1,5.7],["L",15.1,35],["L",31.9,35],["L",31.9,-35]]},"T":{"w":55.4,"h":70,"c":[["M",-27.7,-35],["L",-27.7,-19.9],["L",-8.5,-19.9],["L",-8.5,35],["L",8.4,35],["L",8.4,-19.9],["L",27.7,-19.9],["L",27.7,-35],["L",-27.7,-35]]},"E":{"w":46.5,"h":70,"c":[["M",23.3,-35],["L",-23.2,-35],["L",-23.2,35],["L",23.3,35],["L",23.3,21.1],["L",-7,21.1],["L",-7,5],["L",21.3,5],["L",21.3,-8.6],["L",-7,-8.6],["L",-7,-21.1],["L",23.3,-21.1],["L",23.3,-35]]},"L":{"w":45,"h":70,"c":[["M",-5.6,-35],["L",-22.5,-35],["L",-22.5,35],["L",22.5,35],["L",22.5,20.5],["L",-5.6,20.5],["L",-5.6,-35]]},"N":{"w":64.6,"h":77,"c":[["M",32.3,-35],["L",16,-35],["L",16,4.4],["L",-32.3,-38.5],["L",-32.3,35],["L",-16.1,35],["L",-16.1,-4.4],["L",32.3,38.5],["L",32.3,-35]]}};
/* Glyphe als Pfad, Grösse 100 auf fs skaliert, y nach unten */
function glyphPath(ch, fs){
  const k = fs / 100, p = new Path2D();
  for (const c of GLYPHS[ch].c) {
    if (c[0] === 'M') p.moveTo(c[1] * k, c[2] * k); else if (c[0] === 'L') p.lineTo(c[1] * k, c[2] * k);
    else if (c[0] === 'Q') p.quadraticCurveTo(c[1] * k, c[2] * k, c[3] * k, c[4] * k);
    else if (c[0] === 'C') p.bezierCurveTo(c[1] * k, c[2] * k, c[3] * k, c[4] * k, c[5] * k, c[6] * k); else p.closePath();
  }
  return p;
}
function glyphShapes(ch, fs){
  const k = fs / 100, sp = new THREE.ShapePath();
  for (const c of GLYPHS[ch].c) {
    if (c[0] === 'M') sp.moveTo(c[1] * k, -c[2] * k); else if (c[0] === 'L') sp.lineTo(c[1] * k, -c[2] * k);
    else if (c[0] === 'Q') sp.quadraticCurveTo(c[1] * k, -c[2] * k, c[3] * k, -c[4] * k);
    else if (c[0] === 'C') sp.bezierCurveTo(c[1] * k, -c[2] * k, c[3] * k, -c[4] * k, c[5] * k, -c[6] * k);
  }
  /* Aussenformen und Innenräume selbst bestimmen: grösste Kontur aussen, was darin liegt ist ein Loch */
  const cs = sp.subPaths.map(p => p.getPoints(14)).filter(p => p.length > 2).map(p => ({ p, A: Math.abs(THREE.ShapeUtils.area(p)) })).sort((a, b) => b.A - a.A);
  const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
  const out = [];
  for (const c of cs) { const host = out.find(o => inside(c.p[0], o.p)); if (host) host.s.holes.push(new THREE.Path(c.p)); else out.push({ p: c.p, s: new THREE.Shape(c.p) }); }
  return out.map(o => o.s);
}
const cv = $('cv'), ctx = cv.getContext('2d');
let W = 0, Hh = 0, DPR = 1, FH = 100, LW = 2;
const letters = { ids: null, idW: 0, idH: 0, G: [] };
const mobile = () => innerWidth < 640, desk = () => innerWidth >= 1024;

/* ---------- Buchstaben: extrudierte Strichzeichnung, keine Grautöne ---------- */
function buildLetters(){
  const L = letters;
  /* das i steht als Info Zeichen gleich nach 2026 */
  const rows = mobile() ? ['WICH', 'TELN', '2026i'] : ['WICHTELN', '2026i'];
  const heights = [1.15, .6, 1.3, .8, 1.4, .65, 1.05, .55, 1.25, .75, 1.35, .7];
  /* Buchstaben verteilt über den Platz, leicht gedreht, mit Platz zum Durchgehen */
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const x0 = W * (mobile() ? .06 : .05), x1 = W - x0;
  /* bis zum Anmeldeschluss schieben die Figuren alles langsam an den Platz: Platz für das Geschenk */
  /* erst rücken die Buchstaben zur Seite (60 % der Zeit), dann kommt das Geschenk (40 %) */
  const P0 = boxProg(), P = ez(cl(P0 / .6)), PB = cl((P0 - .6) / .4);
  L.PL = P;
  const y0 = top() + FH * 1.1, y1S = bottom() - FH * .5, y1E = mobile() ? top() + (bottom() - top()) * .64 : y1S, y1 = lerp(y1S, y1E, P);
  const rowSp = (y1 - y0) / rows.length, rowSpE = (y1E - y0) / rows.length;
  L.G = [];
  const maxN = Math.max(...rows.map(r => r.replace('i', '').length));
  const fs = Math.floor(Math.min((x1 - x0) / maxN * (mobile() ? .66 : desk() ? .76 : .68), rowSpE / C * .5, FH * 3) * (L.shrink || 1));
  rows.forEach((row, ri) => {
    /* das i braucht keinen eigenen Platz: es steht direkt rechts neben der 6 */
    const hasI = row.includes('i'), rx1 = hasI ? lerp(x1 - fs * 1.05, mobile() ? x1 - fs * 1.05 : x0 + (x1 - x0) * .54, P) : x1, letters_ = row.replace('i', '');
    const unit = (rx1 - x0) / letters_.length; let acc = 0, lastX = 0;
    [...row].forEach(ch => {
      let x;
      if (ch === 'i') x = lastX + fs * 1.1;
      else { x = x0 + acc + unit / 2 + (rnd() - .5) * unit * .16; acc += unit; lastX = x; }
      const gy = y0 + rowSp * (ri + .55) + (rnd() - .5) * rowSp * .42;
      const info = ch === 'i';
      const H = info ? Math.round(fs * .2) : Math.round(Math.min(FH * 1.75, fs * .95 * heights[L.G.length % heights.length]));
      L.G.push({ ch, x, gy, rot: info ? 0 : (rnd() - .5) * .38, H, E: H * HZ, info });
    });
  });
  /* Trefferkarte: 0 frei, 255 gesperrt (Nischen), sonst Buchstabe */
  const idc = document.createElement('canvas'); idc.width = W; idc.height = Hh;
  const ix = idc.getContext('2d', { willReadFrequently: true });
  L.fs = fs;
  L.tooClose = false;
  L.G.forEach((g, i) => { ix.save(); ix.translate(g.x, g.gy); ix.scale(1, C); ix.rotate(g.rot); ix.fillStyle = `rgb(${i + 1},0,0)`; if (g.info) { ix.beginPath(); ix.arc(0, 0, fs * .3, 0, 7); ix.fill(); } else ix.fill(glyphPath(g.ch, fs)); ix.restore(); });
  const data = ix.getImageData(0, 0, W, Hh).data;
  L.idW = W; L.idH = Hh; L.ids = new Uint8Array(W * Hh);
  const NG = L.G.length, infoId = L.G.findIndex(g => g.info) + 1;
  /* Abstand zwischen den Buchstaben prüfen */
  { const gap = Math.round(FH * .6); outer: for (let y = 0; y < Hh; y += 2) for (let x = 0; x < W; x += 2) { const v = data[(y * W + x) * 4 + 3] === 255 ? data[(y * W + x) * 4] : 0; if (!v || v > NG) continue;
      for (const [dx, dy] of [[gap, 0], [-gap, 0], [0, Math.round(gap * C)], [0, -Math.round(gap * C)], [gap * .7, gap * .7 * C], [-gap * .7, gap * .7 * C]]) {
        const X = Math.round(x + dx), Y = Math.round(y + dy); if (X < 0 || Y < 0 || X >= W || Y >= Hh) continue;
        const o = data[(Y * W + X) * 4 + 3] === 255 ? data[(Y * W + X) * 4] : 0; if (o && o <= NG && o !== v && o !== infoId && v !== infoId) { L.tooClose = true; break outer; } } } }
  for (let p = 0, q = 0; p < L.ids.length; p++, q += 4) { const v = data[q + 3] === 255 ? data[q] : 0; L.ids[p] = v > NG ? 0 : v; }
  /* Innenräume (O, 0, 6) sind von aussen nicht erreichbar: sperren */
  {
    const seen = new Uint8Array(W * Hh), st = [];
    for (let x = 0; x < W; x++) { st.push(x, (Hh - 1) * W + x); } for (let y = 0; y < Hh; y++) { st.push(y * W, y * W + W - 1); }
    while (st.length) { const q = st.pop(); if (seen[q] || L.ids[q] !== 0) continue; seen[q] = 1; const x = q % W;
      if (x > 0) st.push(q - 1); if (x < W - 1) st.push(q + 1); if (q >= W) st.push(q - W); if (q < W * (Hh - 1)) st.push(q + W); }
    /* Innenräume (0, 6) sind oben zugedeckt: sie gehören zur Oberfläche des Buchstabens */
    for (let q0 = 0; q0 < L.ids.length; q0++) if (L.ids[q0] === 0 && !seen[q0]) {
      const comp = [], st2 = [q0], nb = new Set(); seen[q0] = 1;
      while (st2.length) { const q = st2.pop(); comp.push(q); const x = q % W;
        for (const r of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, q >= W ? q - W : -1, q < W * (Hh - 1) ? q + W : -1]) { if (r < 0) continue; const v = L.ids[r];
          if (v === 0) { if (!seen[r]) { seen[r] = 1; st2.push(r); } } else nb.add(v); } }
      const only = [...nb][0], fill = nb.size === 1 && only !== 255 ? only : 255;
      for (const q of comp) L.ids[q] = fill;
    }
  }
  { const g = L.G.find(q => q.info); L.info = g ? { x: g.x, gy: g.gy, gw: fs * .6, gh: fs * .6, H: g.H } : null; }
  /* Nischen sperren: morphologisches Schliessen je Buchstabe, nur was dazukommt */
  const r = Math.round(FH * .3);
  L.G.forEach((g, i) => {
    const R0 = fs * .62 + r + 4, bx = Math.max(0, Math.floor(g.x - R0)), bw = Math.min(W, Math.ceil(g.x + R0)) - bx;
    const by = Math.max(0, Math.floor(g.gy - R0 * C)), bh = Math.min(Hh, Math.ceil(g.gy + R0 * C)) - by;
    if (bw <= 0 || bh <= 0) return;
    let m = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) m[y * bw + x] = L.ids[(y + by) * W + x + bx] === i + 1 ? 1 : 0;
    const ry = Math.max(1, Math.round(r * C));
    const pass = (src, dil) => {
      const t = new Uint8Array(bw * bh), o = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) { let sum = 0; const row = y * bw;
        for (let x = -r; x < bw + r; x++) { const a = x + r, b = x - r - 1;
          if (a < bw && a >= 0) sum += src[row + a]; if (b >= 0 && b < bw) sum -= src[row + b];
          if (x >= 0 && x < bw) { const n = Math.min(bw - 1, x + r) - Math.max(0, x - r) + 1; t[row + x] = dil ? (sum > 0 ? 1 : 0) : (sum === n ? 1 : 0); } } }
      for (let x = 0; x < bw; x++) { let sum = 0;
        for (let y = -ry; y < bh + ry; y++) { const a = y + ry, b = y - ry - 1;
          if (a < bh && a >= 0) sum += t[a * bw + x]; if (b >= 0 && b < bh) sum -= t[b * bw + x];
          if (y >= 0 && y < bh) { const n = Math.min(bh - 1, y + ry) - Math.max(0, y - ry) + 1; o[y * bw + x] = dil ? (sum > 0 ? 1 : 0) : (sum === n ? 1 : 0); } } }
      return o;
    };
    const closed = pass(pass(m, true), false);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const p = (y + by) * W + x + bx; if (closed[y * bw + x] && L.ids[p] === 0) L.ids[p] = 255; }
  });
  layoutBox(L, fs, x0, x1, PB);
  /* Knopf für die Tastatur über dem Info Zeichen; Klicks kommen über den Platz */
  { const I = L.info, b = $('info');
    if (I) { const top_ = I.gy - I.gh / 2 * C - I.H * HZ, bot = I.gy + I.gh / 2 * C;
      Object.assign(b.style, { display: '', left: (I.x - I.gw / 2 - 10) + 'px', top: (top_ - 10) + 'px', width: (I.gw + 20) + 'px', height: (bot - top_ + 20) + 'px' }); }
    else b.style.display = 'none'; }
  /* 3D Blöcke aus den Vektorformen der Schrift */
  for (const m of GL.letters) { GL.scene.remove(m); m.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.uniforms && o.material.uniforms.map) { o.material.uniforms.map.value.dispose(); o.material.dispose(); } }); }
  GL.passB = [];
  GL.letters = L.G.map(g => {
    if (g.info) return infoDisc(g, fs);
    const shapes = glyphShapes(g.ch, fs);
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: g.H, bevelEnabled: false, curveSegments: 14 });
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, GL.mat[0]);
    /* Innenräume (0, 6) oben zudecken: nur die Öffnung als Linie, keine Innenwände */
    const holes = []; shapes.forEach(sh => sh.holes.forEach(h => holes.push(new THREE.Shape(h.getPoints()))));
    if (holes.length) { const cg = new THREE.ShapeGeometry(holes, 14); cg.rotateX(-Math.PI / 2); cg.translate(0, g.H + .2, 0); m.add(new THREE.Mesh(cg, GL.mat[3])); }
    m.position.set(g.x - W / 2, 0, (g.gy - Hh / 2) / C); m.rotation.y = -g.rot;
    GL.scene.add(m); return m;
  });
  if (L.box) GL.letters.push(boxMesh(L.box));
}
/* ---------- WebGL: echte Tiefe, Konturen über einen Kantenfilter ---------- */
const GL = { letters: [] };
function initGL(){
  const r = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: false, alpha: false });
  GL.r = r; GL.scene = new THREE.Scene();
  /* Material schreibt Normale und Farbkennung; die Farbe entsteht erst im Filter */
  const vs = `varying vec3 vN; void main(){ vec3 p = position; vec3 n = normal;
    #ifdef USE_INSTANCING
      p = (instanceMatrix * vec4(p, 1.0)).xyz; n = mat3(instanceMatrix) * n;
    #endif
    vN = normalize(normalMatrix * n); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
  const fsx = `uniform float uId; varying vec3 vN; void main(){ gl_FragColor = vec4(normalize(vN) * .5 + .5, uId / 255.0); }`;
  GL.textMat = (tex, id) => new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, uId: { value: id } }, transparent: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float uId; varying vec2 vUv; void main(){ if (texture2D(map, vUv).a < .5) discard; gl_FragColor = vec4(.5, .5, 1., uId / 255.0); }` });
  GL.mat = [0, 1, 2, 3].map(id => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fsx, uniforms: { uId: { value: id } }, side: THREE.DoubleSide }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), GL.mat[0]); ground.rotation.x = -Math.PI / 2; ground.position.y = -.01;
  GL.scene.add(ground);
  GL.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -6000, 6000);
  GL.cam.position.set(0, Math.sin(EL) * 3000, Math.cos(EL) * 3000); GL.cam.lookAt(0, 0, 0);
  /* Strichmännchen: Zylinder und Kugeln als Instanzen, je Farbe */
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false), sph = new THREE.SphereGeometry(1, 14, 10);
  GL.parts = {};
  for (const [key, id] of [['k', 1], ['p', 2]]) {
    const c = new THREE.InstancedMesh(cyl, GL.mat[id], N * 14 + 220), sp = new THREE.InstancedMesh(sph, GL.mat[id], N * 18 + 160);
    c.frustumCulled = sp.frustumCulled = false; GL.scene.add(c); GL.scene.add(sp);
    GL.parts[key] = { c, sp, nc: 0, ns: 0 };
  }
  /* Schlittenkasten: vollflächig weiss, verdeckt die Buchstaben dahinter */
  GL.matPinkO = new THREE.ShaderMaterial({ vertexShader: GL.mat[0].vertexShader, fragmentShader: GL.mat[0].fragmentShader, uniforms: { uId: { value: 7 } }, side: THREE.DoubleSide });
  GL.matW = new THREE.ShaderMaterial({ vertexShader: GL.mat[0].vertexShader, fragmentShader: GL.mat[0].fragmentShader, uniforms: { uId: { value: 6 } }, side: THREE.DoubleSide });
  GL.wbox = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), GL.matW, 6); GL.wbox.frustumCulled = false; GL.wbox.count = 0; GL.scene.add(GL.wbox);
  /* Santas Geschenke als kleine pinke 3D Päckchen mit Deckel und Masche */
  GL.gbox = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), GL.matPinkO, 64); GL.gbow = new THREE.InstancedMesh(new THREE.TorusGeometry(1, .32, 8, 18), GL.matPinkO, 64);
  for (const m of [GL.gbox, GL.gbow]) { m.frustumCulled = false; m.count = 0; GL.scene.add(m); }
  /* Filter: Kanten aus Normalen, Tiefe und Farbkennung */
  GL.post = new THREE.Scene(); GL.pcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  GL.pmat = new THREE.ShaderMaterial({
    uniforms: { tN: { value: null }, tD: { value: null }, tI: { value: null }, uRes: { value: new THREE.Vector2() }, uR: { value: 2 }, uDT: { value: .0004 }, uPink: { value: new THREE.Color(PINK) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D tN; uniform sampler2D tD; uniform sampler2D tI; uniform vec2 uRes; uniform float uR; uniform float uDT; uniform vec3 uPink; varying vec2 vUv;
      float edgeAt(vec2 o, vec4 c0, float d0){
        vec4 a = texture2D(tN, vUv + o), b = texture2D(tN, vUv - o);
        float da = texture2D(tD, vUv + o).x, db = texture2D(tD, vUv - o).x;
        vec3 n0 = c0.xyz * 2.0 - 1.0;
        float e = 0.0;
        e = max(e, smoothstep(.86, .7, dot(n0, a.xyz * 2.0 - 1.0)));
        e = max(e, smoothstep(.86, .7, dot(n0, b.xyz * 2.0 - 1.0)));
        e = max(e, step(.5, abs(a.w - c0.w) * 255.0)); e = max(e, step(.5, abs(b.w - c0.w) * 255.0));
        e = max(e, smoothstep(uDT, uDT * 2.0, abs(da + db - 2.0 * d0)));
        return e;
      }
      void main(){
        vec2 px = 1.0 / uRes; vec4 c0 = texture2D(tN, vUv); float d0 = texture2D(tD, vUv).x;
        float e = 0.0;
        e = max(e, edgeAt(vec2(uR, 0.0) * px, c0, d0));
        e = max(e, edgeAt(vec2(0.0, uR) * px, c0, d0));
        e = max(e, edgeAt(vec2(uR, uR) * .707 * px, c0, d0));
        e = max(e, edgeAt(vec2(uR, -uR) * .707 * px, c0, d0));
        /* Konturen kommen aus dem Bild ohne Figuren: keine Lücken, wo eine Figur davorsteht */
        float id = floor(texture2D(tI, vUv).w * 255.0 + .5);
        vec3 col = mix(vec3(1.0), vec3(0.0), e);
        if (id > .5 && id < 1.5) col = vec3(0.0);
        if (id > 1.5 && id < 2.5) col = uPink;
        if (id > 5.5 && id < 6.5) col = vec3(1.0);
        if (id > 6.5 && id < 7.5) col = mix(uPink, vec3(0.0), e);

        gl_FragColor = vec4(col, 1.0);
      }`
  });
  GL.post.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), GL.pmat));
}
function sizeGL(){
  const d = Math.min(2, devicePixelRatio || 1);
  GL.r.setPixelRatio(d); GL.r.setSize(W, Hh, false);
  const w = Math.round(W * d), h = Math.round(Hh * d);
  if (GL.rt) { GL.rt.dispose(); GL.rtI.dispose(); }
  GL.rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat });
  GL.rtI = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat });
  GL.rt.depthTexture = new THREE.DepthTexture(w, h); GL.rt.depthTexture.type = THREE.UnsignedIntType;
  Object.assign(GL.cam, { left: -W / 2, right: W / 2, top: Hh / 2, bottom: -Hh / 2 }); GL.cam.updateProjectionMatrix();
  GL.pmat.uniforms.tN.value = GL.rt.texture; GL.pmat.uniforms.tI.value = GL.rtI.texture; GL.pmat.uniforms.tD.value = GL.rt.depthTexture;
  GL.pmat.uniforms.uRes.value.set(w, h); GL.pmat.uniforms.uR.value = (mobile() ? .8 : desk() ? 1.45 : 1.25) * d;
  STROKE = mobile() ? .78 : 1;
  GL.pmat.uniforms.uDT.value = 6 / 12000;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
const toW = (F, base, p) => new THREE.Vector3(F.x - W / 2 + p.x, base.z + p.z, (F.g - Hh / 2) / C + p.y);
/* auf dem Handy etwas feinere Striche, damit jeder einzelne lesbar bleibt */
let STROKE = 1;
function addCyl(P, a, b, r){
  r *= STROKE;
  _d.subVectors(b, a); const l = _d.length(); if (l < .01) return;
  _q.setFromUnitVectors(_y, _d.multiplyScalar(1 / l)); _v.addVectors(a, b).multiplyScalar(.5); _s.set(r, l, r);
  _m.compose(_v, _q, _s); P.c.setMatrixAt(P.nc++, _m);
}
function addSph(P, a, r){ _q.identity(); _s.set(r, r, r); _m.compose(a, _q, _s); P.sp.setMatrixAt(P.ns++, _m); }
function figTo3D(F, J, base){
  const P = GL.parts[S.claims[F.i] != null ? 'p' : 'k'], w = p => toW(F, base, p), R = FH;
  const r = R * .033, j = {};
  for (const k of ['pel','chest','neck','headC','shL','shR','hipL','hipR','kneeL','kneeR','ankL','ankR','elbL','elbR','handL','handR']) j[k] = w(J[k]);
  const toe = (ank, t) => w(add(J[ank], add(mul(J.fw, .075 * R), mul(J.up, -.02 * R + t * .03 * R))));
  j.toeL = toe('ankL', J.toeL); j.toeR = toe('ankR', J.toeR);
  addCyl(P, j.pel, j.neck, r * 1.15); addCyl(P, j.shL, j.shR, r * .95); addCyl(P, j.hipL, j.hipR, r * .95);
  for (const s of ['L', 'R']) {
    addCyl(P, j['hip' + s], j['knee' + s], r); addCyl(P, j['knee' + s], j['ank' + s], r); addCyl(P, j['ank' + s], j['toe' + s], r * .9);
    addCyl(P, j['sh' + s], j['elb' + s], r * .92); addCyl(P, j['elb' + s], j['hand' + s], r * .92);
    for (const q of ['hip', 'knee', 'ank', 'toe', 'sh', 'elb', 'hand']) addSph(P, j[q + s], r * STROKE * (q === 'toe' ? .9 : 1));
  }
  addSph(P, j.pel, r * STROKE * 1.15); addSph(P, j.neck, r * STROKE * 1.15);
  addSph(P, j.headC, .1 * R * J.k);
  if (F.santa) {
    /* Bauch, Zipfelmütze, Sack auf dem Rücken */
    const Pp = GL.parts.p, mid = add(mul(add(J.pel, J.chest), .5), mul(J.fw, .05 * R));
    addSph(P, w(mid), .095 * R);
    const hb = add(J.headC, mul(J.up, .08 * R)), tip = add(add(J.headC, mul(J.up, .2 * R)), mul(J.fw, -.09 * R));
    addCyl(Pp, w(hb), w(tip), .06 * R); addSph(Pp, w(tip), .03 * R);
    addSph(Pp, w(add(add(J.chest, mul(J.fw, -.12 * R)), mul(J.up, -.02 * R))), .1 * R);
  }
  F.cig = null;
  if (F.lean && F.lean.smoke && F.lean.b > .3) {
    const dir = add(mul(J.fw, .8), mul(J.rt, -.35)), dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const tipRel = add(J.handR, mul(dir, .08 * R / dl));
    addCyl(P, j.handR, w(tipRel), r * .5);
    F.cig = [base.x + tipRel.x, sy(base.gy, tipRel.y, tipRel.z + base.z)];
  }
  /* Umriss für Antippen und Beschriftung */
  const P2 = p => [base.x + p.x, sy(base.gy, p.y, p.z + base.z)];
  const xs = [J.headC, J.handL, J.handR, J.ankL, J.ankR, J.shL, J.shR].map(P2);
  F.box = { x0: Math.min(...xs.map(p => p[0])) - .12 * R, x1: Math.max(...xs.map(p => p[0])) + .12 * R,
    y0: Math.min(...xs.map(p => p[1])) - .14 * R, y1: Math.max(...xs.map(p => p[1])) + .06 * R, head: P2(add(J.headC, mul(J.up, .12 * R))) };
}
/* -1 Boden, -2 gesperrte Nische, sonst Buchstabe */
const idAt = (x, gy) => { x = Math.round(x); gy = Math.round(gy); if (x < 0 || gy < 0 || x >= letters.idW || gy >= letters.idH) return -1; const v = letters.ids[gy * letters.idW + x]; return v === 255 ? -2 : v - 1; };
const hOf = id => id < 0 ? 0 : letters.G[id].H;
function edgeNormal(x, gy, upperId){
  let nx = 0, nv = 0;
  for (let a = 0; a < 24; a++) {
    const ca = Math.cos(a / 24 * Math.PI * 2), sa = Math.sin(a / 24 * Math.PI * 2);
    for (const r of [4, 8, 12]) if (idAt(x + ca * r, gy + sa * r * C) === upperId) { nx += ca; nv += sa; }
  }
  const l = Math.hypot(nx, nv) || 1; return { x: nx / l, v: nv / l };
}

/* ---------- Figur: Skelett in 3D, gezeichnet als Strichzeichnung ---------- */
function makeFig(i){
  const Lk = LOOKS[i];
  return { i, look: Lk, x: 0, g: 0, a: Math.PI / 2, ph: Math.random() * 6, surf: -1, sp: 0, want: .6 + Math.random() * .16,
    seed: Math.random() * 100, pause: 0, act: null, drag: null, box: null };
}
/* Pose: lokale Ziele (r = rechts, f = vorne, z = oben), in Figurhöhen */
function walkPose(F, o){
  const s = o.stride, ph = F.ph, P = {};
  const legT = off => { const t = ((ph + off) / (Math.PI * 2) % 1 + 1) % 1;
    if (t < .6) { const q = t / .6; return { f: s * (.5 - q), z: 0, toe: 0 }; }
    const q = (t - .6) / .4; return { f: s * (-.5 + ez(q)), z: .07 * Math.sin(Math.PI * q) * (s > .05 ? 1 : .3), toe: Math.sin(Math.PI * q) * .5 };
  };
  const L = legT(0), R = legT(Math.PI);
  const bob = s > .02 ? .014 * Math.cos(ph * 2) : 0;
  P.pelvis = { r: Math.sin(ph) * .012 * (s > .02), f: 0, z: .52 - .02 + bob };
  P.yaw = Math.sin(ph) * .12 * cl(s * 3);
  P.lean = .05 * cl(s * 3);
  P.footL = { r: .075, f: L.f, z: L.z, toe: L.toe }; P.footR = { r: -.075, f: R.f, z: R.z, toe: R.toe };
  const sw = .45 * cl(s * 2.5);
  P.handL = { r: .17, f: Math.sin(ph + Math.PI) * sw * .28, z: .30 + Math.abs(Math.sin(ph)) * sw * .06 };
  P.handR = { r: -.17, f: Math.sin(ph) * sw * .28, z: .30 + Math.abs(Math.sin(ph)) * sw * .06 };
  return P;
}
function solveFig(F, P){
  /* Achsen in der Welt: vorne, rechts, oben */
  const a = F.a, fw = v3(Math.cos(a), Math.sin(a), 0), rt = v3(-Math.sin(a), Math.cos(a), 0), up = v3(0, 0, 1);
  const k = F.look.h, bw = 1 + F.look.build * .18;
  const loc = (r, f, z) => add(add(mul(rt, r * FH * bw), mul(fw, f * FH)), mul(up, z * FH * k));
  const locN = (r, f, z) => add(add(mul(rt, r * FH), mul(fw, f * FH)), mul(up, z * FH * k));
  const locA = (r, f, z) => add(add(mul(rt, r * FH), mul(fw, f * FH)), mul(up, z * FH));
  const pel = P.pelvis.abs ? add(locA(P.pelvis.r, P.pelvis.f, P.pelvis.z - .5), mul(up, .48 * FH * k)) : locN(P.pelvis.r, P.pelvis.f, P.pelvis.z);
  const lean = P.lean || 0, yaw = P.yaw || 0;
  /* Oberkörper: Neigung nach vorne, Schulterdrehung gegen die Hüfte */
  const spineUp = add(mul(up, Math.cos(lean)), mul(fw, Math.sin(lean)));
  const chest = add(pel, mul(spineUp, .27 * FH * k));
  const yawV = (amt) => add(mul(rt, Math.cos(amt)), mul(fw, Math.sin(amt)));
  const sRt = yawV(-yaw), hRt = yawV(yaw * .6);
  const shL = add(chest, mul(sRt, .125 * FH * bw)), shR = add(chest, mul(sRt, -.125 * FH * bw));
  const hipL = add(pel, mul(hRt, .075 * FH * bw)), hipR = add(pel, mul(hRt, -.075 * FH * bw));
  const neck = add(chest, mul(spineUp, .045 * FH * k));
  const headC = add(neck, add(mul(spineUp, .085 * FH * k), mul(fw, .01 * FH)));
  const absP = p => p.abs ? p.abs : locA(p.r, p.f, p.z);
  const A1 = .165 * FH * k, A2 = .16 * FH * k;
  const hand = (h, sh) => { const free = add(chest, loc(h.r, h.f, h.z - .78)); if (!h.g) return free;
    const grab = locA(h.g.r, h.g.f, h.g.z);
    /* erst hoch, dann über die Kante: so streift die Hand nie die Wand */
    const d = sub(grab, free), dz = dot(d, up), dh = sub(d, mul(up, dz));
    const at = w => { const wz = 1 - Math.pow(1 - w, 3), wf = w * w; return add(free, add(mul(dh, wf), mul(up, dz * wz))); };
    /* reicht der Arm noch nicht bis zur Kante, bleibt die Hand dort, wo sie hinkommt, statt zur Wand gezogen zu werden */
    let w = h.w; const reach = (A1 + A2) * .995;
    if (h.pre && len(sub(at(w), sh)) > reach) { let lo = 0, hi = w; for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (len(sub(at(m), sh)) > reach) hi = m; else lo = m; } w = lo; }
    return at(w); };
  const handL = hand(P.handL, shL), handR = hand(P.handR, shR);
  const footL = absP(P.footL), footR = absP(P.footR);
  const L1 = .25 * FH * k, L2 = .25 * FH * k;
  const ankL = add(footL, mul(up, .03 * FH)), ankR = add(footR, mul(up, .03 * FH));
  /* Knie: beim Gehen nach vorne; beim Klettern zur Seite und nach oben, nie in die Wand */
  const kd = (kb, side) => add(add(mul(fw, 1 - .85 * kb), mul(rt, side * .7 * kb)), mul(up, .85 * (1 - kb) + .25 * kb));
  /* zeitlich glätten: das Knie bleibt auf der Seite, auf der es im letzten Bild war */
  const coh = (d, prev) => prev ? add(mul(nrm(d), .45), mul(prev, .55)) : d;
  const kL = ik(hipL, ankL, L1, L2, coh(kd(P.kneeBackL || 0, 1), F.kpL)), kR = ik(hipR, ankR, L1, L2, coh(kd(P.kneeBackR || 0, -1), F.kpR));
  if (!P.noKeep) { F.kpL = nrm(sub(kL.j, hipL)); F.kpR = nrm(sub(kR.j, hipR)); }
  /* beim Klettern zeigen die Ellbogen von der Wand weg, nie hinein */
  const elbBend = P.armsUp ? add(mul(fw, -1), mul(up, .6)) : add(mul(fw, -1), mul(up, -.2));
  const eL = ik(shL, handL, A1, A2, add(elbBend, mul(rt, .4))), eR = ik(shR, handR, A1, A2, add(elbBend, mul(rt, -.4)));
  return { fw, rt, up, pel, chest, shL, shR, hipL, hipR, neck, headC, kneeL: kL.j, ankL: kL.end, kneeR: kR.j, ankR: kR.end,
    elbL: eL.j, handL: eL.end, elbR: eR.j, handR: eR.end, toeL: P.footL.toe || 0, toeR: P.footR.toe || 0, k, bw };
}
/* Strichmännchen: dicke runde Linien, Kopf als Kreis; hintere Glieder zuerst */
function drawFig(c, F, J, base, opt = {}){
  const col = S.claims[F.i] != null ? PINK : INK;
  const P2 = p => [base.x + p.x, sy(base.gy, p.y, p.z + base.z)];
  const D = p => depth(p.y, p.z);
  const R = FH, w = (opt.w || 1) * R * .052;
  c.strokeStyle = col; c.fillStyle = col; c.lineCap = 'round'; c.lineJoin = 'round';
  const line = (pts, lw) => { c.beginPath(); const q = pts.map(P2); c.moveTo(q[0][0], q[0][1]); for (let j = 1; j < q.length; j++) c.lineTo(q[j][0], q[j][1]); c.lineWidth = lw; c.stroke(); };
  const foot = (ank, toe) => { const tip = add(ank, add(mul(J.fw, .075 * R), mul(J.up, -.02 * R + toe * .03 * R))); return tip; };
  const legL = () => line([J.hipL, J.kneeL, J.ankL, foot(J.ankL, J.toeL)], w);
  const legR = () => line([J.hipR, J.kneeR, J.ankR, foot(J.ankR, J.toeR)], w);
  const armL = () => line([J.shL, J.elbL, J.handL], w * .92);
  const armR = () => line([J.shR, J.elbR, J.handR], w * .92);
  const body = () => {
    line([J.pel, J.chest, J.neck], w * 1.08);
    line([J.shL, J.shR], w * .9); line([J.hipL, J.hipR], w * .9);
    const h = P2(J.headC); c.beginPath(); c.arc(h[0], h[1], .1 * R * J.k, 0, 7); c.fill();
  };
  /* welche Seite ist näher bei der Kamera */
  const lNear = D(J.hipL) + D(J.shL) > D(J.hipR) + D(J.shR);
  const order = lNear ? [legR, armR, body, legL, armL] : [legL, armL, body, legR, armR];
  for (const f of order) f();
  const xs = [J.headC, J.handL, J.handR, J.ankL, J.ankR, J.shL, J.shR].map(P2);
  F.box = { x0: Math.min(...xs.map(p => p[0])) - .12 * R, x1: Math.max(...xs.map(p => p[0])) + .12 * R,
    y0: Math.min(...xs.map(p => p[1])) - .14 * R, y1: Math.max(...xs.map(p => p[1])) + .06 * R, head: P2(add(J.headC, mul(J.up, .12 * R))) };
}

/* ---------- Bewegung: Gehen, Klettern, Absteigen ---------- */
/* Keyframes fürs Klettern. Füsse ohne Ziel hängen locker unter der Hüfte,
   so bleibt jedes Ziel für die Beine erreichbar und nichts knickt falsch. */
const dangle = (k, side) => [k.pel[0] - .03 - (side ? .02 : 0), k.pel[1] - .48 + (side ? .02 : 0)];
const fill = keys => keys.map(k => ({ ...k, fL: k.fL || dangle(k, 0), fR: k.fR || dangle(k, 1) }));
/* Hüfte so hoch, dass der Arm (Schulter 0.27 über der Hüfte, Reichweite 0.3) die Kante sicher erreicht */
const reachZ = (pf, lean, hf, H) => { const sf = pf + .27 * Math.sin(lean), dx = Math.min(.24, Math.abs(hf - sf)); return H - Math.sqrt(Math.max(.0001, .26 * .26 - dx * dx)) - .25 * Math.cos(lean); };
const UP_KEYS = (H, fEnd) => {
  const fk = Math.min(.07, fEnd - .02);
  const k = (t, pf, pz, lean, hand, fL, fR) => {
    /* Arm muss die Kante erreichen: Hüfte nah genug und hoch genug */
    if (hand) { const sf = pf + .27 * Math.sin(lean); if (hand[0] - sf > .2) pf = hand[0] - .2 - .27 * Math.sin(lean); pz = Math.max(pz, reachZ(pf, lean, hand[0], hand[1])); }
    return { t, pel: [pf, pz], lean, hand, fL, fR };
  };
  const jump = H > 1.05;
  return fill([
    k(0,   -.22, .5,  .03, null, [-.22, 0], [-.22, 0]),
    k(.16, -.13, .5, 0, [-.02, H + .045], jump ? null : [-.2, 0], jump ? null : [-.21, 0]),
    k(.3,  -.2,  Math.max(.43, H - .62), .05, [-.02, H + .045], H > 1.01 ? null : [-.19, 0], H > 1.01 ? null : [-.17, 0]),
    k(.5, -.21, H - .32, .25, [-.02, H + .045], null, null),
    k(.62, -.24, H - .05, .55, [-.02, H + .045], null, null),
    k(.75, -.1,  H + .09, .6,  [-.02, H + .045], [-.13, H + .13], [-.22, H - .42]),
    k(.84, -.04, H + .13, .6,  [-.02, H + .045], [.02, H + .01], [-.2, H - .22]),
    k(.93, fk,   H + .3,  .3,  null, [fk + .02, H], [-.02, H + .04]),
    k(1,   fEnd, H + .5,  .03, null, [fEnd, H], [fEnd, H]),
  ]);
};
const STEP_KEYS = (H, fEnd) => fill([
  { t: 0,   pel: [-.17, .5], lean: .03, hand: null, fL: [-.17, 0], fR: [-.17, 0] },
  { t: .4,  pel: [-.08, .5 + H * .3], lean: .12, hand: null, fL: [.04, H + .05], fR: [-.16, 0] },
  { t: .72, pel: [Math.min(.06, fEnd - .02), .5 + H * .95], lean: .08, hand: null, fL: [Math.min(.06, fEnd), H], fR: [-.01, H + .07] },
  { t: 1,   pel: [fEnd, .5 + H], lean: .03, hand: null, fL: [fEnd, H], fR: [fEnd, H] },
]);
/* Rundum Abstand: der ganze Körper passt auf die Fläche surf */
const clearAt = (surf, x, g, r) => {
  if (idAt(x, g) !== surf) return false;
  const r1 = r || (surf >= 0 ? .09 : .25), hs = hOf(surf);
  for (let a = 0; a < 12; a++) {
    const ca = Math.cos(a * .5236), sa = Math.sin(a * .5236);
    if (idAt(x + ca * FH * r1, g + sa * FH * r1 * C) !== surf) return false;
    /* keine höhere Wand in Körpernähe */
    const q = idAt(x + ca * FH * .3, g + sa * FH * .3 * C);
    if (q === -2 || (q !== surf && hOf(q) > hs + 2)) return false;
  }
  return true;
};
/* Grundhöhe der Figur: beim Umdrehen vor dem Absteigen noch oben auf dem Block */
const baseZ = F => F.act ? (F.act.turn < 1 ? hOf(F.act.from) : F.act.lowZ) : F.z0;
/* Punkt relativ zur Kante: f entlang der Normalen (in den höheren Block), r entlang der Kante, in Figurhöhen */
const edgePt = (E, n, f, r) => ({ x: E.x + (n.x * f - n.v * r) * FH, g: E.g + (n.v * f + n.x * r) * FH * C });
const onId = (E, n, f, r, id) => { const q = edgePt(E, n, f, r); return idAt(q.x, q.g) === id; };
/* Kletterei planen und prüfen: Start, Griffe, Standplatz müssen stimmen, sonst nicht klettern */
function planAct(F, toId, ang){
  const fromId = F.surf;
  if (toId === -2 || fromId === -2) return null;
  const dh = (hOf(toId) - hOf(fromId)) / FH, up = dh > 0, Hn = Math.abs(dh);
  if (up && Hn > 1.85) return null;
  /* Kante: in Richtung der Annäherung bis zum ersten fremden Pixel */
  const ca = Math.cos(ang), sa = Math.sin(ang);
  let x = F.x, g = F.g, n0 = 0;
  while (idAt(x, g) === fromId && n0++ < FH * .8) { x += ca * .5; g += sa * .5 * C; }
  if (idAt(x, g) !== toId) return null;
  const E = { x: x - ca * .25, g: g - sa * .25 * C };
  const upper = up ? toId : fromId, lower = up ? fromId : toId;
  const nn = edgeNormal(E.x, E.g, upper); if (!nn.x && !nn.v) return null;
  const n = { x: nn.x, v: nn.v };
  /* nicht zu schräg anlaufen */
  const dir = up ? 1 : -1, cosA = (Math.cos(ang) * n.x + Math.sin(ang) * n.v) * dir;
  if (cosA < .55) return null;
  /* unten frei, Griffe oben, Standplatz oben */
  for (const r of [0, .08, -.08]) for (const f of [-.2, -.28]) if (!onId(E, n, f, r, lower)) return null;
  /* auf dem ganzen Kletterweg nur diese zwei Flächen, kein Nachbarbuchstabe im Weg */
  for (let f = -.3; f <= .18; f += .03) for (let r = -.34; r <= .341; r += .04) { const q = edgePt(E, n, f, r), id = idAt(q.x, q.g); if (f < -.02 ? id !== lower : (id !== lower && id !== upper)) return null; }
  let gr = null; for (const r of [.12, .08, .05]) if (onId(E, n, .1, r, upper) && onId(E, n, .1, -r, upper) && onId(E, n, .06, r, upper) && onId(E, n, .06, -r, upper)) { gr = r; break; }
  if (gr === null) return null;
  /* wo genau die Kante unter jeder Hand liegt (bei runden Buchstaben nicht überall gleich) */
  const edgeF = r => { for (let f = -.12; f <= .2; f += .005) if (onId(E, n, f, r, upper)) return f; return 0; };
  const eoP = edgeF(gr), eoM = edgeF(-gr);
  /* Standplatz oben: Füsse vorne, hinten und seitlich auf dem Block, keine höhere Wand daneben */
  const standOk = f => { for (const df of [-.05, 0, .05]) for (const r of [-.08, 0, .08]) if (!onId(E, n, f + df, r, upper)) return false;
    for (let a = 0; a < 12; a++) { const c = edgePt(E, n, f, 0), q = idAt(c.x + Math.cos(a * .5236) * FH * .3, c.g + Math.sin(a * .5236) * FH * .3 * C); if (q === -2 || (q !== upper && hOf(q) > hOf(upper) + 2)) return false; } return true; };
  let fEnd = null; for (const f of [.15, .12, .1, .08]) if (standOk(f)) { fEnd = f; break; }
  if (fEnd === null) return null;
  return { E, n, up, Hn, gr, eoP, eoM, fEnd, from: fromId, to: toId, lowZ: Math.min(hOf(fromId), hOf(toId)) };
}
function actFromPlan(F, pl, down){
  if (!down) F.sitDone = false;
  const from = down ? pl.to : pl.from, to = down ? pl.from : pl.to, small = pl.Hn < .36;
  F.act = { kind: small ? 'step' : down ? 'down' : 'up', from, to, H: pl.Hn, ex: pl.E.x, eg: pl.E.g, n: pl.n, t: 0,
    gr: pl.gr, eoP: pl.eoP, eoM: pl.eoM, fEnd: pl.fEnd, keys: small ? STEP_KEYS(pl.Hn, pl.fEnd) : UP_KEYS(pl.Hn, pl.fEnd), turn: 0, a0: F.a,
    dur: small ? .9 : (down ? 2.8 : 3.2) + pl.Hn * .9, lowZ: pl.lowZ, plan: pl };
}
/* Kletterstellen: einmal beim Aufbau geprüft, nur diese werden benutzt */
function buildSpots(){
  const L = letters, out = [];
  L.G.forEach((g, i) => {
    const pts = [];
    for (let y = 1; y < Hh - 1; y++) for (let x = 1; x < W - 1; x++) {
      const q = y * W + x; if (L.ids[q] !== i + 1) continue;
      if (L.ids[q - 1] !== i + 1 || L.ids[q + 1] !== i + 1 || L.ids[q - W] !== i + 1 || L.ids[q + W] !== i + 1) pts.push([x, y]);
    }
    const mine = [];
    for (let j = 0; j < pts.length; j += 3) {
      const [x, y] = pts[j];
      if (mine.some(sp => Math.hypot(sp.E.x - x, (sp.E.g - y) / C) < FH * .35)) continue;
      const nn = edgeNormal(x, y, i); if (!nn.x && !nn.v) continue;
      const S = { x: x - nn.x * FH * .24, g: y - nn.v * FH * .24 * C };
      if (idAt(S.x, S.g) !== -1) continue;
      let ok = true; for (let a = 0; a < 12 && ok; a++) if (idAt(S.x + Math.cos(a * .5236) * FH * .14, S.g + Math.sin(a * .5236) * FH * .14 * C) !== -1) ok = false;
      if (!ok) continue; if (S.x < FH * .5 || S.x > W - FH * .5 || S.g < top() || S.g > bottom()) continue;
      const pl = planAct({ x: S.x, g: S.g, surf: -1 }, i, Math.atan2(nn.v, nn.x));
      const S2 = { x: x - nn.x * FH * .55, g: y - nn.v * FH * .55 * C };
      if (pl && clearAt(-1, S2.x, S2.g)) mine.push({ ...pl, S, S2, id: i });
    }
    out.push(...mine);
  });
  L.spots = out;
}
function actPose(F, dt){
  const A = F.act, n = A.n;
  const down = A.kind === 'down' || (A.kind === 'step' && hOf(A.to) < hOf(A.from));
  if (A.kind === 'step' && !down) { /* kleine Stufe hoch: Start wie beim Klettern */ }
  const fwdStepDown = A.kind === 'step' && down, sgn = fwdStepDown ? -1 : 1;
  /* erst zur Kante (oder beim Absteigen zum Block) drehen, mit kleinen Schritten */
  if (A.turn < 1) {
    const target = Math.atan2(n.v * sgn, n.x * sgn);
    let d = target - A.a0; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (!A.p0) { A.p0 = { x: F.x, g: F.g }; A.td = Math.max(.35, Math.abs(d) * .32); }
    A.turn = Math.min(1, A.turn + dt / A.td);
    F.a = A.a0 + d * ez(A.turn);
    /* gleichzeitig an die geplante Startstelle gehen */
    const f0 = (down ? A.fEnd : -.2) * sgn, sx = A.ex + Math.cos(target) * f0 * FH, sg = A.eg + Math.sin(target) * f0 * FH * C;
    F.x = lerp(A.p0.x, sx, ez(A.turn)); F.g = lerp(A.p0.g, sg, ez(A.turn));
    F.ph += dt * 9;
    if (A.turn < 1) return walkPose(F, { stride: .05 });
  }
  A.t = Math.min(1, A.t + dt * (A.fast || 1) / (RM ? .01 : A.dur));
  const k = down ? 1 - A.t : A.t;
  const K = A.keys, sp = get => spline(K, k, get);
  F.a = Math.atan2(n.v * sgn, n.x * sgn);
  const pf = sp(q => q.pel[0]) * sgn, pz = sp(q => q.pel[1]);
  /* Ursprung auf der Kante; der Startversatz wird weich ausgeblendet */
  if (!A.blend) { A.blend = { x: F.x - (A.ex + Math.cos(F.a) * pf * FH), g: F.g - (A.eg + Math.sin(F.a) * pf * FH * C) }; }
  const fade = 1 - ez(cl(A.t / .2));
  F.x = A.ex + A.blend.x * fade; F.g = A.eg + A.blend.g * fade; F.z0 = A.lowZ;
  const P = { pelvis: { r: 0, f: pf, z: pz, abs: true }, lean: sp(q => q.lean) * (fwdStepDown ? .5 : 1), yaw: 0 };
  P.footL = { r: .075, f: sp(q => q.fL[0]) * sgn, z: sp(q => q.fL[1]) };
  P.footR = { r: -.075, f: sp(q => q.fR[0]) * sgn, z: sp(q => q.fR[1]) };
  /* Greifen: zwischen den Schlüsselbildern mit Hand weich hin, sonst fest auf der geprüften Kante */
  const hi = K.map((q, j) => q.hand ? j : -1).filter(j => j >= 0);
  let w = 0, hf = .05, hz = A.H;
  if (hi.length) {
    const a = hi[0], b = hi[hi.length - 1];
    w = k < K[a].t ? ez(seg(k, K[Math.max(0, a - 1)].t, K[a].t)) : k > K[b].t ? 1 - ez(seg(k, K[b].t, K[Math.min(K.length - 1, b + 1)].t)) : 1;
    const HK = K.slice(a, b + 1), kk = cl(k, K[a].t, K[b].t);
    hf = HK.length > 1 ? spline(HK, kk, q => q.hand[0]) : K[a].hand[0]; hz = HK.length > 1 ? spline(HK, kk, q => q.hand[1]) : K[a].hand[1];
  }
  const sw = Math.sin(F.ph) * .03;
  P.handL = { r: .12, f: .03 + sw, z: .3, w, g: { r: A.gr, f: hf + (A.eoP || 0), z: hz } };
  P.handR = { r: -.12, f: .03 - sw, z: .3, w, g: { r: -A.gr, f: hf + (A.eoM || 0), z: hz } };
  /* kleinere Figuren ziehen sich etwas höher, damit die Hände die Kante sicher erreichen */
  P.pelvis.z += Math.max(0, 1 - F.look.h) * 1.2 * w * (1 - seg(k, .5, .7));
  P.handL.pre = P.handR.pre = hi.length > 0 && k < K[hi[0]].t;
  P.armsUp = w > .3;
  /* beim Hochziehen Knie nach oben statt in die Wand */
  if (A.kind !== 'step') {
    /* an der Wand die ganze Zeit: Knie seitlich, erst oben wieder nach vorne */
    const kb = Math.min(1, k / .02) * (1 - seg(k, .88, .98));
    P.kneeBackL = kb; P.kneeBackR = kb;
  }
  return P;
}

/* ---------- Szene ---------- */
let Fs = [], view = 'pick', sel = null, last = 0, clock = 0;
/* im Topf: nach Anmeldeschluss alle anderen Angemeldeten, bis man sein Los aufgedeckt hat */
const eligible = () => isOpen() || S.me == null || S.draws[S.me] != null ? [] : Object.keys(S.claims).map(Number).filter(i => i !== S.me);
const top = () => Hh * .05 + FH * .9, bottom = () => Hh - (mobile() ? 125 : desk() ? 120 : 105);
/* Figuren bleiben über der Fusszeile, auch wenn dort die Aktionstasten stehen */
let footTop = 1e9;
const fbot = () => Math.min(bottom(), footTop - FH * .12);
function inBounds(F){
  const m = FH * .45;
  return F.x > m && F.x < W - m && F.g > top() && F.g < fbot();
}
function build(){
  W = innerWidth; Hh = innerHeight; DPR = Math.min(2, Math.round(devicePixelRatio || 1)) || 1;
  cv.width = W * DPR; cv.height = Hh * DPR;
  FH = Math.round(Math.max(40, Math.min(W * .105, Hh * .075, 72)));
  LW = mobile() ? 1.7 : 2.1;
  if (!GL.r) initGL();
  sizeGL();
  letters.shrink = 1;
  buildLetters();
  for (let n = 0; n < 6 && letters.tooClose; n++) { letters.shrink *= .9; buildLetters(); }
  /* Figurgrösse an die Strichstärke der Schrift koppeln, damit oben Platz zum Stehen ist */
  const fh2 = Math.round(cl(letters.fs * .43, 22, desk() ? 74 : 60));
  if (Math.abs(fh2 - FH) > 1) { FH = fh2; buildLetters(); for (let n = 0; n < 6 && letters.tooClose; n++) { letters.shrink *= .9; buildLetters(); } }
  buildSpots();
  makeDog();
  computeTasks(); letters.t0 = null;
  Fs = [];
  wantedFigs().forEach(i => {
    const F = makeFig(i);
    let t = 0;
    do { F.x = FH * .4 + Math.random() * (W - FH * .8); F.g = top() + Math.random() * (bottom() - top()); } while ((!clearAt(-1, F.x, F.g, .3) || Fs.some(o => Math.hypot(o.x - F.x, o.g - F.g) < FH * .5)) && ++t < 60);
    F.surf = idAt(F.x, F.g); F.z0 = hOf(F.surf);
    F.a = Math.random() * Math.PI * 2; F.pause = Math.random() < .3 ? Math.random() * 2 : 0;
    Fs.push(F);
    return F;
  });
}
/* Anlehnen: Rücken an die Wand, ein Fuss angewinkelt an der Wand; manche rauchen */
const leanPt = (sp, d = .27) => ({ x: sp.E.x - sp.n.x * FH * d, g: sp.E.g - sp.n.v * FH * d * C });
function leanPose(F, dt, held){
  const L = F.lean; L.t += dt;
  if (held) L.dur = Math.min(L.dur, L.t + .6);
  let d = L.aT - L.a0; d = Math.atan2(Math.sin(d), Math.cos(d));
  F.a = L.a0 + d * ez(cl(L.t / .7));
  const b = ez(seg(L.t, .7, 1.5)) * (1 - ez(seg(L.t, L.dur - .7, L.dur)));
  /* erst mit Abstand umdrehen, dann einen kleinen Schritt zurück an die Wand */
  const p0 = leanPt(L.sp), p1 = leanPt(L.sp, .17); F.x = lerp(p0.x, p1.x, b); F.g = lerp(p0.g, p1.g, b);
  const P = walkPose(F, { stride: 0 });
  if (L.t < .7) { F.ph += dt * 5; const st = walkPose(F, { stride: .06 }); P.footL = st.footL; P.footR = st.footR; }
  for (const h of [P.handL, P.handR]) { h.r *= .6; h.f *= .3; }
  const mixP = (a, q) => { for (const k of ['r', 'f', 'z']) a[k] = lerp(a[k], q[k], b); };
  P.lean = lerp(P.lean, -.12, b); P.pelvis.f = lerp(P.pelvis.f || 0, .04, b); P.pelvis.z -= .012 * b;
  mixP(P.footL, { r: .085, f: .07, z: 0 }); mixP(P.footR, { r: -.055, f: -.1, z: .2 }); P.footR.toe = 0;
  const cyc = (L.t % 5.5) / 5.5, toMouth = L.smoke ? ez(seg(cyc, .08, .2)) * (1 - ez(seg(cyc, .38, .5))) : 0;
  if (L.smoke) { mixP(P.handL, { r: -.03, f: .07, z: .55 }); mixP(P.handR, { r: lerp(-.12, -.02, toMouth), f: lerp(.08, .11, toMouth), z: lerp(.5, .87, toMouth) }); }
  else { mixP(P.handL, { r: .12, f: .0, z: .43 }); mixP(P.handR, { r: -.12, f: .0, z: .43 }); }
  P.yaw = Math.sin(L.t * .5) * .1 * b;
  L.b = b; L.mouth = toMouth; L.cyc = cyc;
  if (L.t >= L.dur) { F.lean = null; F.pause = 0; F.sp = 0; F.vs = 0; F.escT = 0; F.stillT = 0; }
  return P;
}
const SMOKE = [];
/* ---------- Beagle: schnüffelt, läuft herum, macht ab und zu einen Haufen ---------- */
let DOG = null, POOPS = [];
function makeDog(){
  let x = W / 2, g = (top() + bottom()) / 2;
  for (let t = 0; t < 200; t++) { const x2 = FH + Math.random() * (W - 2 * FH), g2 = top() + Math.random() * (bottom() - top()); if (clearAt(-1, x2, g2, .3)) { x = x2; g = g2; break; } }
  DOG = { x, g, a: Math.random() * 6.28, sp: 0, ph: 0, mode: 'walk', t: 3, lastPoop: -15, sniff: 0, squat: 0 };
  POOPS = [];
}
function dogStep(dt){
  const D = DOG; if (!D) return;
  D.t -= dt; D.ph += dt * (2 + D.sp * 14);
  /* eine Figur in der Nähe streichelt den Hund */
  if (D.mode === 'pet' && (!D.petF || !D.petF.pet)) { D.mode = 'walk'; D.t = 2; D.petF = null; }
  if (D.mode === 'stay' && (!D.petF || !D.petF.trick)) { D.mode = 'walk'; D.t = 2; D.petF = null; }
  const petOk = F => !F.santa && !F.push && !F.reveal && F.surf < 0 && !F.act && !F.lean && !F.sit && !F.drag && !F.fetch && !F.pickUp && !F.pet && !F.trick && !F.leave && !(F.enter > 0) && !F.flyHide && F.i !== sel && clock > (F.petCool || 0);
  const dist = F => Math.hypot(F.x - D.x, (F.g - D.g) / C);
  if (D.mode === 'visit' && (!D.vF || !petOk(D.vF) || D.t <= 0)) { D.mode = 'walk'; D.t = 2; D.vF = null; }
  if (D.mode === 'visit' && dist(D.vF) < FH * 1.4) { D.vF.goal = null; D.vF.goalStage = 0; D.vF.pause = Math.max(D.vF.pause || 0, .5); }
  if ((D.mode === 'walk' || D.mode === 'sniff' || D.mode === 'visit') && Math.random() < dt * (D.mode === 'visit' ? 8 : .5)) {
    const F = D.mode === 'visit' ? (dist(D.vF) < FH * .62 && Math.abs(D.vF.g - D.g) / C < FH * .2 ? D.vF : null) : Fs.find(F => petOk(F) && !F.goal && dist(F) < FH * .62 && Math.abs(F.x - D.x) > FH * .35 && Math.abs(F.g - D.g) / C < FH * .2);
    if (F) { D.vF = null; const dur = 2.4 + Math.random() * 1.6; F.pet = { t: 0, dur }; F.goal = null; F.goalStage = 0; D.mode = 'pet'; D.t = dur; D.petF = F; }
  }
  if (D.t <= 0 && D.mode !== 'stay' && D.mode !== 'chase') {
    const r = Math.random();
    if (D.mode !== 'poop' && clock - D.lastPoop > 25 && POOPS.length < 2 && r < .3) { D.mode = 'poop'; D.t = 2.6; }
    else if (D.mode === 'walk' && r < .5 && clock - (D.lastVisit || -30) > 14) {
      /* zu einer Figur laufen, damit sie ihn streichelt */
      let best = null, bd = FH * 8; for (const F of Fs) if (petOk(F) && dist(F) < bd) { bd = dist(F); best = F; }
      if (best) { D.mode = 'visit'; D.vF = best; D.vS = D.x < best.x ? -1 : 1; D.t = 9; D.lastVisit = clock; } else { D.mode = 'walk'; D.t = 2.5 + Math.random() * 4; }
    }
    else if (D.mode === 'walk' && r < .75) { D.mode = 'sniff'; D.t = 1.5 + Math.random() * 2.5; }
    else { D.mode = 'walk'; D.t = 2.5 + Math.random() * 4; }
  }
  const free = a2 => { for (const L of [.15, .3, .45]) if (!clearAt(-1, D.x + Math.cos(a2) * L * FH, D.g + Math.sin(a2) * L * FH * C, .22)) return false; return true; };
  let want = 0;
  const out = D.x < FH || D.x > W - FH || D.g < top() || D.g > fbot();
  /* Mellow läuft der Figur entgegen, damit sich beide rechtzeitig treffen */
  const pd = D.mode === 'stay' && D.petF ? Math.hypot(D.petF.x - D.x, (D.petF.g - D.g) / C) / FH : 0, far = pd > .9;
  if (D.mode === 'chase' && !CAT) { D.mode = 'walk'; D.t = 2; }
  if (D.mode === 'walk' || D.mode === 'visit' || D.mode === 'chase' || (D.mode === 'stay' && (out || far))) {
    want = D.mode === 'visit' ? .65 : D.mode === 'stay' ? (out ? 1 : cl((pd - .5) / 2 / Math.max(.3, PET_RUN - (D.petF.trick ? D.petF.trick.t : 0)) * 1.25, .4, 6)) : .5;
    /* beim Besuch seitlich neben die Figur, damit man das Streicheln sieht */
    const vx = D.mode === 'visit' ? D.vF.x + D.vS * FH * .5 : 0, vg = D.mode === 'visit' ? D.vF.g : 0, vd = D.mode === 'visit' ? Math.hypot(vx - D.x, (vg - D.g) / C) : 0;
    if (D.mode === 'chase') want = 1.9;
    let desired = D.mode === 'chase' ? Math.atan2((CAT.g - D.g) / C, CAT.x - D.x) : D.mode === 'stay' ? (out ? Math.atan2((Hh / 2 - D.g) / C, W / 2 - D.x) : Math.atan2((D.petF.g - D.g) / C, D.petF.x - D.x)) : D.mode === 'visit' ? (vd < FH * .12 ? Math.atan2(0, -D.vS) : Math.atan2((vg - D.g) / C, vx - D.x)) : D.a + (Math.sin(clock * .7 + 1) * 1.2 + Math.sin(clock * 1.9) * .6) * dt;
    if (D.mode === 'visit') want = cl(vd / (FH * .4)) * .65;
    if (D.x < FH || D.x > W - FH || D.g < top() || D.g > fbot()) desired = Math.atan2((Hh / 2 - D.g) / C, W / 2 - D.x);
    for (const F of Fs) { if (F.surf >= 0 || F.drag || F === D.vF) continue; const dx = F.x - D.x, dg = (F.g - D.g) / C, d = Math.hypot(dx, dg);
      if (d < FH * .5) desired -= Math.sign(Math.sin(Math.atan2(dg, dx) - D.a) || 1) * 2 * dt * (1 - d / (FH * .5)); }
    let pick = null; for (const da of [0, .4, -.4, .8, -.8, 1.3, -1.3, 2, -2, Math.PI]) if (free(desired + da)) { pick = desired + da; break; }
    if (pick === null) { want = 0; D.a += 2 * dt; } else { let d = pick - D.a; d = Math.atan2(Math.sin(d), Math.cos(d)); D.a += Math.sign(d) * Math.min(Math.abs(d), 3 * dt); if (Math.abs(d) > 1) want *= .3; }
  }
  D.sp = lerp(D.sp, want, Math.min(1, dt * (D.mode === 'stay' ? 9 : 4)));
  const nx = D.x + Math.cos(D.a) * D.sp * FH * dt, ng = D.g + Math.sin(D.a) * D.sp * FH * dt * C;
  /* nie in eine Figur hineinlaufen */
  const tooNear = Fs.some(F => F.surf < 0 && !F.drag && Math.hypot(F.x - nx, (F.g - ng) / C) < FH * (F === D.vF ? .42 : .32) && Math.hypot(F.x - nx, (F.g - ng) / C) < Math.hypot(F.x - D.x, (F.g - D.g) / C));
  if (D.sp > .01 && !tooNear && clearAt(-1, nx, ng, .15)) { D.x = nx; D.g = ng; } else if (tooNear) D.a += 2.5 * dt;
  if ((D.mode === 'pet' || (D.mode === 'stay' && !out)) && D.petF) { let d = Math.atan2((D.petF.g - D.g) / C, D.petF.x - D.x) - D.a; d = Math.atan2(Math.sin(d), Math.cos(d)); D.a += Math.sign(d) * Math.min(Math.abs(d), 3 * dt); }
  D.sniff = lerp(D.sniff, D.mode === 'sniff' ? 1 : D.mode === 'walk' || D.mode === 'visit' ? .25 : 0, Math.min(1, dt * 4));
  D.squat = lerp(D.squat, D.mode === 'poop' && D.t > .5 ? 1 : 0, Math.min(1, dt * 5));
  if (D.mode === 'poop' && D.t < 1.2 && !D.dropped) { D.dropped = true; D.lastPoop = clock;
    POOPS.push({ x: D.x - Math.cos(D.a) * FH * .32, g: D.g - Math.sin(D.a) * FH * .32 * C, born: clock, who: null }); }
  if (D.mode !== 'poop') D.dropped = false;
}
/* ---------- Katze: beim Laden, wenn jemand die Seite öffnet und alle 30 Sekunden; Mellow jagt sie ein paar Sekunden ---------- */
let CAT = null, catAt = -1e9, catWant = -1, catSlot = null;
/* Wunsch merken: die Katze kommt, sobald Mellow frei ist (bis zu 6 Sekunden später) */
function wantCat(){ catWant = clock + 6; }
function spawnCat(){
  const D = DOG; if (!D || CAT || (view !== 'pick' && view !== 'lobby') || clock - catAt < 10 || !['walk', 'sniff', 'visit'].includes(D.mode)) return;
  let spot = null;
  for (let t = 0; t < 60 && !spot; t++) { const a = Math.random() * 6.283, r = FH * (2.5 + Math.random() * 2.5), x = D.x + Math.cos(a) * r, g = D.g + Math.sin(a) * r * C;
    if (x > FH && x < W - FH && g > top() && g < fbot() && clearAt(-1, x, g, .3)) spot = { x, g }; }
  if (!spot) return;
  catAt = clock;
  CAT = { ...spot, a: Math.atan2((spot.g - D.g) / C, spot.x - D.x), sp: 0, ph: 0, t: 0, life: 5.2 };
  POPS.push({ x: spot.x, y: spot.g - FH * .2, r: FH * .3, t: 0 });
  if (D.vF) D.vF = null; D.mode = 'chase'; D.t = CAT.life + .5;
}
function catStep(dt){
  /* alle 30 Sekunden, auf allen Geräten zur gleichen Zeit */
  const now = srvNow(), k = Math.floor(now / 30000), t0 = k * 30000 + 12000 + hh(k, 77) * 8000;
  if (catSlot !== k && now >= t0 && now < t0 + 2000) { catSlot = k; wantCat(); }
  if (!CAT && clock < catWant) { spawnCat(); if (CAT) catWant = -1; }
  const K = CAT; if (!K) return;
  K.t += dt; K.ph += dt * (4 + K.sp * 16);
  const D = DOG;
  if (K.t > K.life || !D) { POPS.push({ x: K.x, y: K.g - FH * .2, r: FH * .3, t: 0 }); CAT = null; if (D && D.mode === 'chase') { D.mode = 'sniff'; D.t = 1.5; } return; }
  /* weg vom Hund, Hindernissen ausweichen, im Bild bleiben */
  const free = a2 => { for (const L of [.15, .3, .5]) if (!clearAt(-1, K.x + Math.cos(a2) * L * FH, K.g + Math.sin(a2) * L * FH * C, .2)) return false; return true; };
  let desired = Math.atan2((K.g - D.g) / C, K.x - D.x) + Math.sin(K.t * 2.3) * .6;
  const edge = K.x < FH * 1.2 || K.x > W - FH * 1.2 || K.g < top() + FH * .3 || K.g > fbot() - FH * .3;
  if (edge) desired = Math.atan2((Hh / 2 - K.g) / C, W / 2 - K.x) + Math.sin(K.t * 3) * .9;
  let pick = null; for (const da of [0, .4, -.4, .8, -.8, 1.3, -1.3, 1.9, -1.9, 2.6, -2.6]) if (free(desired + da)) { pick = desired + da; break; }
  if (pick !== null) { let d = pick - K.a; d = Math.atan2(Math.sin(d), Math.cos(d)); K.a += Math.sign(d) * Math.min(Math.abs(d), 7 * dt); }
  K.sp = lerp(K.sp, pick === null ? 0 : 2.3, Math.min(1, dt * 6));
  const nx = K.x + Math.cos(K.a) * K.sp * FH * dt, ng = K.g + Math.sin(K.a) * K.sp * FH * dt * C;
  if (clearAt(-1, nx, ng, .12)) { K.x = nx; K.g = ng; }
}
function catTo3D(){
  const K = CAT; if (!K) return;
  const R = FH * 1.15, fw = v3(Math.cos(K.a), Math.sin(K.a), 0), rt = v3(-Math.sin(K.a), Math.cos(K.a), 0), up = v3(0, 0, 1);
  const L = (f, r, z) => add(add(mul(fw, f * R), mul(rt, r * R)), mul(up, z * R));
  const w = p => toW({ x: K.x, g: K.g }, { z: 0 }, p), q = new THREE.Quaternion().setFromAxisAngle(_y, -K.a), P = GL.parts.k;
  const bz = .2 + Math.sin(K.ph * 2) * .012, st = Math.sin(K.ph * .5) * .05;
  addEll(P, w(L(0, 0, bz)), q, .17 * R, .055 * R, .06 * R);
  const head = L(.19, 0, bz + .08); addSph(P, w(head), .055 * R);
  for (const sd of [1, -1]) addCyl(P, w(add(head, L(.0, sd * .03, .03))), w(add(head, L(-.01, sd * .035, .085))), .014 * R);
  for (const [f, r, off] of [[.11, .04, 0], [.11, -.04, Math.PI], [-.11, .04, Math.PI], [-.11, -.04, 0]]) {
    const sw = Math.sin(K.ph + off) * .07 * cl(K.sp / 1.2);
    addCyl(P, w(L(f, r, bz - .02)), w(L(f + sw, r, Math.max(0, Math.cos(K.ph + off)) * .025)), .018 * R);
  }
  /* Schwanz: hoch geschwungen */
  const t1 = L(-.16, 0, bz + .02), t2 = L(-.26, st, bz + .12), t3 = L(-.24, st * 1.5, bz + .24);
  addCyl(P, w(t1), w(t2), .016 * R); addCyl(P, w(t2), w(t3), .014 * R);
}
function addEll(P, c, q, sx, sy, sz){ _s.set(sx, sy, sz); _m.compose(c, q, _s); P.sp.setMatrixAt(P.ns++, _m); }
function dogTo3D(){
  const D = DOG; if (!D) return;
  const R = FH * 1.3, fw = v3(Math.cos(D.a), Math.sin(D.a), 0), rt = v3(-Math.sin(D.a), Math.cos(D.a), 0), up = v3(0, 0, 1);
  const L = (f, r, z) => add(add(mul(fw, f * R), mul(rt, r * R)), mul(up, z * R));
  const w = p => toW({ x: D.x, g: D.g }, { z: 0 }, p), q = new THREE.Quaternion().setFromAxisAngle(_y, -D.a);
  const Wt = GL.parts.k, K = GL.parts.k, mv = cl(D.sp / .3), sq = D.squat, sn = D.sniff;
  const nod = Math.sin(clock * 9) * .012 * sn;
  /* Rumpf, Sattel, Brust */
  const bz = .24 - sq * .05;
  addEll(Wt, w(L(0, 0, bz + .01 * Math.sin(D.ph * 2) * mv)), q, .23 * R, .1 * R, .1 * R);
  addEll(K, w(L(-.02, 0, bz + .055)), q, .14 * R, .06 * R, .095 * R);
  /* Kopf und Schnauze: beim Schnüffeln tief am Boden */
  const head = L(.25 + sn * .04, 0, .36 - sn * .22 + nod);
  addSph(Wt, w(head), .075 * R);
  const nose = add(head, L(.09, 0, -.03 - sn * .03));
  addCyl(Wt, w(head), w(nose), .038 * R); addSph(K, w(nose), .022 * R);
  for (const sd of [1, -1]) addEll(K, w(add(head, L(-.01, sd * .065, -.05))), q, .035 * R, .075 * R, .022 * R);
  /* Beine im Trab, hinten beim Hinsetzen eingeknickt */
  for (const [f, r, off, back] of [[.15, .065, 0, 0], [.15, -.065, Math.PI, 0], [-.15, .065, Math.PI, 1], [-.15, -.065, 0, 1]]) {
    const hip = L(f, r, bz - .03 - (back ? sq * .06 : 0)), sw = Math.sin(D.ph + off) * .06 * mv, lift = Math.max(0, Math.cos(D.ph + off)) * .03 * mv;
    const foot = L(f + sw + (back ? sq * .06 : 0), r, lift);
    addCyl(Wt, w(hip), w(foot), .028 * R);
  }
  /* Schwanz: wedelt, beim Haufen hoch */
  const tb = L(-.22, 0, bz + .05), wag = Math.sin(clock * (D.mode === 'pet' ? 22 : sn > .5 ? 16 : 10)) * (D.mode === 'pet' ? .08 : .05);
  addCyl(Wt, w(tb), w(add(tb, L(-.06 - sq * .02, wag, .13 + sq * .04))), .022 * R);
}
/* ---------- Das Geschenk: wird bis zum Anmeldeschluss an seinen Platz geschoben, am Tag selbst geöffnet ---------- */
const BOX_START = Date.parse('2026-11-25T00:00:00+01:00');
const boxProg = () => cl((srvNow() - BOX_START) / Math.max(1, DEADLINE - BOX_START));
const BOX = { anim: null, shake: 0, open: false };
function layoutBox(L, fs, x0, x1, P){
  L.box = null; if (P <= 0) return;
  const last = L.G.filter(g => !g.info).slice(-4);
  const bw = fs * (mobile() ? 1.45 : 1.25), bd = bw * .62, bh = bw * .78, lh = bh * .17, ov = bw * .075;
  const ex = mobile() ? W / 2 : x0 + (x1 - x0) * .81, gy = mobile() ? top() + (bottom() - top()) * .87 : last.reduce((a, g) => a + g.gy, 0) / last.length + FH * .3;
  /* kommt von ausserhalb des Bildes herein, auf einer Bahn ohne Buchstaben */
  const out = bw / 2 + ov + 4, sx = mobile() ? -out : W + out, x = lerp(sx, ex, P);
  L.box = { x, gy, w: bw, d: bd, h: bh, lh, ov, dir: Math.sign(ex - sx) || 1, done: P >= 1 };
  /* Grundfläche als Hindernis eintragen */
  const hw = bw / 2 + ov + FH * .02, hd = (bd / 2 + ov) * C + FH * .02;
  for (let y = Math.max(0, Math.floor(gy - hd)); y < Math.min(Hh, Math.ceil(gy + hd)); y++)
    for (let X = Math.max(0, Math.floor(x - hw)); X < Math.min(W, Math.ceil(x + hw)); X++) L.ids[y * W + X] = 255;
}
/* Info: flache weisse Scheibe, das i obenauf in Pink */
function infoDisc(g, fs){
  const r = fs * .3, grp = new THREE.Group();
  const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, g.H, 56), GL.mat[0]); d.position.y = g.H / 2; grp.add(d);
  const fi = r * 1.3 / (GLYPHS.i.h / 100), ig = new THREE.ShapeGeometry(glyphShapes('i', fi), 10); ig.rotateX(-Math.PI / 2); ig.translate(0, g.H + .4, 0);
  const im = new THREE.Mesh(ig, GL.mat[2]); grp.add(im); GL.passB.push(im);
  grp.position.set(g.x - W / 2, 0, (g.gy - Hh / 2) / C); GL.scene.add(grp); return grp;
}
function textTex(txt, weight){
  const cvs = document.createElement('canvas'); cvs.width = 1024; cvs.height = 320; const x = cvs.getContext('2d');
  x.font = `${weight} 210px Jost, Futura, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#000'; x.fillText(txt, 512, 172);
  const t = new THREE.CanvasTexture(cvs); t.minFilter = THREE.LinearFilter; return t;
}
function boxMesh(B){
  const { w: bw, d: bd, h: bh, lh, ov } = B, grp = new THREE.Group(), lid = new THREE.Group(), bow = new THREE.Group();
  const add3 = (par, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); par.add(m); return m; };
  const bodyH = bh - lh * .6;
  add3(grp, new THREE.BoxGeometry(bw, bodyH, bd), GL.mat[0], 0, bodyH / 2, 0);
  /* "Draw!" vorne auf der Kiste: nur im zweiten Durchgang, damit es keine Kontur bekommt */
  const tp = add3(grp, new THREE.PlaneGeometry(bw * .86, bw * .86 * 320 / 1024), GL.textMat(textTex('Draw!', 500), 1), 0, bodyH * .44, bd / 2 + .6); GL.passB.push(tp);
  /* Deckel mit klarer Unterkante */
  add3(lid, new THREE.BoxGeometry(bw + ov * 2, lh, bd + ov * 2), GL.mat[0], 0, lh / 2, 0);
  const lw = Math.max(1.6, FH * .022);
  add3(lid, new THREE.BoxGeometry(bw + ov * 2 + lw, lw, lw), GL.mat[1], 0, 0, bd / 2 + ov);
  for (const sd of [1, -1]) add3(lid, new THREE.BoxGeometry(lw, lw, bd + ov * 2 + lw), GL.mat[1], sd * (bw / 2 + ov), 0, 0);
  /* Masche */
  const R = bw * .17, zf = bd / 2 + ov, pinkO = GL.matPinkO;
  for (const sd of [1, -1]) {
    const t = add3(bow, new THREE.TorusGeometry(R, R * .26, 16, 40), pinkO, sd * R * 1.02, R * .62, -R * .15); t.scale.set(1, .78, 1); t.rotation.set(-.35, sd * .35, sd * .38);
    const ax = sd * R * .25, bx = sd * R * 1.15, len = Math.hypot(bx - ax, zf);
    const fl = add3(bow, new THREE.BoxGeometry(R * .42, R * .07, len), pinkO, (ax + bx) / 2, R * .04, zf / 2); fl.rotation.y = Math.atan2(bx - ax, zf);
    const hg = add3(bow, new THREE.BoxGeometry(R * .42, lh * 1.7, R * .07), pinkO, bx, -lh * .8 + lh, zf + R * .04); hg.rotation.z = -sd * .12;
  }
  add3(bow, new THREE.BoxGeometry(R * .62, R * .5, R * .5), pinkO, 0, R * .5, 0).rotation.z = .08;
  bow.position.y = lh; lid.add(bow);
  /* offene Kiste: Rand der Öffnung oben */
  const rim = new THREE.Group(), wt = bw * .06, lw2 = Math.max(1.4, FH * .02);
  for (const [w2, d2, x, z] of [[bw - wt * 2, lw2, 0, bd / 2 - wt], [bw - wt * 2, lw2, 0, -bd / 2 + wt], [lw2, bd - wt * 2, bw / 2 - wt, 0], [lw2, bd - wt * 2, -bw / 2 + wt, 0]])
    add3(rim, new THREE.BoxGeometry(w2, lw2, d2), GL.mat[1], x, bodyH + .3, z);
  rim.visible = false; grp.add(rim); B.rim = rim;
  lid.position.y = bh - lh; grp.add(lid);
  grp.position.set(B.x - W / 2, 0, (B.gy - Hh / 2) / C);
  B.grp = grp; B.lid = lid; B.bow = bow; B.bodyH = bodyH;
  GL.scene.add(grp);
  if (BOX.open) setBoxOpen(B, 1);
  return grp;
}
/* offen: Masche weg, Deckel liegt neben der Kiste */
function setBoxOpen(B, k){
  const { w: bw, d: bd, h: bh, lh } = B, side = B.dir > 0 ? 1 : -1;
  B.bow.visible = k < .35; B.bow.scale.setScalar(Math.max(.001, 1 - k / .35));
  const q = ez(cl((k - .3) / .7)), arc = Math.sin(q * Math.PI);
  /* Deckel fliegt hoch und landet flach neben der Kiste, leicht schräg */
  B.lid.position.set(lerp(0, side * (bw + B.ov * 2 + FH * .25), q), lerp(bh - lh, 0, q) + arc * bh * 1.1, lerp(0, bd * .2, q));
  B.lid.rotation.set(-arc * .5, lerp(0, side * .35, q), -side * Math.sin(q * Math.PI) * .9);
  B.rim.visible = k > .45;
}
const boxScreen = () => { const B = letters.box; if (!B) return null;
  const hw = B.w / 2 + B.ov, hd = B.d / 2 + B.ov, top_ = sy(B.gy, -hd, B.h + B.w * .3), bot = sy(B.gy, hd, 0);
  return { x0: B.x - hw - 6, x1: B.x + hw + 6, y0: top_ - 6, y1: bot + 6 }; };
const onBox = (x, y) => { const b = boxScreen(); return !!b && (view === 'pick' || view === 'lobby') && x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1; };
function boxStep(dt){
  const B = letters.box; if (!B || !B.grp) return;
  /* antippen vor dem Tag: kurz wackeln */
  if (BOX.shake > 0) { BOX.shake -= dt; const k = BOX.shake / .55; B.grp.rotation.z = Math.sin(BOX.shake * 38) * .045 * k; B.grp.rotation.y = Math.sin(BOX.shake * 29) * .03 * k; }
  else B.grp.rotation.set(0, 0, 0);
  /* ziehende Figuren bis zum Anmeldeschluss */
  const A = BOX.anim; if (!A) return;
  A.t += dt;
  if (A.t < .55) { BOX.shake = Math.max(BOX.shake, .05); B.grp.rotation.z = Math.sin(A.t * 40) * .05; }
  if (A.t >= .55 && !A.popped) { A.popped = true; const s0 = sy(B.gy, 0, B.h + B.w * .12); POPS.push({ x: B.x, y: s0, r: B.w * .2, t: 0 }); }
  setBoxOpen(B, cl((A.t - .55) / 1.1));
  /* das Geschenk für dich springt heraus und winkt */
  const F = fig(A.target);
  if (F && A.t >= 1.1) {
    if (!F.reveal) { F.reveal = { t: 0 }; F.drag = null; F.act = null; F.lean = null; F.sit = null; F.fetch = null; F.pickUp = null; F.pet = null; endTrick(F); F.push = null;
      F.x = B.x; F.g = B.gy; F.surf = -1; F.z0 = 0; F.a = Math.PI / 2; F.sw = null; F.dropZ = 0; }
    const t = A.t - 1.1, top_ = B.bodyH / FH, j = ez(cl(t / .55));
    /* springt aus der Kiste hoch und bleibt halb drin stehen */
    const rest = top_ - .28;
    F.hop = t < .55 ? lerp(-1.1, top_ + .6, j) : t < 1 ? lerp(top_ + .6, rest, ez((t - .55) / .45)) : rest;
  }
  if (A.t > 3.6 && !A.done) { A.done = true; BOX.open = true; S.draws[S.me] = A.target; busy = false; showResult(); }
}
/* nach dem Ergebnis steht die Figur wieder neben der Kiste */
function releaseReveal(){ for (const F of Fs) if (F.reveal) { const B = letters.box; F.reveal = null; F.hop = 0; if (B) { F.x = cl(B.x + (B.w / 2 + B.ov + FH * .35) * (B.dir > 0 ? 1 : -1), FH * .5, W - FH * .5); F.g = B.gy; } } }
/* Arbeitsplätze bis zum Anmeldeschluss: Buchstaben schieben, dann das Geschenk am Seil ziehen und schieben */
function computeTasks(){
  const L = letters, T = [], free = (x, g) => x > FH * .5 && x < W - FH * .5 && g > top() && g < fbot() && idAt(x, g) === -1 && clearAt(-1, x, g, .18);
  const near = (x, g) => T.some(t => Math.hypot(t.x - x, (t.g - g) / C) < FH * .4);
  if (L.PL < 1 && !L.box) {
    /* Desktop: 2026 rückt nach links, also von rechts schieben; Handy: alles rückt nach oben, also von vorne */
    const mv = mobile() ? L.G : L.G.filter(g => /[0-9]/.test(g.ch) || g.info);
    const dx = mobile() ? 0 : 1, dg = mobile() ? 1 : 0, a = mobile() ? -Math.PI / 2 : Math.PI;
    mv.filter((g, i) => i % 2 === 0 || mv.length < 5).slice(0, 5).forEach(g => {
      for (let d = FH * .2; d < FH * 3; d += 2) { const x = g.x + dx * d, gg = g.gy + dg * d * C;
        if (idAt(x, gg) === -1 && clearAt(-1, x, gg, .18)) { const x2 = x + dx * FH * .06, g2 = gg + dg * FH * .06 * C; if (free(x2, g2) && !near(x2, g2)) { let e = FH * 2; for (const o of [-.14, 0, .14]) { let e2 = 0; const ox = dg * o * FH, og = dx * o * FH * C; while (e2 < e && idAt(x2 + ox - dx * e2, g2 + og - dg * e2 * C) === -1) e2 += 1; e = Math.min(e, e2); } T.push({ x: x2, g: g2, a, kind: 'push', reach: e / FH }); } break; } }
    });
  }
  const B = L.box;
  if (B && !B.done) {
    const dir = B.dir, front = B.x + dir * (B.w / 2 + B.ov), face = dir > 0 ? Math.PI : 0;
    /* fünf ziehen am Seil, vor der Kiste in einer Reihe */
    for (let i = 0; i < 5; i++) { const x = front + dir * FH * (.55 + i * .46), g = B.gy + (i % 2 ? .07 : -.07) * FH * C; if (free(x, g) && !near(x, g)) T.push({ x, g, a: face, kind: 'pull', i }); }
    /* in den letzten Minuten helfen weitere hinten mit schieben */
    for (const k of [-1, 0, 1]) { const x = B.x - dir * (B.w / 2 + B.ov + FH * .36), g = B.gy + k * Math.max(B.d * .3 * C, FH * .24); if (free(x, g) && !near(x, g)) T.push({ x, g, a: dir > 0 ? 0 : Math.PI, kind: 'push', reach: .42, late: true }); }
  }
  L.tasks = T;
}
/* Schichten: niemand arbeitet ununterbrochen. Am Seil wird immer gezogen, nur mit wechselnden Figuren;
   an den Buchstaben wird ab und zu geschoben; hinter der Kiste erst in den letzten Minuten */
const rnd2 = (a, b) => a + Math.random() * (b - a);
function managePushers(){
  const T = letters.tasks || [], want = isOpen() && view !== 'result';
  for (const F of Fs) if (F.push && (!want || F.drag || F.leave || F.trick || F.reveal)) F.push = null;
  if (!want) return;
  const first = letters.t0 == null; if (first) letters.t0 = clock;
  const late = DEADLINE - srvNow() < 5 * 60e3;
  T.forEach((t, k) => {
    const pull = t.kind === 'pull', W0 = Fs.find(F => F.push && F.push.k === k);
    if (t.late && !late) { if (W0) W0.push = null; return; }
    if (first) { t.next = pull || t.late || Math.random() < .5 ? 0 : clock + rnd2(3, 20); }
    if (W0) { if (clock > t.until) { W0.push = null; W0.rest = clock + rnd2(20, 45); t.next = clock + (pull || t.late ? rnd2(.5, 2) : rnd2(8, 30)); } return; }
    if (clock < (t.next || 0)) return;
    let best = null, bd = 1e9;
    for (const F of Fs) { if (F.push || clock < (F.rest || 0) || F.santa || F.reveal || S.claims[F.i] != null || F.i === sel || F.surf >= 0 || F.act || F.lean || F.sit || F.drag || F.fetch || F.pickUp || F.pet || F.trick || F.leave || F.enter > 0) continue;
      const d = Math.hypot(F.x - t.x, (F.g - t.g) / C); if (d < bd) { bd = d; best = F; } }
    if (!best) return;
    best.push = { k, ...t, on: false }; best.goal = null; best.goalStage = 0; best.pause = 0;
    t.until = clock + (pull ? rnd2(18, 35) : t.late ? 1e9 : rnd2(8, 18));
    /* beim Laden sind die ersten schon bei der Arbeit */
    if (first || clock - letters.t0 < 1.5) { best.x = t.x; best.g = t.g; best.push.on = true; best.surf = -1; best.z0 = 0; best.a = t.a; }
  });
}
function pushPose(F, dt){
  const K = F.push; turnTo(F, K.a, 6 * dt);
  if (K.kind === 'pull') {
    /* Seil ziehen: zurückgelehnt, kleine Schritte rückwärts an Ort */
    F.ph -= dt * 3.4;
    const P = walkPose(F, { stride: .1 }), tug = Math.sin(clock * 3.4 + K.i) * .03;
    P.lean = -.32 + tug; P.pelvis.f = .02; P.pelvis.z -= .05; P.yaw = 0;
    P.handL = { r: .05, f: .3, z: .5 }; P.handR = { r: -.05, f: .24, z: .48 };
    return P;
  }
  F.ph += dt * 4.2;
  const P = walkPose(F, { stride: .13 });
  P.lean = .5; P.pelvis.f = -.05; P.pelvis.z -= .04; P.yaw = 0;
  const bob = Math.sin(F.ph * 2) * .01;
  /* Hände genau an die Wand, nicht hinein */
  const f = cl((K.reach || .36) - .19, .06, .33);
  P.handL = { r: .1, f: f + bob, z: .62 }; P.handR = { r: -.1, f: f - bob, z: .62 };
  return P;
}
/* das Seil: von der Kiste durch die Hände der Ziehenden */
function ropeTo3D(){
  const B = letters.box; if (!B || B.done || !isOpen()) return;
  const pul = Fs.filter(F => F.push && F.push.on && F.push.kind === 'pull' && F.lastJ && F.base).sort((a, b) => a.push.i - b.push.i);
  if (!pul.length) return;
  const K = GL.parts.k, r = Math.max(1, FH * .012);
  let prev = new THREE.Vector3(B.x + B.dir * (B.w / 2 + B.ov) - W / 2, B.bodyH * .55, (B.gy - Hh / 2) / C);
  for (const F of pul) { const h = toW(F, F.base, F.lastJ.handL); addCyl(K, prev, h, r); prev = h; }
  const last = pul[pul.length - 1], tail = toW(last, last.base, add(last.lastJ.handL, mul(last.lastJ.fw, -.35 * FH)));
  tail.y = Math.max(.5, tail.y - FH * .25); addCyl(K, prev, tail, r);
}
function revealPose(F, dt){
  F.reveal.t += dt; F.a = Math.PI / 2;
  const P = walkPose(F, { stride: 0 }), w = Math.sin(clock * 12);
  P.handL = { r: .24, f: .05, z: 1.05 + w * .03 }; P.handR = { r: -.24, f: .05, z: 1.05 - w * .03 }; P.armsUp = true;
  return P;
}
/* Antippen: vor dem Tag ein Hinweis, am Tag geht die Kiste auf */
function tapBox(){
  const B = letters.box; if (!B) return;
  if (isOpen()) { BOX.shake = .55; boxNote('Not quite there yet.', 'You can open this box when the countdown is done.'); return; }
  if (S.me == null || !ID) { BOX.shake = .55; boxNote('This box is for everyone who signed up.', 'Already in? Tap your figure to find yourself again.'); return; }
  if (S.draws[S.me] != null) { showResult(); return; }
  if (busy || BOX.anim) return;
  busy = true;
  api('me', ID).then(m => {
    if (m.target == null) { busy = false; say('The draw is not ready yet. Try again in a moment.', true); return; }
    if (m.targetName) S.claims[m.target] = m.targetName;
    if (!fig(m.target)) syncFigs();
    if (RM) { S.draws[S.me] = m.target; BOX.open = true; setBoxOpen(B, 1); busy = false; showResult(); return; }
    BOX.anim = { t: 0, target: m.target };
  }).catch(err => { busy = false; say(err.message || NET, true); });
}
function boxNote(h, t){ $('boxNoteT').textContent = h; $('boxNoteD').textContent = t; if (!$('boxNote').open) { faqAt = performance.now(); $('boxNote').showModal(); } }

/* ---------- Santa: fliegt ab und zu mit Schlitten und Rentieren vorbei ----------
   Der Fahrplan hängt nur an der Serverzeit, darum sehen alle ihn im selben Moment.
   Mal wirft er Geschenke ab, mal holt er sie wieder. Antippen: er zerplatzt wie eine Seifenblase. */
const SLOT = 30000, FLY_MS = 9000;
const hh = (k, n) => { const v = Math.sin(k * 127.1 + n * 311.7) * 43758.5453; return v - Math.floor(v); };
const SANTA = { k: null, on: false, popped: {}, box: null, x: 0, y: 0 };
let GIFTS = [], POPS = [];
function santaFlight(k){
  return { k, kind: hh(k, 1) < .55 ? 'drop' : 'collect', t0: k * SLOT + 1500 + hh(k, 2) * (SLOT - FLY_MS - 3000), dir: hh(k, 3) < .5 ? 1 : -1, row: hh(k, 4) };
}
function santaStep(dt){
  const now = srvNow(), k = Math.floor(now / SLOT), f = santaFlight(k);
  SANTA.on = false; SANTA.box = null;
  if (SANTA.walker && !Fs.includes(SANTA.walker)) SANTA.walker = null;
  if (f && f.kind === 'collect' && now >= f.t0 && now < f.t0 + 15000 && !SANTA.popped[k] && !SANTA.walker && !(SANTA.walked && SANTA.walked[k]) && GIFTS.some(G => G.state === 'rest')) spawnWalker(k);
  if (SANTA.walker) { const F = SANTA.walker; walkerThink(F, dt); if (F.box && !F.leave) { SANTA.on = true; SANTA.k = F.k; SANTA.box = F.box; } }
  if (f && f.kind === 'drop' && now >= f.t0 && now < f.t0 + FLY_MS && !SANTA.popped[k]) {
    const u = (now - f.t0) / FLY_MS, R = FH * (desk() ? 1.9 : 1.6), span = W + R * 5;
    SANTA.k = k; SANTA.on = true; SANTA.f = f; SANTA.u = u; SANTA.R = R;
    SANTA.x = f.dir > 0 ? -R * 2.2 + span * u : W + R * 2.2 - span * u;
    /* in der oberen Bildhälfte, ganz vorne, damit nichts ihn verdeckt */
    const yScr = top() + FH * .3 + f.row * Math.max(0, fbot() - top() - FH * 1.1) + Math.sin(now / 420) * FH * .08;
    SANTA.g = Hh + FH * 2; SANTA.z = (SANTA.g - yScr) / HZ;
    santaTo3D();
    /* Geschenke fallen lassen */
    for (let i = 0; i < 4; i++) {
      const at = .18 + i * .19 + (hh(k, 10 + i) - .5) * .06, id = k * 10 + i;
      if (u >= at && !GIFTS.some(G => G.id === id) && !(SANTA.dropped || (SANTA.dropped = {}))[id] && GIFTS.length < 14) { SANTA.dropped[id] = true; dropGift(id, k, i); }
    }
  }
  for (const G of GIFTS) {
    if (G.state === 'fall') { G.vy += FH * 9 * dt; G.y += G.vy * dt; if (G.y >= G.landY) { G.y = G.landY; if (G.vy > FH * 2) G.vy = -G.vy * .3; else { G.vy = 0; G.state = 'rest'; } } }
  }
  GIFTS = GIFTS.filter(G => !G.gone);
}
/* nichts davor, das den Boden an dieser Stelle verdeckt (Buchstaben, Kiste) */
function inView(x, g){
  const B = letters.box;
  for (let g2 = g + 2; g2 < g + FH * 4; g2 += 2) {
    const id = idAt(x, g2); let h = 0;
    if (id >= 0) h = hOf(id); else if (id === -2 && B && Math.abs(x - B.x) < B.w / 2 + B.ov + FH * .1 && Math.abs(g2 - B.gy) < (B.d / 2 + B.ov) * C + FH * .1) h = B.h + B.w * .3;
    if (h && g2 - h * HZ < g) return false;
  }
  return true;
}
function dropGift(id, k, i){
  const f = SANTA.f, R = SANTA.R, y = SANTA.y + R * .1;
  /* Landeplatz nur auf freiem Boden, nie auf einem Buchstaben, sicher unterhalb des Schlittens */
  const x0 = SANTA.x - f.dir * R * .35, gMin = Math.max(top(), y + FH * .5), gMax = fbot() - FH * .1;
  if (gMin > gMax) return;
  let spot = null;
  for (let t = 0; t < 30 && !spot; t++) {
    const x = x0 + (t ? (hh(k, 40 + t) - .5) * FH * Math.min(3, t * .4) : 0), g = gMin + hh(k, 20 + i + t * 7) * (gMax - gMin);
    if (x > FH * .4 && x < W - FH * .4 && idAt(x, g) === -1 && clearAt(-1, x, g, .2) && inView(x, g)) spot = { x, g };
  }
  if (!spot) return;
  GIFTS.push({ id, gift: true, x: spot.x, g: spot.g, y, vy: -FH * .4, landY: spot.g, state: 'fall', spin: (hh(k, 30 + i) - .5) * .6 });
}
/* Santa zu Fuss: kommt vom Rand, sammelt jedes Geschenk einzeln auf und geht wieder */
function spawnWalker(k){
  const F = makeFig(0), side = hh(k, 5) < .5;
  F.i = -1; F.santa = true; F.k = k; F.look = { h: 1.07, build: 1.6 }; F.want = .85; F.born = srvNow();
  let g = top() + hh(k, 6) * (fbot() - top());
  for (let t = 0; t < 40 && !clearAt(-1, side ? FH * .6 : W - FH * .6, g); t++) g = top() + hh(k, 50 + t) * (fbot() - top());
  F.x = side ? -FH * .6 : W + FH * .6; F.g = g; F.a = side ? 0 : Math.PI; F.surf = -1; F.z0 = 0; F.enter = 1.2;
  Fs.push(F); SANTA.walker = F; (SANTA.walked = SANTA.walked || {})[k] = true;
}
function walkerThink(F, dt){
  if (F.leave || F.drag) return;
  F.age = (F.age || 0) + dt; if (F.age > 45) { F.leave = true; F.fetch = null; return; }
  if (F.enter > 0 || F.fetch || F.pickUp) return;
  let best = null, bd = 1e9; for (const G of GIFTS) if (G.state === 'rest' && !G.popped && !(F.skipPoop && F.skipPoop.has(G))) { const d = Math.hypot(G.x - F.x, (G.g - F.g) / C); if (d < bd) { bd = d; best = G; } }
  if (best) { F.fetch = best; F.fetchT = 0; F.goal = null; F.goalStage = 0; F.pause = 0; } else F.leave = true;
}
function santaTo3D(){
  const S2 = SANTA, R = S2.R, a = S2.f.dir > 0 ? 0 : Math.PI, fw = v3(Math.cos(a), Math.sin(a), 0), rt = v3(-Math.sin(a), Math.cos(a), 0), up = v3(0, 0, 1);
  const L = (f, r, z) => add(add(mul(fw, f * R), mul(rt, r * R)), mul(up, z * R));
  const w = p => toW({ x: S2.x, g: S2.g }, { z: S2.z }, p), q = new THREE.Quaternion().setFromAxisAngle(_y, -a);
  const K = GL.parts.k, Pk = GL.parts.p, cy = (A, B, r) => addCyl(K, w(L(...A)), w(L(...B)), r * R), line = (pts, r) => { for (let i = 1; i < pts.length; i++) cy(pts[i - 1], pts[i], r); };
  const t = srvNow() / 1000;
  /* Schlitten: Kufen, Streben, Kasten */
  for (const sd of [1, -1]) {
    const r = sd * .17;
    line([[-.42, r, 0], [.28, r, 0], [.4, r, .05], [.44, r, .15], [.39, r, .22]], .016);
    cy([-.25, r, 0], [-.25, r, .12], .014); cy([.15, r, 0], [.15, r, .12], .014);
    line([[-.4, r, .12], [.3, r, .12], [.25, r, .3], [-.4, r, .3], [-.4, r, .44]], .016);
    cy([-.4, r, .12], [-.4, r, .3], .016);
  }
  cy([-.4, .17, .44], [-.4, -.17, .44], .016); cy([.3, .17, .12], [.3, -.17, .12], .016); cy([.25, .17, .3], [.25, -.17, .3], .014);
  { const box = (fc, zc, lf, lz, lr) => { _s.set(lf * R, lz * R, lr * R); _m.compose(w(L(fc, 0, zc)), q, _s); GL.wbox.setMatrixAt(GL.wbox.count++, _m); };
    box(-.05, .21, .68, .17, .33); box(-.39, .37, .03, .14, .33); }
  /* Sack voller Geschenke */
  addSph(Pk, w(L(-.3, 0, .38)), .11 * R); addSph(Pk, w(L(-.27, .02, .48)), .06 * R);
  /* Santa: sitzend, runder Bauch, Mütze */
  const hip = [-.1, 0, .2], chest = [-.14, 0, .46], head = [-.15, 0, .6];
  cy(hip, chest, .03); addSph(K, w(L(...hip)), .035 * R); addSph(K, w(L(-.07, 0, .33)), .085 * R);
  addSph(K, w(L(...head)), .07 * R);
  addCyl(Pk, w(L(-.15, 0, .66)), w(L(-.24, 0, .77)), .045 * R); addSph(Pk, w(L(-.25, 0, .78)), .028 * R);
  const wave = Math.sin(t * 6) * .03;
  for (const sd of [1, -1]) {
    const h = [-.1, sd * .06, .2], kn = [.03, sd * .06, .25], ft = [.08, sd * .06, .13];
    line([h, kn, ft], .028); addSph(K, w(L(...kn)), .03 * R);
    const sh = [-.14, sd * .09, .45], el = [-.04, sd * .12, .38], hd = [.09, sd * .07, .4 + wave * sd];
    line([sh, el, hd], .026); addSph(K, w(L(...el)), .028 * R); addSph(K, w(L(...hd)), .026 * R);
  }
  /* zwei Rentiere im Galopp mit Geweih, an Leinen */
  const ph = t * 9;
  for (const [f0, o] of [[.95, 0], [1.55, 1.3]]) {
    const b = .3 + Math.sin(ph + o) * .015;
    addEll(K, w(L(f0, 0, b)), q, .2 * R, .07 * R, .075 * R);
    const nk = [f0 + .25, 0, b + .17];
    cy([f0 + .14, 0, b + .03], nk, .03); addSph(K, w(L(...nk)), .05 * R);
    cy(nk, [f0 + .33, 0, b + .14], .024);
    for (const sd of [1, -1]) {
      const a0 = [f0 + .23, sd * .03, b + .21], m = [f0 + .19, sd * .07, b + .31];
      line([a0, m, [f0 + .12, sd * .08, b + .37]], .011); cy(m, [f0 + .26, sd * .09, b + .36], .01);
      const s1 = Math.sin(ph + o) * .07, s2 = Math.sin(ph + o + 1.4) * .07;
      cy([f0 + .13, sd * .045, b - .03], [f0 + .26 + s1, sd * .045, b - .22], .02);
      cy([f0 - .13, sd * .045, b - .03], [f0 - .27 - s2, sd * .045, b - .2], .02);
    }
    cy([f0 - .2, 0, b + .03], [f0 - .27, 0, b + .09], .016);
  }
  /* Leinen von den Händen und der Deichsel */
  for (const sd of [1, -1]) cy([.09, sd * .07, .4], [.98, sd * .05, .38], .006);
  cy([.42, 0, .18], [.76, 0, .3], .012); cy([1.15, 0, .32], [1.36, 0, .3], .012);
  /* Trefferfläche und Mitte für das Zerplatzen */
  const xs = [-.5, 2.1].map(f => S2.x + fw.x * f * R), yTop = sy(S2.g, 0, S2.z + R * .85), yBot = sy(S2.g, 0, S2.z - R * .05);
  S2.y = sy(S2.g, 0, S2.z + R * .35);
  S2.box = { x0: Math.min(...xs) - R * .15, x1: Math.max(...xs) + R * .15, y0: yTop - R * .15, y1: yBot + R * .15 };
}
/* Geschenk antippen: die Infos öffnen sich */
const onGift = (x, y) => { const s = FH * .2; return GIFTS.some(G => !G.popped && Math.abs(x - G.x) < s * 1.3 && Math.abs(y - (G.y - s * .9)) < s * 1.4); };
const onSanta = (x, y) => { const b = SANTA.on && SANTA.box; return !!b && x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1; };
function popSanta(){
  if (!SANTA.on || SANTA.popped[SANTA.k]) return false;
  SANTA.popped[SANTA.k] = true;
  const b = SANTA.box;
  if (SANTA.walker) { const i = Fs.indexOf(SANTA.walker); if (i >= 0) Fs.splice(i, 1); SANTA.walker = null; } POPS.push({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, r: Math.max(b.x1 - b.x0, b.y1 - b.y0) * .45, t: 0 });
  /* und alle Geschenke gleich mit, kurz nacheinander */
  GIFTS.forEach((G, i) => POPS.push({ x: G.x, y: G.y - FH * .12, r: FH * .22, t: -.12 - i * .07, gift: G }));
  return true;
}
function giftsTo3D(){
  const s = FH * .25, q = new THREE.Quaternion(), e = new THREE.Euler(), add1 = (M, pos, sc) => { _s.set(sc[0], sc[1], sc[2]); _m.compose(pos, q, _s); M.setMatrixAt(M.count++, _m); };
  for (const G of GIFTS) {
    if (G.popped || G.gone) continue;
    /* Höhe über dem Landeplatz aus der Bildschirmhöhe; beim Fallen taumelt es */
    const z = Math.max(0, (G.landY - G.y) / HZ), tumble = G.state === 'fall' ? Math.sin(G.y * .03) * G.spin * 1.6 : 0;
    G.yaw = G.yaw ?? G.spin * 3;
    e.set(tumble, G.yaw, tumble * .6); q.setFromEuler(e);
    const base = new THREE.Vector3(G.x - W / 2, z, (G.g - Hh / 2) / C), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    add1(GL.gbox, base.clone().addScaledVector(up, s * .4), [s, s * .8, s]);
    add1(GL.gbox, base.clone().addScaledVector(up, s * .87), [s * 1.12, s * .2, s * 1.12]);
    const bq = q.clone(); for (const sd of [1, -1]) { const loop = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sd * .5)); q.copy(bq).multiply(loop);
      add1(GL.gbow, base.clone().addScaledVector(up, s * 1.08).add(new THREE.Vector3(sd * s * .17, 0, 0).applyQuaternion(bq)), [s * .15, s * .12, s * .15]); }
    q.copy(bq);
  }
  for (const M of [GL.gbox, GL.gbow]) M.instanceMatrix.needsUpdate = true;
}
/* Seifenblase: dünner Ring, der aufgeht und verblasst, dazu kleine Spritzer */
function drawPops(c, dt){
  for (const P of POPS) {
    P.t += dt; if (P.t < 0) continue;
    if (P.gift && !P.gift.popped) { P.gift.popped = true; P.gift.gone = true; }
    const q = cl(P.t / .45), e = 1 - Math.pow(1 - q, 3), rr = P.r * (.7 + .6 * e);
    c.globalAlpha = 1 - q;
    c.beginPath(); c.arc(P.x, P.y, rr, 0, 7); c.lineWidth = Math.max(.8, 2.2 * (1 - q)); c.strokeStyle = INK; c.stroke();
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + P.r, r1 = rr * 1.08, r2 = rr * (1.08 + .25 * (1 - q));
      c.beginPath(); c.moveTo(P.x + Math.cos(a) * r1, P.y + Math.sin(a) * r1); c.lineTo(P.x + Math.cos(a) * r2, P.y + Math.sin(a) * r2); c.strokeStyle = i % 2 ? PINK : INK; c.stroke(); }
    c.globalAlpha = 1;
  }
  POPS = POPS.filter(P => P.t < .45);
  GIFTS = GIFTS.filter(G => !G.gone);
}
function poopTo3D(){
  const P = GL.parts.p, R = FH;
  for (const p of POOPS) { const b = w0 => toW({ x: p.x, g: p.g }, { z: 0 }, w0);
    addSph(P, b(v3(0, 0, .03 * R)), .04 * R); addSph(P, b(v3(0, 0, .07 * R)), .03 * R); addSph(P, b(v3(.005 * R, 0, .1 * R)), .018 * R); }
}
/* den Haufen aufsammeln: die nächste freie Figur geht hin, bückt sich und hebt ihn auf */
function assignPoops(){
  for (const p of POOPS) {
    if (p.who && (!Fs.includes(p.who) || (p.who.fetch !== p && !(p.who.pickUp && p.who.pickUp.p === p)))) p.who = null;
    if (p.who || clock - p.born < 2.5) continue;
    const ok = F => !F.santa && !F.push && !F.reveal && F.surf < 0 && !F.act && !F.lean && !F.sit && !F.drag && !F.leave && !(F.enter > 0) && !F.fetch && !F.pickUp && !F.pet && !F.trick && !F.flyHide && F.i !== sel && !F.skipPoop?.has(p);
    const F = Fs.filter(ok).sort((a, b) => Math.hypot(a.x - p.x, a.g - p.g) - Math.hypot(b.x - p.x, b.g - p.g))[0];
    if (F) { p.who = F; F.fetch = p; F.fetchT = 0; F.goal = null; F.goalStage = 0; }
  }
}
/* ---------- Spielen mit der eigenen Figur ---------- */
const PET_RUN = 3.2, LEAD = .7;
const TRICKS = { twerk: 4.4, roll: 3.8, jump: 6 * .62 + .4, pet: PET_RUN + 3.6 };
const turnTo = (F, a, rate) => { let d = a - F.a; d = Math.atan2(Math.sin(d), Math.cos(d)); F.a += Math.sign(d) * Math.min(Math.abs(d), rate); };
function petSpot(F){ const T = F.trick, D = DOG; if (T.side == null) T.side = F.x < D.x ? -1 : 1; return { x: D.x + T.side * FH * .5, g: D.g }; }
function endTrick(F){ if (!F.trick) return; if (F.pet && F.pet.T === F.trick) F.pet = null; F.trick = null; F.hop = 0; F.vs = 0; F.sp = 0; }
/* Jede Aktion hat einen festen Startzeitpunkt in Serverzeit: so passiert sie auf allen Geräten gleichzeitig */
function startTrick(kind, F = fig(S.me), at = srvNow() + LEAD * 1000){
  if (!F || F.drag || F.leave || !Object.hasOwn(TRICKS, kind)) return false;
  if ((srvNow() - at) / 1000 > TRICKS[kind] - .3) return false;
  if (kind === 'pet' && !DOG) return false;
  endTrick(F);
  if (F.fetch) { F.fetch.who = null; F.fetch = null; }
  F.goal = null; F.goalStage = 0; F.escT = 0;
  /* was gerade läuft, rasch zu Ende bringen */
  if (F.lean) F.lean.dur = Math.min(F.lean.dur, F.lean.t + .5);
  if (F.sit) F.sit.dur = Math.min(F.sit.dur, F.sit.t + .6);
  if (F.pet) F.pet.dur = Math.min(F.pet.dur, F.pet.t + .4);
  if (F.pickUp) F.pickUp.fast = 3;
  if (F.act) F.act.fast = 3;
  F.trick = { kind, at, t: (srvNow() - at) / 1000, dur: TRICKS[kind], wait: true, p: 1 };
  if (kind === 'pet') { const D = DOG; if (D.petF && D.petF !== F && D.petF.trick) endTrick(D.petF); if (D.petF && D.petF.pet) D.petF.pet = null; D.mode = 'stay'; D.t = 30; D.petF = F; }
  return true;
}
/* vom Buchstaben auf den Boden daneben springen */
function dropDown(F){
  const h = hOf(F.surf); let best = null;
  for (let r = .35; r <= 3 && !best; r += .15) for (let k = 0; k < 24 && !best; k++) {
    const a = k / 24 * Math.PI * 2, x = F.x + Math.cos(a) * r * FH, g = F.g + Math.sin(a) * r * FH * C;
    if (clearAt(-1, x, g, .25) && x > FH * .4 && x < W - FH * .4 && g > top() && g < fbot()) best = { x, g };
  }
  if (!best) return false;
  F.x = best.x; F.g = best.g; F.surf = -1; F.z0 = 0; F.dropZ = (F.dropZ || 0) + h / FH; F.dropV = 0;
  F.spot = null; F.topGoal = null; F.topPath = null; F.sit = null; F.lean = null; F.topT = 0; F.sitDone = false;
  return true;
}
function trickTick(F, dt){
  const T = F.trick;
  T.t = (srvNow() - T.at) / 1000;
  if (T.wait) {
    F.pause = Math.max(F.pause || 0, .1);
    if (F.act) F.act.fast = 3;
    if (T.kind === 'pet' && F.surf >= 0 && !F.act) dropDown(F);
    if (T.t >= 0 && !F.act && !F.lean && !F.sit && !F.pickUp && !F.pet && !F.flyHide && (T.kind !== 'pet' || F.surf < 0)) {
      T.wait = false; F.pause = 0;
      if (T.kind === 'roll') {
        /* in die offenste Richtung rollen */
        let best = F.a, bn = -1;
        for (let k = 0; k < 16; k++) { const a2 = k * Math.PI / 8; let n = 0; for (let L = .25; L <= 2.6; L += .25) { const x = F.x + Math.cos(a2) * L * FH, g = F.g + Math.sin(a2) * L * FH * C; if (clearAt(F.surf, x, g, .2) && x > FH * .4 && x < W - FH * .4 && g > top() && g < fbot()) n++; else break; } if (n > bn + .5 * Math.abs(Math.sin(a2))) { bn = n; best = a2; } }
        T.a = best; T.room = bn * .25 * FH;
      }
    }
  }
  T.p = cl(1 - Math.max(0, T.t) / T.dur);
  if (T.kind === 'pet' && !T.wait && !T.petting && T.t >= PET_RUN && DOG) {
    /* jetzt streicheln, überall gleichzeitig; ist Mellow noch zu weit weg, springt er schnell hin */
    const D = DOG, p = petSpot(F);
    if (Math.hypot(p.x - F.x, (p.g - F.g) / C) > FH * .3) { const nx = F.x - T.side * FH * .5; if (clearAt(-1, nx, F.g, .15)) { D.x = nx; D.g = F.g; } else { T.side = -T.side; D.x = F.x - T.side * FH * .5; D.g = F.g; } }
    F.pet = { t: 0, dur: 3.4, T }; T.petting = true; F.sp = 0; F.vs = 0; D.mode = 'pet'; D.t = 3.6; D.petF = F;
  }
  if (T.t >= T.dur || (T.wait && T.t > T.dur)) endTrick(F);
}
function trickPose(F, dt){
  const T = F.trick, t = T.t, e = ez(seg(t, 0, .35)) * (1 - ez(seg(t, T.dur - .45, T.dur)));
  let P;
  if (T.kind === 'twerk') {
    /* im Profil, vornübergebeugt, Hände auf den Knien, der Po wippt schnell */
    if (T.a == null) T.a = F.x < W / 2 ? Math.PI - .35 : .35;
    turnTo(F, T.a, 7 * dt);
    P = walkPose(F, { stride: 0 });
    const s = Math.sin(t * 21), s2 = Math.sin(t * 10.5);
    P.pelvis.z += (-.13 + s * .065) * e; P.pelvis.f = (-.09 - s * .06) * e; P.pelvis.r = s2 * .018 * e;
    P.lean = (1.05 + s * .12) * e; P.yaw = 0;
    P.footL = { r: lerp(.075, .13, e), f: 0, z: 0 }; P.footR = { r: lerp(-.075, -.13, e), f: 0, z: 0 };
    P.kneeBackL = 0; P.kneeBackR = 0;
    P.handL = { r: lerp(.17, .12, e), f: lerp(0, -.04, e), z: lerp(.3, .46, e) };
    P.handR = { r: lerp(-.17, -.12, e), f: lerp(0, -.04, e), z: lerp(.3, .46, e) };
  } else if (T.kind === 'jump') {
    /* sechs Sprünge, Arme in der Luft */
    turnTo(F, Math.PI / 2, 6 * dt);
    const per = .62, t0 = t - .25, k = Math.floor(t0 / per), q = t0 >= 0 && k < 6 ? (t0 % per) / per : -1;
    const air = q > .2 && q < .85 ? (q - .2) / .65 : -1;
    F.hop = air >= 0 ? 4 * air * (1 - air) * .3 : 0;
    const crouch = q < 0 ? 0 : q <= .2 ? Math.sin(q / .2 * Math.PI / 2) : q >= .85 ? Math.sin((1 - q) / .15 * Math.PI / 2) : 0;
    P = walkPose(F, { stride: 0 });
    P.pelvis.z -= crouch * .09; P.lean = crouch * .18;
    const tuck = air >= 0 ? Math.sin(air * Math.PI) : 0;
    P.footL = { r: .08, f: .02 * tuck, z: .05 * tuck, toe: .6 * tuck }; P.footR = { r: -.08, f: .02 * tuck, z: .05 * tuck, toe: .6 * tuck };
    const up = ez(seg(t, 0, .3)) * (1 - ez(seg(t, T.dur - .35, T.dur))), wv = Math.sin(t * 12) * .03;
    P.handL = { r: lerp(.17, .23, up), f: lerp(0, .03, up) + wv, z: lerp(.3, 1.12 - crouch * .05, up) };
    P.handR = { r: lerp(-.17, -.23, up), f: lerp(0, .03, up) - wv, z: lerp(.3, 1.12 - crouch * .05, up) };
    P.armsUp = up > .5;
  } else {
    /* Purzelbaum: zusammenrollen und als Kugel vorwärts rollen */
    turnTo(F, T.a, 8 * dt);
    const tk = ez(seg(t, 0, .4)) * (1 - ez(seg(t, T.dur - .5, T.dur)));
    P = walkPose(F, { stride: 0 });
    P.pelvis.z = lerp(.5, .27, tk); P.lean = .95 * tk; P.yaw = 0;
    P.footL = { r: .07, f: .1 * tk, z: 0 }; P.footR = { r: -.07, f: .1 * tk, z: 0 };
    P.handL = { r: lerp(.17, .1, tk), f: lerp(0, -.02, tk), z: lerp(.3, .52, tk) };
    P.handR = { r: lerp(-.17, -.1, tk), f: lerp(0, -.02, tk), z: lerp(.3, .52, tk) };
    const n = T.room > FH * 1.4 ? 2 : 1, th = Math.PI * 2 * n * ez(seg(t, .45, T.dur - .55));
    const dth = th - (T.th || 0); T.th = th; T.tk = tk;
    /* soweit Platz ist, kommt die Kugel voran; sonst rollt sie an Ort */
    const adv = Math.min(dth * .2 * FH, Math.max(0, (T.room || 0) - FH * .3 - (T.went || 0)));
    const nx = F.x + Math.cos(F.a) * adv, ng = F.g + Math.sin(F.a) * adv * C;
    if (adv > 0 && clearAt(F.surf, nx, ng, .2)) { F.x = nx; F.g = ng; T.went = (T.went || 0) + adv; }
  }
  F.vs = 0;
  return P;
}
/* alle Gelenke um die Mitte der zusammengerollten Figur drehen und auf den Boden setzen */
function rollJ(J, T){
  const th = T.th, k = J.rt, c = mul(add(add(J.pel, J.chest), add(J.kneeL, J.kneeR)), .25);
  const cs = Math.cos(th), sn = Math.sin(th);
  const rot = v => { const kv = dot(k, v); return add(add(mul(v, cs), mul(cross(k, v), sn)), mul(k, kv * (1 - cs))); };
  const out = { ...J };
  const pts = ['pel','chest','shL','shR','hipL','hipR','neck','headC','kneeL','ankL','kneeR','ankR','elbL','handL','elbR','handR'];
  for (const q of pts) out[q] = add(c, rot(sub(J[q], c)));
  out.fw = rot(J.fw); out.up = rot(J.up);
  let mz = Infinity; for (const q of pts) mz = Math.min(mz, out[q].z - (q === 'headC' ? .1 * FH * J.k : .035 * FH));
  const lift = -mz * T.tk; for (const q of pts) out[q] = add(out[q], v3(0, 0, lift));
  return out;
}
/* den Hund streicheln: zum Hund drehen, bücken, Hand auf dem Rücken hin und her */
function petPose(F, dt){
  const K = F.pet, D = DOG; if (K.T) K.t = K.T.t - PET_RUN; else K.t += dt;
  if (!D) { F.pet = null; return walkPose(F, { stride: 0 }); }
  const dx = D.x - F.x, dg = (D.g - F.g) / C, dist = Math.hypot(dx, dg) / FH;
  { let d = Math.atan2(dg, dx) - F.a; d = Math.atan2(Math.sin(d), Math.cos(d)); F.a += Math.sign(d) * Math.min(Math.abs(d), 5 * dt); }
  const b = ez(seg(K.t, .15, .7)) * (1 - ez(seg(K.t, K.dur - .6, K.dur)));
  const st = (1 - ez(cl(K.t / .4))) * .36 * cl((F.vs || 0) / .65); F.ph += dt * 7 * (st > .01 ? 1 : 0);
  const P = walkPose(F, { stride: st });
  P.pelvis.z -= .12 * b; P.lean = .45 * b;
  const stroke = Math.sin(K.t * 7) * .05 * b;
  P.handR = { r: lerp(-.17, -.03, b), f: lerp(0, cl(dist - .12, .14, .42) + stroke, b), z: lerp(.3, .4, b) };
  if (K.t >= K.dur) { F.pet = null; F.petCool = clock + 12; F.vs = 0; }
  return P;
}
function pickPose(F, dt){
  const K = F.pickUp; K.t += dt * (K.fast || 1);
  { let d = K.a - F.a; d = Math.atan2(Math.sin(d), Math.cos(d)); F.a += Math.sign(d) * Math.min(Math.abs(d), 6 * dt); }
  const b = ez(seg(K.t, .15, .7)) * (1 - ez(seg(K.t, 1.1, 1.7)));
  /* den letzten Schritt ausklingen lassen, dann bücken */
  const st = (1 - ez(cl(K.t / .4))) * .36 * cl((F.vs || 0) / .65); F.ph += dt * 7 * (st > .01 ? 1 : 0);
  const P = walkPose(F, { stride: st });
  P.pelvis.z -= .2 * b; P.lean = .6 * b;
  P.handR = { r: lerp(-.17, -.06, b), f: lerp(0, .26, b), z: lerp(.3, .05, b) };
  if (K.t > .95 && !K.done) { K.done = true; if (K.p.gift) K.p.gone = true; else POOPS = POOPS.filter(p => p !== K.p); }
  if (K.t >= 1.8) { F.pickUp = null; F.pause = .3; F.vs = 0; }
  return P;
}
/* Weg auf der Buchstabenoberfläche zur nächsten Kletterstelle (Raster, breit genug für die Füsse) */
function topRoute(id, from){
  const st = 3, gw = Math.ceil(W / st), gh = Math.ceil(Hh / st), m = FH * .07;
  const ok = (x, g) => idAt(x, g) === id && idAt(x + m, g) === id && idAt(x - m, g) === id && idAt(x, g + m * C) === id && idAt(x, g - m * C) === id;
  const goals = new Map();
  for (const sp of letters.spots) if (sp.id === id) { const p = standPt(sp); goals.set(Math.round(p.g / st) * gw + Math.round(p.x / st), sp); }
  const s0 = Math.round(from.g / st) * gw + Math.round(from.x / st), prev = new Map([[s0, -1]]), q = [s0];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (goals.has(c)) { const sp = goals.get(c), pts = []; let k = c; while (k !== -1) { pts.push({ x: k % gw * st, g: Math.floor(k / gw) * st }); k = prev.get(k); }
      pts.reverse(); const out = pts.filter((_, j) => j % 3 === 0); out.push(standPt(sp)); return { sp, pts: out }; }
    const cx = c % gw, cy = Math.floor(c / gw);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, k = ny * gw + nx;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || prev.has(k)) continue;
      if (!goals.has(k) && !ok(nx * st, ny * st)) continue; prev.set(k, c); q.push(k); }
  }
  return null;
}
const standPt = sp => ({ x: sp.E.x + sp.n.x * sp.fEnd * FH, g: sp.E.g + sp.n.v * sp.fEnd * FH * C });
/* Sitzen auf der Kante: umdrehen, an die Kante, hinsetzen, Beine baumeln lassen */
function sitPose(F, dt, held){
  const L = F.sit; L.t += dt;
  if (held) L.dur = Math.min(L.dur, L.t + .9);
  const sp = L.sp, n = sp.n;
  const u = ez(cl(L.t / .8)); let d = Math.atan2(-n.v, -n.x) - L.a0; d = Math.atan2(Math.sin(d), Math.cos(d));
  F.a = L.a0 + d * u;
  const pe = { x: sp.E.x + n.x * .07 * FH, g: sp.E.g + n.v * .07 * FH * C };
  F.x = lerp(L.x0, pe.x, u); F.g = lerp(L.g0, pe.g, u);
  const b = ez(seg(L.t, .8, 1.8)) * (1 - ez(seg(L.t, L.dur - 1, L.dur)));
  const P = walkPose(F, { stride: 0 });
  if (L.t < .8) { F.ph += dt * 6; const st = walkPose(F, { stride: .05 }); P.footL = st.footL; P.footR = st.footR; }
  const bf = ez(seg(b, 0, .55)), bz = ez(seg(b, .35, 1)), sw = Math.sin(L.t * 2.1) * .045, sw2 = Math.sin(L.t * 2.1 + 1.9) * .045;
  P.pelvis.z = lerp(P.pelvis.z, .09, ez(seg(b, .15, 1))); P.pelvis.f = 0;
  P.footL = { r: lerp(P.footL.r, .07, b), f: lerp(P.footL.f, .2 + sw * bz, bf), z: lerp(P.footL.z, -.24, bz), toe: 0 };
  P.footR = { r: lerp(P.footR.r, -.07, b), f: lerp(P.footR.f, .2 + sw2 * bz, bf), z: lerp(P.footR.z, -.24, bz), toe: 0 };
  P.handL = { ...P.handL, w: b, g: { r: .15, f: -.05, z: .03 } }; P.handR = { ...P.handR, w: b, g: { r: -.15, f: -.05, z: .03 } };
  P.lean = lerp(P.lean, .14, b); P.yaw = Math.sin(L.t * .45) * .12 * b;
  if (L.t >= L.dur) { F.sit = null; F.topT = 99; }
  return P;
}
/* Pendel beim Ziehen: der Körper hängt am Kopf und schwingt der Bewegung nach */
function swingStep(F, ax, ay, dt, held){
  const W2 = 49, L = FH * .8, c = held ? 2.4 : (F.dropZ ? 2.4 : 7), S2 = F.sw;
  S2.om += (-W2 * Math.sin(S2.th) - c * S2.om - ax / L * Math.cos(S2.th)) * dt; S2.th = cl(S2.th + S2.om * dt, -1.2, 1.2);
  S2.pom += (-W2 * Math.sin(S2.ph) - c * S2.pom - ay / L * Math.cos(S2.ph) * .6) * dt; S2.ph = cl(S2.ph + S2.pom * dt, -.8, .8);
  if (!held && !F.dropZ && Math.abs(S2.th) + Math.abs(S2.om) + Math.abs(S2.ph) + Math.abs(S2.pom) < .01) F.sw = null;
}
function swingJ(J, sw){
  const pv = add(J.headC, mul(J.up, .1 * FH)), ct = Math.cos(sw.th), st = Math.sin(sw.th), cp = Math.cos(sw.ph), sp2 = Math.sin(sw.ph);
  const rot = v => { let x = v.x * ct - v.z * st, z = v.x * st + v.z * ct, y = v.y; const y2 = y * cp - z * sp2, z2 = y * sp2 + z * cp; return v3(x, y2, z2); };
  const out = { ...J };
  for (const k of ['pel','chest','neck','headC','shL','shR','hipL','hipR','kneeL','kneeR','ankL','ankR','elbL','elbR','handL','handR']) out[k] = add(pv, rot(sub(J[k], pv)));
  for (const k of ['fw','rt','up']) out[k] = rot(J[k]);
  return out;
}
function syncFigs(){
  const want = new Set(wantedFigs());
  for (const F of Fs) if (!F.santa && !want.has(F.i) && !F.leave) { F.leave = true; F.goal = null; F.lean = null; F.goalStage = 0; F.pause = 0; if (F.act) F.act.dur = Math.min(F.act.dur, 1); }
  for (const i of want) if (!fig(i)) {
    const F = makeFig(i), side = Math.random() < .5;
    let g = top() + Math.random() * (bottom() - top());
    for (let t = 0; t < 40 && !clearAt(-1, side ? FH * .6 : W - FH * .6, g); t++) g = top() + Math.random() * (bottom() - top());
    F.x = side ? -FH * .6 : W + FH * .6; F.g = g; F.a = side ? 0 : Math.PI; F.surf = -1; F.z0 = 0; F.enter = 2.2;
    Fs.push(F);
  }
}
function step(F, dt){
  let P;
  const held = view === 'pick' && F.i === sel;
  if (F.drag) {
    F.ph += dt * 4;
    P = walkPose(F, { stride: 0 });
    const sw = Math.sin(clock * 3 + F.seed) * .04;
    P.pelvis.z = .5; P.footL = { r: .07, f: sw, z: .02 }; P.footR = { r: -.07, f: -sw * .6, z: .03 };
    P.handL = { r: .22, f: .02, z: .47 }; P.handR = { r: -.22, f: .02, z: .47 };
    F.dropZ = .16;
    /* Beschleunigung des Griffs auf dem Bildschirm */
    const D = F.drag, sy0 = F.g - F.z0 * HZ, idt = 1 / Math.max(dt, 1e-3);
    const vx = D.lx == null ? 0 : (F.x - D.lx) * idt, vy = D.ly == null ? 0 : (sy0 - D.ly) * idt; D.lx = F.x; D.ly = sy0;
    D.svx = lerp(D.svx || 0, vx, Math.min(1, dt * 18)); D.svy = lerp(D.svy || 0, vy, Math.min(1, dt * 18));
    const ax = D.pvx == null ? 0 : (D.svx - D.pvx) * idt, ay = D.pvy == null ? 0 : (D.svy - D.pvy) * idt; D.pvx = D.svx; D.pvy = D.svy;
    F.sw = F.sw || { th: 0, om: 0, ph: 0, pom: 0 };
    swingStep(F, cl(ax, -6000, 6000), cl(ay, -6000, 6000), dt, true);
  } else if (F.reveal) {
    P = revealPose(F, dt);
  } else if (F.push && F.push.on) {
    P = pushPose(F, dt);
  } else if (F.trick && !F.trick.wait && F.trick.kind !== 'pet') {
    P = trickPose(F, dt);
  } else if (F.pickUp) {
    P = pickPose(F, dt);
  } else if (F.pet) {
    P = petPose(F, dt);
  } else if (F.sit) {
    P = sitPose(F, dt, held);
  } else if (F.lean) {
    P = leanPose(F, dt, held);
  } else if (F.act) {
    P = actPose(F, dt);
    if (F.act.t >= 1) { const A = F.act; F.surf = A.to; F.z0 = hOf(A.to);
      /* nach dem Klettern auf dem neuen Boden stehen */
      const pf = P.pelvis.f;
      F.x += Math.cos(F.a) * pf * FH; F.g += Math.sin(F.a) * pf * FH * C;
      F.act = null; F.pause = Math.random() < .5 ? .5 + Math.random() : 0;
      /* gleiche Haltung im neuen Bezug, sonst springt die Figur für ein Bild */
      P = walkPose(F, { stride: 0 }); }
  } else {
    /* Wandern: weiche Kurven, Abstand halten; ab und zu gezielt zu einer geprüften Kletterstelle */
    F.z0 = hOf(F.surf);
    const t = clock + F.seed;
    let turn = .7 * Math.sin(t * .41) + .45 * Math.sin(t * 1.13 + 2);
    const onTop = F.surf >= 0;
    if (onTop) {
      /* oben: stehen, umschauen, dann an derselben Stelle rückwärts hinunter */
      F.topT = (F.topT || 0) + dt; if (F.leave) F.topWait = 0;
      if (F.spot && !F.topGoal && !held && !F.leave && !F.trick && !F.sitDone && F.topT > .8) { F.sitDone = true; if (Math.random() < .55) F.sit = { t: 0, dur: 4 + Math.random() * 5, sp: F.spot, a0: F.a, x0: F.x, g0: F.g }; }
      if (F.topT > (F.topWait || 3) && F.spot && !F.topGoal && !F.sit && !held) { actFromPlan(F, F.spot, true); F.topT = 0; F.spot = null; }
    }
    if (!onTop && !F.goal && !F.fetch && !F.trick && !F.santa && !F.push && !held && !F.leave && !(F.enter > 0) && letters.spots.length && Math.random() < dt * .1) {
      /* nur Stellen mit freiem Weg, freiem Einstieg und einem Buchstaben, auf dem niemand ist */
      const sight = sp => { const dx = sp.S2.x - F.x, dg = sp.S2.g - F.g, n = Math.ceil(Math.hypot(dx, dg / C) / (FH * .15)); for (let k = 1; k <= n; k++) if (!clearAt(-1, F.x + dx * k / n, F.g + dg * k / n)) return false; return true; };
      const busy = sp => Fs.some(o => o !== F && (o.goal === sp || o.spot === sp || o.surf === sp.id || (o.spot && o.spot.id === sp.id) || (o.goal && o.goal.id === sp.id) || (o.act && (o.act.to === sp.id || o.act.from === sp.id)) || Math.hypot(o.x - sp.S.x, (o.g - sp.S.g) / C) < FH * .6 || Math.hypot(o.x - sp.S2.x, (o.g - sp.S2.g) / C) < FH * .5));
      const near = letters.spots.filter(sp => Math.hypot(sp.S.x - F.x, (sp.S.g - F.g) / C) < W * .45 && !busy(sp) && sight(sp));
      /* manchmal statt klettern: an einen Buchstaben lehnen (nur vorne, wo man die Figur sieht) */
      const lean = Math.random() < .45, pool = lean ? near.filter(sp => sp.n.v < -.3) : near;
      if (pool.length) { F.goalBest = null; F.goalNP = 0; F.goal = pool[Math.floor(Math.random() * pool.length)]; F.goalKind = lean ? 'lean' : 'climb'; F.goalT = 0; F.goalStage = 0; }
    }
    if (F.goal) {
      F.goalT += dt;
      const tgt = F.goalStage ? (F.goalKind === 'lean' ? leanPt(F.goal) : F.goal.S) : F.goal.S2;
      const gx = tgt.x - F.x, gg = (tgt.g - F.g) / C, d = Math.hypot(gx, gg);
      let justArrived = false;
      /* kommt die Figur dem Ziel nicht mehr näher, gibt sie es auf statt im Kreis zu laufen */
      if (d < (F.goalBest ?? 1e9) - FH * .03) { F.goalBest = d; F.goalNP = 0; } else F.goalNP = (F.goalNP || 0) + dt;
      if (!F.goalStage && d < FH * .15) { F.goalStage = 1; justArrived = true; }
      let da = Math.atan2(gg, gx) - F.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      turn = da * 3.5;
      if (F.goalStage && !justArrived) { /* letztes Stück genau auf der Linie zur Kante */
        F.a += da * Math.min(1, dt * 10);
        const step = Math.min(d, F.want * FH * dt);
        if (d > .01) { F.x += gx / d * step; F.g += gg / d * step * C; }
        F.sp = lerp(F.sp, F.want * .7, dt * 4);
      }
      if (F.goalStage && !justArrived && d < Math.max(FH * .03, F.sp * FH * dt * 1.5) && F.goalKind === 'lean') {
        F.x = tgt.x; F.g = tgt.g; const n = F.goal.n;
        F.lean = { t: 0, dur: 5 + Math.random() * 7, smoke: Math.random() < .6, a0: F.a, aT: Math.atan2(-n.v, -n.x), sp: F.goal, puff: 0 };
        F.goal = null; F.goalStage = 0; F.waitT = 0; F.sp = 0; F.vs = 0;
      }
      else if (F.goalStage && !justArrived && d < Math.max(FH * .03, F.sp * FH * dt * 1.5) && !Fs.some(o => o !== F && !o.drag && Math.hypot(o.x - F.goal.S.x, (o.g - F.goal.S.g) / C) < FH * .34)) { F.goalStage = 0; F.waitT = 0; F.x = F.goal.S.x; F.g = F.goal.S.g; F.spot = F.goal; F.goal = null; F.topWait = 2 + Math.random() * 3; actFromPlan(F, F.spot, false); }
      else if (F.goalT > 12 || F.goalNP > 1.5 || (F.goalStage && (F.waitT = (F.waitT || 0) + dt) > .6)) { F.goal = null; F.goalStage = 0; F.waitT = 0; }
    }
    if (!F.act) {
    const x0 = F.x, g0 = F.g;
    /* oben abgesetzt: auf dem Buchstaben zur Kletterstelle gehen */
    if (onTop && F.topGoal && !held) {
      const gx = F.topGoal.x - F.x, gg = (F.topGoal.g - F.g) / C, d = Math.hypot(gx, gg);
      if (d < 1) { F.topGoal = F.topPath && F.topPath.length ? F.topPath.shift() : null; F.topT = 0; }
      else { let da = Math.atan2(gg, gx) - F.a; da = Math.atan2(Math.sin(da), Math.cos(da)); F.a += Math.sign(da) * Math.min(Math.abs(da), 6 * dt);
        if (Math.abs(da) < .6) { const st = Math.min(d, .32 * FH * dt); F.x += gx / d * st; F.g += gg / d * st * C; } }
    }
    for (const o of Fs) if (o !== F && !o.drag) {
      const dx = o.x - F.x, dg = (o.g - F.g) / C, d = Math.hypot(dx, dg);
      if (d < FH * .55 && d > 0) { const side = Math.sin(Math.atan2(dg, dx) - F.a); turn -= Math.sign(side || 1) * 2.4 * (1 - d / (FH * .55)) * (F.goal ? .4 : 1); }
    }
    const cx = W / 2 - F.x, cg = (Hh * .5 - F.g) / C;
    if (F.enter > 0) F.enter -= dt;
    if (!inBounds(F) && !F.leave && !(F.enter > 0)) { const ta = Math.atan2(cg, cx); let d = ta - F.a; d = Math.atan2(Math.sin(d), Math.cos(d)); turn += d * 3; }
    const moving = !(F.pause > 0 || held || RM || onTop || F.goalStage);
    if (F.pause > 0) F.pause -= dt;
    if (held) { let d = Math.PI / 2 - F.a; d = Math.atan2(Math.sin(d), Math.cos(d)); F.a += d * Math.min(1, dt * 5); }
    const clear = (x, g) => clearAt(F.surf, x, g);
    /* Richtung wählen: gewünschte Richtung, sonst die nächste freie; nie gegen eine Wand laufen */
    const free = (a2, lim = 9) => { for (const L of [.12, .26, .42]) if (L <= lim && !clear(F.x + Math.cos(a2) * L * FH, F.g + Math.sin(a2) * L * FH * C)) return false; return true; };
    let want = F.want * (F.leave ? 1.5 : 1);
    if (moving) {
      /* steht die Figur fest, sucht sie die offenste Richtung und geht dorthin */
      if (F.escT > 0) F.escT -= dt;
      else if ((F.vs || 0) < .05) { F.stillT = (F.stillT || 0) + dt;
        if (F.stillT > .8) { let best = F.a, bn = -1; for (let k = 0; k < 16; k++) { const a2 = k * Math.PI / 8; let n = 0; for (const L of [.2, .4, .6, .8, 1]) { if (clear(F.x + Math.cos(a2) * L * FH, F.g + Math.sin(a2) * L * FH * C)) n++; else break; } if (n > bn) { bn = n; best = a2; } }
          F.escA = best; F.escT = 1.2; F.stillT = 0; F.goal = null; F.goalStage = 0; } }
      else F.stillT = 0;
      const pushT = F.push && !F.push.on ? F.push : null;
      const run = pushT ? pushT : F.trick && F.trick.kind === 'pet' && !F.trick.wait && !F.trick.petting && DOG ? petSpot(F) : null;
      /* so schnell wie nötig, damit das Streicheln überall im selben Moment beginnt */
      if (pushT) { const d = Math.hypot(pushT.x - F.x, (pushT.g - F.g) / C) / FH; want = d < .06 ? 0 : Math.min(F.want, d / Math.max(dt, 1 / 60) * .6); if (d < .1) { pushT.on = true; F.x = pushT.x; F.g = pushT.g; } }
      else if (run) { const d = Math.hypot(run.x - F.x, (run.g - F.g) / C) / FH; want = d < .08 ? 0 : Math.min(cl(d / Math.max(.3, PET_RUN - F.trick.t) * 1.15, .35, 9), d / Math.max(dt, 1 / 60) * .6); }
      const desired = run ? Math.atan2((run.g - F.g) / C, run.x - F.x) : F.fetch && F.escT > 0 ? F.escA : F.fetch && !F.leave ? Math.atan2((F.fetch.g - F.g) / C, F.fetch.x - F.x) : F.leave ? (F.x < W / 2 ? Math.PI : 0) : F.enter > 0 ? (F.x < W / 2 ? 0 : Math.PI) : F.escT > 0 ? F.escA : F.goal ? Math.atan2((F.goal.S2.g - F.g) / C, F.goal.S2.x - F.x) : F.a + cl(turn, -4, 4) * dt;
      if (F.goal && F.escT <= 0) want *= cl(Math.hypot(F.goal.S2.x - F.x, (F.goal.S2.g - F.g) / C) / (FH * .7), .3, 1);
      let pick = null, da0 = 0;
      for (const da of [0, .35, -.35, .7, -.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
        const a2 = desired + da * (Math.sin(F.seed) > 0 ? 1 : -1); if (free(a2, F.goal && F.escT <= 0 && !da ? Math.hypot(F.goal.S2.x - F.x, (F.goal.S2.g - F.g) / C) / FH : 9)) { pick = a2; da0 = da; break; } }
      if (F.goal) { F.goalBlock = pick !== null && Math.abs(pick - desired) < .01 ? 0 : (F.goalBlock || 0) + dt; if (F.goalBlock > 1.2) { F.goal = null; F.goalBlock = 0; } }
      if (pick === null && F.escT > 0) { pick = F.escA; want *= .5; }
      if (pick === null) { want = 0; F.a += 2 * dt; }
      else { let d = pick - F.a; d = Math.atan2(Math.sin(d), Math.cos(d)); F.a += Math.sign(d) * Math.min(Math.abs(d), (F.goal || F.escT > 0 || da0 ? 5 : 2.2) * dt); if (Math.abs(d) > 1) want *= .35; }
    }
    F.sp = lerp(F.sp, moving ? want : 0, Math.min(1, dt * (F.trick && F.trick.kind === 'pet' ? 10 : 4)));
    const v = F.sp * FH;
    if (v > 1 && moving) {
      const ca = Math.cos(F.a), sa = Math.sin(F.a);
      const nx = F.x + ca * v * dt, ng = F.g + sa * v * dt * C;
      /* steht die Figur knapp an einer Wand (nach dem Klettern), darf sie sich wegbewegen */
      if (clear(nx, ng) || (idAt(nx, ng) === F.surf && (free(F.a) || (F.escT > 0 && clearAt(F.surf, nx, ng, .1))))) { F.x = nx; F.g = ng; }
      else F.sp *= .5;
      if (!F.goal && !F.fetch && !F.trick && !F.santa && !F.push && !F.leave && !(F.enter > 0) && Math.random() < dt * .05) F.pause = 1 + Math.random() * 2.5;
    }
    if (DOG && F.surf < 0 && !F.goalStage) { const dx = F.x - DOG.x, dg = (F.g - DOG.g) / C, d = Math.hypot(dx, dg), m = FH * .34;
      if (d < m && d > .01) { const push = Math.min(m - d, FH * 1.5 * dt), px = F.x + dx / d * push, pg = F.g + dg / d * push * C; if (clear(px, pg)) { F.x = px; F.g = pg; } } }
    /* Abstand halten: Figuren stehen nie ineinander */
    if (!F.goalStage) for (const o of Fs) if (o !== F && !o.drag && (o.act || o.surf === F.surf)) {
      const dx = F.x - o.x, dg = (F.g - o.g) / C, d = Math.hypot(dx, dg), m = FH * .34;
      if (d < m) { const k = d > .01 ? 1 / d : 0, push = Math.min(m - d, FH * 1.5 * dt), ux = d > .01 ? dx * k : Math.cos(F.seed), ug = d > .01 ? dg * k : Math.sin(F.seed);
        const px = F.x + ux * push, pg = F.g + ug * push * C; if (clear(px, pg)) { F.x = px; F.g = pg; } }
    }
    /* beim Hund angekommen: streicheln */
    /* beim Haufen angekommen: bücken und aufheben */
    if (F.fetch) { F.fetchT += dt; const p = F.fetch, d = Math.hypot(p.x - F.x, (p.g - F.g) / C);
      /* kommt die Figur nicht näher, ein Stück in die offenste Richtung Richtung Ziel ausweichen */
      if (F.fetchFor !== p) { F.fetchFor = p; F.fetchBest = 1e9; F.fetchNP = 0; }
      if (d < (F.fetchBest ?? 1e9) - FH * .05) { F.fetchBest = d; F.fetchNP = 0; } else if ((F.fetchNP = (F.fetchNP || 0) + dt) > 1.4 && !(F.escT > 0)) {
        const ta = Math.atan2((p.g - F.g) / C, p.x - F.x); let best = F.a, bs = -1e9;
        for (let k2 = 0; k2 < 16; k2++) { const a2 = k2 * Math.PI / 8; let n = 0; for (const L of [.25, .5, .75, 1, 1.25, 1.5]) { if (clearAt(F.surf, F.x + Math.cos(a2) * L * FH, F.g + Math.sin(a2) * L * FH * C)) n++; else break; }
          const sc = n + Math.cos(a2 - ta) * 2.2 + (Math.abs(Math.atan2(Math.sin(a2 - F.a), Math.cos(a2 - F.a))) > 2.6 ? -1 : 0); if (n >= 2 && sc > bs) { bs = sc; best = a2; } }
        F.escA = best; F.escT = .9 + Math.random() * .6; F.fetchNP = 0; F.fetchBest = 1e9; }
      if (p.gift ? !GIFTS.includes(p) || p.popped : !POOPS.includes(p)) F.fetch = null;
      else if (d < FH * .26) { F.fetch = null; F.pickUp = { t: 0, p, a: Math.atan2((p.g - F.g) / C, p.x - F.x) }; F.sp = 0; }
      else if (F.fetchT > 14) { (F.skipPoop = F.skipPoop || new Set()).add(p); F.fetch = null; p.who = null; } }
    /* Beine nur bewegen, wenn die Figur wirklich vorankommt */
    const moved = Math.hypot(F.x - x0, (F.g - g0) / C);
    F.vs = lerp(F.vs || 0, moved / Math.max(dt, 1e-4) / FH, Math.min(1, dt * 10));
    }
    if (F.act) { P = actPose(F, dt); F.lastPel = P.pelvis; return P; }
    /* ein Schritt pro halbe Schrittlänge */
    const vs = F.vs || 0, stride = .36 * cl(vs / .65, 0, 1.1);
    F.ph += dt * (vs * FH) / (2 * Math.max(.05, stride) * FH) * Math.PI * 2 * (vs > .02 ? 1 : 0);
    P = walkPose(F, { stride });
    /* nah an einer Wand: Arme eng am Körper, damit keine Hand in den Block greift */
    F.armIn = lerp(F.armIn || 0, clearAt(F.surf, F.x, F.g, F.surf >= 0 ? .2 : .36) ? 0 : 1, Math.min(1, dt * 8));
    if (F.armIn > .01) for (const h of [P.handL, P.handR]) { h.r *= 1 - .45 * F.armIn; h.f *= 1 - .6 * F.armIn; }
    if (vs < .05) { /* ruhig stehen: atmen, Gewicht verlagern, umschauen */
      P.pelvis.r = Math.sin(t * .8) * .01; P.pelvis.z += Math.sin(t * 2.2) * .003; P.yaw = Math.sin(t * .6) * .18;
    }
    if (held || F.wave) { const w = Math.sin(clock * 9); P.handR = { r: -.24, f: .08, z: .98 + w * .02 }; P.wave = w; }
    if (F.dropZ) { F.dropV = (F.dropV || 0) + 9 * dt; F.dropZ = Math.max(0, F.dropZ - F.dropV * dt); if (!F.dropZ) { F.dropV = 0; F.land = .35; } }
    if (F.land > 0) { F.land -= dt; const q = Math.sin(cl(F.land / .35) * Math.PI); P.pelvis.z -= q * .08; P.lean += q * .2; }
  }
  if (P.wave !== undefined) { P.handR.f += P.wave * .05; }
  F.lastPel = P.pelvis;
  return P;
}
function render(dt){
  for (const k in GL.parts) { GL.parts[k].nc = 0; GL.parts[k].ns = 0; }
  GL.wbox.count = 0; GL.gbox.count = 0; GL.gbow.count = 0;
  dogStep(dt); catStep(dt); dogTo3D(); catTo3D(); poopTo3D(); assignPoops(); santaStep(dt); boxStep(dt); managePushers();
  const c = ctx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, W, Hh);
  for (const F of Fs) {
    if (F.leave) F.pause = 0;
    if (F.trick) trickTick(F, dt);
    const P = step(F, dt);
    if (F.sw && !F.drag) swingStep(F, 0, 0, dt, false);
    let J = F.sw ? swingJ(solveFig(F, P), F.sw) : solveFig(F, P);
    if (F.trick && F.trick.th != null) J = rollJ(J, F.trick);
    F.lastJ = J;
    const base = { x: F.x, gy: F.g, z: baseZ(F) + ((F.dropZ || 0) + (F.hop || 0)) * FH };
    F.base = base;
    if (F.flyHide) continue;
    figTo3D(F, J, base);
  }
  /* wer den Platz verlassen hat, verschwindet */
  ropeTo3D(); giftsTo3D();
  for (let i = Fs.length - 1; i >= 0; i--) { const F = Fs[i]; if (F.leave && (F.x < -FH * .8 || F.x > W + FH * .8 || (F.surf >= 0 && !F.spot && !F.act))) Fs.splice(i, 1); }
  for (const k in GL.parts) { const P = GL.parts[k]; P.c.count = P.nc; P.sp.count = P.ns; P.c.instanceMatrix.needsUpdate = P.sp.instanceMatrix.needsUpdate = true; }
  /* erst Buchstaben allein (für die Konturen), dann alles (für die Figuren mit Verdeckung) */
  const figs = [GL.wbox, ...(GL.passB || [])]; for (const k in GL.parts) figs.push(GL.parts[k].c, GL.parts[k].sp);
  GL.wbox.instanceMatrix.needsUpdate = true;
  figs.forEach(m => m.visible = false);
  GL.r.setRenderTarget(GL.rt); GL.r.setClearColor(0x80ff80, 0); GL.r.clear(); GL.r.render(GL.scene, GL.cam);
  figs.forEach(m => m.visible = true);
  GL.r.setRenderTarget(GL.rtI); GL.r.clear(); GL.r.render(GL.scene, GL.cam);
  GL.r.setRenderTarget(null); GL.r.render(GL.post, GL.pcam);
  /* Ringe am Boden, Namen und Geschenke obenauf */
  for (const F of Fs) {
    const base = F.base; if (!base || F.flyHide) continue;
    const gy = sy(F.g, 0, base.z);
    if ((view === 'pick' && F.i === sel) || (view === 'lobby' && F.i === S.me)) {
      const k = 1 + Math.sin(clock * 4) * .05;
      c.beginPath(); c.ellipse(F.x, gy, FH * .32 * k, FH * .32 * C * k, 0, 0, 7); c.lineWidth = 2; c.strokeStyle = PINK; c.stroke();
    }
    if (F.land > .2) { const q = 1 - (F.land - .2) / .15; c.beginPath(); c.ellipse(F.x, gy, FH * (.16 + q * .18), FH * (.16 + q * .18) * C, 0, 0, 7); c.lineWidth = 1.2; c.strokeStyle = `rgba(0,0,0,${(1 - q) * .7})`; c.stroke(); }
  }
  /* Rauch: kleine gezeichnete Kringel, die aufsteigen und dünner werden */
  for (const F of Fs) {
    const L = F.lean; if (!L || !F.cig) continue;
    L.puff -= dt; if (L.puff <= 0 && !RM) { L.puff = .35 + Math.random() * .25; SMOKE.push({ x: F.cig[0], y: F.cig[1], a: 0, life: 2 + Math.random(), s: Math.random() * 6, big: 0 }); }
    if (L.mouth < .05 && L.lastMouth > .5 && F.box) for (let i = 0; i < 3; i++) SMOKE.push({ x: F.box.head[0] + 3, y: F.box.head[1] + FH * .1, a: -i * .12, life: 2.4, s: Math.random() * 6, big: 1 });
    L.lastMouth = L.mouth;
  }
  const us = FH / 60;
  for (let i = SMOKE.length - 1; i >= 0; i--) {
    const p = SMOKE[i]; p.a += dt; if (p.a >= p.life) { SMOKE.splice(i, 1); continue; } if (p.a < 0) continue;
    const q = p.a / p.life; p.y -= (10 + p.big * 6) * us * dt; p.x += (Math.sin(p.a * 2.2 + p.s) * 6 + p.big * 4) * us * dt;
    c.beginPath(); c.arc(p.x, p.y, (1.2 + q * (5 + p.big * 4)) * us, 0, 7);
    c.lineWidth = Math.max(.3, 1.2 * (1 - q)); c.strokeStyle = `rgba(0,0,0,${(1 - q) * .85})`; c.stroke();
  }
  drawPops(c, dt);
  c.textAlign = 'center'; c.textBaseline = 'bottom';
  for (const F of Fs) {
    const b = F.box; if (!b || F.flyHide) continue;
    const name = F.i === S.me ? 'You' : S.claims[F.i];
    let y = Math.min(b.head[1], b.y0 + FH * .12) - 2;
    if (view === 'lobby' && S.draws[S.me] == null && !F.reveal && !BOX.anim && eligible().includes(F.i)) {
      const hop = Math.sin(clock * 4 + F.seed) * 2, s2 = desk() ? 1.2 : 1;
      drawGift(c, b.head[0], y - 10 + hop, 9 * s2); y -= 24 * s2;
    }
    if (name) {
      c.font = `500 ${desk() ? 14 : 12}px Jost, Futura, sans-serif`;
      const w = c.measureText(name).width + 8;
      c.fillStyle = 'rgba(255,255,255,.9)'; const lh = desk() ? 18 : 15; c.fillRect(b.head[0] - w / 2, y - lh, w, lh);
      c.fillStyle = F.i === S.me ? INK : PINK; c.fillText(name, b.head[0], y - 1);
      /* grüner Punkt über dem Kopf: gerade online */
      if (isOnline(F.i)) { const r0 = desk() ? 5 : 4.2; c.beginPath(); c.arc(b.head[0], y - lh - r0 - 1, r0, 0, 7); c.fillStyle = '#22C55E'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#fff'; c.stroke(); }
    }
  }
}
function drawGift(c, x, y, s){
  c.save(); c.translate(x, y); c.lineWidth = 1.3; c.strokeStyle = INK; c.fillStyle = PINK; c.lineJoin = 'round';
  c.beginPath(); c.rect(-s * .8, -s * .2, s * 1.6, s * 1.1); c.fill(); c.stroke();
  c.beginPath(); c.rect(-s * .95, -s * .55, s * 1.9, s * .4); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(0, -s * .55); c.lineTo(0, s * .9); c.stroke();
  c.beginPath(); c.moveTo(0, -s * .55); c.bezierCurveTo(-s * .2, -s * 1.2, -s * .9, -s * 1, -s * .3, -s * .55); c.moveTo(0, -s * .55); c.bezierCurveTo(s * .2, -s * 1.2, s * .9, -s * 1, s * .3, -s * .55); c.stroke();
  c.restore();
}


/* grosse Ansicht: Platz und Pose je Figur */
const bigFH = (r, n) => Math.min(r.height * .86 / (HZ + .1), r.width / n * .95);
function bigJ(o, j, fh){
  const F = o.F, t = clock + F.seed, keep = FH; FH = fh;
  const P = walkPose(F, { stride: 0 });
  P.pelvis.r = Math.sin(t * .9) * .012; P.pelvis.z += Math.sin(t * 2.4) * .004; P.yaw = Math.sin(t * .7) * .1;
  if (o.wave) { const w = Math.sin(clock * 8 + j); P.handR = { r: -.25, f: .08 + w * .05, z: .98 }; }
  const saveA = F.a, kl = F.kpL, kr = F.kpR; F.a = Math.PI / 2 + (o.turn || 0);
  const J = solveFig(F, P); F.a = saveA; F.kpL = kl; F.kpR = kr; FH = keep; return J;
}
function drawBig(canvas, list){
  const r = canvas.getBoundingClientRect(); if (!r.width) return;
  const d = Math.min(2, Math.round(devicePixelRatio || 1)) || 1;
  if (canvas.width !== Math.round(r.width * d) || canvas.height !== Math.round(r.height * d)) { canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d); }
  const c = canvas.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, r.width, r.height);
  const fh = bigFH(r, list.length), keepFH = FH;
  list.forEach((o, j) => { const J = bigJ(o, j, fh), box = o.F.box; FH = fh; drawFig(c, o.F, J, { x: r.width * (j + .5) / list.length, gy: r.height * .94, z: 0 }); FH = keepFH; o.F.box = box; });
}
/* Übergang: die Figur fliegt vom Platz in die grosse Ansicht und zurück, die Pose geht fliessend über */
let FLY = null, flyDirty = false;
function startFly(dir, list, canvas){
  list = list.filter(o => o.F); if (!list.length) return;
  if (FLY) FLY.list.forEach(o => o.F.flyHide = false);
  canvas.classList.add('wait');
  FLY = { dir, t: 0, dur: RM ? .01 : .95, list, canvas, src: list.map(o => ({ x: o.F.x, gy: o.F.g, z: o.F.base ? o.F.base.z : 0, fh: FH, J: o.F.lastJ })) };
  list.forEach(o => o.F.flyHide = true);
}
function mixJ(A, sa, B, sb, k, s){
  const o = {};
  for (const key in B) { const a = A[key], b = B[key];
    if (b && typeof b === 'object') o[key] = ['fw', 'rt', 'up'].includes(key) ? nrm(add(mul(a, 1 - k), mul(b, k))) : mul(add(mul(a, (1 - k) / sa), mul(b, k / sb)), s);
    else o[key] = typeof b === 'number' && typeof a === 'number' ? lerp(a, b, k) : b; }
  return o;
}
function drawFly(dt){
  /* nur arbeiten, solange etwas fliegt; danach einmal leeren */
  if (!FLY) { if (flyDirty) { const c0 = $('fly').getContext('2d'); c0.setTransform(1, 0, 0, 1, 0, 0); c0.clearRect(0, 0, $('fly').width, $('fly').height); flyDirty = false; } return; }
  const cv2 = $('fly'), d = Math.min(2, Math.round(devicePixelRatio || 1)) || 1; flyDirty = true;
  if (cv2.width !== innerWidth * d || cv2.height !== innerHeight * d) { cv2.width = innerWidth * d; cv2.height = innerHeight * d; }
  const c = cv2.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, innerWidth, innerHeight);
  FLY.t += dt / FLY.dur;
  const e = ez(ez(cl(FLY.t))), k = FLY.dir === 'in' ? e : 1 - e, r = FLY.canvas.getBoundingClientRect(), n = FLY.list.length, fhB = bigFH(r, n);
  FLY.list.forEach((o, j) => {
    const F = o.F, src = FLY.dir === 'in' ? FLY.src[j] : { x: F.x, gy: F.g, z: F.base ? F.base.z : 0, fh: FH, J: F.lastJ };
    if (!src.J) return;
    const Jb = bigJ(o, j, fhB), fh = lerp(src.fh, fhB, k), box = F.box, keep = FH;
    const J = mixJ(src.J, src.fh, Jb, fhB, k, fh);
    FH = fh; drawFig(c, F, J, { x: lerp(src.x, r.left + r.width * (j + .5) / n, k), gy: lerp(src.gy, r.top + r.height * .94, k), z: lerp(src.z, 0, k) }, { w: lerp(1.27, 1, k) });
    FH = keep; F.box = box;
  });
  if (FLY.t >= 1) { FLY.list.forEach(o => o.F.flyHide = false); FLY.canvas.classList.remove('wait'); FLY = null; c.clearRect(0, 0, innerWidth, innerHeight); }
}

/* ---------- Ablauf ---------- */
function left(){
  const ms = DEADLINE - Date.now(); if (ms <= 0) return '';
  const t = Math.floor(ms / 1000), d = Math.floor(t / 86400), p = n => String(n).padStart(2, '0');
  const hms = `${p(Math.floor(t % 86400 / 3600))}:${p(Math.floor(t % 3600 / 60))}:${p(t % 60)}`;
  return d ? `${d} ${d === 1 ? 'day' : 'days'} ${hms}` : hms;
}
/* Countdown oben in der Blase, bis auf die Sekunde */
function tickCd(){
  const el = $('cd'), l = left(), show = isOpen() && !!l && (view === 'pick' || view === 'lobby');
  el.hidden = !show; if (show && el.dataset.t !== l) { el.dataset.t = l; el.innerHTML = `Registration closes in <b>${l}</b>`; }
}
setInterval(tickCd, 250);
let wasOpen = true, busy = false;
function phaseTick(){
  if (!Fs.length) return;
  /* Anmeldeschluss erreicht, während die Seite offen ist: freie Figuren gehen, Auslosen geht los */
  if (wasOpen && !isOpen()) { wasOpen = false; if (view === 'name') { sel = null; } build(); syncFigs(); setView(S.me != null ? 'lobby' : 'pick'); return; }
  /* das Geschenk kommt: einmal neu aufbauen, damit es da ist, ohne neu zu laden */
  if (!letters.box && boxProg() > .6 && (view === 'pick' || view === 'lobby') && !drag && !busy) build();
}
setInterval(phaseTick, 1000);
const DOTS = '\u0001';
function say(t, shake){ const el = $('say'); const dots = t.startsWith(DOTS); el.textContent = dots ? t.slice(1) : t; if (dots) { const d = document.createElement('span'); d.className = 'dots'; d.setAttribute('aria-hidden', 'true'); d.innerHTML = '<i>.</i><i>.</i><i>.</i>'; el.append(d); } if (shake) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); } }
function setView(v, quiet){
  view = v;
  const open = isOpen(), cd = '';
  $('scene').classList.toggle('away', v === 'name' || v === 'result' || v === 'code');
  $('codeStage').classList.toggle('on', v === 'code');
  $('nameStage').classList.toggle('on', v === 'name');
  $('stageBack').hidden = v !== 'name' && v !== 'code'; $('stageBack').textContent = v === 'code' ? 'Back' : 'Pick another figure';
  if (v !== 'name' && $('notice').open) $('notice').close();
  $('resStage').classList.toggle('on', v === 'result');
  $('scroll').hidden = v !== 'pick' || !open;
  $('info').hidden = v !== 'pick' && v !== 'lobby';
  $('drawBtn').hidden = v !== 'lobby' || open;
  $('acts').hidden = v !== 'lobby' || !open;
  if (v === 'pick') say(!open ? 'Registration is closed. Already in? Tap your figure.' : sel == null ? 'Choose your avatar. Tap a black figure.' + cd : DOTS + "Nice pick. Let's give it your name");
  if (v === 'name') { $('nameForm').hidden = false; $('pinBox').hidden = true; $('nameStage').classList.remove('pin'); say('Enter your real name.'); clearTimeout(noticeT); noticeT = setTimeout(() => { if (view === 'name' && !$('nameForm').hidden && !$('notice').open) $('notice').showModal(); }, RM ? 0 : 750); }
  if (v === 'code') { say('Enter your code.'); setTimeout(() => $('codeIn').focus(), RM ? 0 : 700); }
  if (v === 'lobby') {
    const mine = S.draws[S.me];
    $('drawBtn').textContent = mine != null ? 'See my draw' : 'Draw';
    if (open) say("You're in. The draw opens on December 1st at 12:00. You can play with your avatar in the meantime.");
    else say(mine != null ? "You've opened your box. Tap it to see again." : 'Registration is closed. Tap the box to see who you are gifting.');
  }
  if (v === 'result') say('Psst. Keep it to yourself.');
  tickCd();
  $('scroll').classList.toggle('ready', sel != null);
  measureFoot();
}
function measureFoot(){ requestAnimationFrame(() => { const el = [...$('foot').children].find(e => !e.hidden && e.getBoundingClientRect().height); footTop = el ? el.getBoundingClientRect().top - 6 : 1e9; }); }
function tap(F){
  if (view !== 'pick') return;
  if (!isOpen() && S.claims[F.i] == null) return;
  if (S.claims[F.i] != null) {
    if (S.me == null) { sel = F.i; $('codeTxt').textContent = `Is this you, ${S.claims[F.i]}?`; $('codeIn').value = ''; setView('code'); startFly('in', [{ F, wave: true }], $('codeC')); return; }
    say(`This avatar belongs to ${S.claims[F.i]}. Pick a black figure.`, true); return; }
  sel = F.i; F.pause = 0; setView('pick');
  /* kurz zeigen, welche Figur gewählt ist, dann gross zum Namen */
  clearTimeout(pickT); pickT = setTimeout(() => { if (view === 'pick' && sel === F.i) next(); }, RM ? 300 : 1500);
}
let pickT = 0;

/* Hund getroffen? Doppelt antippen: er macht sofort einen Haufen */
function onDog(x, y){
  const D = DOG; if (!D) return false;
  const cy = sy(D.g, 0, FH * .3);
  return Math.abs(x - D.x) < FH * .45 && Math.abs(y - cy) < FH * .38;
}
let dogTapAt = 0;
function dogPoop(){
  const D = DOG; if (!D || D.mode === 'poop' || POOPS.length >= 4) return false;
  if (D.petF) D.petF.pet = null; D.mode = 'poop'; D.t = 2.6; D.dropped = false; return true;
}
function tapDog(){
  const now = performance.now(); if (now - dogTapAt < 300) return; dogTapAt = now;
  if (dogPoop()) rtSend({ t: 'poop' });
}
/* Info Zeichen getroffen? Grosszügig um die Form herum, damit es auch mit dem Finger klappt */
function onInfo(x, y){
  if (!letters.info) return false;
  const r = $('info').getBoundingClientRect(), pad = 14;
  return r.width > 0 && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}
/* Ziehen und Antippen */
let drag = null;
const pick = (x, y) => [...Fs].sort((a, b) => b.g - a.g).find(F => F.box && !F.santa && x >= F.box.x0 - 12 && x <= F.box.x1 + 12 && y >= F.box.y0 - 12 && y <= F.box.y1 + 12);
cv.addEventListener('pointerdown', e => {
  if (view !== 'pick' && view !== 'lobby') return;
  if (onSanta(e.clientX, e.clientY)) { if (popSanta()) rtSend({ t: 'santa', k: SANTA.k }); return; }
  if (onGift(e.clientX, e.clientY)) { openFaq(); return; }
  if (onBox(e.clientX, e.clientY) && !pick(e.clientX, e.clientY)) { tapBox(); return; }
  if (onDog(e.clientX, e.clientY) && !pick(e.clientX, e.clientY)) { tapDog(); return; }
  const F = pick(e.clientX, e.clientY);
  if (!F) {
    if (onInfo(e.clientX, e.clientY)) openFaq();
    /* Tipp ins Leere: gewählte Figur wieder abwählen */
    else if (view === 'pick' && sel != null) { sel = null; clearTimeout(pickT); setView('pick'); }
    return; }
  cv.setPointerCapture(e.pointerId);
  drag = { F, sx: e.clientX, sy: e.clientY, moved: false, ox: F.x - e.clientX, og: F.g - e.clientY };
  cv.classList.add('grabbing');
});
cv.addEventListener('pointermove', e => {
  if (!drag) { const F = (view === 'pick' || view === 'lobby') && pick(e.clientX, e.clientY); cv.classList.toggle('grab', !!F); cv.classList.toggle('info', !F && (view === 'pick' || view === 'lobby') && (onInfo(e.clientX, e.clientY) || onDog(e.clientX, e.clientY) || onSanta(e.clientX, e.clientY) || onGift(e.clientX, e.clientY) || onBox(e.clientX, e.clientY))); return; }
  const F = drag.F;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) { drag.moved = true; F.act = null; F.lean = null; F.sit = null; F.fetch = null; F.pickUp = null; F.pet = null; F.push = null; endTrick(F); F.topGoal = null; F.topPath = null; F.drag = { vx: 0 }; F.dropZ = 0; }
  if (!drag.moved) return;
  const nx = e.clientX + drag.ox;
  F.drag.vx = lerp(F.drag.vx, (nx - F.x) / .016, .3);
  /* unter dem Finger: Boden oder Blockoberfläche */
  const gy = e.clientY + drag.og + .16 * FH * HZ;
  let s = -1, zz = 0;
  for (const id of [...new Set(letters.G.map((_, i) => i))]) {
    const g2 = gy + letters.G[id].H * HZ; if (idAt(nx, g2) === id && letters.G[id].H > zz) { s = id; zz = letters.G[id].H; }
  }
  F.x = nx; F.surf = s; F.z0 = hOf(s); F.g = gy + F.z0 * HZ;
  F.a = Math.PI / 2;
});
const endDrag = () => {
  if (!drag) return;
  const F = drag.F; cv.classList.remove('grabbing');
  if (drag.moved) { F.drag = null; F.dropZ = .16; F.dropV = 0; F.goal = null; F.spot = null;
    F.x = cl(F.x, FH * .5, W - FH * .5); F.g = cl(F.g, top(), bottom());
    /* auf einen Buchstaben, wenn dort Platz ist und ein Weg hinunter; sonst daneben auf den Boden */
    let onLetter = false;
    if (F.surf >= 0) {
      const id = F.surf; let top0 = null;
      for (let r = 0; r < FH * .5 && !top0; r += 2) for (let a = 0; a < 16; a++) { const x = F.x + Math.cos(a * .3927) * r, g = F.g + Math.sin(a * .3927) * r * C; if (clearAt(id, x, g)) { top0 = { x, g }; break; } }
      const route = top0 && topRoute(id, top0);
      if (route) { F.x = top0.x; F.g = top0.g; F.z0 = hOf(id); F.spot = route.sp; F.topPath = route.pts; F.topGoal = F.topPath.shift(); F.topT = 0; F.sitDone = false; F.topWait = 2 + Math.random() * 3; onLetter = true; }
    }
    if (!onLetter) {
      let best = null; for (let r = 0; r < FH * 3 && !best; r += 3) for (let a = 0; a < 16; a++) { const x = F.x + Math.cos(a * .3927) * r, g = F.g + Math.sin(a * .3927) * r * C; if (clearAt(-1, x, g)) { best = { x, g }; break; } }
      if (best) { F.x = best.x; F.g = best.g; } F.surf = -1; F.z0 = 0; }
  }
  else tap(F);
  drag = null;
};
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);

/* Weiter: Knopf, Scrollen, Wischen */
function next(){
  if ($('faq').open) return;
  if (view !== 'pick' || !isOpen()) return;
  if (sel == null) { say('Choose your avatar first. Tap a black figure.', true); return; }
  $('nameIn').value = ''; setView('name');
  startFly('in', [{ F: fig(sel), wave: true }], $('nameC'));
}
function back(){ if ((view !== 'name' && view !== 'code') || $('faq').open || busy) return; const c = view === 'name' ? $('nameC') : $('codeC'); setView('pick'); startFly('out', [{ F: fig(sel), wave: true }], c); if (S.claims[sel] != null || c === $('nameC')) { sel = null; setView('pick'); } }
$('scroll').addEventListener('click', next);
addEventListener('keydown', e => { if (e.target.closest('input') || $('notice').open || $('faq').open || $('boxNote').open) return; if (['ArrowDown','PageDown'].includes(e.key)) next(); if (['ArrowUp','PageUp','Escape'].includes(e.key)) back(); });

$('nameForm').addEventListener('submit', e => {
  e.preventDefault();
  const n = $('nameIn').value.trim();
  if (sel == null) { setView('pick'); return; }
  if (!n) { say('Please enter your name first.', true); return; }
  if (Object.values(S.claims).some(c => c.toLowerCase() === n.toLowerCase())) { say(n + ' is already here. Try adding the first letter of your last name.', true); return; }
  if (!isOpen()) { sel = null; setView('pick'); return; }
  if (busy) return; busy = true; say('One moment …');
  const f0 = sel;
  api('join', { fig: f0, name: n }).then(d => {
    ID = { fig: d.fig, token: d.token, pin: d.pin }; saveId(); (RT.busy || Promise.resolve()).then(rtStart).then(() => rtSend({ t: 'join' }));
    S.claims[d.fig] = d.name; S.me = d.fig; sel = d.fig; $('nameIn').blur(); syncFigs(); updateMyCode();
    /* den Code einmal gross zeigen */
    $('nameForm').hidden = true; $('stageBack').hidden = true; $('pinTxt').textContent = d.pin; $('pinBox').hidden = false; $('nameStage').classList.add('pin');
    say('Save your code, then tap Got it.');
  }).catch(err => {
    say(err.message || NET, true);
    if (err.status === 409 && err.status === 409 && /figure/.test(err.message)) refresh().then(() => { syncFigs(); }).catch(() => {});
  }).finally(() => { busy = false; });
});
$('stageBack').addEventListener('click', back);
/* Aktionstasten: schwarz solange die Figur spielt, der Balken läuft dabei leer */
const ACTS = [...document.querySelectorAll('#acts button')];
for (const b of ACTS) b.addEventListener('click', () => { if (view === 'lobby' && isOpen()) { const at = Math.round(srvNow() + LEAD * 1000); if (startTrick(b.dataset.k, fig(S.me), at)) rtSend({ t: 'trick', k: b.dataset.k, at }); } });
function showActs(){
  const F = S.me != null ? fig(S.me) : null, T = F && F.trick;
  for (const b of ACTS) { const on = !!T && T.kind === b.dataset.k, p = on ? T.p : 0;
    if (b._p !== p) { b._p = p; b.style.setProperty('--p', p.toFixed(4)); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); } }
}
$('pinOk').addEventListener('click', () => { sel = null; setView('lobby'); startFly('out', [{ F: fig(S.me), wave: true }], $('nameC')); });
$('codeForm').addEventListener('submit', e => {
  e.preventDefault();
  const pin = $('codeIn').value.trim();
  if (!/^\d{4}$/.test(pin)) { say('The code has 4 digits.', true); return; }
  if (busy || sel == null) return; busy = true; say('One moment …');
  const f0 = sel;
  api('recover', { fig: f0, pin }).then(d => {
    ID = { fig: d.fig, token: d.token, pin }; saveId(); S.me = d.fig; updateMyCode(); rtStart();
    $('codeIn').blur(); sel = null; setView('lobby'); startFly('out', [{ F: fig(S.me), wave: true }], $('codeC'));
  }).catch(err => { say(err.message || NET, true); }).finally(() => { busy = false; });
});
function updateMyCode(){ const has = !!(ID && ID.pin); $('myCodeRow').hidden = !has; $('myCode').textContent = has ? ID.pin : ''; }
function showResult(){
  const r = S.draws[S.me];
  $('resTxt').innerHTML = `Your gift goes to <b>${esc(S.claims[r])}</b>`;
  setView('result');
  startFly('in', [{ F: fig(S.me), turn: -.35 }, { F: fig(r), wave: true, turn: .35 }], $('resC'));
  releaseReveal(); BOX.anim = null;
}
$('drawBtn').addEventListener('click', tapBox);
$('info').addEventListener('click', openFaq);
$('faqClose').addEventListener('click', () => $('faq').close());
/* Hinweis vor der Namenseingabe: der echte Name, damit man weiss, für wen das Geschenk ist */
let noticeT = 0;
$('noticeOk').addEventListener('click', () => $('notice').close());
$('boxNoteOk').addEventListener('click', () => $('boxNote').close());
$('boxNote').addEventListener('click', e => { if (performance.now() - faqAt < 500) return; const r = $('boxNote').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('boxNote').close(); });
$('notice').addEventListener('close', () => { if (view === 'name') setTimeout(() => $('nameIn').focus(), 50); });
/* Tipp neben das Fenster schliesst es; der Tipp, der es geöffnet hat, zählt nicht */
let faqAt = 0;
/* ---------- Pip, der Sekretär des Admins: ein kleiner Elf im Infofenster ---------- */
const ELF = { F: null, t: 0, gest: 'wave', in: 1 };
function drawElf(){
  const cvs = $('elfC'), r = cvs.getBoundingClientRect(); if (!r.width) return;
  const d = Math.min(2, Math.round(devicePixelRatio || 1)) || 1;
  if (cvs.width !== Math.round(r.width * d)) { cvs.width = Math.round(r.width * d); cvs.height = Math.round(r.height * d); }
  const c = cvs.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, r.width, r.height);
  if (!ELF.F) { ELF.F = makeFig(0); ELF.F.i = -2; ELF.F.look = { h: .9, build: .1 }; ELF.F.a = Math.PI / 2 - .25; }
  const F = ELF.F, keep = FH, fh = r.height / 1.55; FH = fh;
  const P = walkPose(F, { stride: 0 }), t = ELF.t, w = Math.sin(t * 9);
  P.pelvis.z += Math.sin(t * 2.2) * .004;
  if (ELF.gest === 'wave') { P.handR = { r: -.3, f: .1, z: 1.02 + w * .04 }; P.armsUp = true; }
  if (ELF.gest === 'psst') { P.handR = { r: -.02, f: .12, z: .76 }; }
  if (ELF.gest === 'point') { P.handR = { r: -.34, f: .3, z: .74 + Math.sin(t * 5) * .015 }; }
  if (ELF.gest === 'watch') { P.handR = { r: .02, f: .2, z: .62 }; F.a = Math.PI / 2 - .25 + Math.sin(t * 2) * .05; }
  if (ELF.gest === 'look') { P.handR = { r: -.06, f: .13, z: 1.02 }; P.yaw = Math.sin(t * 1.6) * .35; }
  if (ELF.gest === 'tap') { P.handR = { r: .12, f: .18, z: .46 + Math.abs(Math.sin(t * 7)) * .05 }; }
  P.handL = { r: .2, f: .1, z: .42 };
  const J = solveFig(F, P), rise = RM ? 0 : (1 - ez(cl(ELF.in / .45))) * r.height * .9, base = { x: r.width * .52, gy: r.height * .9 + rise, z: 0 };
  drawFig(c, F, J, base);
  const P2 = p => [base.x + p.x, sy(base.gy, p.y, p.z + base.z)], h = P2(J.headC), hr = .1 * fh * J.k;
  /* Ohren, spitz */
  c.fillStyle = INK; for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(h[0] + sd * hr * .8, h[1] - hr * .2); c.lineTo(h[0] + sd * hr * 1.75, h[1] - hr * .75); c.lineTo(h[0] + sd * hr * .7, h[1] + hr * .35); c.fill(); }
  /* Zipfelmütze in Pink mit Bommel */
  c.fillStyle = PINK; c.strokeStyle = INK; c.lineWidth = 1.4; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(h[0] - hr * 1.05, h[1] - hr * .45); c.quadraticCurveTo(h[0] - hr * .2, h[1] - hr * 2.9, h[0] + hr * 1.9, h[1] - hr * 2.2 + Math.sin(t * 3) * hr * .15); c.quadraticCurveTo(h[0] + hr * .6, h[1] - hr * 1.6, h[0] + hr * 1.05, h[1] - hr * .45); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.arc(h[0] + hr * 1.95, h[1] - hr * 2.2 + Math.sin(t * 3) * hr * .15, hr * .38, 0, 7); c.fill(); c.stroke();
  /* Klemmbrett unter dem Arm */
  const hl = P2(J.handL); c.save(); c.translate(hl[0] + fh * .02, hl[1] - fh * .1); c.rotate(.18);
  c.fillStyle = '#fff'; c.lineWidth = 1.6; c.beginPath(); c.rect(-fh * .1, -fh * .13, fh * .2, fh * .26); c.fill(); c.stroke();
  c.fillStyle = INK; c.fillRect(-fh * .045, -fh * .155, fh * .09, fh * .04);
  c.lineWidth = 1; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-fh * .06, -fh * .05 + i * fh * .055); c.lineTo(fh * .06, -fh * .05 + i * fh * .055); c.stroke(); }
  c.restore();
  FH = keep;
}
/* Pip erklärt: Zeile für Zeile, mit einer Geste und einem Satz */
const PIP = [
  [null, 'wave', "Hi, I'm Pip, the admin's secretary. Here is everything you need."],
  [0, 'point', 'Mark your calendar: Saturday, December 26th.'],
  [1, 'watch', "We start at 20:00. Don't be late."],
  [2, 'look', 'Somewhere in Zurich. The exact spot follows.'],
  [3, 'tap', 'Sign up until December 1st, 12:00.'],
  [4, 'point', 'Then tap the gift box to see who you are gifting.'],
  [5, 'psst', 'Psst. Your code is just for you. Keep it safe.'],
  [null, 'wave', "That's all. Have fun!"]
];
let pipRaf = 0;
function openFaq(){
  if ($('faq').open) return; faqAt = performance.now();
  const rows = [...$('faq').querySelectorAll('dl > div')], steps = PIP.filter(p => p[0] == null || !rows[p[0]].hidden);
  rows.forEach(r0 => r0.classList.toggle('pend', !RM));
  ELF.t = 0; ELF.in = 0; let k = -1, next = 0, last = performance.now();
  const show = i => { k = i; const [row, g, txt] = steps[i]; ELF.gest = g; $('elfSay').textContent = txt; if (row != null) rows[row].classList.remove('pend'); };
  const skip = () => { rows.forEach(r0 => r0.classList.remove('pend')); show(steps.length - 1); next = Infinity; };
  ELF.skip = skip;
  if (RM) { show(steps.length - 1); rows.forEach(r0 => r0.classList.remove('pend')); }
  $('faq').showModal();
  const tick = now => {
    if (!$('faq').open) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now; ELF.t += dt; ELF.in += dt;
    if (!RM && ELF.t >= next && k < steps.length - 1) { show(k + 1); next = ELF.t + (k === 0 ? 2.2 : 1.7); }
    drawElf(); pipRaf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(pipRaf); pipRaf = requestAnimationFrame(tick);
}
$('faq').addEventListener('click', e => {
  if (performance.now() - faqAt < 500) return;
  /* Tipp ins Fenster: alles auf einmal zeigen */
  if (e.target.closest('dl, .elf') && ELF.skip) ELF.skip();
  const r = $('faq').getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('faq').close();
});
$('resBack').addEventListener('click', () => { setView('lobby'); startFly('out', [{ F: fig(S.me), turn: -.35 }, { F: fig(S.draws[S.me]), wave: true, turn: .35 }], $('resC')); });

function loop(t){
  const dt = last ? Math.min(.04, (t - last) / 1000) : 0; last = t; clock += dt;
  if (view === 'pick' || view === 'lobby' || FLY) render(dt);
  if (view === 'name' && sel != null) drawBig($('nameC'), [{ F: fig(sel), wave: true }]);
  if (view === 'code' && sel != null) drawBig($('codeC'), [{ F: fig(sel), wave: true }]);
  if (view === 'result') drawBig($('resC'), [{ F: fig(S.me), wave: false, turn: -.35 }, { F: fig(S.draws[S.me]), wave: true, turn: .35 }]);
  drawFly(dt);
  if (view === 'lobby') showActs();
  requestAnimationFrame(loop);
}
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (innerWidth >= 50 && innerHeight >= 50) build(); measureFoot(); }, 200); });
/* ---------- Echtzeit über Ably: was eine Person macht, sehen alle anderen sofort ----------
   Empfangen per Server Sent Events, senden per REST. Der Schlüssel bleibt auf dem Server, hier gibt es nur kurzlebige Tokens. */
const RT_HOST = 'https://main.realtime.ably.net';
const RT = { on: true, es: null, tok: null, ch: null, me: null, last: null, wait: 2000, rn: 0, busy: null, seen: {} };
function rtStart(){
  if (!RT.on) return Promise.resolve();
  if (RT.busy) return RT.busy;
  RT.busy = (async () => {
    try {
      const d = await api('rt', ID ? { fig: ID.fig, token: ID.token } : {});
      if (!d || typeof d.token !== 'string' || typeof d.channel !== 'string') throw new Error('rt');
      RT.tok = d.token; RT.ch = d.channel; RT.me = d.clientId;
      if (RT.es) RT.es.close();
      const es = new EventSource(`${RT_HOST}/sse?v=1.2&channels=${encodeURIComponent(d.channel)}&accessToken=${encodeURIComponent(d.token)}` + (RT.last ? '&lastEvent=' + encodeURIComponent(RT.last) : ''));
      RT.es = es;
      es.onopen = () => { RT.wait = 2000; heartbeat(); if (!RT.hello) { RT.hello = true; rtSend({ t: 'hello' }); } };
      es.onmessage = e => { if (e.lastEventId) RT.last = e.lastEventId; try { onRt(JSON.parse(e.data)); } catch (err) {} };
      /* abgelaufen oder Verbindung weg: sauber neu verbinden, mit wachsender Pause */
      es.onerror = () => { if (RT.es !== es) return; es.close(); RT.es = null; clearTimeout(RT.rn); RT.rn = setTimeout(rtStart, RT.wait); RT.wait = Math.min(RT.wait * 2, 60000); };
      clearTimeout(RT.rn); RT.rn = setTimeout(rtStart, Math.max(60000, (d.expires || Date.now() + 3600000) - Date.now() - 300000));
    } catch (e) {
      if (e.status === 503 || e.status === 404) { RT.on = false; return; }
      clearTimeout(RT.rn); RT.rn = setTimeout(rtStart, RT.wait); RT.wait = Math.min(RT.wait * 2, 60000);
    } finally { RT.busy = null; }
  })();
  return RT.busy;
}
function rtSend(data){
  if (!RT.tok || !RT.ch) return;
  fetch(`${RT_HOST}/channels/${encodeURIComponent(RT.ch)}/messages`, { method: 'POST', cache: 'no-store', keepalive: true,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + btoa(RT.tok) },
    body: JSON.stringify({ name: 'e', data: JSON.stringify(data) }) }).catch(() => {});
}
/* wer gerade online ist: angemeldete Geräte melden sich alle 20 Sekunden */
const ONLINE = {};
const isOnline = i => i === S.me || (ONLINE[i] && performance.now() - ONLINE[i] < 50000);
function heartbeat(){ if (S.me != null && document.visibilityState === 'visible') rtSend({ t: 'hb' }); }
setInterval(heartbeat, 20000);
function onRt(m){
  if (!m || typeof m !== 'object' || m.clientId === RT.me) return;
  let d = m.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
  if (!d || typeof d !== 'object') return;
  /* nur angemeldete Figuren dürfen ihre eigene Figur bewegen; alles andere wird ignoriert */
  const from = typeof m.clientId === 'string' && /^f\d{1,2}$/.test(m.clientId) ? +m.clientId.slice(1) : null;
  if (from != null) { if (d.t === 'bye') { delete ONLINE[from]; return; } const was = isOnline(from); ONLINE[from] = performance.now(); if (!was && from !== S.me && performance.now() > 30000) wantCat(); if (d.t === 'hb') return; }
  const now = performance.now(), key = d.t + (from ?? 'v');
  if (now - (RT.seen[key] || 0) < (d.t === 'poop' ? 2500 : 400)) return; RT.seen[key] = now;
  if (d.t === 'trick' && from != null && from !== S.me && typeof d.k === 'string' && Object.hasOwn(TRICKS, d.k) && S.claims[from] != null) { const F = fig(from), at = Number(d.at); if (F && Number.isFinite(at) && Math.abs(at - srvNow()) < 15000) startTrick(d.k, F, at); }
  else if (d.t === 'poop') dogPoop();
  else if (d.t === 'hello') wantCat();
  else if (d.t === 'santa' && d.k === SANTA.k) popSanta();
  else if (d.t === 'join' && from != null && (view === 'pick' || view === 'lobby') && !busy) refresh().then(syncFigs).catch(() => {});
}

/* Start: Schrift laden, Stand vom Server holen; danach alle paar Sekunden nachfragen, solange die Seite sichtbar ist */
const firstLoad = () => refresh().catch(() => new Promise(r => setTimeout(r, 2500)).then(firstLoad));
say('One moment …');
Promise.all([document.fonts ? document.fonts.load('700 100px Jost').catch(() => {}) : null, firstLoad()]).then(() => {
  wasOpen = isOpen(); updateMyCode();
  /* manche eingebetteten Browser melden beim Start kurz keine Grösse: dann auf die erste echte Grösse warten */
  const go = () => { if (innerWidth < 50 || innerHeight < 50) { setTimeout(go, 200); return; } build(); setView(S.me != null ? 'lobby' : 'pick'); requestAnimationFrame(loop); };
  go();
  rtStart();
  /* beim Laden kommt nach ein paar Sekunden eine Katze vorbei */
  setTimeout(wantCat, 3500);
  setInterval(() => { if (document.visibilityState === 'visible' && (view === 'pick' || view === 'lobby') && !busy) refresh().then(syncFigs).catch(() => {}); }, 12000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && S.me != null) rtSend({ t: 'bye' }); if (document.visibilityState === 'visible') { heartbeat(); refresh().then(syncFigs).catch(() => {}); if (RT.on && (!RT.es || RT.es.readyState === 2)) rtStart(); } });
});
}
