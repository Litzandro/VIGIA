(function(){
  const form=document.getElementById('shiftForm');if(!form)return;
  const session=VigiaAPI.getSession();
  const canManage=['admin','superadmin'].includes(session.rol_codigo);
  const isSuper=session.rol_codigo==='superadmin';
  const residentialGroup=document.getElementById('opResidentialGroup');
  if(!isSuper)residentialGroup.style.display='none';
  if(!canManage)form.closest('.panel').style.display='none';
  let allShifts=[],guards=[],users=[],points=[],configs=[],residentials=[];

  function selectedResidential(){return isSuper?Number(document.getElementById('opResidential').value):Number(session.residencial_id)}
  function refreshSelectors(){
    const rid=selectedResidential();
    if(canManage){
      const userMap=new Map(users.map(u=>[String(u.id),`${u.nombre} ${u.apellido}`]));
      const currentGuards=guards.filter(g=>!rid||Number(g.residencial_id)===rid);
      const options=currentGuards.map(g=>`<option value="${g.usuario_id}">${escapeHtml(userMap.get(String(g.usuario_id))||`Guardia #${g.usuario_id}`)}</option>`).join('');
      document.getElementById('opGuard').innerHTML=options||'<option value="">Sin guardias</option>';
      document.getElementById('opRelief').innerHTML='<option value="">Sin relevo</option>'+options;
      document.getElementById('opPoint').innerHTML=points.filter(p=>!rid||Number(p.residencial_id)===rid).map(p=>`<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('')||'<option value="">Sin punto de acceso</option>';
    }
    const cfg=configs.find(x=>Number(x.residencial_id)===rid);const zone=cfg&&cfg.zona_horaria||'America/Tegucigalpa';
    document.getElementById('timeZone').textContent=zone.split('/').pop().replaceAll('_',' ');localStorage.setItem('vigia_timezone',zone);
    renderShifts();
    if(isSuper&&rid){VigiaAPI.request(`/cola-acceso/metricas?residencial_id=${rid}`).then(r=>{const m=r.data||{};document.getElementById('waitingQueue').textContent=m.esperando||0;document.getElementById('avgAccess').textContent=`${m.tiempo_promedio_seg||0} s`}).catch(()=>{})}
  }

  function renderShifts(){
    const rid=selectedResidential();
    const rows=allShifts.filter(x=>!rid||Number(x.residencial_id)===rid);
    document.getElementById('activeShifts').textContent=rows.filter(x=>x.estado==='activo').length;
    document.getElementById('shiftCount').textContent=`${rows.length} jornadas`;
    const box=document.getElementById('shiftList');box.innerHTML=rows.length?'':'<div class="empty-state">No hay turnos programados.</div>';
    rows.forEach(x=>{
      const el=document.createElement('div');el.className='queue-item';
      // Este panel va en un layout de 2 columnas (split-layout), mas
      // angosto que otras paginas: fuerza la tarjeta a 2 columnas
      // (icono+texto) con los botones en su propia fila de abajo, para
      // que el nombre del guardia no se apriete y se parta letra por
      // letra cuando hay 2-3 botones de accion.
      el.style.gridTemplateColumns='auto 1fr';
      el.innerHTML=`<div class="queue-number"><i class="bi bi-clock-history"></i></div><div class="queue-copy"><b>${escapeHtml(x.guardia_original_nombre||`Guardia #${x.guardia_original_id}`)}</b><span>${new Date(x.inicio_programado).toLocaleString('es-HN')} — ${new Date(x.fin_programado).toLocaleString('es-HN')}</span>${x.guardia_relevo_nombre?`<span>Relevo: ${escapeHtml(x.guardia_relevo_nombre)}</span>`:''}<span>${escapeHtml(x.observaciones||'Sin observaciones')}</span></div><div class="queue-actions" style="grid-column:1 / -1;justify-content:flex-start;margin-top:.6rem;"><span class="badge ${x.estado==='activo'?'ok':x.estado==='programado'?'pending':'neutral'}">${escapeHtml(x.estado)}</span>${x.estado==='programado'?'<button class="btn btn-solid" data-a="iniciar">Iniciar</button>':''}${canManage&&['programado','activo'].includes(x.estado)?'<button class="btn btn-ghost" data-a="relevar">Relevar</button>':''}${['activo','relevado'].includes(x.estado)?'<button class="btn btn-ghost" data-a="finalizar">Finalizar</button>':''}</div>`;
      el.querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{
        const body={accion:b.dataset.a};
        if(b.dataset.a==='relevar'){
          const relief=document.getElementById('opRelief').value||prompt('ID del guardia de relevo:');if(!relief)return;
          body.guardia_relevo_id=Number(relief);body.observaciones=prompt('Motivo del relevo:')||'Relevo de jornada';
        }
        try{await VigiaAPI.request(`/turnos-guardia/${x.id}/accion`,{method:'PATCH',body:JSON.stringify(body)});showToast('Jornada actualizada');await load()}catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
      });box.appendChild(el);
    });
  }

  async function load(){
    try{
      const requests=[VigiaAPI.request('/turnos-guardia?limit=200'),isSuper?Promise.resolve({data:{}}):VigiaAPI.request('/cola-acceso/metricas'),VigiaAPI.request('/configuraciones-residencial?limit=300')];
      if(canManage)requests.push(VigiaAPI.request('/guardias?limit=500'),VigiaAPI.request('/usuarios?limit=500'),VigiaAPI.request('/puntos-acceso?limit=300'));
      if(isSuper)requests.push(VigiaAPI.request('/residenciales?limit=300'));
      const all=await Promise.all(requests);allShifts=all[0].data||[];const metrics=all[1].data||{};configs=all[2].data||[];
      document.getElementById('waitingQueue').textContent=metrics.esperando||0;document.getElementById('avgAccess').textContent=`${metrics.tiempo_promedio_seg||0} s`;
      if(canManage){guards=all[3].data||[];users=all[4].data||[];points=all[5].data||[]}
      if(isSuper){residentials=all[6].data||[];const select=document.getElementById('opResidential');const previous=select.value;select.innerHTML=residentials.map(x=>`<option value="${x.id}">${escapeHtml(x.nombre)}</option>`).join('');if(previous)select.value=previous;select.onchange=refreshSelectors}
      refreshSelectors();
    }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
  }

  form.onsubmit=async e=>{e.preventDefault();const payload={guardia_original_id:Number(document.getElementById('opGuard').value),guardia_relevo_id:Number(document.getElementById('opRelief').value)||null,punto_acceso_id:Number(document.getElementById('opPoint').value)||null,inicio_programado:document.getElementById('opStart').value,fin_programado:document.getElementById('opEnd').value,observaciones:document.getElementById('opNotes').value.trim()||null};if(isSuper)payload.residencial_id=selectedResidential();try{await VigiaAPI.request('/turnos-guardia',{method:'POST',body:JSON.stringify(payload)});form.reset();showToast('Turno programado');await load()}catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}};
  document.getElementById('reloadOps').onclick=load;load();
})();
