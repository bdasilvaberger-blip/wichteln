import { getStore } from '@netlify/blobs';
import { makeHandler } from '../lib/core.mjs';

/* Echte Daten nur auf der Live Adresse; jede andere Vorschau schreibt in einen Testspeicher */
const live = host => ['bdsb.info', 'www.bdsb.info', 'wichteln-2026-4qxk.netlify.app'].includes(host);

const handler = makeHandler({
  getStore: host => getStore({ name: live(host) ? 'wichteln26' : 'wichteln26-test', consistency: 'strong' }),
  env: k => Netlify.env.get(k),
});

export default handler;
export const config = { path: '/api/*', method: ['GET', 'POST'] };
