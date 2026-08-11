// ============ GUARDIA.JS ============
// Exclusivo de guardia.html: valida la sesion contra GuardAuthStore,
// muestra las alertas de panico REALES (via /api/alertas-panico) con
// acciones reales para el guardia (marcar atendida o falsa alarma) y
// el chat con residentes (via ChatStore, sigue pendiente de conectar
// a la API real de mensajes).
//
// Nota: el nombre/avatar en la barra lateral y el boton de cerrar
// sesion (id="vgLogoutBtn") ya los maneja common.js de forma generica
// para todas las paginas de staff; este archivo no los toca.

(function(){
  if(typeof GuardAuthStore==='undefined') return;
  const session=GuardAuthStore.getSession();
  if(!session){ window.location.href='guardia-login.html'; return; }

  const guardShiftLine=document.getElementById('guardShiftLine');
  if(guardShiftLine){const h=new Date().getHours();const jornada=h>=6&&h<18?'Jornada diurna':'Jornada nocturna';guardShiftLine.textContent=(session.turno||jornada)+' · '+jornada+' · Altavista Residencial';}

  // ---- Pestañas (Alertas / Chat) ----
  const tabsGroup=document.querySelector('.agenda-tabs');
  const panels={
    alertas: document.querySelector('[data-panel="alertas"]'),
    chat: document.querySelector('[data-panel="chat"]')
  };
  if(tabsGroup){
    tabsGroup.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click',()=>{
        tabsGroup.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        Object.entries(panels).forEach(([key,panel])=>{
          if(panel) panel.style.display=(key===btn.dataset.tab) ? '' : 'none';
        });
      });
    });
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

  // Mapeo simple vivienda -> camara mas cercana en camaras.html. En un
  // residencial real esto vendria de un mapa de unidades a camaras dado
  // de alta por el superadmin; por ahora usa un enlace general por torre.
  function nearestCameraAnchor(vivienda){
    const u=(vivienda||'').toLowerCase();
    if(u.includes('torre b')) return {id:'cam-area-comun', label:'Área común'};
    if(u.includes('torre a')) return {id:'cam-porton-principal', label:'Portón principal'};
    return {id:'cam-porton-principal', label:'Portón principal'};
  }

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

    const cam=nearestCameraAnchor(a.vivienda);
    const who=a.vivienda ? `${a.usuario_nombre} · ${a.vivienda}` : a.usuario_nombre;
    const tipo=a.tipo_alerta_nombre || 'Alerta';
    const resuelta=a.estado!=='activa';

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
        '<a class="btn btn-ghost panic-card-cam-link" href="camaras.html#'+cam.id+'" target="_blank" rel="noopener"><i class="bi bi-camera-video-fill"></i> Ver cámara más cercana (' +cam.label+ ')</a>'+
      '</div>';

    card.querySelector('.panic-card-who-text b').textContent=who;
    card.querySelector('.panic-card-who-text span').textContent=tipo+' · '+formatFecha(a.fecha_hora);
    const statusBadge=card.querySelector('.panic-card-head .badge');
    statusBadge.textContent=STATUS_LABEL[a.estado].toUpperCase();

    if(resuelta){
      const info=document.createElement('p');
      info.className='panic-card-note-saved';
      info.innerHTML='<i class="bi bi-check2-circle"></i> Resuelta por '+escapeHtml(a.atendida_por_nombre||'personal')+' <span class="mono">— '+formatFecha(a.fecha_atencion)+'</span>';
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
      renderPanicAlerts();
    }catch(e){
      guardPanicList.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;
    }
  }

  loadPanicAlerts();
  setInterval(loadPanicAlerts, 20000);

  // ============ CHAT CON RESIDENTES ============
  // Mismo canal (ChatStore/localStorage) que usan chat.html y la pestaña
  // de chat de superadmin.html. En este demo solo hay un residente
  // (Jorge Paz), igual que en el resto del prototipo.
  const CHAT_CONTACTS=[{name:'Jorge Paz', detail:'Torre B · Depto 402'}];
  const chatList=document.getElementById('guardChatList');
  const chatMessagesEl=document.getElementById('guardChatMessages');
  const chatForm=document.getElementById('guardChatForm');
  const chatInput=document.getElementById('guardChatInput');
  const chatNameEl=document.getElementById('guardChatName');
  const chatAvEl=document.getElementById('guardChatAv');
  const hasChatStore=typeof ChatStore!=='undefined';
  let activeContact=null;

  function initials(name){
    return name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
  }

  function renderConversation(name){
    if(!chatMessagesEl || !hasChatStore) return;
    chatMessagesEl.innerHTML='';
    ChatStore.getThread(name).forEach(m=>{
      const who = m.sender==='staff' ? 'resident' : 'guard';
      const msg=document.createElement('div');
      msg.className='chat-msg '+who;
      msg.innerHTML='<div class="chat-bubble"></div><span class="chat-time mono"></span>';
      msg.querySelector('.chat-bubble').textContent=m.text;
      msg.querySelector('.chat-time').textContent=m.time;
      chatMessagesEl.appendChild(msg);
    });
    chatMessagesEl.scrollTop=chatMessagesEl.scrollHeight;
  }

  function selectContact(name){
    activeContact=name;
    if(hasChatStore){
      ChatStore.ensureSeed(name, [
        {sender:'staff', text:'Buenas tardes, quedo atento por si necesita algo.', time:'3:40 PM'}
      ]);
    }
    if(chatNameEl) chatNameEl.textContent=name;
    if(chatAvEl) chatAvEl.textContent=initials(name);
    if(chatList){
      chatList.querySelectorAll('.admin-chat-contact').forEach(c=>{
        c.classList.toggle('active', c.dataset.name===name);
      });
    }
    renderConversation(name);
  }

  function renderChatContacts(){
    if(!chatList) return;
    chatList.innerHTML='';
    CHAT_CONTACTS.forEach(r=>{
      const c=document.createElement('div');
      c.className='admin-chat-contact';
      c.dataset.name=r.name;
      c.innerHTML=
        '<div class="post-av"></div>'+
        '<div class="post-who"><b></b><span class="mono"></span></div>';
      c.querySelector('.post-av').textContent=initials(r.name);
      c.querySelector('.post-who b').textContent=r.name;
      c.querySelector('.post-who span').textContent=r.detail;
      c.addEventListener('click',()=>selectContact(r.name));
      chatList.appendChild(c);
    });
    if(!activeContact && CHAT_CONTACTS.length) selectContact(CHAT_CONTACTS[0].name);
  }

  if(chatForm){
    chatForm.addEventListener('submit',(e)=>{
      e.preventDefault();
      const text=chatInput.value.trim();
      if(!text || !activeContact || !hasChatStore) return;
      ChatStore.addMessage(activeContact, 'staff', text);
      renderConversation(activeContact);
      chatInput.value='';
    });
  }

  if(hasChatStore){
    ChatStore.onChange(()=>{ if(activeContact) renderConversation(activeContact); });
  }

  renderChatContacts();
})();
