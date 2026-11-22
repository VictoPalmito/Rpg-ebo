/* Taverna20 — service worker.
   Arquivos do próprio app: rede primeiro (sempre pega a versão nova), cache só como reserva offline.
   Bibliotecas e fontes de CDN: cache com atualização em segundo plano.
   Chamadas às APIs de IA, PeerJS e qualquer POST nunca passam por aqui. */
const V = 'taverna20-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const CDN = /^(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(V)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => (k.startsWith('mesa-') || k.startsWith('taverna20-')) && k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  try {
    // no-cache: o GitHub Pages deixa os arquivos em cache ~10 min; assim o app sempre revalida e pega a versão nova
    const res = await fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }));
    if (res && res.ok) { const c = await caches.open(V); c.put(req, res.clone()); }
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const page = (await caches.match('index.html')) || (await caches.match('./'));
      if (page) return page;
    }
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const c = await caches.open(V), hit = await c.match(req);
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) return e.respondWith(networkFirst(r));
  if (CDN.test(u.hostname)) return e.respondWith(staleWhileRevalidate(r));
});
