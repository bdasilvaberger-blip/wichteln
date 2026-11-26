const $ = id => document.getElementById(id);
const call = async (path, body) => {
  const r = await fetch('/wichteln26/api/admin/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: $('key').value, ...body }), cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Error');
  return d;
};
async function load(){
  $('msg').textContent = '';
  try {
    const d = await call('list');
    $('sum').textContent = `${d.people.length} signed up. Registration ${d.open ? 'open' : 'closed'}${d.drawn ? ', drawn' : ''}.`;
    const t = $('t'); t.replaceChildren();
    for (const p of d.people) {
      const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td'), c = document.createElement('td');
      a.textContent = p.name; b.textContent = new Date(p.at).toLocaleString('en-GB');
      /* neuer Code, falls jemand seinen verloren hat: wird nur hier angezeigt */
      const nc = document.createElement('button'), code = document.createElement('span'); nc.className = 'ghost'; nc.type = 'button'; nc.textContent = 'New code'; code.className = 'code';
      nc.onclick = async () => { if (!confirm(`Create a new code for ${p.name}? The old code stops working. Devices already signed in stay signed in.`)) return;
        try { const r = await call('newcode', { fig: p.fig }); code.textContent = r.pin; nc.hidden = true; } catch (e) { $('msg').textContent = e.message; } };
      c.append(code, nc);
      if (!d.drawn) { const x = document.createElement('button'); x.className = 'ghost'; x.type = 'button'; x.textContent = 'Remove';
        x.onclick = async () => { if (!confirm(`Remove ${p.name}?`)) return; try { await call('remove', { fig: p.fig }); load(); } catch (e) { $('msg').textContent = e.message; } };
        c.append(x); }
      tr.append(a, b, c); t.append(tr);
    }
    $('reset').hidden = false;
  } catch (e) { $('msg').textContent = e.message; }
}
$('f').addEventListener('submit', e => { e.preventDefault(); load(); });
$('reset').addEventListener('click', async () => {
  if (prompt('Delete all sign-ups? Type DELETE ALL') !== 'DELETE ALL') return;
  try { await call('reset', { confirm: 'DELETE ALL' }); load(); } catch (e) { $('msg').textContent = e.message; }
});
