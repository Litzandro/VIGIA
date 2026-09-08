// ============ GUARDIA.JS ============
// Exclusivo de guardia.html: valida la sesion contra GuardAuthStore,
// muestra las alertas de panico REALES (via /api/alertas-panico) con
// acciones reales para el guardia (marcar atendida, falsa alarma,
// llamar al residente o escribirle por Mensajería).
//
// Nota: el nombre/avatar en la barra lateral y el boton de cerrar
// sesion (id="vgLogoutBtn") ya los maneja common.js de forma generica
// para todas las paginas de staff; este archivo no los toca.

(function(){
  if(typeof GuardAuthStore==='undefined') return;
  const session=GuardAuthStore.getSession();
  if(!session){ window.location.href='guardia-login.html'; return; }

  const guardShiftLine=document.getElementById('guardShiftLine');
  if(guardShiftLine){
    // session.turno viene de la BD como codigo ('diurno'/'nocturno'). Antes
    // se concatenaba con el texto calculado por la hora actual y, cuando
    // session.turno faltaba, el mismo texto ("Jornada diurna") quedaba
    // repetido dos veces seguidas. Ahora solo mostramos una etiqueta: la
    // del turno asignado si existe, o si no, la que corresponde a la hora.
    const h=new Date().getHours();
    const jornadaPorHora=h>=6&&h<18?'Jornada diurna':'Jornada nocturna';
    const turnoLabels={diurno:'Jornada diurna',nocturno:'Jornada nocturna'};
    const jornada=turnoLabels[session.turno]||jornadaPorHora;
    guardShiftLine.textContent=jornada+' · Altavista Residencial';
  }

  // ============ SONIDO + NOTIFICACION DEL NAVEGADOR PARA ALERTAS NUEVAS ============
  // Antes, una alerta de panico nueva no sonaba ni avisaba de ninguna
  // forma: el guardia solo se enteraba si en ese momento tenia la vista
  // puesta en esta pantalla, viendo la lista actualizarse cada 20
  // segundos. Para algo que puede ser una emergencia real, eso no
  // alcanza. Ahora: un tono audible (generado con Web Audio, no
  // depende de ningun archivo de sonido) mas una notificacion del
  // navegador si el guardia dio permiso, cada vez que aparece una
  // alerta "activa" que no estaba en la lista la vez anterior.
  if('Notification' in window && Notification.permission==='default'){
    Notification.requestPermission();
  }

  function reproducirTonoAlerta(){
    try{
      const ctx=new (window.AudioContext||window.webkitAudioContext)();
      const ahora=ctx.currentTime;
      // Dos tonos cortos y agudos en sucesion (patron tipo "beep-beep"),
      // mas facil de notar que un solo tono largo.
      [0,0.32].forEach(offset=>{
        const osc=ctx.createOscillator();
        const gain=ctx.createGain();
        osc.type='sine';
        osc.frequency.setValueAtTime(880,ahora+offset);
        gain.gain.setValueAtTime(0,ahora+offset);
        gain.gain.linearRampToValueAtTime(0.35,ahora+offset+0.03);
        gain.gain.linearRampToValueAtTime(0,ahora+offset+0.26);
        osc.connect(gain);gain.connect(ctx.destination);
        osc.start(ahora+offset);osc.stop(ahora+offset+0.3);
      });
    }catch(e){/* Web Audio no disponible en este navegador; sin sonido, sin romper nada */}
  }

  function notificarAlertaNueva(alerta){
    reproducirTonoAlerta();
    if('Notification' in window && Notification.permission==='granted'){
      const quien=alerta.vivienda?`${alerta.usuario_nombre} · ${alerta.vivienda}`:alerta.usuario_nombre;
      const n=new Notification('🚨 Alerta de pánico activa',{
        body:quien,
        tag:'vigia-panico-'+alerta.id,
        requireInteraction:true,
      });
      n.onclick=()=>{window.focus();n.close();};
    }
  }

  // ============ ALERTAS DE PANICO (API real: /api/alertas-panico) ============
  const guardPanicList=document.getElementById('guardPanicList');
  const guardPanicEmptyMsg=document.getElementById('guardPanicEmptyMsg');
  const statPendientes=document.getElementById('statPendientes');
  const statFalsas=document.getElementById('statFalsas');
  const statAtendidas=document.getElementById('statAtendidas');

  // El esquema real solo tiene 3 estados: activa, atendida, falsa_alarma
  // (no existe "en_camino" ni reasignar guardia; eso era del store falso).
  const STATUS_LABEL={activa:'Pendiente', atendida:'Atendida', falsa_alarma:'Falsa alarma'};
  const STATUS_BADGE_CLASS={activa:'alert', atendida:'ok', falsa_alarma:'neutral'};

  function formatFecha(iso){
    if(!iso) return '';
    return new Date(iso).toLocaleString('es-HN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  }

  async function atenderAlerta(id, estado, btn){
    const original=btn.innerHTML;
    btn.disabled=true; btn.innerHTML='<i class="bi bi-arrow-repeat"></i> Guardando...';
    try{
      await VigiaAPI.request(`/alertas-panico/${id}`,{method:'PATCH',body:JSON.stringify({
        estado,
        atendida_por:session.id,
        fecha_atencion:new Date().toISOString(),
      })});
      showToast(estado==='atendida' ? 'Alerta marcada como atendida' : 'Alerta marcada como falsa alarma');
      await loadPanicAlerts();
    }catch(e){
      showToast(e.message,'bi-exclamation-triangle-fill');
      btn.disabled=false; btn.innerHTML=original;
    }
  }

  function renderAlertCard(a){
    const card=document.createElement('div');
    card.className='panic-card'+(a.estado==='activa' ? ' is-pendiente' : '');
    card.dataset.id=a.id;

    const who=a.vivienda ? `${a.usuario_nombre} · ${a.vivienda}` : a.usuario_nombre;
    const tipo=a.tipo_alerta_nombre || 'Alerta';
    const resuelta=a.estado!=='activa';

    // Llamar y Mensaje solo tienen sentido si sabemos a quien -- si por
    // algun motivo no hay telefono guardado (campo opcional) o no hay
    // usuario_id, el boton correspondiente simplemente no aparece, en
    // vez de mostrar un enlace roto.
    const botonLlamar=a.usuario_telefono
      ? `<a class="btn btn-ghost" href="tel:${escapeHtml(a.usuario_telefono)}"><i class="bi bi-telephone-fill"></i> Llamar</a>`
      : '';
    const botonMensaje=a.usuario_id
      ? `<a class="btn btn-ghost" href="mensajeria.html?abrir_residente=${a.usuario_id}"><i class="bi bi-chat-dots-fill"></i> Mensaje</a>`
      : '';

    card.innerHTML=
      '<div class="panic-card-head">'+
        '<div class="panic-card-who">'+
          '<span class="ic"><i class="bi bi-exclamation-octagon-fill"></i></span>'+
          '<div class="panic-card-who-text"><b></b><span></span></div>'+
        '</div>'+
        '<span class="badge '+STATUS_BADGE_CLASS[a.estado]+'"></span>'+
      '</div>'+
      '<div class="panic-card-actions">'+
        (resuelta ? '' :
          '<button type="button" class="btn btn-solid panic-action-btn" data-status="atendida"><i class="bi bi-check-lg"></i> Atendida</button>'+
          '<button type="button" class="btn btn-ghost panic-action-btn" data-status="falsa_alarma"><i class="bi bi-x-lg"></i> Falsa alarma</button>'
        )+
        botonLlamar+botonMensaje+
        // Antes esto mostraba un enlace a "la camara mas cercana"
        // adivinada por texto ("torre a"/"torre b" en el nombre de la
        // vivienda, cualquier otro caso caia siempre al mismo default) --
        // una adivinanza vestida de dato preciso es peor que no adivinar:
        // el guardia podia confiar en una camara que en realidad no era
        // la correcta durante una emergencia real. Hasta que exista un
        // mapeo de verdad vivienda->camara (dado de alta por el admin),
        // el enlace honesto es simplemente abrir todas las camaras.
        '<a class="btn btn-ghost" href="camaras.html" target="_blank" rel="noopener"><i class="bi bi-camera-video-fill"></i> Ver cámaras</a>'+
      '</div>';

    card.querySelector('.panic-card-who-text b').textContent=who;
    card.querySelector('.panic-card-who-text span').textContent=tipo+' · '+formatFecha(a.fecha_hora);
    const statusBadge=card.querySelector('.panic-card-head .badge');
    statusBadge.textContent=STATUS_LABEL[a.estado].toUpperCase();

    if(resuelta){
      const info=document.createElement('p');
      info.className='panic-card-note-saved';
      info.innerHTML='<i class="bi bi-check2-circle"></i> Atendida por '+escapeHtml(a.atendida_por_nombre||'personal')+' <span class="mono">— '+formatFecha(a.fecha_atencion)+'</span>';
      card.appendChild(info);
    }

    card.querySelectorAll('.panic-action-btn').forEach(btn=>{
      btn.addEventListener('click',()=> atenderAlerta(a.id, btn.dataset.status, btn));
    });

    return card;
  }

  function escapeHtml(str){
    const div=document.createElement('div');
    div.textContent=str;
    return div.innerHTML;
  }

  let panicAlerts=[];
  let idsActivasConocidas=null; // null = primera carga; no suena en la primera carga, solo ante alertas NUEVAS
  function renderPanicAlerts(){
    if(!guardPanicList) return;
    guardPanicList.innerHTML='';
    panicAlerts.forEach(a=> guardPanicList.appendChild(renderAlertCard(a)));

    if(guardPanicEmptyMsg) guardPanicEmptyMsg.style.display = panicAlerts.length ? 'none' : '';

    if(statPendientes){
      const n=panicAlerts.filter(a=>a.estado==='activa').length;
      statPendientes.textContent=n;
      statPendientes.closest('.admin-stat').classList.toggle('has-alert', n>0);
    }
    if(statFalsas) statFalsas.textContent=panicAlerts.filter(a=>a.estado==='falsa_alarma').length;
    if(statAtendidas) statAtendidas.textContent=panicAlerts.filter(a=>a.estado==='atendida').length;
  }

  async function loadPanicAlerts(){
    if(!guardPanicList) return;
    try{
      const r=await VigiaAPI.request('/alertas-panico?limit=100&sort=fecha_hora:desc');
      panicAlerts=r.data||[];

      const activasAhora=panicAlerts.filter(a=>a.estado==='activa');
      if(idsActivasConocidas!==null){
        const nuevas=activasAhora.filter(a=>!idsActivasConocidas.has(a.id));
        nuevas.forEach(notificarAlertaNueva);
      }
      idsActivasConocidas=new Set(activasAhora.map(a=>a.id));

      renderPanicAlerts();
    }catch(e){
      guardPanicList.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;
    }
  }

  loadPanicAlerts();
  setInterval(loadPanicAlerts, 20000);
})();
