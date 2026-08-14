const CACHE='vigia-ui-v4';
const CORE=['/','/index.html','/login.html','/css/style.css','/js/common.js','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.pathname.startsWith('/api/'))return;
  // Solo intervenimos peticiones del propio dominio (HTML/CSS/JS propios).
  // Los recursos de otros dominios (Bootstrap Icons, Google Fonts, la foto
  // de fondo) deben ir directo al navegador: si el service worker los
  // reintenta con fetch() aqui adentro, quedan sujetos al "connect-src" del
  // CSP de la pagina (que solo permite 'self'), y el navegador los bloquea
  // silenciosamente. Por eso nunca cargaban los iconos ni las fuentes.
  if(u.origin!==self.location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/index.html'))));
});
