import { getStore } from '@netlify/blobs';
import { makeHandler } from '../lib/core.mjs';

/* Echte Daten nur auf der Live Adresse; jede andere Vorschau schreibt in einen Testspeicher */
const live = host => host === 'bdsb.info' || host === 'www.bdsb.info' || host.startsWith('live--');

const handler = makeHandler({
  getStore: host => getStore({ name: live(host) ? 'wichteln26' : 'wichteln26-test', consistency: 'strong' }),
  env: k => Netlify.env.get(k),
});

export default handler;
export const config = { path: '/api/*', method: ['GET', 'POST'] };
