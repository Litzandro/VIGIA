(function(){
  const form=document.getElementById('shiftForm');if(!form)return;
  const session=VigiaAPI.getSession();
  const canManage=['admin','superadmin'].includes(session.rol_codigo);
  const isSuper=session.rol_codigo==='superadmin';
  const residentialGroup=document.getElementById('opResidentialGroup');
  if(!isSuper)residentialGroup.style.display='none';
  if(!canManage){form.closest('.panel').style.display='none';document.getElementById('opPlantillasPanel').style.display='none'}
  let allShifts=[],guards=[],users=[],points=[],configs=[],residentials=[],plantillas=[];

  // Antes habia que escribir/elegir a mano CADA fecha y hora, las dos --
  // "Inicio" arrancaba vacio (el navegador mostraba el placeholder
  // "aaaa-mm-ddT-:-" ) y "Fin" habia que calcularlo uno mismo sumando
  // las horas del turno. Ahora "Inicio" arranca en el momento actual
  // (redondeado a los 5 min mas cercanos) y los botones de duracion
  // calculan "Fin" solos a partir de "Inicio" -- lo unico que hay que
  // tocar a mano sigue siendo posible (los campos no quedan bloqueados),
  // pero ya no es obligatorio.
  function aValorLocal(d){
    const pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function ahoraRedondeado(){
    const d=new Date();d.setSeconds(0,0);
    d.setMinutes(Math.ceil(d.getMinutes()/5)*5);
    return d;
  }
  function prellenarInicio(){
    const startEl=document.getElementById('opStart');
    if(!startEl.value)startEl.value=aValorLocal(ahoraRedondeado());
  }
  document.getElementById('opDurationRow').addEventListener('click',e=>{
    const btn=e.target.closest('[data-hours]');if(!btn)return;
    prellenarInicio();
    const startEl=document.getElementById('opStart'),endEl=document.getElementById('opEnd');
    const inicio=new Date(startEl.value);
    if(Number.isNaN(inicio.getTime()))return;
    endEl.value=aValorLocal(new Date(inicio.getTime()+Number(btn.dataset.hours)*3600000));
    document.querySelectorAll('#opDurationRow [data-hours]').forEach(b=>b.classList.toggle('active',b===btn));
  });
  // Elegir la hora de fin a mano (en vez de con un boton de duracion) ya
  // no tiene por que coincidir con ningun preset -- se quita el
  // resaltado para no mostrar una duracion que ya no es la real.
  document.getElementById('opEnd').addEventListener('input',()=>{
    document.querySelectorAll('#opDurationRow [data-hours]').forEach(b=>b.classList.remove('active'));
  });
  prellenarInicio();

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
    if(canManage)renderPlantillas();
    if(isSuper&&rid){VigiaAPI.request(`/cola-acceso/metricas?residencial_id=${rid}`).then(r=>{const m=r.data||{};document.getElementById('waitingQueue').textContent=m.esperando||0;document.getElementById('avgAccess').textContent=`${m.tiempo_promedio_seg||0} s`}).catch(()=>{})}
  }

  // Antes "Relevar" abria DOS prompt() nativos del navegador seguidos --
  // una caja gris generica y fuera de lugar (no se parece en nada al
  // resto de la app), que ademas pedia escribir a mano el ID numerico
  // del guardia de relevo (nadie se sabe el ID de memoria). Ahora abre
  // un modal propio de VIGIA con un selector real (mismos guardias ya
  // cargados para el formulario de arriba, filtrados por residencial) y
  // un campo de texto para el motivo.
  const relevoModal=document.getElementById('opRelevoModal'),relevoForm=document.getElementById('opRelevoForm'),relevoGuardSelect=document.getElementById('opRelevoGuard');
  function abrirModalRelevo(){
    relevoGuardSelect.innerHTML=document.getElementById('opRelief').innerHTML.replace('Sin relevo','Selecciona un guardia');
    document.getElementById('opRelevoMotivo').value='';
    relevoModal.classList.add('open');
    return new Promise(resolve=>{
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;relevoModal.classList.remove('open');resolve(value)};
      relevoForm.onsubmit=e=>{
        e.preventDefault();
        const guardiaId=relevoGuardSelect.value;
        if(!guardiaId){showToast('Selecciona quién toma el relevo.','bi-exclamation-triangle-fill');return}
        finish({guardia_relevo_id:Number(guardiaId),motivo:document.getElementById('opRelevoMotivo').value.trim()||'Relevo de jornada'});
      };
      document.getElementById('opRelevoCancel').onclick=()=>finish(null);
    });
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
      // Hora real (cuando el guardia de verdad pulso "Iniciar"/"Finalizar")
      // se muestra junto a la programada solo cuando existe y difiere --
      // antes esa informacion (que ya vive en el backend, inicio_real/
      // fin_real) no se mostraba en ningun lado de esta pantalla.
      const realInicio=x.inicio_real?new Date(x.inicio_real).toLocaleString('es-HN',fmt12h):null;
      const realFin=x.fin_real?new Date(x.fin_real).toLocaleString('es-HN',fmt12h):null;
      const estadoBadge=x.estado==='activo'?'ok':x.estado==='programado'?'pending':x.estado==='ausente'?'alert':'neutral';
      const extras=[
        x.plantilla_nombre?`<span class="badge info"><i class="bi bi-arrow-repeat"></i> ${escapeHtml(x.plantilla_nombre)}</span>`:'',
        x.llego_tarde?'<span class="badge alert">Llegó tarde</span>':'',
      ].filter(Boolean).join('');
      el.innerHTML=`<div class="queue-number"><i class="bi bi-clock-history"></i></div><div class="queue-copy"><b>${escapeHtml(x.guardia_original_nombre||`Guardia #${x.guardia_original_id}`)}</b><span>${new Date(x.inicio_programado).toLocaleString('es-HN',fmt12h)} — ${new Date(x.fin_programado).toLocaleString('es-HN',fmt12h)}</span>${(realInicio||realFin)?`<span>Real: ${realInicio||'—'} — ${realFin||'—'}</span>`:''}${x.guardia_relevo_nombre?`<span>Relevo: ${escapeHtml(x.guardia_relevo_nombre)}</span>`:''}<span>${escapeHtml(x.observaciones||'Sin observaciones')}</span></div><div class="queue-actions" style="grid-column:1 / -1;justify-content:flex-start;margin-top:.6rem;flex-wrap:wrap;"><span class="badge ${estadoBadge}">${escapeHtml(x.estado)}</span>${extras}${x.estado==='programado'?'<button class="btn btn-solid" data-a="iniciar">Iniciar</button>':''}${x.estado==='ausente'&&canManage?'<button class="btn btn-caution" data-a="relevar">Relevar</button>':''}${canManage&&['programado','activo'].includes(x.estado)?'<button class="btn btn-caution" data-a="relevar">Relevar</button>':''}${['activo','relevado'].includes(x.estado)?'<button class="btn btn-danger" data-a="finalizar">Finalizar</button>':''}${x.estado!=='programado'?`<button class="btn btn-ghost" data-bitacora="1"><i class="bi bi-journal-text"></i> Bitácora</button>`:''}</div>`;
      const bitBtn=el.querySelector('[data-bitacora]');
      if(bitBtn)bitBtn.onclick=()=>abrirBitacora(x);
      el.querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{
        const body={accion:b.dataset.a};
        if(b.dataset.a==='relevar'){
          const datos=await abrirModalRelevo();if(!datos)return;
          body.guardia_relevo_id=datos.guardia_relevo_id;body.observaciones=datos.motivo;
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

  // ---------- PLANTILLAS DE TURNO ----------
  // Antes cada jornada era una fila 100% manual: para un turno que se
  // repite todos los dias (o que rota entre varios guardias) habia que
  // volver a elegir guardia/horario desde cero cada vez. Una plantilla
  // guarda ese patron una sola vez; el servidor genera los turnos reales
  // solo (ver sincronizarTurnosDesdePlantillas() en el backend) la
  // proxima vez que se carga esta pantalla.
  const plModal=document.getElementById('opPlantillaModal');
  const plForm=document.getElementById('opPlantillaForm');
  const plGuardList=document.getElementById('opPlGuardList');
  const plGuardAdd=document.getElementById('opPlGuardAdd');
  let plDiasSel=new Set();
  let plRotacion=[]; // [{id, nombre}] en orden
  let plEditandoId=null;

  function renderDiasBotones(){
    document.querySelectorAll('#opPlDias [data-dia]').forEach(b=>b.classList.toggle('active',plDiasSel.has(Number(b.dataset.dia))));
  }
  document.getElementById('opPlDias').addEventListener('click',e=>{
    const b=e.target.closest('[data-dia]');if(!b)return;
    const dia=Number(b.dataset.dia);
    if(plDiasSel.has(dia))plDiasSel.delete(dia);else plDiasSel.add(dia);
    renderDiasBotones();
  });

  function renderRotacion(){
    plGuardList.innerHTML=plRotacion.length?'':'<div class="empty-state">Agrega al menos un guardia.</div>';
    plRotacion.forEach((g,i)=>{
      const row=document.createElement('div');row.className='op-plantilla-chip';
      row.innerHTML=`<span class="op-pl-orden">${i+1}</span><span class="op-pl-nombre">${escapeHtml(g.nombre)}</span>${i>0?'<button type="button" class="op-pl-move" data-up="1" title="Subir"><i class="bi bi-arrow-up"></i></button>':''}${i<plRotacion.length-1?'<button type="button" class="op-pl-move" data-down="1" title="Bajar"><i class="bi bi-arrow-down"></i></button>':''}<button type="button" data-quitar="1" title="Quitar"><i class="bi bi-x-lg"></i></button>`;
      row.querySelector('[data-quitar]').onclick=()=>{plRotacion.splice(i,1);renderRotacion()};
      const up=row.querySelector('[data-up]');if(up)up.onclick=()=>{[plRotacion[i-1],plRotacion[i]]=[plRotacion[i],plRotacion[i-1]];renderRotacion()};
      const down=row.querySelector('[data-down]');if(down)down.onclick=()=>{[plRotacion[i+1],plRotacion[i]]=[plRotacion[i],plRotacion[i+1]];renderRotacion()};
      plGuardList.appendChild(row);
    });
  }
  document.getElementById('opPlGuardAddBtn').onclick=()=>{
    const id=Number(plGuardAdd.value);if(!id)return;
    if(plRotacion.some(g=>g.id===id))return;
    const nombre=plGuardAdd.options[plGuardAdd.selectedIndex].textContent;
    plRotacion.push({id,nombre});
    renderRotacion();
  };

  function abrirPlantillaModal(plantilla){
    plEditandoId=plantilla?plantilla.id:null;
    document.getElementById('opPlantillaModalTitle').textContent=plantilla?'Editar plantilla de turno':'Nueva plantilla de turno';
    const userMap=new Map(users.map(u=>[String(u.id),`${u.nombre} ${u.apellido}`]));
    const rid=selectedResidential();
    const currentGuards=guards.filter(g=>!rid||Number(g.residencial_id)===rid);
    plGuardAdd.innerHTML=currentGuards.map(g=>`<option value="${g.usuario_id}">${escapeHtml(userMap.get(String(g.usuario_id))||`Guardia #${g.usuario_id}`)}</option>`).join('')||'<option value="">Sin guardias</option>';
    document.getElementById('opPlPoint').innerHTML='<option value="">Sin punto de acceso</option>'+points.filter(p=>!rid||Number(p.residencial_id)===rid).map(p=>`<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
    if(plantilla){
      document.getElementById('opPlNombre').value=plantilla.nombre;
      document.getElementById('opPlPoint').value=plantilla.punto_acceso_id||'';
      document.getElementById('opPlStart').value=String(plantilla.hora_inicio||'').slice(0,5);
      document.getElementById('opPlEnd').value=String(plantilla.hora_fin||'').slice(0,5);
      plDiasSel=new Set(plantilla.dias_semana_lista||[]);
      plRotacion=(plantilla.guardias||[]).map(g=>({id:g.id,nombre:g.nombre}));
    }else{
      plForm.reset();
      plDiasSel=new Set();
      plRotacion=[];
    }
    renderDiasBotones();renderRotacion();
    plModal.classList.add('open');
  }
  document.getElementById('opPlantillaNew').onclick=()=>abrirPlantillaModal(null);
  document.getElementById('opPlCancel').onclick=()=>plModal.classList.remove('open');

  plForm.onsubmit=async e=>{
    e.preventDefault();
    if(!plDiasSel.size){showToast('Selecciona al menos un día de la semana.','bi-exclamation-triangle-fill');return}
    if(!plRotacion.length){showToast('Agrega al menos un guardia a la rotación.','bi-exclamation-triangle-fill');return}
    const payload={
      nombre:document.getElementById('opPlNombre').value.trim(),
      punto_acceso_id:Number(document.getElementById('opPlPoint').value)||null,
      hora_inicio:document.getElementById('opPlStart').value,
      hora_fin:document.getElementById('opPlEnd').value,
      dias_semana:[...plDiasSel],
      guardia_ids:plRotacion.map(g=>g.id),
    };
    if(isSuper)payload.residencial_id=selectedResidential();
    const btn=document.getElementById('opPlSubmit');
    await withSubmitLock(btn,async()=>{
      try{
        if(plEditandoId)await VigiaAPI.request(`/plantillas-turno/${plEditandoId}`,{method:'PATCH',body:JSON.stringify(payload)});
        else await VigiaAPI.request('/plantillas-turno',{method:'POST',body:JSON.stringify(payload)});
        plModal.classList.remove('open');
        showToast(plEditandoId?'Plantilla actualizada':'Plantilla creada');
        await load();
      }catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
    });
  };

  const DIA_LABEL={0:'Dom',1:'Lun',2:'Mar',3:'Mié',4:'Jue',5:'Vie',6:'Sáb'};
  function renderPlantillas(){
    const rid=selectedResidential();
    const rows=plantillas.filter(x=>!rid||Number(x.residencial_id)===rid);
    const box=document.getElementById('opPlantillasList');
    box.innerHTML=rows.length?'':'<div class="empty-state">Todavía no hay plantillas de turno.</div>';
    rows.forEach(x=>{
      const el=document.createElement('div');el.className='queue-item';el.style.gridTemplateColumns='auto 1fr';
      const dias=(x.dias_semana_lista||[]).map(d=>DIA_LABEL[d]).join(', ');
      const nombresGuardias=(x.guardias||[]).map(g=>g.nombre).join(' → ');
      el.innerHTML=`<div class="queue-number"><i class="bi bi-arrow-repeat"></i></div><div class="queue-copy"><b>${escapeHtml(x.nombre)}</b><span>${escapeHtml(x.hora_inicio||'').slice(0,5)} — ${escapeHtml(x.hora_fin||'').slice(0,5)} · ${escapeHtml(dias)}</span><span>${escapeHtml(nombresGuardias||'Sin guardias')}</span></div><div class="queue-actions" style="grid-column:1 / -1;justify-content:flex-start;margin-top:.6rem;flex-wrap:wrap;"><span class="badge ${x.activa?'ok':'neutral'}">${x.activa?'Activa':'Pausada'}</span><button class="btn btn-ghost" data-pl-editar="1">Editar</button><button class="btn btn-caution" data-pl-pausar="1">${x.activa?'Pausar':'Reactivar'}</button><button class="btn btn-danger" data-pl-borrar="1">Eliminar</button></div>`;
      el.querySelector('[data-pl-editar]').onclick=()=>abrirPlantillaModal(x);
      el.querySelector('[data-pl-pausar]').onclick=async()=>{
        try{await VigiaAPI.request(`/plantillas-turno/${x.id}`,{method:'PATCH',body:JSON.stringify({activa:!x.activa})});showToast(x.activa?'Plantilla pausada':'Plantilla reactivada');await load()}
        catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
      };
      el.querySelector('[data-pl-borrar]').onclick=async()=>{
        if(!confirm(`¿Eliminar la plantilla "${x.nombre}"? Los turnos que ya generó se conservan en el historial.`))return;
        try{await VigiaAPI.request(`/plantillas-turno/${x.id}`,{method:'DELETE'});showToast('Plantilla eliminada');await load()}
        catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
      };
      box.appendChild(el);
    });
  }

  async function load(){
    try{
      const requests=[VigiaAPI.request('/turnos-guardia?limit=200'),isSuper?Promise.resolve({data:{}}):VigiaAPI.request('/cola-acceso/metricas'),VigiaAPI.request('/configuraciones-residencial?limit=300')];
      if(canManage)requests.push(VigiaAPI.request('/guardias?limit=500'),VigiaAPI.request('/usuarios?limit=500'),VigiaAPI.request('/puntos-acceso?limit=300'),VigiaAPI.request('/plantillas-turno?limit=200'));
      if(isSuper)requests.push(VigiaAPI.request('/residenciales?limit=300'));
      const all=await Promise.all(requests);allShifts=all[0].data||[];const metrics=all[1].data||{};configs=all[2].data||[];
      document.getElementById('waitingQueue').textContent=metrics.esperando||0;document.getElementById('avgAccess').textContent=`${metrics.tiempo_promedio_seg||0} s`;
      if(canManage){guards=all[3].data||[];users=all[4].data||[];points=all[5].data||[];plantillas=all[6].data||[]}
      if(isSuper){residentials=all[7].data||[];const select=document.getElementById('opResidential');const previous=select.value;select.innerHTML=residentials.map(x=>`<option value="${x.id}">${escapeHtml(x.nombre)}</option>`).join('');if(previous)select.value=previous;select.onchange=refreshSelectors}
      refreshSelectors();
    }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
  }

  
  form.onsubmit=async e=>{e.preventDefault();const payload={guardia_original_id:Number(document.getElementById('opGuard').value),guardia_relevo_id:Number(document.getElementById('opRelief').value)||null,punto_acceso_id:Number(document.getElementById('opPoint').value)||null,inicio_programado:document.getElementById('opStart').value,fin_programado:document.getElementById('opEnd').value,observaciones:document.getElementById('opNotes').value.trim()||null};if(isSuper)payload.residencial_id=selectedResidential();try{await VigiaAPI.request('/turnos-guardia',{method:'POST',body:JSON.stringify(payload)});form.reset();document.querySelectorAll('#opDurationRow [data-hours]').forEach(b=>b.classList.remove('active'));prellenarInicio();showToast('Turno programado');await load()}catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}};
  document.getElementById('reloadOps').onclick=load;load();
})();
