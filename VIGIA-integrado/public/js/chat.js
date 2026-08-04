// Chat persistente del residente con seguridad/administración.
(function(){
  const form=document.getElementById('chatForm');
  const messages=document.getElementById('chatMessages');
  const input=document.getElementById('chatInput');
  if(!form||!messages||!input)return;
  const session=VigiaAPI.getSession();
  let conversationId=null;
  let sending=false;

  function initials(name){return String(name||'VG').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'VG'}
  function scrollToBottom(){messages.scrollTop=messages.scrollHeight}
  function formatTime(value){try{return new Date(value).toLocaleTimeString('es-HN',{hour:'2-digit',minute:'2-digit'})}catch(e){return ''}}

  function render(data){
    conversationId=data.conversacion?data.conversacion.id:null;
    const staff=(data.participantes||[]).find(x=>String(x.id)!==String(session.id));
    const staffName=(data.personal_actual&&data.personal_actual.nombre_completo)||(staff&&staff.nombre_completo)||'Seguridad VIGIA';
    document.getElementById('chatStaffName').textContent=staffName;
    document.getElementById('chatStaffAvatar').textContent=initials(staffName);
    const rows=data.mensajes||[];
    messages.innerHTML=rows.length?'':'<div class="empty-state">Aún no hay mensajes. Escribe para iniciar la conversación.</div>';
    rows.forEach(m=>{
      const mine=String(m.usuario_id)===String(session.id);
      const el=document.createElement('div');
      el.className='chat-msg '+(mine?'resident':'guard');
      el.innerHTML='<div class="chat-bubble"></div><span class="chat-time mono"></span>';
      el.querySelector('.chat-bubble').textContent=m.contenido;
      el.querySelector('.chat-time').textContent=(mine?'Tú':m.autor_nombre||'Seguridad')+' · '+formatTime(m.fecha_hora);
      messages.appendChild(el);
    });
    scrollToBottom();
  }

  async function load(showError=false){
    try{const r=await VigiaAPI.request('/mensajes/hilo-principal');render(r.data||{})}
    catch(e){if(showError)showToast(e.message,'bi-exclamation-triangle-fill')}
  }

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(sending)return;
    const contenido=input.value.trim();
    if(!contenido)return;
    if(contenido.split(/\r?\n/).length>4){showToast('Usa como máximo 4 líneas.','bi-exclamation-triangle-fill');return}
    sending=true;document.getElementById('chatSendBtn').disabled=true;
    try{
      const r=await VigiaAPI.request('/mensajes/enviar',{method:'POST',body:JSON.stringify({conversacion_id:conversationId,contenido})});
      input.value='';
      if(r.moderacion&&r.moderacion.estado==='advertencia')showToast('Mensaje enviado y resaltado para seguridad.','bi-exclamation-triangle-fill');
      await load(true);
    }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
    finally{sending=false;document.getElementById('chatSendBtn').disabled=false;input.focus()}
  });

  load(true);setInterval(()=>load(false),5000);
})();
