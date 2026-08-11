(function(){
  const feed=document.getElementById('postsFeed'),form=document.getElementById('postForm');if(!feed||!form)return;
  const input=document.getElementById('postText'),count=document.getElementById('postCount'),session=VigiaAPI.getSession();
  let rows=[],filter='todas',editingId=null;
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&(input.value.match(/\n/g)||[]).length>=3)e.preventDefault()});
  input.addEventListener('input',()=>{input.value=input.value.replace(/\n{3,}/g,'\n\n');count.textContent=`${input.value.length}/300`});
  const badges={'General':'neutral','Objetos perdidos':'warn','Compra-venta':'ok','Aviso importante':'alert'};

  function moderate(text){
    const links=(text.match(/https?:\/\//gi)||[]).length;
    if(links>2)return{ok:false,msg:'La publicación parece spam: máximo 2 enlaces.'};
    if(/(.)\1{12,}/.test(text))return{ok:false,msg:'Reduce las repeticiones antes de publicar.'};
    return{ok:true};
  }

  function relativeTime(iso){
    const d=new Date(iso);const min=Math.floor((Date.now()-d.getTime())/60000);
    if(min<1)return 'Justo ahora';if(min<60)return `Hace ${min} min`;
    const h=Math.floor(min/60);if(h<24)return `Hace ${h} h`;
    const days=Math.floor(h/24);if(days===1)return 'Ayer';if(days<7)return `Hace ${days} días`;
    return d.toLocaleDateString('es-HN');
  }

  function authorName(x){
    if(x.usuario&&(x.usuario.nombre||x.usuario.apellido))return `${x.usuario.nombre||''} ${x.usuario.apellido||''}`.trim();
    return 'Vecino';
  }
  function initials(name){const parts=name.trim().split(/\s+/);return ((parts[0]||'')[0]||'V').toUpperCase()+((parts[1]||'')[0]||'').toUpperCase()}

  function matchesFilter(x){return filter==='todas'||x.categoria===filter}
  function matchesSearch(x,q){if(!q)return true;q=q.toLowerCase();return (x.contenido||'').toLowerCase().includes(q)||(x.categoria||'').toLowerCase().includes(q)}

  function postCard(x){
    const mine=String(x.usuario_id)===String(session.id);
    const isAdmin=['admin','superadmin'].includes(session.rol_codigo);
    const name=mine?'Tú':authorName(x);
    const card=document.createElement('div');
    card.className='panel post-card';
    card.dataset.id=x.id;
    card.innerHTML=`<div class="post-head"><div class="post-av">${mine?'YO':initials(authorName(x))}</div><div class="post-who"><b>${escapeHtml(name)}</b><span class="mono">${relativeTime(x.fecha_creacion)}</span></div><span class="badge ${badges[x.categoria]||'neutral'} post-category">${escapeHtml(x.categoria)}</span>${x.visibilidad==='administracion'?'<span class="badge neutral"><i class="bi bi-lock-fill"></i> Privada</span>':''}</div>`+
      `<p class="post-text" data-content>${escapeHtml(x.contenido)}</p>`+
      `<div class="post-actions">`+
      (mine?`<button class="post-like" data-edit="${x.id}"><i class="bi bi-pencil"></i> Editar</button><button class="post-like" data-delete="${x.id}"><i class="bi bi-trash"></i> Eliminar</button>`:`<button class="post-like" data-report="${x.id}"><i class="bi bi-flag"></i> Reportar</button>`)+
      (isAdmin&&!mine?`<button class="post-like" data-hide="${x.id}"><i class="bi bi-eye-slash"></i> Ocultar</button>`:'')+
      `</div>`;
    const del=card.querySelector('[data-delete]');
    if(del)del.onclick=async()=>{
      if(!confirm('¿Eliminar esta publicación?'))return;
      try{await VigiaAPI.request(`/publicaciones-comunidad/${x.id}`,{method:'DELETE'});showToast('Publicación retirada');load()}
      catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
    };
    const hide=card.querySelector('[data-hide]');
    if(hide)hide.onclick=async()=>{
      try{await VigiaAPI.request(`/publicaciones-comunidad/${x.id}`,{method:'PATCH',body:JSON.stringify({estado:'oculta'})});showToast('Publicación ocultada');load()}
      catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
    };
    const edit=card.querySelector('[data-edit]');
    if(edit)edit.onclick=()=>startEdit(card,x);
    const report=card.querySelector('[data-report]');
    if(report)report.onclick=()=>openReport(x.id);
    return card;
  }

  function startEdit(card,x){
    const p=card.querySelector('[data-content]');
    const original=x.contenido;
    p.outerHTML=`<div class="form-group" style="margin:.6rem 0;"><textarea class="form-control" id="editArea${x.id}" maxlength="500" rows="3">${escapeHtml(original)}</textarea></div>`+
      `<div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel-edit>Cancelar</button><button type="button" class="btn btn-solid" data-save-edit>Guardar</button></div>`;
    card.querySelector('[data-cancel-edit]').onclick=()=>load();
    card.querySelector('[data-save-edit]').onclick=async()=>{
      const val=document.getElementById(`editArea${x.id}`).value.trim();
      const check=moderate(val);
      if(!val){showToast('La publicación no puede quedar vacía.','bi-exclamation-triangle-fill');return}
      if(!check.ok){showToast(check.msg,'bi-shield-exclamation');return}
      try{await VigiaAPI.request(`/publicaciones-comunidad/${x.id}`,{method:'PATCH',body:JSON.stringify({contenido:val})});showToast('Publicación actualizada');load()}
      catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
    };
  }

  // ---- Reportar publicación (requisito 3.7) ----
  const reportModal=document.getElementById('reportPostModal'),reportForm=document.getElementById('reportPostForm');
  function openReport(id){editingId=id;reportModal.classList.add('open')}
  if(reportModal){
    document.getElementById('reportPostCancel').onclick=()=>reportModal.classList.remove('open');
    reportModal.onclick=e=>{if(e.target===reportModal)reportModal.classList.remove('open')};
    reportForm.onsubmit=async e=>{
      e.preventDefault();
      try{
        await VigiaAPI.request('/publicaciones-reportes',{method:'POST',body:JSON.stringify({publicacion_id:editingId,motivo:document.getElementById('reportPostMotivo').value,comentario:document.getElementById('reportPostComentario').value.trim()||null})});
        reportForm.reset();reportModal.classList.remove('open');showToast('Gracias, revisaremos tu reporte.');
      }catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
    };
  }

  function render(){
    const q=(document.getElementById('communitySearch')||{}).value||'';
    const visible=rows.filter(x=>matchesFilter(x)&&matchesSearch(x,q));
    feed.innerHTML='';
    if(!visible.length){feed.innerHTML='<div class="empty-state"><i class="bi bi-people"></i><span>No hay publicaciones todavía.</span></div>';return}
    visible.forEach(x=>feed.appendChild(postCard(x)));
  }

  async function load(){
    try{const r=await VigiaAPI.request('/publicaciones-comunidad');rows=r.data||[];render();highlightFromQuery()}
    catch(e){feed.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`}
  }

  // Si se llega desde una notificacion ("X subió un mensaje en el muro
  // de vecinos"), resalta y hace scroll hasta esa publicación en vez de
  // solo abrir el muro en general (requisito 3).
  function highlightFromQuery(){
    const id=new URLSearchParams(location.search).get('post');
    if(!id)return;
    const card=feed.querySelector(`[data-id="${id}"]`);
    if(!card)return;
    card.scrollIntoView({behavior:'smooth',block:'center'});
    card.classList.add('post-highlight');
    setTimeout(()=>card.classList.remove('post-highlight'),2600);
  }

  document.querySelectorAll('#communityFilters .filter-chip').forEach(chip=>chip.addEventListener('click',()=>{
    document.querySelectorAll('#communityFilters .filter-chip').forEach(c=>c.classList.remove('active'));chip.classList.add('active');filter=chip.dataset.filter;render();
  }));
  const searchInput=document.getElementById('communitySearch');
  if(searchInput)searchInput.addEventListener('input',()=>render());

  form.onsubmit=async e=>{
    e.preventDefault();
    const text=input.value.trim(),check=moderate(text);
    if(!text){showToast('Escribe algo antes de publicar.','bi-exclamation-triangle-fill');return}
    if(!check.ok){showToast(check.msg,'bi-shield-exclamation');return}
    try{
      await VigiaAPI.request('/publicaciones-comunidad',{method:'POST',body:JSON.stringify({categoria:document.getElementById('postCategory').value,contenido:text,visibilidad:document.getElementById('postPrivate').checked?'administracion':'residencial'})});
      form.reset();count.textContent='0/300';showToast(document.getElementById('postPrivate').checked?'Publicación privada enviada':'Publicación compartida');load();
    }catch(err){showToast(err.message||'No fue posible publicar. Intenta nuevamente.','bi-exclamation-triangle-fill')}
  };

  load();
})();
