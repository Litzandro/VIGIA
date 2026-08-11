(function(){
  const modal=document.getElementById('reportModal'),form=document.getElementById('reportForm'),kanban=document.querySelector('.kanban');if(!modal||!form||!kanban)return;
  const desc=document.getElementById('reportDesc'),count=document.getElementById('reportDescCount'),priority=document.getElementById('reportPriority');let photoData='',types=[],rows=[];
  function open(){modal.classList.add('open');document.getElementById('reportTitle').focus()}function close(){modal.classList.remove('open')}
  document.querySelectorAll('[data-open-report]').forEach(x=>x.onclick=open);document.getElementById('reportCancel').onclick=close;modal.onclick=e=>{if(e.target===modal)close()};
  desc.addEventListener('keydown',e=>{if(e.key==='Enter'&&(desc.value.match(/\n/g)||[]).length>=3)e.preventDefault()});
  desc.addEventListener('input',()=>{desc.value=desc.value.replace(/\n{3,}/g,'\n\n');count.textContent=`${desc.value.length}/350`;const t=desc.value.toLowerCase();let p='media',cat='Otro';if(/fuego|humo|robo|intruso|arma|médic|medic|accidente/.test(t)){p='urgente';cat=/médic|medic|accidente/.test(t)?'Emergencia medica':'Robo'}else if(/luz|portón|porton|agua|fuga|sospech/.test(t)){p='alta';cat=/sospech/.test(t)?'Comportamiento sospechoso':'Dano a propiedad'}else if(/ruido|basura/.test(t)){p='baja';cat='Disturbio / ruido'}priority.value=p==='urgente'?'alta':p;document.getElementById('aiAssistText').textContent=`Sugerencia local: ${cat} · prioridad ${p}. Puedes cambiarla antes de enviar.`;document.getElementById('aiAssistBox').dataset.suggested=cat});

  // ---- Validacion de foto: tipo y tamano (requisito 1.2) ----
  const MAX_PHOTO_BYTES=4*1024*1024; // 4MB en el archivo original, antes de comprimir
  async function compress(file){
    if(!file)return '';
    if(!/^image\//.test(file.type)){showToast('Solo se permiten imagenes (jpg, png, webp).','bi-exclamation-triangle-fill');return ''}
    if(file.size>MAX_PHOTO_BYTES){showToast('Archivo demasiado grande. Máximo 4MB.','bi-exclamation-triangle-fill');return ''}
    const src=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file)});
    const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=src});
    const c=document.createElement('canvas'),s=Math.min(1,520/img.width);c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    return c.toDataURL('image/jpeg',.55)
  }
  document.getElementById('reportPhoto').onchange=async e=>{photoData=await compress(e.target.files[0]);const im=document.getElementById('reportPhotoPreview');im.src=photoData;document.getElementById('reportPhotoPreviewWrap').style.display=photoData?'block':'none';if(!photoData)e.target.value=''};

  const stateLabel={reportada:'Reportada',en_revision:'En revisión',resuelta:'Resuelta',cerrada:'Cerrada'};
  const stateBadge={reportada:'warn',en_revision:'ok',resuelta:'ok',cerrada:'neutral'};

  function relativeDays(iso){
    const d=new Date(iso);const days=Math.floor((Date.now()-d.getTime())/86400000);
    if(days<=0)return 'Hoy';if(days===1)return '1 día';return `${days} días`;
  }
  function matchesFilter(x,filter){
    if(filter==='alta')return x.prioridad==='alta'||x.prioridad==='urgente';
    if(filter==='semana')return (Date.now()-new Date(x.fecha_hora).getTime())<=7*86400000;
    if(filter==='abiertas')return x.estado==='reportada';
    if(filter==='progreso')return x.estado==='en_revision';
    if(filter==='historial')return x.estado==='resuelta'||x.estado==='cerrada';
    return true;
  }
  function matchesSearch(x,q){
    if(!q)return true;
    q=q.toLowerCase();
    const folio=`inc-${String(x.id).padStart(4,'0')}`;
    return folio.includes(q)||String(x.id).includes(q)||(x.titulo||'').toLowerCase().includes(q)||(x.descripcion||'').toLowerCase().includes(q)||(x.categoria||'').toLowerCase().includes(q);
  }

  function card(x){return `<article class="kcard" data-id="${x.id}" data-priority="${escapeHtml(x.prioridad)}"><div class="kcard-top"><span class="kcard-icon ${x.prioridad==='urgente'||x.prioridad==='alta'?'warn':'ok'}"><i class="bi bi-flag-fill"></i></span><span class="priority ${escapeHtml(x.prioridad)}">Prioridad ${escapeHtml(x.prioridad)}</span></div><h4>${escapeHtml(x.titulo)}</h4><p>${escapeHtml(x.descripcion)}</p><div class="kcard-footer"><div class="kcard-assignee"><span class="mini-av">VG</span> ${escapeHtml(x.visibilidad)}</div><span class="kcard-updated mono">#INC-${String(x.id).padStart(4,'0')} · ${relativeDays(x.fecha_hora)}</span></div></article>`}

  function render(){
    const chipFilter=(document.querySelector('.filter-chip.active')||{}).dataset?.filter||'todas';
    const q=(document.getElementById('incidentSearch')||{}).value||'';
    const filtered=rows.filter(x=>matchesFilter(x,chipFilter)&&matchesSearch(x,q));
    const groups={reportada:[],en_revision:[],historial:[]};
    filtered.forEach(x=>{if(x.estado==='reportada')groups.reportada.push(x);else if(x.estado==='en_revision')groups.en_revision.push(x);else groups.historial.push(x)});
    kanban.innerHTML=[['reportada','warn','Abierta'],['en_revision','ok','En progreso'],['historial','neutral','Historial']].map(([key,dot,title])=>`<section><div class="kanban-col-head"><span class="dot ${dot}"></span>${title} <span class="count">${groups[key].length}</span></div>${groups[key].length?groups[key].map(card).join(''):'<div class="incident-empty-note"><i class="bi bi-inbox"></i><span>Sin incidencias en esta etapa.</span></div>'}${key==='reportada'?'<div class="kcard-add" data-open-report><i class="bi bi-plus-lg"></i> Reportar otra incidencia</div>':''}</section>`).join('');
    kanban.querySelectorAll('[data-open-report]').forEach(x=>x.onclick=open);
    kanban.querySelectorAll('.kcard[data-id]').forEach(el=>el.addEventListener('click',()=>openDetail(Number(el.dataset.id))));
  }

  async function load(){try{const [i,t]=await Promise.all([VigiaAPI.request('/incidencias'),VigiaAPI.request('/tipos-incidencia?limit=100')]);types=t.data||[];rows=i.data||[];render();openFromQuery()}catch(e){kanban.innerHTML=`<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><span>${escapeHtml(e.message)}</span></div>`}}

  // Si se llega desde una notificacion de incidencia (propia o publica
  // de un vecino), abre directamente su detalle en vez de solo dejar
  // caer a la persona en el tablero general (requisito 2).
  function openFromQuery(){
    const id=new URLSearchParams(location.search).get('inc');
    if(id) openDetail(Number(id));
  }

  // ---- Filtros (requisito 1.7) ----
  document.querySelectorAll('.filter-chip').forEach(chip=>chip.addEventListener('click',()=>{
    document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));chip.classList.add('active');render();
  }));
  const searchInput=document.getElementById('incidentSearch');
  if(searchInput)searchInput.addEventListener('input',()=>render());

  // ---- Detalle de incidencia + historial (requisito 1.5/1.6) ----
  const detailModal=document.getElementById('detailModal');
  function closeDetail(){detailModal.classList.remove('open')}
  document.getElementById('detailClose').onclick=closeDetail;
  document.getElementById('detailCloseBtn').onclick=closeDetail;
  detailModal.onclick=e=>{if(e.target===detailModal)closeDetail()};
  function fullName(u){if(!u)return 'Sin asignar';return `${u.nombre||''} ${u.apellido||''}`.trim()||'Sin asignar'}
  async function openDetail(id){
    try{
      const r=await VigiaAPI.request(`/incidencias/${id}`);
      const x=r.data;
      document.getElementById('detailFolio').textContent=`#INC-${String(x.id).padStart(4,'0')}`;
      document.getElementById('detailTitle').textContent=x.titulo;
      document.getElementById('detailDescripcion').textContent=x.descripcion;
      const estadoEl=document.getElementById('detailEstado');estadoEl.textContent=stateLabel[x.estado]||x.estado;estadoEl.className='badge '+(stateBadge[x.estado]||'neutral');
      const prioEl=document.getElementById('detailPrioridad');prioEl.textContent=`Prioridad ${x.prioridad}`;prioEl.className='priority '+x.prioridad;
      document.getElementById('detailCategoria').textContent=(x.tipoIncidencia&&x.tipoIncidencia.nombre)||'Sin categoría';
      document.getElementById('detailFecha').textContent=new Date(x.fecha_hora).toLocaleString('es-HN');
      document.getElementById('detailReportadoPor').textContent=fullName(x.reportadoPor);
      document.getElementById('detailAsignadoA').textContent=fullName(x.asignadoA);
      document.getElementById('detailActualizado').textContent=(r.seguimiento&&r.seguimiento.length)?new Date(r.seguimiento[r.seguimiento.length-1].fecha_hora).toLocaleString('es-HN'):new Date(x.fecha_hora).toLocaleString('es-HN');
      const evWrap=document.getElementById('detailEvidenciaWrap'),ev=document.getElementById('detailEvidencia');
      if(r.evidencias&&r.evidencias.length){ev.src=r.evidencias[0].url_archivo;evWrap.style.display='block'}else{evWrap.style.display='none'}
      const timeline=document.getElementById('detailTimeline');
      const items=[{titulo:'Incidencia reportada',fecha:x.fecha_hora,comentario:null}].concat((r.seguimiento||[]).map(s=>({titulo:`Estado cambiado a "${stateLabel[s.estado_nuevo]||s.estado_nuevo}"`,fecha:s.fecha_hora,comentario:s.comentario,usuario:fullName(s.usuario)})));
      timeline.innerHTML=items.map(it=>`<div class="timeline-item"><span class="timeline-dot"></span><div><b>${escapeHtml(it.titulo)}</b><span>${new Date(it.fecha).toLocaleString('es-HN')}${it.usuario?' · '+escapeHtml(it.usuario):''}</span>${it.comentario?`<p>${escapeHtml(it.comentario)}</p>`:''}</div></div>`).join('');
      detailModal.classList.add('open');
    }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
  }

  form.onsubmit=async e=>{
    e.preventDefault();
    const titleVal=document.getElementById('reportTitle').value.trim();
    if(!titleVal){showToast('Debes escribir un título.','bi-exclamation-triangle-fill');return}
    if(!desc.value.trim()){showToast('Debes escribir una descripción.','bi-exclamation-triangle-fill');return}
    const suggested=document.getElementById('aiAssistBox').dataset.suggested;
    const type=types.find(x=>x.nombre===suggested)||types.find(x=>x.nombre==='Otro')||types[0];
    try{
      await VigiaAPI.request('/incidencias',{method:'POST',body:JSON.stringify({tipo_incidencia_id:type&&type.id,titulo:titleVal,descripcion:desc.value.trim(),prioridad:priority.value==='alta'&&/fuego|robo|médic|medic|intruso/.test(desc.value.toLowerCase())?'urgente':priority.value,visibilidad:document.getElementById('reportPrivate').checked?'privada':'comunidad',evidencia_url:photoData||null,evidencia_tipo:'imagen'})});
      form.reset();photoData='';count.textContent='0/350';document.getElementById('reportPhotoPreviewWrap').style.display='none';close();showToast('Incidencia enviada y guardada');load();
    }catch(err){showToast(err.message||'No fue posible crear la incidencia. Intenta nuevamente.','bi-exclamation-triangle-fill')}
  };
  document.getElementById('emergencyContactsBtn').onclick=()=>location.href='emergencias.html';
  async function panic(target){try{const r=await VigiaAPI.request('/tipos-alerta?limit=20');const type=(r.data||[]).find(x=>x.codigo==='otro')||(r.data||[])[0];if(!type)throw new Error('No hay tipo de alerta configurado.');await VigiaAPI.request('/alertas-panico',{method:'POST',body:JSON.stringify({tipo_alerta_id:type.id})});showToast(target==='guardia'?'Alerta privada enviada a garita':'Alerta enviada al sistema','bi-broadcast')}catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}}
  function modalPanic(button,mid,cancel,confirm,target){const m=document.getElementById(mid);document.getElementById(button).onclick=()=>m.classList.add('open');document.getElementById(cancel).onclick=()=>m.classList.remove('open');document.getElementById(confirm).onclick=async()=>{m.classList.remove('open');await panic(target)}}
  modalPanic('panicGuardBtn','panicGuardModal','panicGuardCancel','panicGuardConfirm','guardia');modalPanic('panicResidentsBtn','panicResidentsModal','panicResidentsCancel','panicResidentsConfirm','residentes');

  // ---- Integracion con el Asistente VIGIA (requisito 4.1/4.2): si llega
  // desde el asistente con ?open=report, abre "Nueva incidencia" sola.
  if(new URLSearchParams(location.search).get('open')==='report') setTimeout(open,150);

  load();
})();
