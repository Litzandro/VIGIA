(function(){
  const form=document.getElementById('quickAccessForm');if(!form)return;
  const point=document.getElementById('qaPoint'),photo=document.getElementById('qaPhoto'),preview=document.getElementById('qaPreview'),message=document.getElementById('qaMessage'),authHint=document.getElementById('qaAuthHint');
  const docInput=document.getElementById('qaDocument'),plateInput=document.getElementById('qaPlate');
  let photoData='';
  const setMsg=(text,type='')=>{message.style.display='flex';message.className='status-line '+type;message.textContent=text};

  // Consulta en vivo (con pequeño retraso) si el documento o la placa que
  // el guardia esta escribiendo coincide con una autorizacion recurrente
  // vigente (bus escolar, familiar, proveedor...), para que no tenga que
  // re-validarla a mano cada vez que la persona ya esta autorizada.
  let authTimer=null;
  function hideAuthHint(){authHint.style.display='none';authHint.textContent=''}
  async function checkAuthorized(){
    const numero_documento=docInput.value.trim(),placa_vehiculo=plateInput.value.trim();
    if(!numero_documento&&!placa_vehiculo){hideAuthHint();return}
    try{
      const params=new URLSearchParams();
      if(numero_documento)params.set('numero_documento',numero_documento);
      if(placa_vehiculo)params.set('placa_vehiculo',placa_vehiculo);
      const r=await VigiaAPI.request(`/personas-autorizadas/verificar?${params.toString()}`);
      const match=r.data;
      if(!match){hideAuthHint();return}
      authHint.style.display='flex';
      if(!match.dentro_de_horario){
        authHint.className='status-line warn';
        authHint.innerHTML=`<i class="bi bi-exclamation-triangle-fill"></i> ${escapeHtml(match.nombre_completo)} está autorizado, pero fuera de su horario permitido (${escapeHtml(match.hora_desde||'00:00')}–${escapeHtml(match.hora_hasta||'23:59')}). Revisa antes de dejar pasar.`;
      }else if(match.cupo_agotado){
        authHint.className='status-line warn';
        authHint.innerHTML=`<i class="bi bi-exclamation-triangle-fill"></i> ${escapeHtml(match.nombre_completo)} está autorizado, pero ya alcanzó su límite de accesos hoy (${match.max_accesos_dia}).`;
      }else{
        authHint.className='status-line ok';
        authHint.innerHTML=`<i class="bi bi-person-check-fill"></i> Persona autorizada: ${escapeHtml(match.nombre_completo)}${match.empresa?' · '+escapeHtml(match.empresa):''}.`;
      }
    }catch(e){hideAuthHint()}
  }
  function scheduleAuthCheck(){clearTimeout(authTimer);authTimer=setTimeout(checkAuthorized,400)}
  docInput.addEventListener('input',scheduleAuthCheck);
  plateInput.addEventListener('input',scheduleAuthCheck);
  async function compress(file){
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=data});
    const max=520,scale=Math.min(1,max/img.width);const c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.58);
  }
  photo.addEventListener('change',async()=>{const f=photo.files[0];if(!f)return;photoData=await compress(f);preview.src=photoData;preview.classList.add('show');setMsg('Fotografía lista como evidencia.')});

  async function loadPoints(){
    try{const r=await VigiaAPI.request('/puntos-acceso?limit=100');const rows=r.data||[];point.innerHTML=rows.length?rows.map(x=>`<option value="${x.id}">${escapeHtml(x.nombre)}</option>`).join(''):'<option value="1">Garita principal</option>'}catch(e){point.innerHTML='<option value="1">Garita principal</option>';setMsg('No se pudieron cargar los puntos; se usará el punto 1.','warn')}
  }
  function badge(status){const map={esperando:'pending',en_validacion:'info',autorizada:'ok',bloqueada:'blocked',rechazada:'blocked',completada:'neutral'};return `<span class="badge ${map[status]||'neutral'}">${escapeHtml(status||'')}</span>`}
  async function action(id,accion){
    try{await VigiaAPI.request(`/cola-acceso/${id}/atender`,{method:'PATCH',body:JSON.stringify({accion})});showToast('Estado actualizado');await loadQueue()}catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
  }
  async function loadQueue(){
    const list=document.getElementById('queueList');
    try{
      const [q,m]=await Promise.all([VigiaAPI.request('/cola-acceso?limit=100&sort=fecha_llegada:desc'),VigiaAPI.request('/cola-acceso/metricas')]);
      const rows=(q.data||[]).filter(x=>['esperando','en_validacion','bloqueada','autorizada'].includes(x.estado));
      document.getElementById('queueCount').textContent=`${rows.length} registros`;
      list.innerHTML=rows.length?'':'<div class="empty-state">No hay personas esperando.</div>';
      rows.forEach((x,i)=>{
        const el=document.createElement('div');el.className='queue-item';
        const time=new Date(x.fecha_llegada).toLocaleTimeString('es-HN',{hour:'2-digit',minute:'2-digit'});
        let flag='';
        if(x.resultado_validacion==='veto')flag='<span style="color:var(--alert)">VETO ACTIVO — no permitir el ingreso</span>';
        else if(x.resultado_validacion==='fuera_horario')flag='<span style="color:var(--warn)">Autorizado, pero fuera de horario — revisar</span>';
        else if(x.persona_autorizada_id)flag='<span style="color:var(--accent)"><i class="bi bi-person-check-fill"></i> Persona autorizada</span>';
        el.innerHTML=`<div class="queue-number">${i+1}</div><div class="queue-copy"><b>${escapeHtml(x.nombre_persona)}</b><span>${escapeHtml(x.vivienda_destino||'Sin destino')} · ${escapeHtml(x.placa_vehiculo||'Sin placa')} · ${time}</span>${flag}</div><div class="queue-actions">${badge(x.estado)}${x.estado==='esperando'?`<button class="btn btn-ghost" data-a="iniciar">Iniciar</button>`:''}${x.estado==='en_validacion'?`<button class="btn btn-solid" data-a="autorizar">Autorizar</button><button class="btn btn-ghost" data-a="rechazar">Rechazar</button>`:''}${x.estado==='autorizada'?`<button class="btn btn-ghost" data-a="completar">Completar</button>`:''}</div>`;
        el.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>action(x.id,b.dataset.a));list.appendChild(el);
      });
      const metrics=m.data||{};document.getElementById('mWaiting').textContent=metrics.esperando||0;document.getElementById('mValidating').textContent=metrics.en_validacion||0;document.getElementById('mAverage').textContent=(metrics.tiempo_promedio_seg||0)+' s';document.getElementById('mTarget').textContent=(metrics.objetivo_seg||90)+' s';document.getElementById('mTargetCard').classList.toggle('alert',Boolean(metrics.alerta_cola));
    }catch(e){list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`}
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();message.style.display='none';
    const payload={punto_acceso_id:Number(point.value),nombre_persona:document.getElementById('qaName').value.trim(),numero_documento:document.getElementById('qaDocument').value.trim()||null,vivienda_destino:document.getElementById('qaHome').value.trim()||null,placa_vehiculo:document.getElementById('qaPlate').value.trim()||null,motivo:document.getElementById('qaReason').value.trim()||null,origen_registro:document.getElementById('qaOrigin').value,prioridad:document.getElementById('qaPriority').value,foto_url:photoData||null};
    if(!payload.nombre_persona){setMsg('Escribe el nombre de la persona.','alert');return}
    if(!payload.foto_url){setMsg('Toma una fotografía: es la evidencia obligatoria del guardia.','alert');return}
    try{
      const r=await VigiaAPI.request('/cola-acceso/rapido',{method:'POST',body:JSON.stringify(payload)});
      const auth=r.autorizacion_recurrente;
      if(auth&&auth.fuera_de_horario)setMsg(`Agregado a la cola. Ojo: ${auth.nombre_completo} está autorizado pero fuera de su horario.`,'warn');
      else if(auth&&auth.cupo_agotado)setMsg(`Agregado a la cola. Ojo: ${auth.nombre_completo} ya alcanzó su límite de accesos hoy.`,'warn');
      else if(auth)setMsg(`Agregado a la cola. Coincide con la autorización de ${auth.nombre_completo}.`,'');
      else setMsg(r.offline?'Registro guardado sin conexión. Se sincronizará automáticamente.':'Persona agregada a la cola.');
      form.reset();photoData='';preview.classList.remove('show');hideAuthHint();await loadQueue();
    }catch(err){setMsg(err.message,'alert');await loadQueue()}
  });
  document.getElementById('refreshQueue').onclick=loadQueue;loadPoints();loadQueue();setInterval(loadQueue,30000);
})();
