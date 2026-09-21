const CACHE='vigia-ui-v7';
const CORE=['/','/index.html','/login.html','/css/style.css','/js/common.js','/manifest.webmanifest','/img/logo.png','/img/favicon-32.png'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(CORE))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);

  if(request.method!=='GET' || url.pathname.startsWith('/api/')) return;
  if(url.origin!==self.location.origin) return;

  event.respondWith((async()=>{
    try{
      const response=await fetch(request);

      // No guardar redirecciones (por ejemplo dashboard -> login cuando
      // expira la sesion) ni respuestas de error bajo la URL original.
      if(response.ok && !response.redirected){
        const cache=await caches.open(CACHE);
        cache.put(request,response.clone()).catch(()=>{});
      }
      return response;
    }catch(error){
      const exact=await caches.match(request);
      if(exact) return exact;

      // Un fallback HTML solo tiene sentido para una NAVEGACION. Antes se
      // devolvia index.html tambien para .js/.css y el navegador intentaba
      // interpretar HTML como JavaScript: "Unexpected token '<'".
      if(request.mode==='navigate'){
        return (await caches.match('/index.html')) || (await caches.match('/login.html')) || Response.error();
      }

      return Response.error();
    }
  })());
});
