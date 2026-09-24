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

  // ---------- CÓDIGO DE REGISTRO POR RESIDENCIAL ----------
  // Antes esto solo se podia ver/cambiar entrando directo a la base de
  // datos (columna residenciales.codigo_registro) -- ni admin ni
  // superadmin tenian forma de verlo ni de cambiarlo desde la app. Es
  // el codigo que un residente escribe al registrarse para confirmar
  // que de verdad vive en esa residencial (ver authController.js). Un
  // campo vacio significa "todavia sin codigo" -- el registro deja
  // pasar sin exigirlo en ese caso.
  function codigoCelda(res){
    return `<span class="op-plantilla-chip" style="display:inline-flex;gap:.35rem;padding:.3rem .5rem"><input type="text" class="form-control" data-codigo-input="${res.id}" value="${escapeHtml(res.codigo_registro||'')}" placeholder="Sin código" maxlength="20" style="width:110px;font:inherit;font-size:.78rem;padding:.3rem .4rem"><button type="button" data-codigo-guardar="${res.id}" title="Guardar código"><i class="bi bi-check-lg"></i></button></span>`;
  }
  function wireCodigoInputs(){
    document.querySelectorAll('[data-codigo-guardar]').forEach(b=>b.onclick=async()=>{
      const id=b.dataset.codigoGuardar;
      const input=document.querySelector(`[data-codigo-input="${id}"]`);
      const valor=input.value.trim().toUpperCase();
      try{
        await VigiaAPI.request(`/residenciales/${id}`,{method:'PATCH',body:JSON.stringify({codigo_registro:valor||null})});
        input.value=valor;
        showToast(valor?'Código actualizado':'Código quitado (registro libre para esa residencial)');
      }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
    });
  }

  // ---------- ELIMINAR RESIDENCIAL PERMANENTEMENTE ----------
  // Distinto del boton "Suspender/Activar" de la tabla (que solo cambia
  // el estado de la SUSCRIPCION, para dejar de cobrarle sin perder
  // nada). Esto borra la residencial y todo lo que contiene, de verdad,
  // sin forma de deshacerlo -- por eso pide escribir el nombre exacto
  // antes de dejar enviar el formulario (ver DELETE
  // /residenciales/:id/permanente en el backend).
  const resDeleteModal=document.getElementById('resDeleteModal');
  const resDeleteForm=document.getElementById('resDeleteForm');
  const resDeleteConfirm=document.getElementById('resDeleteConfirm');
  let residencialAEliminar=null;
  function wireEliminarBotones(){
    document.querySelectorAll('[data-eliminar]').forEach(b=>b.onclick=()=>{
      residencialAEliminar={id:b.dataset.eliminar,nombre:b.dataset.nombre};
      document.getElementById('resDeleteNombre').textContent=residencialAEliminar.nombre;
      resDeleteConfirm.value='';
      resDeleteModal.classList.add('open');
    });
  }
  document.getElementById('resDeleteCancel').onclick=()=>resDeleteModal.classList.remove('open');
  resDeleteForm.onsubmit=async e=>{
    e.preventDefault();
    if(!residencialAEliminar)return;
    if(resDeleteConfirm.value.trim().toLowerCase()!==residencialAEliminar.nombre.trim().toLowerCase()){
      showToast('El nombre no coincide exactamente.','bi-exclamation-triangle-fill');return;
    }
    const btn=document.getElementById('resDeleteSubmit');
    await withSubmitLock(btn,async()=>{
      try{
        const r=await VigiaAPI.request(`/residenciales/${residencialAEliminar.id}/permanente`,{method:'DELETE',body:JSON.stringify({confirmar:resDeleteConfirm.value.trim()})});
        resDeleteModal.classList.remove('open');
        showToast(r.mensaje||'Residencial eliminada');
        residencialAEliminar=null;
        load();
      }catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
    });
  };

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

      document.getElementById('planGrid').innerHTML=plans.map(x=>`<article class="module-card"><i class="bi bi-shield-check"></i><h3>${escapeHtml(x.nombre)}</h3><p>${escapeHtml(x.descripcion||'')}</p><strong style="font-size:1.45rem">${money(x.precio_mensual)}<small>/mes</small></strong><div style="margin-top:.7rem"><span class="badge ${x.incluye_camaras?'ok':'neutral'}">Cámaras ${x.incluye_camaras?'sí':'no'}</span></div></article>`).join('');
      document.getElementById('suPlan').innerHTML=plans.map(x=>`<option value="${x.id}" data-price="${x.precio_mensual}">${escapeHtml(x.nombre)}</option>`).join('');
      document.getElementById('suResidential').innerHTML=residentials.map(x=>`<option value="${x.id}">${escapeHtml(x.nombre)}</option>`).join('');
      if(!idInput || !idInput.value) document.getElementById('suPrice').value=plans[0]&&plans[0].precio_mensual||'';

      const rows=s.data||[];
      const rowsPorId=new Map(rows.map(x=>[String(x.id),x]));
      // La API ya devuelve esto ordenado por fecha_creacion descendente
      // -- la PRIMERA fila que se ve por cada residencial es la mas
      // reciente (mismo criterio que usa el servidor para decidir cual
      // suscripcion es "la vigente" de cada residencial).
      const masRecientePorResidencial=new Map();
      rows.forEach(x=>{
        const id=String(x.residencial_id);
        if(!masRecientePorResidencial.has(id))masRecientePorResidencial.set(id,x);
      });

      // Antes esta tabla solo listaba FILAS DE SUSCRIPCION -- una
      // residencial real, con usuarios y todo, que nunca llego a tener
      // una fila (por ejemplo porque el plan que buscaba el script de
      // siembra no existia todavia en ese momento) simplemente
      // desaparecia de esta pantalla sin ningun aviso, aunque siguiera
      // funcionando con normalidad. Ahora se recorren TODAS las
      // residenciales -- la que no tenga suscripcion sale marcada como
      // "Sin suscripcion" con un boton para crearle la primera, en vez
      // de estar invisible.
      document.getElementById('subscriptionRows').innerHTML=residentials.length?residentials.map(res=>{
        const x=masRecientePorResidencial.get(String(res.id));
        if(!x){
          return `<tr><td>${escapeHtml(res.nombre)}</td><td>${codigoCelda(res)}</td><td colspan="3"><span class="badge neutral">Sin suscripción</span></td><td>—</td><td class="table-actions"><button class="btn btn-solid" data-crear="${res.id}"><i class="bi bi-plus-lg"></i> Crear suscripción</button> <button class="btn btn-danger" data-eliminar="${res.id}" data-nombre="${escapeHtml(res.nombre)}"><i class="bi bi-trash3-fill"></i></button></td></tr>`;
        }
        return `<tr><td>${escapeHtml(res.nombre)}</td><td>${codigoCelda(res)}</td><td>${escapeHtml((pn.get(String(x.plan_id))||{}).nombre||`#${x.plan_id}`)}</td><td><span class="badge ${x.estado==='activa'?'ok':x.estado==='vencida'?'blocked':'pending'}">${escapeHtml(x.estado)}</span></td><td>${escapeHtml(x.ciclo)}</td><td>${escapeHtml(x.proxima_facturacion||'—')}</td><td class="table-actions"><button class="btn btn-ghost" data-edit="${x.id}"><i class="bi bi-pencil-fill"></i> Editar</button> <button class="btn btn-ghost" data-id="${x.id}" data-state="${x.estado==='activa'?'suspendida':'activa'}">${x.estado==='activa'?'Suspender':'Activar'}</button> <button class="btn btn-danger" data-eliminar="${res.id}" data-nombre="${escapeHtml(res.nombre)}"><i class="bi bi-trash3-fill"></i></button></td></tr>`;
      }).join(''):'<tr><td colspan="7">Sin residenciales.</td></tr>';

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
      document.querySelectorAll('#subscriptionRows [data-crear]').forEach(b=>b.onclick=()=>{
        salirModoEdicion();
        document.getElementById('suResidential').value=b.dataset.crear;
        form.scrollIntoView({behavior:'smooth',block:'start'});
      });
      wireCodigoInputs();
      wireEliminarBotones();
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
