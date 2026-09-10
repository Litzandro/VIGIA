(function(){
  const form=document.getElementById('authorizedForm'); if(!form)return;
  let photo='';
  async function imageData(file){if(!file)return'';const src=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file)});const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=src});const max=480,scale=Math.min(1,max/img.width),c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.55)}
  document.getElementById('auPhoto').onchange=async e=>{
    try{
      photo=await imageData(e.target.files[0]);
      showToast('Fotografía lista');
    }catch(err){
      photo='';
      e.target.value='';
      showToast('No se pudo leer esa imagen. Prueba con otra foto.','bi-exclamation-triangle-fill');
    }
  };
  attachDocumentoHNMask(document.getElementById('auDocument'));
  attachSoloLetras(document.getElementById('auName'),180);
  attachMayusculas(document.getElementById('auPlate'));
  // Selects de 15 en 15 minutos con AM/PM (el value real sigue siendo
  // HH:MM en 24h, que es lo que ya entiende el backend).
  document.getElementById('auFrom').innerHTML=buildAmPmTimeOptions();
  document.getElementById('auTo').innerHTML=buildAmPmTimeOptions();
  const typeLabel={bus_escolar:'Bus escolar',familiar:'Familiar',servicio_domestico:'Servicio doméstico',proveedor:'Proveedor',transporte:'Transporte',otro:'Otro'};

  // Antes el formulario pedia SIEMPRE los mismos 5 campos (documento,
  // empresa, placa, foto) sin importar el tipo -- a un familiar le
  // pedia "Empresa" (no tiene una), a un bus escolar no le mencionaba
  // que la foto podia ser la de su licencia, etc. Esta tabla dice, por
  // tipo, que campos tienen sentido pedir; los que no aplican se
  // ocultan y se mandan como null aunque quedara algo escrito ahi antes
  // de cambiar de tipo.
  const CAMPOS_POR_TIPO={
    bus_escolar:{empresa:false,placa:true,fotoLabel:'Foto de la licencia del conductor (opcional)'},
    familiar:{empresa:false,placa:true,fotoLabel:'Fotografía opcional'},
    servicio_domestico:{empresa:true,placa:false,fotoLabel:'Fotografía opcional'},
    proveedor:{empresa:true,placa:true,fotoLabel:'Fotografía opcional'},
    transporte:{empresa:true,placa:true,fotoLabel:'Fotografía opcional'},
    otro:{empresa:true,placa:true,fotoLabel:'Fotografía opcional'},
  };
  const auCompanyWrap=document.getElementById('auCompanyWrap'),auPlateWrap=document.getElementById('auPlateWrap');
  const auCompanyInput=document.getElementById('auCompany'),auPlateInput=document.getElementById('auPlate');
  const auPhotoLabel=document.getElementById('auPhotoLabel');
  function actualizarCamposPorTipo(){
    const cfg=CAMPOS_POR_TIPO[document.getElementById('auType').value]||CAMPOS_POR_TIPO.otro;
    auCompanyWrap.style.display=cfg.empresa?'':'none';
    auPlateWrap.style.display=cfg.placa?'':'none';
    if(!cfg.empresa)auCompanyInput.value='';
    if(!cfg.placa)auPlateInput.value='';
    if(auPhotoLabel)auPhotoLabel.textContent=cfg.fotoLabel;
  }
  document.getElementById('auType').addEventListener('change',actualizarCamposPorTipo);
  actualizarCamposPorTipo();
  const statusLabel={pendiente:'Pendiente de aprobación',activa:'Activa',suspendida:'Suspendida',vencida:'Vencida',cancelada:'Cancelada'};
  const statusBadge={pendiente:'pending',activa:'ok',suspendida:'warn',vencida:'neutral',cancelada:'neutral'};
  async function load(){
    const box=document.getElementById('authorizedList');
    try{
      const r=await VigiaAPI.request('/personas-autorizadas?limit=200&sort=fecha_creacion:desc');
      const rows=r.data||[];
      box.innerHTML=rows.length?'':'<div class="empty-state">Aún no hay personas autorizadas.</div>';
      rows.forEach(x=>{
        const days=Array.isArray(x.dias_semana_json)&&x.dias_semana_json.length?x.dias_semana_json.join(', '):'Todos';
        const cancelable=['pendiente','activa','suspendida'].includes(x.estado);
        const el=document.createElement('div');
        el.className='queue-item';
        el.innerHTML=`<div class="queue-number"><i class="bi bi-person-check-fill"></i></div><div class="queue-copy"><b>${escapeHtml(x.nombre_completo)}</b><span>${typeLabel[x.tipo]||x.tipo} · ${escapeHtml(x.empresa||x.placa_vehiculo||'Sin empresa/placa')}</span><span>${escapeHtml(formatHora12(x.hora_desde)||'12:00 AM')}–${escapeHtml(formatHora12(x.hora_hasta)||'11:59 PM')} · Días: ${escapeHtml(days)}</span></div><div class="queue-actions"><span class="badge ${statusBadge[x.estado]||'neutral'}">${escapeHtml(statusLabel[x.estado]||x.estado)}</span>${cancelable?`<button class="btn btn-ghost" data-id="${x.id}" title="Cancelar autorización"><i class="bi bi-x-lg"></i></button>`:''}</div>`;
        const btn=el.querySelector('button');
        if(btn)btn.onclick=async()=>{
          if(!confirm('¿Cancelar esta autorización? Se guarda el historial, no se borra.'))return;
          try{await VigiaAPI.request(`/personas-autorizadas/${x.id}`,{method:'DELETE'});showToast('Autorización cancelada');load()}
          catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
        };
        box.appendChild(el);
      });
    }catch(e){box.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`}
  }
  form.onsubmit=async e=>{
    e.preventDefault();
    const days=[...document.querySelectorAll('#auDays input:checked')].map(x=>Number(x.value));
    const submitBtn=form.querySelector('button[type="submit"]');
    await withSubmitLock(submitBtn,async()=>{
      try{
        await VigiaAPI.request('/personas-autorizadas',{method:'POST',body:JSON.stringify({
          tipo:document.getElementById('auType').value,
          nombre_completo:document.getElementById('auName').value.trim(),
          numero_documento:document.getElementById('auDocument').value.trim()||null,
          // Se manda null si el campo esta oculto para este tipo, sin
          // importar que haya quedado algo escrito ahi de un tipo
          // anterior -- actualizarCamposPorTipo() ya limpia el input al
          // cambiar, esto es una segunda linea de defensa.
          empresa:(auCompanyWrap.style.display!=='none'?document.getElementById('auCompany').value.trim():'')||null,
          placa_vehiculo:(auPlateWrap.style.display!=='none'?document.getElementById('auPlate').value.trim():'')||null,
          dias_semana_json:days,
          hora_desde:document.getElementById('auFrom').value||null,
          hora_hasta:document.getElementById('auTo').value||null,
          foto_url:photo||null,
        })});
        form.reset();photo='';actualizarCamposPorTipo();
        showToast('Autorización enviada. Administración debe aprobarla antes de que quede activa.');
        load();
      }catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
    },'<i class="bi bi-arrow-repeat"></i> Guardando...');
  };
  document.getElementById('reloadAuthorized').onclick=load;document.getElementById('newAuthorized').onclick=()=>document.getElementById('auName').focus();load();
})();
