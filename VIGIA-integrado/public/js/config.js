// Antes estos 4 interruptores de notificaciones no guardaban nada: el
// HTML traia un estado fijo (on/off) y cualquier clic se perdia al
// recargar la pagina -- por eso siempre se veian "datos
// predeterminados". Todavia no hay una columna en la base de datos
// para preferencias de notificacion por categoria (eso requeriria una
// migracion), asi que por ahora se recuerdan por dispositivo via
// localStorage, igual que otras preferencias locales de VIGIA.
(function(){
  // Igual que vigia_accessibility en common.js: la clave se escopa por
  // cuenta para que estas preferencias no se mezclen entre distintos
  // usuarios que entran desde el mismo navegador/dispositivo.
  const session=VigiaAPI.getSession();
  const KEY=session&&session.id?`vigia_notif_prefs_${session.id}`:'vigia_notif_prefs';
  const DEFAULTS={visitas:true,incidencias:true,administracion:false,seguridad:true};
  let prefs={...DEFAULTS};
  try{prefs={...prefs,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch(e){}
  document.querySelectorAll('[data-notif-pref]').forEach(t=>{
    const key=t.dataset.notifPref;
    t.classList.toggle('on',Boolean(prefs[key]));
    t.addEventListener('click',()=>{
      prefs[key]=!prefs[key];
      t.classList.toggle('on',prefs[key]);
      try{localStorage.setItem(KEY,JSON.stringify(prefs))}catch(e){}
      showToast(prefs[key]?'Notificación activada':'Notificación desactivada');
    });
  });
})();
document.querySelectorAll('.toggle:not([data-notif-pref]):not(.disabled)').forEach(t=>t.addEventListener('click',()=>t.classList.toggle('on')));
(function(){
  if(!window.VigiaAccessibility)return;const status=document.getElementById('accessibilityStatus');let remote={};
  const mapToApi=p=>({tema:{light:'claro',soft:'suave',dark:'oscuro',high:'alto_contraste'}[p.theme]||'suave',filtro_color:{none:'ninguno',grayscale:'escala_grises',deuteranopia:'deuteranopia',protanopia:'protanopia',tritanopia:'tritanopia'}[p.filter]||'ninguno',tamano_texto:{normal:'normal',large:'grande',xl:'extra_grande'}[p.font]||'normal',lectura_asistida:Boolean(p.readAloud)});
  const mapFromApi=p=>({theme:{claro:'light',suave:'soft',oscuro:'dark',alto_contraste:'high'}[p.tema]||'soft',filter:{ninguno:'none',escala_grises:'grayscale',deuteranopia:'deuteranopia',protanopia:'protanopia',tritanopia:'tritanopia'}[p.filtro_color]||'none',font:{normal:'normal',grande:'large',extra_grande:'xl'}[p.tamano_texto]||'normal',readAloud:Boolean(p.lectura_asistida)});
  function refresh(){const p=VigiaAccessibility.get();document.querySelectorAll('[data-theme]').forEach(b=>b.classList.toggle('active',b.dataset.theme===p.theme));document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===p.filter));document.querySelectorAll('[data-font]').forEach(b=>b.classList.toggle('active',b.dataset.font===p.font));document.getElementById('readToggleBtn').classList.toggle('active',p.readAloud)}
  async function save(next){const p=VigiaAccessibility.set(next);refresh();status.innerHTML='<i class="bi bi-cloud-check-fill"></i> Preferencias guardadas';try{await VigiaAPI.request('/preferencias-usuario/me',{method:'PUT',body:JSON.stringify(mapToApi(p)),offline:false})}catch(e){status.innerHTML='<i class="bi bi-device-ssd"></i> Guardado en este dispositivo'}clearTimeout(status._t);status._t=setTimeout(()=>status.innerHTML='<i class="bi bi-check-circle"></i> Preferencias guardadas automáticamente',1800)}
  document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>save({theme:b.dataset.theme}));document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>save({filter:b.dataset.filter}));document.querySelectorAll('[data-font]').forEach(b=>b.onclick=()=>save({font:b.dataset.font}));
  document.getElementById('resetAccessibility').onclick=async()=>{VigiaAccessibility.reset();refresh();await save({});showToast('Accesibilidad restablecida')};
  document.getElementById('readToggleBtn').onclick=async()=>{const activo=!VigiaAccessibility.get().readAloud;await save({readAloud:activo});if(activo){VigiaAccessibility.announce('Lectura de pantalla activada.');setTimeout(()=>VigiaAccessibility.read(),1400)}else{VigiaAccessibility.announce('Lectura de pantalla desactivada.')}};
  document.getElementById('readNowBtn').onclick=()=>{VigiaAccessibility.read();showToast('Lectura asistida iniciada')};
  VigiaAPI.request('/preferencias-usuario/me').then(r=>{remote=r.data||{};VigiaAccessibility.set(mapFromApi(remote));refresh()}).catch(()=>refresh());
  document.getElementById('logoutBtn').onclick=async()=>{const confirmed=await VigiaConfirm({title:'¿Quieres cerrar tu sesión?',message:'Saldrás de VIGIA en este dispositivo. Para volver a entrar tendrás que iniciar sesión nuevamente.',confirmText:'Cerrar sesión',cancelText:'Cancelar',icon:'bi-box-arrow-right',tone:'alert'});if(!confirmed)return;try{await VigiaAPI.request('/auth/logout',{method:'POST',offline:false})}catch(e){}VigiaAPI.clearSession();location.replace('login.html')};refresh();
  // "Sesiones activas" antes traia un "1 dispositivo conectado
  // actualmente" fijo en el HTML. seguridad.html si consulta esto de
  // verdad (GET /auth/sessions); aca se pide lo mismo solo para
  // mostrar el numero correcto.
  const sessionsCountEl=document.getElementById('activeSessionsCount');
  if(sessionsCountEl){
    VigiaAPI.request('/auth/sessions').then(r=>{
      const activas=(r.data||[]).filter(x=>x.activa).length;
      sessionsCountEl.textContent=`${activas} ${activas===1?'dispositivo conectado':'dispositivos conectados'} actualmente`;
    }).catch(()=>{sessionsCountEl.textContent='No se pudo consultar tus sesiones activas.'});
  }
})();
