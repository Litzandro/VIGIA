(function(){
  const list=document.getElementById('inboxList');if(!list)return;
  const session=VigiaAPI.getSession();let threads=[];let currentId=null;
  const messages=document.getElementById('staffMessages'),input=document.getElementById('staffChatInput'),send=document.getElementById('staffSendBtn');
  function initials(name){return String(name||'VG').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'VG'}
  function participantName(t){const p=(t.participantes||[]).find(x=>String(x.id)!==String(session.id));return p?p.nombre_completo:(t.nombre||'Conversación')}
  function time(v){try{return new Date(v).toLocaleString('es-HN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}catch(e){return ''}}
  function renderInbox(){
    document.getElementById('inboxCount').textContent=threads.length;
    list.innerHTML=threads.length?'':'<div class="empty-state">No hay conversaciones.</div>';
    threads.forEach(t=>{const name=participantName(t);const el=document.createElement('button');el.type='button';el.className='queue-item thread-item'+(String(t.id)===String(currentId)?' active':'');el.innerHTML=`<div class="post-av">${escapeHtml(initials(name))}</div><div class="queue-copy"><b>${escapeHtml(name)}</b><span>${escapeHtml(t.ultimo_mensaje||'Sin mensajes')}</span><small class="mono">${escapeHtml(time(t.ultima_fecha))}</small></div>`;el.onclick=()=>openThread(t.id);list.appendChild(el)})
  }
  async function loadInbox(){try{const r=await VigiaAPI.request('/mensajes/inbox');threads=r.data||[];renderInbox();if(!currentId&&threads.length)openThread(threads[0].id)}catch(e){list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`}}
  async function openThread(id){
    currentId=id;renderInbox();
    try{const r=await VigiaAPI.request(`/mensajes/conversacion/${id}`),d=r.data||{};const other=(d.participantes||[]).find(x=>String(x.id)!==String(session.id));const name=other?other.nombre_completo:(d.conversacion&&d.conversacion.nombre)||'Residente';document.getElementById('staffThreadName').textContent=name;document.getElementById('staffThreadAvatar').textContent=initials(name);const rows=d.mensajes||[];messages.innerHTML=rows.length?'':'<div class="empty-state">Sin mensajes.</div>';rows.forEach(m=>{const mine=String(m.usuario_id)===String(session.id);const el=document.createElement('div');el.className='chat-msg '+(mine?'resident':'guard');el.innerHTML='<div class="chat-bubble"></div><span class="chat-time mono"></span>';el.querySelector('.chat-bubble').textContent=m.contenido;el.querySelector('.chat-time').textContent=(mine?'Tú':m.autor_nombre||name)+' · '+time(m.fecha_hora);messages.appendChild(el)});messages.scrollTop=messages.scrollHeight;input.disabled=false;send.disabled=false}catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
  }
  document.getElementById('staffChatForm').addEventListener('submit',async e=>{e.preventDefault();const contenido=input.value.trim();if(!currentId||!contenido)return;try{const r=await VigiaAPI.request('/mensajes/enviar',{method:'POST',body:JSON.stringify({conversacion_id:currentId,contenido})});input.value='';if(r.moderacion&&r.moderacion.estado==='advertencia')showToast('Mensaje enviado con alerta de prioridad.','bi-exclamation-triangle-fill');await openThread(currentId);await loadInbox()}catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}});
  document.getElementById('refreshInbox').onclick=loadInbox;loadInbox();setInterval(()=>{loadInbox();if(currentId)openThread(currentId)},7000);
})();
