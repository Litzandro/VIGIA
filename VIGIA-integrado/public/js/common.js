// ============ CONEXION CON LA API REAL ============
// En produccion usa el mismo dominio. Solo cuando se abre con Live Server
// en localhost apunta al backend local del puerto 3000.
const VigiaAPI=(function(){
  const TOKEN_KEY='vigia_token';
  const SESSION_KEY='vigia_session';
  const OFFLINE_KEY='vigia_offline_queue_v2';
  const onLocalPreview=['localhost','127.0.0.1'].includes(location.hostname) && location.port && location.port!=='3000';
  const BASE_URL=onLocalPreview ? 'http://localhost:3000/api' : '/api';

  // El token de sesion real vive en una cookie httpOnly que pone el
  // backend (src/controllers/authController.js); JavaScript no puede
  // leerla ni un script inyectado por XSS puede robarla. getToken() ya
  // no guarda nada sensible: solo queda por compatibilidad con codigo
  // que la llama para saber "hay sesion" (ver getSession() abajo, que
  // es la forma correcta de chequear eso).
  function getToken(){try{return localStorage.getItem(TOKEN_KEY)||''}catch(e){return ''}}
  function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(e){return null}}
  function setSession(user,expiraEn){
    // expiraEn (fecha ISO) no es sensible -sirve solo para el temporizador
    // de auto-logout del cliente-, a diferencia del token, que ya nunca
    // pasa por aqui: vive unicamente en la cookie httpOnly del backend.
    const session={...user,name:user.nombre_completo||`${user.nombre||''} ${user.apellido||''}`.trim(),expira_en:expiraEn||null};
    try{localStorage.removeItem(TOKEN_KEY)}catch(e){}
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
    // credentials:'include' hace que el navegador mande la cookie
    // httpOnly de sesion en cada request (incluso a localhost:3000
    // cuando se previsualiza en otro puerto con Live Server).
    return fetch(BASE_URL+path,{...options,headers,credentials:'include'});
  }
  async function request(path,options={}){
    const method=(options.method||'GET').toUpperCase();
    let response;
    try{
      response=await rawFetch(path,options);
    }catch(e){
      const canQueue=!['GET','HEAD'].includes(method) && !path.startsWith('/auth/') && options.offline!==false && getSession();
      if(canQueue){
        const queued=queueRequest(path,options);
        let parsedBody=null;try{parsedBody=options.body?JSON.parse(options.body):null}catch(_){}
        return {offline:true,queued:true,queue_id:queued.id,data:parsedBody};
      }
      throw new Error('No se pudo conectar con el servidor. Confirma que VIGIA este iniciado y revisa tu conexion.');
    }
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      if(response.status===401 && path!=='/auth/login'){
        console.warn('[VIGIA] 401 en',path,'- se borro la sesion local.',data);
        const rolAntesDeLimpiar=(getSession()||{}).rol_codigo;
        clearSession();
        // Antes esto se quedaba aqui: la sesion se borraba en silencio
        // pero la pantalla seguia mostrando el panel como si la persona
        // siguiera con sesion activa (su nombre, su avatar, el sidebar
        // completo ya estaban pintados desde antes). Si tocaba cualquier
        // otro boton, volvia a chocar con el mismo error una y otra vez,
        // sin que nada la mandara de vuelta a iniciar sesion. Pasa de
        // verdad: el token expira solo (JWT_EXPIRES_IN, 8h por defecto),
        // asi que dejar la pestana abierta toda la noche y volver a
        // usarla al dia siguiente basta para reproducirlo.
        const paginaActual=(location.pathname.split('/').pop()||'').toLowerCase();
        const paginasPublicas=['','index.html','login.html','register.html','guardia-login.html','admin-login.html','vigialanding.html','recuperar-password.html','restablecer-password.html','terminos.html'];
        if(!paginasPublicas.includes(paginaActual)){
          const loginPorRol={guardia:'guardia-login.html',admin:'admin-login.html',superadmin:'admin-login.html'};
          const destino=loginPorRol[rolAntesDeLimpiar]||'login.html';
          location.replace(`${destino}?sesion=expirada`);
        }
      }
      // Antes se perdia "detalle" (el mensaje real del error de SQL que
      // manda errorHandler.js en SequelizeDatabaseError, ej. tabla o
      // columna que no existe) -- solo se mostraba el mensaje generico
      // "Error de base de datos", asi que para diagnosticar algo asi
      // habia que ir a los logs de Railway a mano. Ahora, si el
      // servidor manda un detalle, se pega al mensaje entre parentesis
      // para poder verlo directo en el toast/pantalla.
      const mensajeBase=data.error||data.message||`Error ${response.status}`;
      throw new Error(data.detalle?`${mensajeBase} (${data.detalle})`:mensajeBase);
    }
    return data;
  }
  async function syncOffline(){
    if(!navigator.onLine||!getSession())return {processed:0,pending:readQueue().length};
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

// ============ CONFIRMACION VISUAL VIGIA ============
// Sustituye los confirm() nativos del navegador en acciones importantes.
// Devuelve una Promise<boolean> para poder usar: if (!(await VigiaConfirm(...))) return;
window.VigiaConfirm=function(options={}){
  const config={
    eyebrow:'SEGURIDAD DE CUENTA',
    title:'¿Confirmar acción?',
    message:'Esta acción requiere tu confirmación.',
    confirmText:'Confirmar',
    cancelText:'Cancelar',
    icon:'bi-shield-check',
    tone:'alert',
    ...options
  };

  return new Promise(resolve=>{
    const previous=document.querySelector('.vigia-confirm-overlay');
    if(previous)previous.remove();

    const overlay=document.createElement('div');
    overlay.className='vigia-confirm-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-labelledby','vigiaConfirmTitle');
    overlay.setAttribute('aria-describedby','vigiaConfirmMessage');

    const dialog=document.createElement('div');
    dialog.className=`vigia-confirm-box ${config.tone==='alert'?'is-alert':''}`;
    dialog.innerHTML=`
      <button type="button" class="vigia-confirm-close" aria-label="Cerrar"><i class="bi bi-x-lg"></i></button>
      <div class="vigia-confirm-icon" aria-hidden="true"><i class="bi ${config.icon}"></i></div>
      <span class="vigia-confirm-eyebrow"></span>
      <h3 id="vigiaConfirmTitle"></h3>
      <p id="vigiaConfirmMessage"></p>
      <div class="vigia-confirm-actions">
        <button type="button" class="btn btn-ghost" data-vigia-cancel></button>
        <button type="button" class="btn btn-alert" data-vigia-confirm><i class="bi bi-box-arrow-right"></i><span></span></button>
      </div>`;

    dialog.querySelector('.vigia-confirm-eyebrow').textContent=config.eyebrow;
    dialog.querySelector('#vigiaConfirmTitle').textContent=config.title;
    dialog.querySelector('#vigiaConfirmMessage').textContent=config.message;
    dialog.querySelector('[data-vigia-cancel]').textContent=config.cancelText;
    dialog.querySelector('[data-vigia-confirm] span').textContent=config.confirmText;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const cancelBtn=dialog.querySelector('[data-vigia-cancel]');
    const confirmBtn=dialog.querySelector('[data-vigia-confirm]');
    const closeBtn=dialog.querySelector('.vigia-confirm-close');
    let settled=false;

    const finish=value=>{
      if(settled)return;
      settled=true;
      document.removeEventListener('keydown',onKeydown);
      overlay.classList.remove('open');
      setTimeout(()=>overlay.remove(),180);
      resolve(value);
    };
    const onKeydown=e=>{
      if(e.key==='Escape')finish(false);
      if(e.key==='Tab'){
        const focusable=[closeBtn,cancelBtn,confirmBtn];
        const current=focusable.indexOf(document.activeElement);
        if(e.shiftKey&&current===0){e.preventDefault();confirmBtn.focus();}
        else if(!e.shiftKey&&current===focusable.length-1){e.preventDefault();closeBtn.focus();}
      }
    };

    cancelBtn.addEventListener('click',()=>finish(false));
    closeBtn.addEventListener('click',()=>finish(false));
    confirmBtn.addEventListener('click',()=>finish(true));
    overlay.addEventListener('click',e=>{if(e.target===overlay)finish(false)});
    document.addEventListener('keydown',onKeydown);

    requestAnimationFrame(()=>{
      overlay.classList.add('open');
      cancelBtn.focus();
    });
  });
};

// Evita abrir paneles protegidos sin una sesion real y valida el rol.
(function(){
  const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  // "terminos.html" se agrega aqui a proposito: antes no estaba en esta
  // lista, asi que alguien sin sesion (por ejemplo, alguien en login.html
  // que le da clic a "Terminos y Condiciones" antes de tener cuenta)
  // quedaba atrapado en un ciclo -- este mismo guard lo rebotaba de
  // vuelta a login.html apenas cargaba la pagina de terminos, sin llegar
  // nunca a leerlos.
  const publicPages=new Set(['index.html','login.html','register.html','guardia-login.html','admin-login.html','vigialanding.html','recuperar-password.html','restablecer-password.html','terminos.html','']);
  if(publicPages.has(page))return;
  const session=VigiaAPI.getSession();
  if(!session){console.warn('[VIGIA] Guard de pagina: no hay sesion en localStorage al cargar',page);location.replace('login.html');return}
  const role=session.rol_codigo;
  const guardPages=new Set(['guardia.html','control-acceso.html']);
  const staffPages=new Set(['conflictos.html','operaciones.html','integraciones.html','mensajeria.html']);
  const superPages=new Set(['suscripciones.html','benchmark.html']);
  if(page==='dashboard.html'&&role!=='residente')location.replace(VigiaAPI.destinationForRole(role));
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

// Formatea un numero de telefono hondureno: 8 digitos agrupados como
// 9999-0000. A diferencia de formatDocumentoHN, aqui SI se bloquean las
// letras por completo (estos campos son especificamente numericos, a
// diferencia de "Documento" que a veces es un pasaporte).
function formatTelefonoHN(raw){
  const digits=String(raw||'').replace(/[^0-9]/g,'').slice(0,8);
  const parts=[digits.slice(0,4),digits.slice(4,8)].filter(Boolean);
  return parts.join('-');
}
window.formatTelefonoHN=formatTelefonoHN;

// Evita doble envio de formularios: deshabilita el boton y le pone un
// texto de "enviando" mientras la promesa de fn() esta pendiente, y
// siempre lo restaura al terminar (exito o error), para que quien haga
// clic dos veces rapido -o tenga conexion lenta- no dispare la misma
// peticion (crear incidencia, autorizacion, etc.) por duplicado.
async function withSubmitLock(btn,fn,busyHTML){
  if(!btn)return fn();
  if(btn.disabled)return; // ya hay un envio en curso, ignora el clic
  const originalHTML=btn.innerHTML;
  btn.disabled=true;
  if(busyHTML)btn.innerHTML=busyHTML;
  try{
    return await fn();
  }finally{
    btn.disabled=false;
    btn.innerHTML=originalHTML;
  }
}
window.withSubmitLock=withSubmitLock;

// Engancha el bloqueo real de letras a un <input> de telefono: la tecla
// se bloquea en el momento (keydown), asi la letra nunca llega ni a
// aparecer un instante en la caja. El "input" de respaldo limpia
// cualquier caracter que se cuele por otra via (pegar, autocompletar,
// teclado de celular) y agrupa como 9999-0000.
function attachTelefonoHNMask(input){
  if(!input)return;
  input.setAttribute('placeholder','9999-0000');
  input.setAttribute('inputmode','numeric');
  input.addEventListener('keydown',(e)=>{
    if(e.ctrlKey||e.metaKey||e.altKey)return; // deja pasar atajos (copiar, pegar, seleccionar todo...)
    const allowed=['Backspace','Delete','Tab','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];
    if(allowed.includes(e.key))return;
    if(e.key.length===1 && !/[0-9]/.test(e.key))e.preventDefault();
  });
  input.addEventListener('input',()=>{input.value=formatTelefonoHN(input.value)});
}
window.attachTelefonoHNMask=attachTelefonoHNMask;

// Bloquea numeros y la mayoria de simbolos en un campo de nombre, en
// tiempo real (no solo al enviar el formulario) -- deja pasar letras,
// acentos, espacios, apostrofe y guion (para "O'Brien" o "Ana-Sofía").
// El backend (src/config/resourceValidation.js) tiene la misma regla
// como ultima linea de defensa; esto es solo para que la persona vea
// el problema en el momento, no despues de enviar.
const RE_LETRAS_INPUT=/[^A-Za-zÀ-ÖØ-öø-ÿÑñ'.\- ]/g;
function attachSoloLetras(input,maxlength){
  if(!input)return;
  if(maxlength)input.setAttribute('maxlength',String(maxlength));
  input.addEventListener('input',()=>{
    const cursor=input.selectionStart;
    const limpio=input.value.replace(RE_LETRAS_INPUT,'');
    if(limpio!==input.value){
      const quitados=input.value.length-limpio.length;
      input.value=limpio;
      if(cursor!=null)input.setSelectionRange(cursor-quitados,cursor-quitados);
    }
  });
}
window.attachSoloLetras=attachSoloLetras;

// Convierte a mayusculas mientras se escribe -- placas de vehiculo
// (HAA-1234) se ven y se buscan siempre en mayuscula por convencion,
// asi que evita que "haa-1234" y "HAA-1234" parezcan cosas distintas.
function attachMayusculas(input){
  if(!input)return;
  input.addEventListener('input',()=>{
    const cursor=input.selectionStart;
    input.value=input.value.toUpperCase();
    if(cursor!=null)input.setSelectionRange(cursor,cursor);
  });
}
window.attachMayusculas=attachMayusculas;

// Antepone visualmente "+504" al campo de telefono (VIGIA opera solo en
// Honduras por ahora, asi que es un prefijo fijo, no un dropdown de varios
// paises). Envuelve el <input> existente en un grupo con el codigo de pais
// a la izquierda, sin tocar el valor que guarda el input (sigue siendo solo
// los 8 digitos locales; el backend decide si concatena el +504 al guardar).
function attachPhoneCountryCode(input){
  if(!input || input.closest('.phone-group'))return;
  const group=document.createElement('div');group.className='phone-group';
  const prefix=document.createElement('span');prefix.className='phone-group-prefix';
  prefix.innerHTML='<span class="phone-flag" aria-hidden="true">🇭🇳</span> +504';
  input.parentNode.insertBefore(group,input);
  group.appendChild(prefix);group.appendChild(input);
  input.setAttribute('aria-label','Telefono (Honduras, +504)');
}
window.attachPhoneCountryCode=attachPhoneCountryCode;

// ---- Barra lateral unica, compartida por residentes y personal ----
// Antes cada pagina traia su propio <aside class="sidebar">...</aside>
// pegado a mano, y con el tiempo se desincronizaron entre si (dashboard.html
// ya no era igual a las demas). Ahora el marcado vive una sola vez en
// public/sidebar.html: aqui se descarga, se elige la plantilla segun el
// tipo de pagina (residente o personal) y se inserta en el <aside
// id="vigiaSidebar"> vacio que trae cada pagina.
//
// Bug real corregido: antes esto se decidia por una lista fija de
// nombres de archivo (VIGIA_STAFF_PAGES) -- es decir, por la PAGINA en
// la que estas, no por QUIEN inicio sesion. Cualquier pagina que no
// estuviera en esa lista (terminos.html, config.html, perfil.html,
// notificaciones.html) siempre mostraba el sidebar de
// residente, aunque un guardia o un admin la tuviera abierta -- por
// eso un guardia que entraba a "Terminos y Condiciones" veia el menu y
// el logo del portal de residente (el logo llevaba a dashboard.html en
// vez de a su propio inicio). Ahora se decide por el ROL de la sesion
// activa, que es lo correcto: una pagina compartida debe verse
// distinta segun quien la abre, no siempre igual.
const VIGIA_SIDEBAR_COLLAPSE_KEY='vigia_sidebar_collapsed';
const VIGIA_ROLES_PERSONAL=['guardia','admin','superadmin'];

async function cargarSidebarUnico(){
  const sidebar=document.getElementById('vigiaSidebar');
  if(!sidebar)return;
  const current=(location.pathname.split('/').pop()||'dashboard.html').toLowerCase();
  const session=VigiaAPI.getSession();

  // Alguien sin sesion (por ejemplo, revisando "Terminos y Condiciones"
  // desde login.html antes de tener cuenta) no deberia ver el menu
  // completo de la app -- ningun enlace le serviria, todos lo rebotarian
  // de vuelta a login. Se muestra un encabezado minimo en su lugar.
  if(!session){
    sidebar.innerHTML='<div class="sidebar-header"><a href="vigialanding.html" class="sidebar-logo"><span class="mark" aria-hidden="true"><i class="bi bi-shield-lock-fill"></i></span><span class="label">VIGIA</span></a></div><div style="margin-top:1rem;"><a href="login.html" class="nav-item"><i class="bi bi-box-arrow-in-right"></i><span class="label">Iniciar sesión</span></a></div>';
    window.dispatchEvent(new CustomEvent('vigia:sidebar-ready'));
    return;
  }

  const esPersonal=Boolean(session&&VIGIA_ROLES_PERSONAL.includes(session.rol_codigo));
  const templateId=esPersonal?'staffSidebarTemplate':'residentSidebarTemplate';

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
    fallback.href=esPersonal?VigiaAPI.destinationForRole(session&&session.rol_codigo):'dashboard.html';
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
  // Nada en el proyecto escribia jamas 'vigia_notifs_unread' -- el punto
  // rojo del timbre quedaba fijo segun el HTML, sin relacion con si de
  // verdad tenias notificaciones sin leer. Se consulta /notificaciones
  // (la misma fuente que ya usa notificaciones.js) y se cuenta lo no
  // leido de verdad, respetando las categorias que la persona apago en
  // Configuracion (misma logica de notificaciones.js, duplicada aca a
  // proposito: cada script se carga por separado en cada pagina).
  if(dot&&session){
    (async()=>{
      try{
        const r=await VigiaAPI.request('/notificaciones?limit=100');
        const KEY=session.id?`vigia_notif_prefs_${session.id}`:'vigia_notif_prefs';
        const DEFAULTS={visitas:true,incidencias:true,administracion:false,seguridad:true};
        let prefs={...DEFAULTS};
        try{prefs={...prefs,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch(e){}
        const TIPO_A_CATEGORIA={ingreso_visita:'visitas',incidencia:'incidencias',comunidad:'administracion',alerta:'seguridad'};
        const noLeidas=(r.data||[]).filter(n=>{
          if(n.leida||['paquete','llegada_segura'].includes(n.tipo))return false;
          const cat=TIPO_A_CATEGORIA[n.tipo];
          return !(cat&&prefs[cat]===false);
        }).length;
        localStorage.setItem('vigia_notifs_unread',String(noLeidas));
        dot.hidden=noLeidas===0;
      }catch(e){/* si falla la consulta, se deja el punto como estaba */}
    })();
  }else if(dot&&localStorage.getItem('vigia_notifs_unread')==='0'){
    dot.hidden=true;
  }

  const logout=sidebar.querySelector('#vgLogoutBtn');
  if(logout){
    logout.addEventListener('click',async()=>{
      const confirmed=await VigiaConfirm({
        title:'¿Quieres cerrar tu sesión?',
        message:'Saldrás de VIGIA en este dispositivo. Para volver a entrar tendrás que iniciar sesión nuevamente.',
        confirmText:'Cerrar sesión',
        cancelText:'Cancelar',
        icon:'bi-box-arrow-right',
        tone:'alert'
      });
      if(!confirmed)return;
      try{await VigiaAPI.request('/auth/logout',{method:'POST',offline:false})}catch(e){}
      VigiaAPI.clearSession();
      location.replace('login.html');
    });
  }

  // Barra retractil en escritorio (icono se achica) / cajon deslizable
  // en movil (menu de pantalla completa con fondo oscuro detras) -- el
  // mismo boton hace las dos cosas segun el ancho de pantalla, para no
  // duplicar marcado. Antes, en movil, la navegacion se intentaba meter
  // en una fila horizontal apretada junto con "Terminos y Condiciones",
  // el reloj y el usuario -- en pantallas angostas de verdad eso dejaba
  // la navegacion invisible (ver el comentario largo en style.css).
  const collapseBtn=sidebar.querySelector('#sidebarCollapseBtn');
  const esMovil=()=>window.matchMedia('(max-width:860px)').matches;

  let backdrop=document.querySelector('.sidebar-backdrop');
  if(!backdrop){
    backdrop=document.createElement('div');
    backdrop.className='sidebar-backdrop';
    // CORRECCION BUG REAL (menu movil se ve pero no se puede tocar): este
    // backdrop se colgaba de document.body -- un HERMANO de .app, no un hijo.
    // .app tiene "position:relative;z-index:1" (para el fondo animado del
    // login), lo cual convierte a TODO .app en su propio contexto de
    // apilamiento. Eso significa que el z-index:300/301 de .sidebar y
    // .sidebar-drawer (definidos mas abajo) solo se comparan ENTRE ELLOS y
    // contra otros hijos de .app (como .main) -- nunca se comparan de forma
    // directa contra el backdrop, que vive fuera de .app. Al comparar
    // .app completo (z-index:1) contra el backdrop (z-index:299) al nivel
    // raiz, el backdrop ganaba SIEMPRE y quedaba pintado por encima de TODO
    // .app, cajon incluido -- por eso se veia "medio oscurecido" tambien
    // encima del menu, y los toques/arrastres en esa zona le llegaban al
    // backdrop (que solo sabe cerrar el menu, no tiene scroll propio) en vez
    // de llegarle a los enlaces o a la lista con scroll del cajon. Colgar el
    // backdrop del mismo padre que .sidebar (.app) lo mete en el MISMO
    // contexto de apilamiento, donde el z-index:300 de .sidebar si le gana
    // de verdad al z-index:299 del backdrop.
    (sidebar.parentElement||document.body).appendChild(backdrop);
  }

  function bloquearScrollFondo(bloquear){
    // Complemento del fix de arriba: mientras el cajon esta abierto en
    // movil, sin esto un arrastre que empiece sobre el area oscura (fuera
    // de los 300px del cajon) hace scroll normal de la pagina de fondo
    // por debajo del overlay fijo -- se ve como si "el fondo se moviera".
    document.documentElement.classList.toggle('vigia-sidebar-lock',bloquear);
    document.body.classList.toggle('vigia-sidebar-lock',bloquear);
  }

  function cerrarCajonMovil(){
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('show');
    bloquearScrollFondo(false);
    if(collapseBtn){
      collapseBtn.querySelector('i').className='bi bi-list';
      collapseBtn.setAttribute('aria-label','Abrir menú');
      collapseBtn.title='Abrir menú';
    }
  }

  function abrirCajonMovil(){
    sidebar.classList.add('mobile-open');
    backdrop.classList.add('show');
    bloquearScrollFondo(true);
    if(collapseBtn){
      collapseBtn.querySelector('i').className='bi bi-x-lg';
      collapseBtn.setAttribute('aria-label','Cerrar menú');
      collapseBtn.title='Cerrar menú';
    }
  }

  backdrop.addEventListener('click',cerrarCajonMovil);
  // Si alguien toca un enlace del cajon, no hace falta cerrarlo primero
  // -- la pagina va a cambiar por completo de todas formas -- pero se
  // cierra igual para que, si vuelve con el boton "atras" del navegador,
  // no se encuentre el menu ya abierto encima del contenido.
  sidebar.querySelectorAll('.sidebar-drawer .nav-item').forEach(link=>{
    link.addEventListener('click',cerrarCajonMovil);
  });

  window.addEventListener('resize',()=>{
    if(!esMovil())cerrarCajonMovil();
  });

  if(collapseBtn){
    const applyCollapsed=(collapsed)=>{
      sidebar.classList.toggle('collapsed',collapsed);
      collapseBtn.setAttribute('aria-label',collapsed?'Expandir barra lateral':'Colapsar barra lateral');
      collapseBtn.title=collapsed?'Expandir barra lateral':'Colapsar barra lateral';
    };
    let collapsed=false;
    try{collapsed=localStorage.getItem(VIGIA_SIDEBAR_COLLAPSE_KEY)==='1'}catch(e){}
    if(esMovil())cerrarCajonMovil();else applyCollapsed(collapsed);

    collapseBtn.addEventListener('click',()=>{
      if(esMovil()){
        if(sidebar.classList.contains('mobile-open'))cerrarCajonMovil();else abrirCajonMovil();
        return;
      }
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
  // Ya no existe el interruptor "Reducir movimiento" (se quitó junto con
  // "Modo simple"), pero seguimos respetando la preferencia de
  // accesibilidad que el sistema operativo del usuario ya trae —
  // "prefers-reduced-motion" — para el fondo animado. Es automático y no
  // depende de que alguien encuentre un botón: si Windows, macOS o el
  // celular ya tienen activado "reducir movimiento", VIGIA lo respeta
  // sin que el usuario tenga que configurar nada aparte.
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){canvas.style.display='none';return}
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
  // La clave incluye el id de la cuenta activa: antes era una sola
  // clave global para todo el navegador, asi que si un residente subia
  // el tamano de letra y despues, en la misma computadora, entraba un
  // guardia o un admin, veia esa misma preferencia (bug real reportado:
  // "las configuraciones se comparten" entre cuentas del mismo
  // dispositivo). Cada cuenta ahora tiene su propio espacio.
  const session=VigiaAPI.getSession();
  const KEY=session&&session.id?`vigia_accessibility_${session.id}`:'vigia_accessibility';
  // Pero login.html/register.html/vigialanding.html no tienen sesion
  // (nadie ha iniciado sesion todavia), asi que no hay cuenta de la
  // cual leer -- por eso se quedaban siempre con el tema por defecto
  // (o peor, con un valor viejo pegado en la clave compartida de antes
  // del cambio anterior). DEVICE_KEY guarda "el ultimo tema que se vio
  // en este dispositivo", sin importar que cuenta lo puso: se
  // actualiza cada vez que una cuenta aplica su propio tema, y las
  // paginas sin sesion lo usan como punto de partida.
  const DEVICE_KEY='vigia_theme_device';
  const defaults={theme:'soft',filter:'none',font:'normal',readAloud:false};
  let prefs={...defaults};
  try{
    const origen=session&&session.id?KEY:DEVICE_KEY;
    prefs={...prefs,...JSON.parse(localStorage.getItem(origen)||'{}')};
  }catch(e){}
  function applyAccessibility(){
    document.body.classList.remove('theme-light','theme-soft','theme-high','filter-grayscale','filter-deuteranopia','filter-protanopia','filter-tritanopia');
    // El tamano de texto (a11y-large/a11y-xl) va en <html>, no en <body>:
    // casi todo el tamano de letra del sitio esta en unidades "rem", que
    // siempre se calculan sobre el tamano de fuente del elemento raiz
    // (<html>). Ponerlo en <body> casi no cambiaba nada visualmente.
    document.documentElement.classList.remove('a11y-large','a11y-xl');
    if(prefs.theme!=='dark')document.body.classList.add('theme-'+prefs.theme);
    if(prefs.filter!=='none')document.body.classList.add('filter-'+prefs.filter);
    if(prefs.font!=='normal')document.documentElement.classList.add('a11y-'+prefs.font);
    localStorage.setItem(KEY,JSON.stringify(prefs));
    // Solo una cuenta real actualiza "lo ultimo que se vio en este
    // dispositivo" -- una pagina publica no tiene preferencia propia
    // que ofrecer, asi que no debe sobreescribir lo que dejo la ultima
    // cuenta que si inicio sesion.
    if(session&&session.id){
      try{localStorage.setItem(DEVICE_KEY,JSON.stringify(prefs))}catch(e){}
    }
  }
  window.VigiaAccessibility={get:()=>({...prefs}),set:(next)=>{prefs={...prefs,...next};applyAccessibility();return {...prefs}},reset:()=>{prefs={...defaults};applyAccessibility();return {...prefs}},apply:applyAccessibility,read:leerPaginaActual,announce:anunciar};
  applyAccessibility();

  // ===== Lectura en voz alta (para personas ciegas o con baja vision) =====
  // Antes "Leer esta pagina" era un boton que solo existia dentro de
  // config.html: leia la pagina una sola vez y, al cambiar de pantalla,
  // no habia ninguna forma de volver a activarla sin ver la pantalla
  // para navegar de vuelta a Configuracion -- exactamente lo contrario
  // de para lo que se creo. Ahora es una preferencia mas (como el tema o
  // el tamano de letra): se guarda, y en CADA pagina que carga VIGIA se
  // ofrece el mismo boton flotante y el mismo atajo de teclado para
  // activarla, desactivarla o volver a leer, sin depender de donde este
  // parado el usuario.
  function anunciar(texto){
    if(!('speechSynthesis'in window))return;
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(texto);
    u.lang='es-HN';
    speechSynthesis.speak(u);
  }

  function leerPaginaActual(){
    if(!('speechSynthesis'in window)){
      if(typeof showToast==='function')showToast('La lectura asistida no está disponible en este navegador');
      return;
    }
    speechSynthesis.cancel();
    const contenedor=document.querySelector('.page')||document.querySelector('.content')||document.body;
    const texto=(contenedor.innerText||contenedor.textContent||'').slice(0,5000);
    const u=new SpeechSynthesisUtterance(texto);
    u.lang='es-HN';
    speechSynthesis.speak(u);
  }

  function alternarLectura(){
    const activo=!VigiaAccessibility.get().readAloud;
    VigiaAccessibility.set({readAloud:activo});
    // Si esto se activo por primera vez con Alt+L (sin haber pasado por
    // Configuracion, ej. alguien que no puede ver la pantalla), el boton
    // flotante todavia no existia en esta pagina -- se crea aca mismo en
    // vez de esperar a la siguiente carga de pagina.
    if(activo&&!botonLectura)crearBotonLectura();
    actualizarBotonLectura();
    if(activo){
      anunciar('Lectura de pantalla activada.');
      setTimeout(leerPaginaActual,1400);
    }else{
      anunciar('Lectura de pantalla desactivada.');
    }
  }

  let botonLectura=null;
  function actualizarBotonLectura(){
    if(!botonLectura)return;
    const activo=VigiaAccessibility.get().readAloud;
    botonLectura.classList.toggle('active',activo);
    botonLectura.setAttribute('aria-pressed',activo?'true':'false');
    botonLectura.setAttribute('aria-label',activo?'Desactivar lectura de pantalla (Alt+L)':'Activar lectura de pantalla (Alt+L)');
    botonLectura.querySelector('i').className='bi '+(activo?'bi-volume-up-fill':'bi-volume-mute-fill');
  }

  function crearBotonLectura(){
    if(document.getElementById('vigiaReadToggleBtn'))return;
    botonLectura=document.createElement('button');
    botonLectura.type='button';
    botonLectura.id='vigiaReadToggleBtn';
    botonLectura.className='a11y-read-fab';
    botonLectura.innerHTML='<i class="bi bi-volume-mute-fill"></i>';
    botonLectura.title='Leer esta página en voz alta (Alt+L)';
    botonLectura.addEventListener('click',alternarLectura);
    document.body.appendChild(botonLectura);
    actualizarBotonLectura();
  }

  // Atajo de teclado global: funciona en cualquier pagina de VIGIA, sin
  // necesidad de ver ni encontrar el boton -- justo lo que alguien que
  // no puede ver la pantalla necesita para no depender de la vista.
  document.addEventListener('keydown',evento=>{
    if(evento.altKey&&(evento.key==='l'||evento.key==='L')){
      evento.preventDefault();
      alternarLectura();
    }
  });

  // De fabrica (cuenta nueva, sin ninguna preferencia guardada todavia)
  // este boton flotante NO debe aparecer -- antes se creaba siempre,
  // aunque la persona nunca hubiera activado "Lectura asistida" en
  // Configuracion, asi que a todo el mundo le aparecia un boton de
  // dictado que nunca pidio. Ahora solo se crea si la preferencia ya
  // esta activada (se activa desde Configuracion, con el boton
  // "readToggleBtn" de config.js). El atajo de teclado Alt+L sigue
  // funcionando siempre, sin depender de que este boton exista, para no
  // quitarle a alguien que no puede ver la pantalla una forma de
  // activarlo si de verdad lo necesita.
  if(prefs.readAloud){
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',crearBotonLectura);
    }else{
      crearBotonLectura();
    }
  }

  // Si la preferencia ya estaba activada en una pagina anterior, lee la
  // pagina nueva automaticamente al terminar de cargar -- esto es lo que
  // permite que alguien vaya cambiando de pantalla en pantalla y VIGIA
  // le lea cada una sin que tenga que volver a activar nada.
  if(prefs.readAloud){
    window.addEventListener('load',()=>{
      setTimeout(leerPaginaActual,700);
    });
  }
})();

// ---- Seguridad de sesion: expiracion del JWT e inactividad ----
// El JWT real vive en una cookie httpOnly que este script no puede leer
// (a proposito, para protegerlo de robo por XSS). Para el temporizador
// de expiracion usamos "expira_en", la fecha que el backend ya manda en
// la respuesta de login/register y que setSession() guarda junto al
// resto de la sesion (no es informacion sensible).
(function(){
  const session=VigiaAPI.getSession();if(!session)return;
  const expMs=session.expira_en?new Date(session.expira_en).getTime():null;
  const logout=async(reason,detalle)=>{
    // Diagnostico: si la sesion se cierra sola, esto deja en la consola
    // EXACTAMENTE por que (con que valores) para no tener que adivinar.
    console.warn('[VIGIA] Cierre de sesion automatico.',{reason,detalle,expira_en:session.expira_en,ahora:new Date().toISOString()});
    try{await VigiaAPI.request('/auth/logout',{method:'POST',offline:false})}catch(e){}
    VigiaAPI.clearSession();
    if(reason)sessionStorage.setItem('vigia_logout_reason',reason);
    location.replace('login.html');
  };
  if(expMs){
    const delay=expMs-Date.now();
    if(delay<=0){
      console.warn('[VIGIA] expira_en ya estaba en el pasado al cargar la pagina.',{expira_en:session.expira_en,delay});
      logout('Tu sesion expiro.','expira_en en el pasado al cargar');
      return;
    }
    // setTimeout guarda el retraso en un entero de 32 bits: cualquier
    // valor mayor a 2147483647ms (~24.8 dias) se desborda y el navegador
    // dispara el callback casi de inmediato en vez de esperar. Con
    // "Recordarme" (30 dias) esto cerraba la sesion al instante despues
    // de iniciar sesion. encadenarTemporizador() lo resuelve esperando
    // en tramos de como maximo ese limite hasta llegar a la fecha real.
    const LIMITE_32BITS=2147483647;
    function encadenarTemporizador(restante){
      if(restante>LIMITE_32BITS){
        setTimeout(()=>encadenarTemporizador(restante-LIMITE_32BITS),LIMITE_32BITS);
        return;
      }
      setTimeout(()=>logout('Tu sesion expiro.','temporizador expira_en'),restante);
    }
    encadenarTemporizador(delay);
  }
  const maxIdle=30*60*1000;let timer,warned=false;
  function reset(){warned=false;clearTimeout(timer);timer=setTimeout(()=>logout('La sesion se cerro por inactividad.','temporizador de inactividad (30 min)'),maxIdle)}
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
  // No mostrar el asistente flotante en las paginas publicas (login,
  // registro, landing, portales de guardia/admin): son pantallas de
  // acceso, no tiene sentido ofrecer ayuda del panel ahi todavia.
  const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const noAssistantPages=new Set(['index.html','login.html','register.html','guardia-login.html','admin-login.html','vigialanding.html','recuperar-password.html','restablecer-password.html','']);
  if(noAssistantPages.has(page))return;

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
    else if(/acces|letra|color|anciano|mayor|cieg|ver|no veo|leer/.test(t)){text='En Configuración puedes activar texto grande, alto contraste, filtros de color y lectura en voz alta. La lectura en voz alta, una vez activada, también funciona en cualquier página con el botón flotante de la esquina o el atajo Alt+L.';href='config.html'}
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
