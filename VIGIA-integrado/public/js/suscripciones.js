(function(){
  const form=document.getElementById('subscriptionForm');
  if(!form)return;
  let plans=[],residentials=[];
  const money=n=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL'}).format(Number(n||0));
  const idInput=document.getElementById('suId');
  const submitBtn=document.getElementById('suSubmitBtn');
  const cancelEditBtn=document.getElementById('suCancelEditBtn');

  function salirModoEdicion(){
    if(idInput)idInput.value='';
    form.reset();
    document.getElementById('suStart').value=new Date().toISOString().slice(0,10);
    if(submitBtn)submitBtn.textContent='Guardar suscripción';
    if(cancelEditBtn)cancelEditBtn.hidden=true;
  }

  function entrarModoEdicion(row){
    if(idInput)idInput.value=row.id;
    document.getElementById('suResidential').value=row.residencial_id;
    document.getElementById('suPlan').value=row.plan_id;
    document.getElementById('suStart').value=row.fecha_inicio;
    document.getElementById('suCycle').value=row.ciclo;
    document.getElementById('suState').value=row.estado;
    document.getElementById('suPrice').value=row.precio_acordado||'';
    if(submitBtn)submitBtn.textContent='Actualizar suscripción';
    if(cancelEditBtn)cancelEditBtn.hidden=false;
    form.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function load(){
    try{
      const [p,r,s]=await Promise.all([
        VigiaAPI.request('/planes-servicio?limit=100'),
        VigiaAPI.request('/residenciales?limit=200'),
        VigiaAPI.request('/suscripciones?limit=200&sort=fecha_creacion:desc'),
      ]);
      plans=p.data||[];
      residentials=r.data||[];
      const pn=new Map(plans.map(x=>[String(x.id),x]));
      const rn=new Map(residentials.map(x=>[String(x.id),x]));

      document.getElementById('planGrid').innerHTML=plans.map(x=>`<article class="module-card"><i class="bi bi-shield-check"></i><h3>${escapeHtml(x.nombre)}</h3><p>${escapeHtml(x.descripcion||'')}</p><strong style="font-size:1.45rem">${money(x.precio_mensual)}<small>/mes</small></strong><div style="margin-top:.7rem"><span class="badge ${x.incluye_camaras?'ok':'neutral'}">Cámaras ${x.incluye_camaras?'sí':'no'}</span> <span class="badge ${x.incluye_trancas?'ok':'neutral'}">Trancas ${x.incluye_trancas?'sí':'no'}</span></div></article>`).join('');
      document.getElementById('suPlan').innerHTML=plans.map(x=>`<option value="${x.id}" data-price="${x.precio_mensual}">${escapeHtml(x.nombre)}</option>`).join('');
      document.getElementById('suResidential').innerHTML=residentials.map(x=>`<option value="${x.id}">${escapeHtml(x.nombre)}</option>`).join('');
      if(!idInput || !idInput.value) document.getElementById('suPrice').value=plans[0]&&plans[0].precio_mensual||'';

      const rows=s.data||[];
      const rowsPorId=new Map(rows.map(x=>[String(x.id),x]));
      document.getElementById('subscriptionRows').innerHTML=rows.length?rows.map(x=>`<tr><td>${escapeHtml((rn.get(String(x.residencial_id))||{}).nombre||`#${x.residencial_id}`)}</td><td>${escapeHtml((pn.get(String(x.plan_id))||{}).nombre||`#${x.plan_id}`)}</td><td><span class="badge ${x.estado==='activa'?'ok':x.estado==='vencida'?'blocked':'pending'}">${escapeHtml(x.estado)}</span></td><td>${escapeHtml(x.ciclo)}</td><td>${escapeHtml(x.proxima_facturacion||'—')}</td><td class="table-actions"><button class="btn btn-ghost" data-edit="${x.id}"><i class="bi bi-pencil-fill"></i> Editar</button> <button class="btn btn-ghost" data-id="${x.id}" data-state="${x.estado==='activa'?'suspendida':'activa'}">${x.estado==='activa'?'Suspender':'Activar'}</button></td></tr>`).join(''):'<tr><td colspan="6">Sin suscripciones.</td></tr>';

      document.querySelectorAll('#subscriptionRows [data-id]').forEach(b=>b.onclick=async()=>{
        try{
          await VigiaAPI.request(`/suscripciones/${b.dataset.id}`,{method:'PATCH',body:JSON.stringify({estado:b.dataset.state})});
          showToast('Suscripción actualizada');
          load();
        }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
      });
      document.querySelectorAll('#subscriptionRows [data-edit]').forEach(b=>b.onclick=()=>{
        const row=rowsPorId.get(String(b.dataset.edit));
        if(row)entrarModoEdicion(row);
      });
    }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
  }

  document.getElementById('suPlan').onchange=e=>{
    document.getElementById('suPrice').value=e.target.selectedOptions[0].dataset.price||'';
  };

  form.onsubmit=async e=>{
    e.preventDefault();
    const start=document.getElementById('suStart').value;
    const body={
      residencial_id:Number(document.getElementById('suResidential').value),
      plan_id:Number(document.getElementById('suPlan').value),
      estado:document.getElementById('suState').value,
      fecha_inicio:start,
      ciclo:document.getElementById('suCycle').value,
      precio_acordado:Number(document.getElementById('suPrice').value)||null,
      // proxima_facturacion NO se manda -- el servidor la calcula sola a
      // partir del ciclo, para que nunca quede desincronizada de lo que
      // de verdad se guardo (pedido explicito: evitar sobreescrituras).
    };
    const editandoId=idInput&&idInput.value;
    try{
      if(editandoId){
        await VigiaAPI.request(`/suscripciones/${editandoId}`,{method:'PATCH',body:JSON.stringify(body)});
        showToast('Suscripción actualizada');
      }else{
        await VigiaAPI.request('/suscripciones',{method:'POST',body:JSON.stringify(body)});
        showToast('Suscripción guardada');
      }
      salirModoEdicion();
      load();
    }catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
  };

  if(cancelEditBtn)cancelEditBtn.onclick=salirModoEdicion;
  document.getElementById('reloadSubs').onclick=load;
  document.getElementById('newSubscription').onclick=()=>{ salirModoEdicion(); document.getElementById('suResidential').focus(); };
  document.getElementById('suStart').value=new Date().toISOString().slice(0,10);
  load();
})();
