(function(){
  const form=document.getElementById('vetoForm');if(!form)return;
  const reason=document.getElementById('veReason');
  const counter=document.getElementById('veCounter');
  const photoInput=document.getElementById('veEvidence');
  let evidence='';

  reason.addEventListener('input',()=>{counter.textContent=`${reason.value.length}/255`});
  photoInput.onchange=async e=>{
    try{
      const file=e.target.files[0];
      if(!file){evidence='';return}
      const reader=new FileReader();
      evidence=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
      showToast('Evidencia lista');
    }catch(err){evidence='';e.target.value='';showToast('No se pudo leer esa imagen. Prueba con otra foto.','bi-exclamation-triangle-fill')}
  };

  attachDocumentoHNMask(document.getElementById('veDocument'));
  attachTelefonoHNMask(document.getElementById('vePhone'));
  attachPhoneCountryCode(document.getElementById('vePhone'));
  attachSoloLetras(document.getElementById('veName'),180);

  function icon(className){const i=document.createElement('i');i.className=`bi ${className}`;i.setAttribute('aria-hidden','true');return i}
  function emptyState(text){const el=document.createElement('div');el.className='empty-state';el.textContent=text;return el}
  function statusBadge(estado){const el=document.createElement('span');el.className=`badge ${estado==='activo'?'blocked':estado==='pendiente'?'pending':'neutral'}`;el.textContent=estado||'';return el}

  async function load(){
    const box=document.getElementById('vetoList');box.replaceChildren();
    try{
      const r=await VigiaAPI.request('/vetos-acceso');const rows=r.data||[];
      if(!rows.length){box.appendChild(emptyState('No hay solicitudes.'));return}
      rows.forEach(x=>{
        const el=document.createElement('div');el.className='queue-item';
        const number=document.createElement('div');number.className='queue-number';number.appendChild(icon('bi-shield-x'));
        const copy=document.createElement('div');copy.className='queue-copy';
        const name=document.createElement('b');name.textContent=x.nombre_persona||'';
        const meta=document.createElement('span');meta.textContent=`${x.numero_documento||'Sin documento'} · ${x.alcance||''}`;
        const motivo=document.createElement('span');motivo.textContent=x.motivo||'';
        copy.append(name,meta,motivo);
        const actions=document.createElement('div');actions.className='queue-actions';actions.appendChild(statusBadge(x.estado));
        el.append(number,copy,actions);box.appendChild(el);
      });
    }catch(e){box.replaceChildren(emptyState(e.message))}
  }

  form.onsubmit=async e=>{
    e.preventDefault();const submitBtn=form.querySelector('button[type="submit"]');
    await withSubmitLock(submitBtn,async()=>{
      try{
        await VigiaAPI.request('/vetos-acceso',{method:'POST',body:JSON.stringify({
          nombre_persona:document.getElementById('veName').value.trim(),
          numero_documento:document.getElementById('veDocument').value.trim()||null,
          telefono:document.getElementById('vePhone').value.trim()||null,
          motivo:reason.value.trim(),evidencia_url:evidence||null
        })});
        form.reset();evidence='';counter.textContent='0/255';showToast('Solicitud enviada a administración');await load();
      }catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
    },'<i class="bi bi-arrow-repeat"></i> Enviando...');
  };
  document.getElementById('reloadVetos').onclick=load;load();
})();
