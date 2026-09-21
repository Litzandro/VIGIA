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
      // Formato 12h explicito: el default de Intl para 'es-HN' no siempre
      // cae en 12h segun el navegador, asi que se fuerza hour12:true.
      const fmt12h={day:'2-digit',month:'2-digit',hour:'numeric',minute:'2-digit',hour12:true};
      el.innerHTML=`<div class="queue-number"><i class="bi bi-clock-history"></i></div><div class="queue-copy"><b>${escapeHtml(x.guardia_original_nombre||`Guardia #${x.guardia_original_id}`)}</b><span>${new Date(x.inicio_programado).toLocaleString('es-HN',fmt12h)} — ${new Date(x.fin_programado).toLocaleString('es-HN',fmt12h)}</span>${x.guardia_relevo_nombre?`<span>Relevo: ${escapeHtml(x.guardia_relevo_nombre)}</span>`:''}<span>${escapeHtml(x.observaciones||'Sin observaciones')}</span></div><div class="queue-actions" style="grid-column:1 / -1;justify-content:flex-start;margin-top:.6rem;"><span class="badge ${x.estado==='activo'?'ok':x.estado==='programado'?'pending':'neutral'}">${escapeHtml(x.estado)}</span>${x.estado==='programado'?'<button class="btn btn-solid" data-a="iniciar">Iniciar</button>':''}${canManage&&['programado','activo'].includes(x.estado)?'<button class="btn btn-caution" data-a="relevar">Relevar</button>':''}${['activo','relevado'].includes(x.estado)?'<button class="btn btn-danger" data-a="finalizar">Finalizar</button>':''}${x.estado!=='programado'?`<button class="btn btn-ghost" data-bitacora="1"><i class="bi bi-journal-text"></i> Bitácora</button>`:''}</div>`;
      const bitBtn=el.querySelector('[data-bitacora]');
      if(bitBtn)bitBtn.onclick=()=>abrirBitacora(x);
      el.querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{
        const body={accion:b.dataset.a};
        if(b.dataset.a==='relevar'){
          const relief=document.getElementById('opRelief').value||prompt('ID del guardia de relevo:');if(!relief)return;
          const motivoRelevo=prompt('Motivo del relevo:')||'Relevo de jornada';
          body.guardia_relevo_id=Number(relief);body.observaciones=motivoRelevo;
        }
        try{
          await VigiaAPI.request(`/turnos-guardia/${x.id}/accion`,{method:'PATCH',body:JSON.stringify(body)});
          if(b.dataset.a==='relevar')await VigiaAPI.request(`/turnos-guardia/${x.id}/nota`,{method:'PATCH',body:JSON.stringify({comentario:`Relevo: ${body.observaciones}`})}).catch(()=>{});
          showToast('Jornada actualizada');await load();
        }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
      });box.appendChild(el);
    });
  }

  // ---------- BITÁCORA DEL TURNO ----------
  // Antes ningun guardia tenia donde dejar constancia de lo que paso
  // durante su jornada (rondas, visitas atendidas, algo para el
  // siguiente turno) ni de un motivo de relevo mas detallado que el
  // "Motivo del relevo" de un solo prompt(). Reusa GET/PATCH
  // /turnos-guardia/:id/bitacora y /nota (ver el override del backend).
  let turnoBitacora=null;
  const bitPanel=document.getElementById('opBitacoraPanel');
  const bitList=document.getElementById('opBitacoraList');
  const bitNote=document.getElementById('opBitacoraNote');
  const bitForm=document.getElementById('opBitacoraForm');

  function puedeAnotar(turno){
    if(canManage)return true;
    return [turno.guardia_original_id,turno.guardia_relevo_id].map(String).includes(String(session.id));
  }
  function fmtNota(v){return new Date(v).toLocaleString('es-HN',{day:'2-digit',month:'short',hour:'numeric',minute:'2-digit',hour12:true})}
  async function cargarBitacora(turno){
    bitList.innerHTML='<div class="empty-state">Cargando…</div>';
    try{
      const r=await VigiaAPI.request(`/turnos-guardia/${turno.id}/bitacora`);
      const rows=r.data||[];
      bitList.innerHTML=rows.length?'':'<div class="empty-state">Todavía no hay novedades registradas en este turno.</div>';
      rows.forEach(n=>{
        const el=document.createElement('div');el.className='op-bit-entry';
        el.innerHTML=`<p></p><span></span>`;
        el.querySelector('p').textContent=n.comentario;
        el.querySelector('span').textContent=`${n.usuario_nombre} · ${fmtNota(n.fecha_hora)}`;
        bitList.appendChild(el);
      });
      bitList.scrollTop=bitList.scrollHeight;
    }catch(e){bitList.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`}
  }
  function abrirBitacora(turno){
    turnoBitacora=turno;
    document.getElementById('opBitacoraSub').textContent=`${turno.guardia_original_nombre||'Guardia'} · ${new Date(turno.inicio_programado).toLocaleDateString('es-HN',{day:'2-digit',month:'short'})}`;
    bitForm.style.display=puedeAnotar(turno)?'flex':'none';
    bitNote.value='';
    bitPanel.hidden=false;
    cargarBitacora(turno);
    bitPanel.scrollIntoView({behavior:'smooth',block:'start'});
  }
  document.getElementById('opBitacoraClose').onclick=()=>{bitPanel.hidden=true;turnoBitacora=null};
  document.getElementById('opBitacoraAdd').onclick=async()=>{
    const c=bitNote.value.trim();
    if(c.length<3){showToast('Escribe la novedad.','bi-exclamation-triangle-fill');return}
    if(!turnoBitacora)return;
    const btn=document.getElementById('opBitacoraAdd');
    await withSubmitLock(btn,async()=>{
      try{
        await VigiaAPI.request(`/turnos-guardia/${turnoBitacora.id}/nota`,{method:'PATCH',body:JSON.stringify({comentario:c})});
        bitNote.value='';
        await cargarBitacora(turnoBitacora);
      }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
    });
  };

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
