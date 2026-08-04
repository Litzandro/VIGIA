// ============ GUARDIA.JS ============
// Exclusivo de guardia.html: valida la sesion contra GuardAuthStore,
// muestra las alertas de panico en tiempo real (via PanicStore) con
// acciones reales para el guardia (cambiar estado, asignarse o
// reasignar, dejar una nota, ver la camara mas cercana) y el chat con
// residentes (via ChatStore, el mismo canal que usan chat.html y
// superadmin.html).

(function(){
  if(typeof GuardAuthStore==='undefined') return;
  const session=GuardAuthStore.getSession();
  if(!session){ window.location.href='guardia-login.html'; return; }

  const guardAvatar=document.getElementById('guardAvatar');
  const guardName=document.getElementById('guardName');
  const guardShiftLine=document.getElementById('guardShiftLine');
  if(guardAvatar) guardAvatar.textContent=session.name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
  if(guardName) guardName.textContent=session.name;
  if(guardShiftLine){const h=new Date().getHours();const jornada=h>=6&&h<18?'Jornada diurna':'Jornada nocturna';guardShiftLine.textContent=(session.turno||jornada)+' · '+jornada+' · Altavista Residencial';}

  const logoutBtn=document.getElementById('guardLogoutBtn');
  if(logoutBtn){
    logoutBtn.addEventListener('click',()=>{
      GuardAuthStore.logout();
      window.location.href='guardia-login.html';
    });
  }

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

  // ============ ALERTAS DE PANICO ============
  const hasPanicStore=typeof PanicStore!=='undefined';

  // ---- Guardias reales del residencial (para reasignar una alerta) ----
  let guardNames=[];
  async function loadGuardNames(){
    try{
      const [guardias,usuarios]=await Promise.all([
        VigiaAPI.request('/guardias'),
        VigiaAPI.request('/usuarios'),
      ]);
      const guardIds=new Set((guardias.data||[]).map(g=>g.usuario_id));
      guardNames=(usuarios.data||[])
        .filter(u=>guardIds.has(u.id))
        .map(u=>`${u.nombre||''} ${u.apellido||''}`.trim())
        .filter(Boolean);
    }catch(e){ guardNames=[]; }
    renderPanicAlerts();
  }
  const hasGuardList=typeof GuardAuthStore!=='undefined';
  const guardPanicList=document.getElementById('guardPanicList');
  const guardPanicEmptyMsg=document.getElementById('guardPanicEmptyMsg');
  const statPendientes=document.getElementById('statPendientes');
  const statEnCamino=document.getElementById('statEnCamino');
  const statAtendidas=document.getElementById('statAtendidas');

  const TARGET_LABEL={guardia:'Alertó solo al guardia', residentes:'Alertó a los residentes de su torre'};
  const STATUS_BADGE_CLASS={pendiente:'alert', en_camino:'warn', atendida:'ok', falsa_alarma:'neutral'};

  // Mapeo simple unidad -> camara mas cercana en camaras.html (demo: solo
  // hay una unidad de ejemplo, "Torre B"). En un residencial real esto
  // vendria de un mapa de unidades a camaras dado de alta por el superadmin.
  function nearestCameraAnchor(unidad){
    const u=(unidad||'').toLowerCase();
    if(u.includes('torre b')) return {id:'cam-area-comun', label:'Área común'};
    if(u.includes('torre a')) return {id:'cam-porton-principal', label:'Portón principal'};
    return {id:'cam-porton-principal', label:'Portón principal'};
  }

  function buildActionButton(label, statusValue, currentStatus, extraClass){
    const active=statusValue===currentStatus;
    return '<button type="button" class="btn '+extraClass+' panic-action-btn'+(active?' active':'')+'" data-status="'+statusValue+'">'+label+'</button>';
  }

  function renderAlertCard(a){
    const card=document.createElement('div');
    card.className='panic-card'+(a.status==='pendiente' ? ' is-pendiente' : '');
    card.dataset.id=a.id;

    const cam=nearestCameraAnchor(a.unidad);
    const guardOptions=guardNames
      .map(name=>'<option value="'+name+'"'+(a.assignedTo===name?' selected':'')+'>'+name+'</option>').join('');

    card.innerHTML=
      '<div class="panic-card-head">'+
        '<div class="panic-card-who">'+
          '<span class="ic"><i class="bi bi-exclamation-octagon-fill"></i></span>'+
          '<div class="panic-card-who-text"><b></b><span></span></div>'+
        '</div>'+
        '<span class="badge '+STATUS_BADGE_CLASS[a.status]+'"></span>'+
      '</div>'+
      '<div class="panic-card-actions">'+
        buildActionButton('En camino','en_camino',a.status,'btn-warn')+
        buildActionButton('Atendida','atendida',a.status,'btn-solid')+
        buildActionButton('Falsa alarma','falsa_alarma',a.status,'btn-ghost')+
        '<a class="btn btn-ghost panic-card-cam-link" href="camaras.html#'+cam.id+'" target="_blank" rel="noopener"><i class="bi bi-camera-video-fill"></i> Ver cámara más cercana (' +cam.label+ ')</a>'+
      '</div>'+
      '<div class="panic-card-row">'+
        '<div class="form-group">'+
          '<label>Asignar a</label>'+
          '<select class="form-control panic-assignee-select">'+
            '<option value=""'+(!a.assignedTo?' selected':'')+'>Sin asignar</option>'+
            guardOptions+
          '</select>'+
        '</div>'+
        '<div class="form-group" style="flex:2;">'+
          '<label>Nota / comentario</label>'+
          '<input type="text" class="form-control panic-note-input" placeholder="Ej. Falsa alarma, la mascota activó el sensor." value="">'+
        '</div>'+
        '<button type="button" class="btn btn-ghost panic-note-save" style="padding:.6rem .9rem;"><i class="bi bi-check-lg"></i> Guardar nota</button>'+
      '</div>';

    card.querySelector('.panic-card-who-text b').textContent=a.residentName;
    card.querySelector('.panic-card-who-text span').textContent=a.unidad+' · '+TARGET_LABEL[a.target]+' · '+a.time+(a.originalGuard?' · Guardia original: '+a.originalGuard:'');
    const statusBadge=card.querySelector('.panic-card-head .badge');
    statusBadge.textContent=PanicStore.STATUS_LABEL[a.status].toUpperCase();

    const noteInput=card.querySelector('.panic-note-input');
    noteInput.value=a.note||'';
    if(a.note){
      const savedNote=document.createElement('p');
      savedNote.className='panic-card-note-saved';
      savedNote.innerHTML='<i class="bi bi-sticky-fill"></i> '+escapeHtml(a.note)+' <span class="mono">— '+(a.noteTime||'')+'</span>';
      card.appendChild(savedNote);
    }

    // ---- Acciones ----
    card.querySelectorAll('.panic-action-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        PanicStore.setStatus(a.id, btn.dataset.status);
        renderPanicAlerts();
      });
    });
    card.querySelector('.panic-assignee-select').addEventListener('change',(e)=>{
      PanicStore.setAssignee(a.id, e.target.value);
      renderPanicAlerts();
    });
    card.querySelector('.panic-note-save').addEventListener('click',()=>{
      PanicStore.setNote(a.id, noteInput.value.trim());
      renderPanicAlerts();
    });

    return card;
  }

  function escapeHtml(str){
    const div=document.createElement('div');
    div.textContent=str;
    return div.innerHTML;
  }

  function renderPanicAlerts(){
    if(!guardPanicList || !hasPanicStore) return;
    const alerts=PanicStore.getAll();

    guardPanicList.innerHTML='';
    alerts.forEach(a=> guardPanicList.appendChild(renderAlertCard(a)));

    if(guardPanicEmptyMsg) guardPanicEmptyMsg.style.display = alerts.length ? 'none' : '';

    if(statPendientes){
      const n=alerts.filter(a=>a.status==='pendiente').length;
      statPendientes.textContent=n;
      statPendientes.closest('.admin-stat').classList.toggle('has-alert', n>0);
    }
    if(statEnCamino) statEnCamino.textContent=alerts.filter(a=>a.status==='en_camino').length;
    if(statAtendidas) statAtendidas.textContent=alerts.filter(a=>a.status==='atendida').length;
  }

  if(hasPanicStore) PanicStore.onChange(renderPanicAlerts);
  renderPanicAlerts();

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
