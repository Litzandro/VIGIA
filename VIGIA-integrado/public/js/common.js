// ============ CONEXION CON LA API REAL ============
// En produccion usa el mismo dominio. Solo cuando se abre con Live Server
// en localhost apunta al backend local del puerto 3000.
const VigiaAPI=(function(){
  const TOKEN_KEY='vigia_token';
  const SESSION_KEY='vigia_session';
  const OFFLINE_KEY='vigia_offline_queue_v2';
  const onLocalPreview=['localhost','127.0.0.1'].includes(location.hostname) && location.port && location.port!=='3000';
  const BASE_URL=onLocalPreview ? 'http://localhost:3000/api' : '/api';

  function getToken(){try{return localStorage.getItem(TOKEN_KEY)||''}catch(e){return ''}}
  function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(e){return null}}
  function setSession(token,user){
    const session={...user,name:user.nombre_completo||`${user.nombre||''} ${user.apellido||''}`.trim()};
    localStorage.setItem(TOKEN_KEY,token);
    localStorage.setItem(SESSION_KEY,JSON.stringify(session));
    return session;
  }
  function clearSession(){
    try{localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(SESSION_KEY)}catch(e){}
  }
  function readQueue(){try{return JSON.parse(localStorage.getItem(OFFLINE_KEY)||'[]')}catch(e){return []}}
  function writeQueue(items){try{localStorage.setItem(OFFLINE_KEY,JSON.stringify(items))}catch(e){}}
  function queueRequest(path,options){
    const item={
      id:(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random()),
      path,
      method:(options.method||'POST').toUpperCase(),
      body:options.body||null,
      createdAt:new Date().toISOString(),
      attempts:0
    };
    const q=readQueue();q.push(item);writeQueue(q);
    window.dispatchEvent(new CustomEvent('vigia:offline-queued',{detail:item}));
    return item;
  }
  async function rawFetch(path,options={}){
    const headers={'Content-Type':'application/json',...(options.headers||{})};
    const token=getToken();
    if(token)headers.Authorization='Bearer '+token;
    return fetch(BASE_URL+path,{...options,headers});
  }
  async function request(path,options={}){
    const method=(options.method||'GET').toUpperCase();
    let response;
    try{
      response=await rawFetch(path,options);
    }catch(e){
      const canQueue=!['GET','HEAD'].includes(method) && !path.startsWith('/auth/') && options.offline!==false && getToken();
      if(canQueue){
        const queued=queueRequest(path,options);
        let parsedBody=null;try{parsedBody=options.body?JSON.parse(options.body):null}catch(_){}
        return {offline:true,queued:true,queue_id:queued.id,data:parsedBody};
      }
      throw new Error('No se pudo conectar con el servidor. Confirma que VIGIA este iniciado y revisa tu conexion.');
    }
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      if(response.status===401 && path!=='/auth/login')clearSession();
      throw new Error(data.error||data.message||`Error ${response.status}`);
    }
    return data;
  }
  async function syncOffline(){
    if(!navigator.onLine||!getToken())return {processed:0,pending:readQueue().length};
    const q=readQueue();const pending=[];let processed=0;
    for(const item of q){
      try{
        const response=await rawFetch(item.path,{method:item.method,body:item.body,offline:false,headers:{'X-VIGIA-OFFLINE-ID':item.id,'X-VIGIA-OFFLINE-DATE':item.createdAt}});
        if(response.ok||response.status===409){processed++;continue;}
        item.attempts=(item.attempts||0)+1;pending.push(item);
      }catch(e){item.attempts=(item.attempts||0)+1;pending.push(item)}
    }
    writeQueue(pending);
    window.dispatchEvent(new CustomEvent('vigia:offline-synced',{detail:{processed,pending:pending.length}}));
    return {processed,pending:pending.length};
  }
  function destinationForRole(role){
    if(role==='guardia')return 'guardia.html';
    if(role==='admin'||role==='superadmin')return 'superadmin.html';
    return 'dashboard.html';
  }
  return {request,getToken,getSession,setSession,clearSession,destinationForRole,BASE_URL,syncOffline,offlineCount:()=>readQueue().length};
})();

// Evita abrir paneles protegidos sin una sesion real y valida el rol.
(function(){
  const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const publicPages=new Set(['index.html','login.html','register.html','guardia-login.html','admin-login.html','vigialanding.html','']);
  if(publicPages.has(page))return;
  const session=VigiaAPI.getSession();
  if(!session){location.replace('login.html');return}
  const role=session.rol_codigo;
  const guardPages=new Set(['guardia.html','control-acceso.html']);
  const staffPages=new Set(['conflictos.html','operaciones.html','integraciones.html','mensajeria.html']);
  const superPages=new Set(['suscripciones.html','benchmark.html']);
  if(page==='guardia.html'&&!['guardia','admin','superadmin'].includes(role))location.replace(VigiaAPI.destinationForRole(role));
  if(page==='control-acceso.html'&&!['guardia','admin'].includes(role))location.replace(VigiaAPI.destinationForRole(role));
  if(staffPages.has(page)&&!['admin','superadmin','guardia'].includes(role))location.replace(VigiaAPI.destinationForRole(role));
  if(page==='integraciones.html'&&!['admin','superadmin'].includes(role))location.replace(VigiaAPI.destinationForRole(role));
  if(superPages.has(page)&&role!=='superadmin')location.replace(VigiaAPI.destinationForRole(role));
  if(page==='superadmin.html'&&!['admin','superadmin'].includes(role))location.replace(VigiaAPI.destinationForRole(role));
})();

// ============ UTILIDADES COMUNES ============
// Nota sobre innerHTML: en toda esta seccion se arma el DOM con
// createElement/textContent en vez de innerHTML con texto interpolado,
// para no depender de escapar bien cada cadena a mano.
function showToast(message,icon){
  let toast=document.getElementById('vgToast');
  if(!toast){toast=document.createElement('div');toast.id='vgToast';toast.className='toast';document.body.appendChild(toast)}
  const iconEl=document.createElement('i');
  iconEl.className='bi '+(icon||'bi-check-circle-fill');
  const textEl=document.createElement('span');
  textEl.textContent=message==null?'':String(message);
  toast.replaceChildren(iconEl,textEl);
  toast.classList.add('show');clearTimeout(toast._timer);toast._timer=setTimeout(()=>toast.classList.remove('show'),3000);
}
window.showToast=showToast;

function escapeHtml(value){
  return String(value==null?'':value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}
window.escapeHtml=escapeHtml;

// Formatea un numero de identidad hondureno mientras se escribe:
// 0000-0000-00000 (13 digitos: departamento+municipio, ano+correlativo,
// numero de orden). Se usa en cualquier input de "Documento" de la app.
// Devuelve solo el texto formateado; quien la llama decide cuando
// engancharla al evento "input" del campo correspondiente.
function formatDocumentoHN(raw){
  const value=String(raw||'');
  // Si ya hay alguna letra (pasaporte u otro documento que no sea la
  // identidad hondurena), no tocamos nada: esta mascara es una ayuda
  // para el formato 0000-0000-00000, nunca debe bloquear otro documento.
  if(/[a-zA-Z]/.test(value))return value;
  const digits=value.replace(/[^0-9]/g,'').slice(0,13);
  const parts=[digits.slice(0,4),digits.slice(4,8),digits.slice(8,13)].filter(Boolean);
  return parts.join('-');
}
window.formatDocumentoHN=formatDocumentoHN;

// Engancha el formateo automatico a un <input>: mientras el usuario
// escribe solo numeros, los agrupa como 0000-0000-00000. En cuanto
// escribe una letra (pasaporte u otro documento), se sale del modo
// mascara y deja el campo libre, para no perder datos validos.
function attachDocumentoHNMask(input){
  if(!input)return;
  input.setAttribute('placeholder','0000-0000-00000 (u otro documento)');
  input.addEventListener('input',()=>{input.value=formatDocumentoHN(input.value)});
}
window.attachDocumentoHNMask=attachDocumentoHNMask;

// Arma un <select> de horas cada 15 minutos, mostrando 12h con AM/PM
// pero con value en 24h "HH:MM" (lo que ya espera el backend). Se usa en
// los selectores de horario de Autorizados en vez de <input type="time">,
// que en varios navegadores no deja claro si es AM o PM.
function buildAmPmTimeOptions(selected){
  const out=['<option value="">Sin restricción</option>'];
  for(let m=0;m<24*60;m+=15){
    const hh=String(Math.floor(m/60)).padStart(2,'0');
    const mm=String(m%60).padStart(2,'0');
    const value=`${hh}:${mm}`;
    const h12=((Math.floor(m/60)+11)%12)+1;
    const suffix=Math.floor(m/60)<12?'AM':'PM';
    const label=`${h12}:${mm} ${suffix}`;
    out.push(`<option value="${value}"${value===selected?' selected':''}>${label}</option>`);
  }
  return out.join('');
}
window.buildAmPmTimeOptions=buildAmPmTimeOptions;

// Convierte "HH:MM" (24h, lo que guarda el backend) a texto 12h con
// AM/PM para mostrarlo en listas y avisos. Si no hay valor, devuelve ''.
function formatHora12(hhmm){
  if(!hhmm)return'';
  const [h,m]=String(hhmm).split(':').map(Number);
  if(Number.isNaN(h)||Number.isNaN(m))return hhmm;
  const h12=((h+11)%12)+1;
  const suffix=h<12?'AM':'PM';
  return `${h12}:${String(m).padStart(2,'0')} ${suffix}`;
}
window.formatHora12=formatHora12;

// ---- Barra lateral unica, compartida por residentes y personal ----
// Antes cada pagina traia su propio <aside class="sidebar">...</aside>
// pegado a mano, y con el tiempo se desincronizaron entre si (dashboard.html
// ya no era igual a las demas). Ahora el marcado vive una sola vez en
// public/sidebar.html: aqui se descarga, se elige la plantilla segun el
// tipo de pagina (residente o personal) y se inserta en el <aside
// id="vigiaSidebar"> vacio que trae cada pagina.
const VIGIA_STAFF_PAGES=new Set(['guardia.html','control-acceso.html','conflictos.html','operaciones.html','mensajeria.html','integraciones.html','superadmin.html','suscripciones.html','benchmark.html']);
const VIGIA_SIDEBAR_COLLAPSE_KEY='vigia_sidebar_collapsed';

async function cargarSidebarUnico(){
  const sidebar=document.getElementById('vigiaSidebar');
  if(!sidebar)return;
  const current=(location.pathname.split('/').pop()||'dashboard.html').toLowerCase();
  const templateId=VIGIA_STAFF_PAGES.has(current)?'staffSidebarTemplate':'residentSidebarTemplate';

  try{
    const response=await fetch('sidebar.html',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const markup=await response.text();
    const parsed=new DOMParser().parseFromString(markup,'text/html');
    const template=parsed.getElementById(templateId);
    if(!template)throw new Error(`No existe ${templateId}`);
    sidebar.replaceChildren(document.importNode(template.content,true));
    prepararSidebarUnico(sidebar,current);
    window.dispatchEvent(new CustomEvent('vigia:sidebar-ready'));
  }catch(error){
    console.error('VIGIA: no se pudo cargar sidebar.html',error);
    const fallback=document.createElement('a');
    const session=VigiaAPI.getSession();
    fallback.href=VIGIA_STAFF_PAGES.has(current)?VigiaAPI.destinationForRole(session&&session.rol_codigo):'dashboard.html';
    fallback.className='sidebar-logo';
    fallback.textContent='VIGIA';
    sidebar.replaceChildren(fallback);
  }
}

function prepararSidebarUnico(sidebar,current){
  const session=VigiaAPI.getSession();

  sidebar.querySelectorAll('.sidebar-nav .nav-item').forEach(link=>{
    const target=(link.getAttribute('href')||'').split('/').pop().toLowerCase();
    const active=target===current;
    link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');

    if(session&&link.hasAttribute('data-role')){
      const roles=link.getAttribute('data-role').split(',').map(r=>r.trim());
      link.hidden=!roles.includes(session.rol_codigo);
    }
  });

  // Los separadores visuales tambien respetan data-role, para no dejar
  // una linea suelta cuando todo lo que agrupan queda oculto (por ejemplo,
  // un guardia sin acceso a Integraciones/Administracion/Suscripciones).
  sidebar.querySelectorAll('.sidebar-divider[data-role]').forEach(div=>{
    if(!session)return;
    const roles=div.getAttribute('data-role').split(',').map(r=>r.trim());
    div.hidden=!roles.includes(session.rol_codigo);
  });

  if(session){
    const displayName=session.name||session.nombre_completo||[session.nombre,session.apellido].filter(Boolean).join(' ')||'Usuario';
    const initials=displayName.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x.charAt(0)).join('').toUpperCase()||'VG';
    sidebar.querySelectorAll('.av').forEach(el=>el.textContent=initials);
    sidebar.querySelectorAll('.uname').forEach(el=>el.textContent=displayName);
    const home=sidebar.querySelector('#staffHomeLink');
    if(home)home.href=VigiaAPI.destinationForRole(session.rol_codigo);
  }

  const dot=sidebar.querySelector('#bellDot');
  if(dot&&localStorage.getItem('vigia_notifs_unread')==='0')dot.hidden=true;

  const logout=sidebar.querySelector('#vgLogoutBtn');
  if(logout){
    logout.addEventListener('click',async()=>{
      if(!confirm('¿Cerrar sesión?'))return;
      try{await VigiaAPI.request('/auth/logout',{method:'POST',offline:false})}catch(e){}
      VigiaAPI.clearSession();
      location.replace('login.html');
    });
  }

  // Barra retractil: solo aplica en escritorio (la version movil ya se
  // convierte en una barra superior horizontal via CSS). El estado
  // elegido se recuerda entre paginas con localStorage.
  const collapseBtn=sidebar.querySelector('#sidebarCollapseBtn');
  if(collapseBtn){
    const applyCollapsed=(collapsed)=>{
      sidebar.classList.toggle('collapsed',collapsed);
      collapseBtn.setAttribute('aria-label',collapsed?'Expandir barra lateral':'Colapsar barra lateral');
      collapseBtn.title=collapsed?'Expandir barra lateral':'Colapsar barra lateral';
    };
    let collapsed=false;
    try{collapsed=localStorage.getItem(VIGIA_SIDEBAR_COLLAPSE_KEY)==='1'}catch(e){}
    applyCollapsed(collapsed);
    collapseBtn.addEventListener('click',()=>{
      collapsed=!collapsed;
      applyCollapsed(collapsed);
      try{localStorage.setItem(VIGIA_SIDEBAR_COLLAPSE_KEY,collapsed?'1':'0')}catch(e){}
    });
  }

  tickClock();
}

cargarSidebarUnico();

// ---- Fondo ambiental interactivo ----
(function(){
  const canvas=document.getElementById('bgCanvas');if(!canvas)return;
  if(document.body.classList.contains('reduce-motion')){canvas.style.display='none';return}
  const ctx=canvas.getContext('2d');let w,h,dpr=Math.min(window.devicePixelRatio||1,2);
  function resize(){w=window.innerWidth;h=window.innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0)}
  window.addEventListener('resize',resize);resize();
  const colors=['rgba(18,232,160,0.13)','rgba(18,232,160,0.07)','rgba(27,61,40,0.38)','rgba(18,232,160,0.05)'];
  const orbs=Array.from({length:6},(_,i)=>({x:Math.random()*w,y:Math.random()*h,r:110+Math.random()*160,vx:(Math.random()-.5)*.22,vy:(Math.random()-.5)*.22,color:colors[i%colors.length]}));
  function tick(){ctx.clearRect(0,0,w,h);orbs.forEach(o=>{o.x+=o.vx;o.y+=o.vy;if(o.x< -o.r)o.x=w+o.r;if(o.x>w+o.r)o.x=-o.r;if(o.y< -o.r)o.y=h+o.r;if(o.y>h+o.r)o.y=-o.r;const g=ctx.createRadialGradient(o.x,o.y,0,o.x,o.y,o.r);g.addColorStop(0,o.color);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(o.x,o.y,o.r,0,Math.PI*2);ctx.fill()});requestAnimationFrame(tick)}
  tick();
})();

// ---- Reloj en vivo usando la zona configurada del residencial ----
function tickClock(){
  document.querySelectorAll('#clock').forEach(el=>{
    const zone=localStorage.getItem('vigia_timezone')||'America/Tegucigalpa';
    let s;try{s=new Date().toLocaleTimeString('es-HN',{hour12:false,timeZone:zone})}catch(e){s=new Date().toLocaleTimeString('es-HN',{hour12:false})}
    el.textContent='VIGIA · '+s;
  });
}
setInterval(tickClock,1000);tickClock();

// ---- Modo sin conexion y sincronizacion ----
(function(){
  const banner=document.createElement('div');banner.id='offlineBanner';banner.className='offline-banner';document.body.appendChild(banner);
  function render(){
    const count=VigiaAPI.offlineCount();
    const icon=document.createElement('i');icon.className='bi bi-wifi-off';
    const text=document.createTextNode(` Sin conexion${count?` · ${count} accion(es) pendiente(s)`:''}. VIGIA sincronizara al recuperar la señal.`);
    banner.replaceChildren(icon,text);
    banner.classList.toggle('show',!navigator.onLine||count>0);
  }
  window.addEventListener('vigia:offline-queued',()=>{render();showToast('Accion guardada sin conexion','bi-cloud-arrow-up')});
  window.addEventListener('online',async()=>{render();const r=await VigiaAPI.syncOffline();render();if(r.processed)showToast(`${r.processed} accion(es) sincronizada(s)`,'bi-cloud-check-fill')});
  window.addEventListener('offline',render);window.addEventListener('vigia:offline-synced',render);render();
  if(navigator.onLine)VigiaAPI.syncOffline().then(render);
})();

// ===== Accesibilidad global =====
(function(){
  const KEY='vigia_accessibility';
  const defaults={theme:'soft',filter:'none',font:'normal',simple:false,motion:'normal'};
  let prefs={...defaults};try{prefs={...prefs,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch(e){}
  function applyAccessibility(){
    document.body.classList.remove('theme-light','theme-soft','theme-high','filter-grayscale','filter-deuteranopia','filter-protanopia','filter-tritanopia','a11y-large','a11y-xl','simple-mode','reduce-motion');
    if(prefs.theme!=='dark')document.body.classList.add('theme-'+prefs.theme);
    if(prefs.filter!=='none')document.body.classList.add('filter-'+prefs.filter);
    if(prefs.font!=='normal')document.body.classList.add('a11y-'+prefs.font);
    if(prefs.simple)document.body.classList.add('simple-mode');
    if(prefs.motion==='reduced')document.body.classList.add('reduce-motion');
    localStorage.setItem(KEY,JSON.stringify(prefs));
  }
  window.VigiaAccessibility={get:()=>({...prefs}),set:(next)=>{prefs={...prefs,...next};applyAccessibility();return {...prefs}},reset:()=>{prefs={...defaults};applyAccessibility();return {...prefs}},apply:applyAccessibility};
  applyAccessibility();
})();

// ---- Seguridad de sesion: expiracion del JWT e inactividad ----
(function(){
  const token=VigiaAPI.getToken();if(!token)return;
  let payload=null;try{payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))}catch(e){}
  const expMs=payload&&payload.exp?payload.exp*1000:null;
  const logout=async(reason)=>{
    try{await VigiaAPI.request('/auth/logout',{method:'POST',offline:false})}catch(e){}
    VigiaAPI.clearSession();
    if(reason)sessionStorage.setItem('vigia_logout_reason',reason);
    location.replace('login.html');
  };
  if(expMs){const delay=expMs-Date.now();if(delay<=0){logout('Tu sesion expiro.');return}setTimeout(()=>logout('Tu sesion expiro.'),delay)}
  const maxIdle=30*60*1000;let timer,warned=false;
  function reset(){warned=false;clearTimeout(timer);timer=setTimeout(()=>logout('La sesion se cerro por inactividad.'),maxIdle)}
  ['click','keydown','touchstart','scroll'].forEach(ev=>addEventListener(ev,reset,{passive:true}));reset();
  setInterval(()=>{if(!warned&&timer&&expMs&&expMs-Date.now()<120000){warned=true;showToast('Tu sesion expirara pronto. Guarda tus cambios.','bi-clock-history')}},30000);
})();

// PWA: cachea la interfaz para poder abrirla sin señal.
(function(){if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('/sw.js').catch(()=>{})})();

// F12 y accesos directos: disuasion visual solamente. La seguridad real
// esta en permisos, sesiones, validacion del servidor y bitacora.
document.addEventListener('keydown',e=>{
  const dev=e.key==='F12'||(e.ctrlKey&&e.shiftKey&&['I','J','C'].includes(e.key.toUpperCase()))||(e.ctrlKey&&e.key.toUpperCase()==='U');
  if(dev){e.preventDefault();showToast('Accion deshabilitada en esta demostracion','bi-shield-lock-fill')}
});
document.addEventListener('contextmenu',e=>{if(document.body.dataset.protectDemo==='true')e.preventDefault()});

// ---- Evita que el boton del asistente se sobreponga a los botones de
// panico (ambos flotan en la esquina inferior derecha en incidencias.html)
(function(){
  if(document.querySelector('.panic-group')){
    document.body.classList.add('has-panic-fab');
  }
})();

// ---- Asistente VIGIA local (reglas, no envía conversaciones a terceros) ----
(function(){
  if(document.getElementById('vigiaAssistantBtn'))return;

  const btn=document.createElement('button');
  btn.id='vigiaAssistantBtn';btn.className='assistant-fab';btn.type='button';
  btn.setAttribute('aria-label','Abrir asistente VIGIA');
  const btnIcon=document.createElement('i');btnIcon.className='bi bi-chat-dots-fill';btn.appendChild(btnIcon);

  const panel=document.createElement('section');
  panel.id='vigiaAssistant';panel.className='assistant-panel';

  const head=document.createElement('div');head.className='assistant-head';
  const headCopy=document.createElement('div');
  const title=document.createElement('b');title.textContent='Asistente VIGIA';
  const subtitle=document.createElement('span');subtitle.textContent='Guía local y privada';
  headCopy.append(title,subtitle);
  const close=document.createElement('button');close.type='button';close.setAttribute('aria-label','Cerrar');
  const closeIcon=document.createElement('i');closeIcon.className='bi bi-x-lg';close.appendChild(closeIcon);
  head.append(headCopy,close);

  const messages=document.createElement('div');messages.className='assistant-messages';
  const welcome=document.createElement('div');welcome.className='assistant-msg bot';
  welcome.textContent='Puedo ayudarte a registrar una visita, reportar una incidencia, consultar vetos o encontrar contactos de emergencia.';
  messages.appendChild(welcome);

  const suggestions=document.createElement('div');suggestions.className='assistant-suggestions';
  [['visita','Registrar visita'],['incidencia','Reportar incidencia'],['emergencia','Emergencia'],['accesibilidad','Accesibilidad']].forEach(([q,label])=>{
    const b=document.createElement('button');b.type='button';b.dataset.q=q;b.textContent=label;suggestions.appendChild(b);
  });

  const form=document.createElement('form');form.className='assistant-input';
  const input=document.createElement('input');input.maxLength=180;input.placeholder='Escribe una pregunta breve';
  const send=document.createElement('button');send.type='submit';send.setAttribute('aria-label','Enviar');
  const sendIcon=document.createElement('i');sendIcon.className='bi bi-send-fill';send.appendChild(sendIcon);
  form.append(input,send);

  panel.append(head,messages,suggestions,form);
  document.body.append(btn,panel);

  function answer(q){
    const t=q.toLowerCase();
    let text='Puedo orientarte dentro de VIGIA. Prueba con “visita”, “incidencia”, “veto”, “emergencia” o “accesibilidad”.',href='';
    if(/visita|autoriza/.test(t)){text='Para una visita ocasional usa Mis visitas. Para buses escolares o personas recurrentes usa Personas autorizadas.';href='visitas.html'}
    else if(/incidencia|reporte/.test(t)){text='Abre Incidencias, agrega una descripción breve y una fotografía. Solo verás tus propios reportes.';href='incidencias.html'}
    else if(/veto|bloque/.test(t)){text='Desde Vetos puedes enviar una solicitud. Administración resuelve los conflictos antes de que garita permita el acceso.';href='vetos.html'}
    else if(/emergencia|ayuda|teléfono|telefono/.test(t)){text='Abre Contactos de emergencia para llamar rápidamente a seguridad, atención médica, administración o un contacto privado.';href='emergencias.html'}
    else if(/acces|letra|color|anciano|mayor/.test(t)){text='En Configuración puedes activar modo simple, texto grande, alto contraste, filtros de color y lectura asistida.';href='config.html'}
    else if(/segur|robaron|dispositivo|sesión|sesion/.test(t)){text='En Seguridad puedes revocar el dispositivo perdido y cerrar las demás sesiones.';href='seguridad.html'}

    const mine=document.createElement('div');mine.className='assistant-msg user';mine.textContent=q;messages.appendChild(mine);

    const bot=document.createElement('div');bot.className='assistant-msg bot';
    bot.appendChild(document.createTextNode(text));
    if(href){
      bot.appendChild(document.createTextNode(' '));
      const link=document.createElement('a');link.href=href;link.textContent='Abrir módulo';
      bot.appendChild(link);
    }
    messages.appendChild(bot);
    messages.scrollTop=messages.scrollHeight;
  }

  btn.addEventListener('click',()=>{panel.classList.toggle('open');if(panel.classList.contains('open'))input.focus()});
  close.addEventListener('click',()=>panel.classList.remove('open'));
  suggestions.querySelectorAll('[data-q]').forEach(b=>b.addEventListener('click',()=>answer(b.dataset.q)));
  form.addEventListener('submit',e=>{e.preventDefault();const q=input.value.trim();if(!q)return;answer(q);input.value=''});
})();
