(function(){
  const list=document.getElementById('inboxList');if(!list)return;
  const session=VigiaAPI.getSession();let threads=[];let currentId=null;
  const messages=document.getElementById('staffMessages'),input=document.getElementById('staffChatInput'),send=document.getElementById('staffSendBtn'),charCount=document.getElementById('staffCharCount');
  let lastSignature='';

  // El superadmin no tiene una residencial fija (ve todas), asi que el
  // backend (/mensajes/inbox) no sabe de cual bandeja traerle las
  // conversaciones sin que se lo digamos por query string -- antes esto
  // no existia y el panel se quedaba mostrando el error "Selecciona una
  // residencial." sin ninguna forma de elegir una. Guardia y admin
  // normal ya traen su residencial_id fija en la sesion, para ellos
  // este selector se queda oculto.
  const residencialWrap=document.getElementById('mensajeriaResidencialWrap');
  const residencialSelect=document.getElementById('mensajeriaResidencial');
  let residencialElegida=null;
  async function initResidencialSelector(){
    if(session.rol_codigo!=='superadmin'||!residencialWrap)return;
    try{
      const r=await VigiaAPI.request('/residenciales?limit=300');
      const residenciales=r.data||[];
      residencialSelect.innerHTML=residenciales.map(x=>`<option value="${x.id}">${escapeHtml(x.nombre)}</option>`).join('');
      if(residenciales.length){
        residencialElegida=residenciales[0].id;
        residencialWrap.style.display='block';
      }
      residencialSelect.addEventListener('change',()=>{
        residencialElegida=residencialSelect.value;
        currentId=null;
        loadInbox();
      });
    }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
  }
  function initials(name){return String(name||'VG').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'VG'}
  function counterpart(t){
    // Prioriza al residente como "la otra parte" del hilo: con turnos
    // rotativos puede haber varios guardias en la misma conversación, y
    // el primero que no sea "yo" ya no es un identificador confiable.
    const participants=t.participantes||[];
    return participants.find(x=>x.rol_codigo==='residente')||participants.find(x=>String(x.id)!==String(session.id));
  }
  function participantName(t){const p=counterpart(t);return p?p.nombre_completo:(t.nombre||'Conversación')}
  function time(v){try{return new Date(v).toLocaleString('es-HN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}catch(e){return ''}}
  function isNearBottom(){return messages.scrollHeight-messages.scrollTop-messages.clientHeight<80}
  function updateCharCount(){
    if(!charCount)return;
    const len=input.value.length;
    charCount.textContent=len+'/500';
    charCount.classList.toggle('warn',len>=400&&len<500);
    charCount.classList.toggle('full',len>=500);
  }
  if(input)input.addEventListener('input',updateCharCount);
  function renderInbox(){
    document.getElementById('inboxCount').textContent=threads.length;
    list.innerHTML=threads.length?'':'<div class="empty-state">No hay conversaciones.</div>';
    threads.forEach(t=>{const name=participantName(t);const el=document.createElement('button');el.type='button';el.className='queue-item thread-item'+(String(t.id)===String(currentId)?' active':'');el.innerHTML=`<div class="post-av">${escapeHtml(initials(name))}</div><div class="queue-copy"><b>${escapeHtml(name)}</b><span>${escapeHtml(t.ultimo_mensaje||'Sin mensajes')}</span><small class="mono">${escapeHtml(time(t.ultima_fecha))}</small></div>`;el.onclick=()=>openThread(t.id);list.appendChild(el)})
  }
  async function loadInbox(){try{const qs=(session.rol_codigo==='superadmin'&&residencialElegida)?`?residencial_id=${residencialElegida}`:'';const r=await VigiaAPI.request('/mensajes/inbox'+qs);threads=r.data||[];renderInbox();if(!currentId&&threads.length)openThread(threads[0].id)}catch(e){list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`}}
  async function openThread(id,force){
    const switching=String(id)!==String(currentId);
    if(switching)lastSignature='';
    currentId=id;renderInbox();
    try{
      const r=await VigiaAPI.request(`/mensajes/conversacion/${id}`),d=r.data||{};
      const other=counterpart(d);
      const name=other?other.nombre_completo:(d.conversacion&&d.conversacion.nombre)||'Residente';
      document.getElementById('staffThreadName').textContent=name;
      document.getElementById('staffThreadAvatar').textContent=initials(name);
      const rows=d.mensajes||[];
      const signature=rows.map(m=>m.id+':'+m.leido).join('|');
      if(!force&&!switching&&signature===lastSignature){input.disabled=false;send.disabled=false;return}
      lastSignature=signature;
      const wasNearBottom=switching||isNearBottom();
      messages.innerHTML=rows.length?'':'<div class="empty-state">Sin mensajes.</div>';
      rows.forEach(m=>{
        const mine=String(m.usuario_id)===String(session.id);
        const el=document.createElement('div');
        el.className='chat-msg '+(mine?'resident':'guard');
        el.innerHTML='<div class="chat-bubble"></div><span class="chat-time mono"></span>';
        el.querySelector('.chat-bubble').textContent=m.contenido;
        let meta=(mine?'Tú':m.autor_nombre||name)+' · '+time(m.fecha_hora);
        if(mine)meta+=m.leido?' · Visto':' · Enviado';
        el.querySelector('.chat-time').textContent=meta;
        messages.appendChild(el);
      });
      if(wasNearBottom)messages.scrollTop=messages.scrollHeight;
      input.disabled=false;send.disabled=false;
    }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
  }
  document.getElementById('staffChatForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const contenido=input.value.trim();
    if(!currentId||!contenido)return;
    if(contenido.length>500){showToast('El mensaje no puede superar 500 caracteres.','bi-exclamation-triangle-fill');return}
    try{
      const r=await VigiaAPI.request('/mensajes/enviar',{method:'POST',body:JSON.stringify({conversacion_id:currentId,contenido})});
      input.value='';updateCharCount();
      if(r.moderacion&&r.moderacion.estado==='advertencia')showToast('Mensaje enviado con alerta de prioridad.','bi-exclamation-triangle-fill');
      await openThread(currentId,true);await loadInbox();
    }catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
  });
  document.getElementById('refreshInbox').onclick=loadInbox;

  // Permite llegar aqui directo desde otra pantalla ya sabiendo con
  // que residente se quiere hablar (ej. el boton "Mensaje" de una
  // alerta de panico en guardia.html) -- en vez de tener que buscarlo
  // a mano en la bandeja. Si no existe todavia una conversacion con
  // ese residente, /mensajes/con-residente la crea de una vez.
  const residenteAAbrir=new URLSearchParams(location.search).get('abrir_residente');
  (async()=>{
    await initResidencialSelector();
    if(residenteAAbrir){
      try{
        const r=await VigiaAPI.request(`/mensajes/con-residente/${residenteAAbrir}`);
        await loadInbox();
        if(r.data&&r.data.conversacion_id)openThread(r.data.conversacion_id);
        history.replaceState(null,'',location.pathname);
      }catch(e){
        showToast(e.message,'bi-exclamation-triangle-fill');
        loadInbox();
      }
    }else{
      loadInbox();
    }
  })();

  setInterval(()=>{loadInbox();if(currentId)openThread(currentId)},7000);
})();
