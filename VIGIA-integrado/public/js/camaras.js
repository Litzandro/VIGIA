// ============ CAMARAS.JS ============
// Exclusivo de camaras.html: cada tarjeta carga una imagen real publicada
// por una fuente de gobierno (nps.gov, en.vedur.is), que se actualiza sola
// cada 60 segundos, y la refresca en el navegador con un parámetro
// anti-caché. Si una imagen falla al cargar (fuente caída, mantenimiento,
// etc.), se muestra un mensaje propio con botón de reintentar en vez de
// dejar un ícono de imagen rota o el error de un reproductor ajeno.

(function(){
  const grid=document.getElementById('camGrid');
  if(!grid) return;

  const REFRESH_MS=60000;

  grid.querySelectorAll('.cam-card').forEach(card=>{
    const baseUrl=card.dataset.img;
    const img=card.querySelector('.cam-live-img');
    const errorBox=card.querySelector('.cam-error');
    const retryBtn=card.querySelector('.cam-retry-btn');
    const fsBtn=card.querySelector('.cam-fullscreen-btn');

    function load(){
      errorBox.classList.remove('show');
      img.style.display='';
      img.src=baseUrl+'?t='+Date.now();
    }

    img.addEventListener('error',()=>{
      img.style.display='none';
      errorBox.classList.add('show');
    });

    if(retryBtn) retryBtn.addEventListener('click', load);
    if(fsBtn) fsBtn.addEventListener('click',()=>{
      if(img.requestFullscreen) img.requestFullscreen();
    });

    load();
    setInterval(load, REFRESH_MS);
  });
})();
