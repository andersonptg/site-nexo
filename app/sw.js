const CACHE_NAME = 'nexo-web-v2-20261031';
const SHELL = ['./','./index.html','./style.css','./features.css','./main.mjs',
  './features.mjs','./manifest.webmanifest','./firebase-config.js',
  './assets/nexo_icon.webp','./assets/nexo_halloween.webp',
  './assets/filmes_series_home.webp','./assets/ia_home.webp',
  './assets/historico_home.webp','./assets/compartilhar_app_home.webp',
  './assets/nexo_halloween_fundo.webp','./assets/login_background.webp',
  './assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME)
  .then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(names=>Promise.all(
  names.filter(n=>(n.startsWith('nexo-web-')||n.startsWith('nexo-web-mvp-'))&&n!==CACHE_NAME)
    .map(n=>caches.delete(n)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith('/site-nexo/app/'))return;
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).catch(()=>caches.match('./index.html')));return;
  }
  e.respondWith(fetch(req).then(resp=>{
    if(resp.ok) {const copy=resp.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));}
    return resp;
  }).catch(()=>caches.match(req)));
});
