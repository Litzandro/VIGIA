// El personal (guardia/admin/superadmin) gestiona las incidencias en su propia
// pantalla (incidencias-gestion.html). Esta es la vista del RESIDENTE: "Mis
// incidencias", con los botones de panico. Se conserva el query string para
// que los enlaces viejos (?inc=ID de notificaciones, ?desde_comunidad=...
// de Comunidad) sigan funcionando.
(function(){
  const s=(typeof VigiaAPI!=='undefined'&&VigiaAPI.getSession())||null;
  if(s&&['guardia','admin','superadmin'].includes(s.rol_codigo)){
    location.replace('incidencias-gestion.html'+location.search);
  }
})();
(function(){
  const modal=document.getElementById('reportModal'),form=document.getElementById('reportForm'),kanban=document.querySelector('.kanban');if(!modal||!form||!kanban)return;
  const desc=document.getElementById('reportDesc'),count=document.getElementById('reportDescCount'),tipoSelect=document.getElementById('reportTipo'),priorityInfo=document.getElementById('reportPriorityInfo');let photoData='',types=[];
  const ubicacionInput=document.getElementById('reportUbicacion'),fechaHechoInput=document.getElementById('reportFechaHecho');

  // Antes esto se llamaba "Asistente de IA" y decidia sola la prioridad
  // (que el usuario podia cambiar libremente en un select aparte) --
  // ademas sugeria categorias ("Emergencia medica", "Dano a propiedad"...)
  // que nunca coincidian con ningun tipo real del catalogo
  // (tipos_incidencia solo tiene Robo/Incendio/Medico/Accidente/
  // Sospechoso/Otro), asi que en la practica CUALQUIER incidencia
  // terminaba cayendo en "Otro" sin que nadie lo notara. Ahora es una
  // sugerencia honesta (no es IA, es una coincidencia de palabras clave
  // local) que solo preselecciona el tipo real en el <select> -- el tipo
  // siempre es visible y editable por la persona. La prioridad ya NO se
  // elige aca: la calcula el backend segun el tipo (ver
  // src/routes/overrides/incidencias.js), precisamente para que nadie
  // pueda marcar su propio reporte como "urgente" sin que corresponda.
  const NIVEL_A_PRIORIDAD_LABEL={critico:'Urgente',alto:'Alta',medio:'Media',bajo:'Baja'};
  function sugerirTipo(texto){
    const t=texto.toLowerCase();
    if(/robo|ladr[oó]n|robaron|hurto|forzaron/.test(t))return'Robo';
    // Fuga u olor a gas es riesgo de incendio/explosion, no un dano
    // cualquiera -- se trata igual que fuego/humo (mismo nivel critico).
    if(/fuego|humo|incendio|quemando|quemad|explosi[oó]n|huele a gas|olor a gas|fuga de gas/.test(t))return'Incendio';
    if(/médic|medic|desmay|convulsi[oó]n|infarto|sangr|ambulancia/.test(t))return'Médico';
    if(/accidente|choque|ca[ií]da|golpe|atropell/.test(t))return'Accidente';
    if(/sospech|extra[ñn]o|merode|ronda/.test(t))return'Sospechoso';
    // Antes ninguna palabra de dano/mantenimiento (fuga de agua, gotera,
    // inundacion, corto circuito, apagon, tuberia rota, etc.) coincidia
    // con nada, asi que el selector se quedaba mudo -- ni siquiera caia
    // en "Otro" -- y se veia como si la sugerencia nunca hubiera leido
    // la descripcion. Como el catalogo no tiene una categoria de "dano a
    // la propiedad", esto se declara explicitamente como "Otro" en vez
    // de dejarlo sin sugerir nada.
    if(/fuga|gotera|inundaci[oó]n|derrame|corto\s*circuito|apag[oó]n|aver[ií]a|da[ñn]o|rotura|quebr[oó]|tuber[ií]a|filtraci[oó]n|ruido|escandal|mascota|animal suelto|basura|obstru/.test(t))return'Otro';
    return null;
  }
  function actualizarPrioridadInfo(){
    const tipo=types.find(x=>String(x.id)===String(tipoSelect.value));
    const label=tipo?(NIVEL_A_PRIORIDAD_LABEL[tipo.nivel_urgencia]||'Media'):'—';
    priorityInfo.textContent=`Se calcula según el tipo elegido — con "${tipo?tipo.nombre:'…'}" quedará en prioridad ${label.toLowerCase()}.`;
  }
  function poblarTipos(){
    if(!tipoSelect||!types.length)return;
    const actual=tipoSelect.value;
    tipoSelect.innerHTML=types.map(t=>`<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
    if(actual&&types.some(t=>String(t.id)===actual)){
      tipoSelect.value=actual;
    }else{
      // Antes, al abrir el formulario en blanco, quedaba preseleccionado
      // lo que fuera el primer tipo del catalogo ("Robo" por orden de
      // creacion) sin que nadie lo hubiera elegido -- si alguien
      // describia algo que la sugerencia no reconocia (ej. "fuga de
      // agua"), el reporte se quedaba marcado como Robo sin que se
      // notara. "Otro" es un punto de partida neutral y honesto.
      const otro=types.find(t=>t.nombre==='Otro');
      if(otro)tipoSelect.value=otro.id;
    }
    actualizarPrioridadInfo();
  }
  if(tipoSelect)tipoSelect.addEventListener('change',actualizarPrioridadInfo);
  function open(){
    modal.classList.add('open');poblarTipos();document.getElementById('reportTitle').focus();
    // El hecho ya paso -- no tendria sentido dejar elegir una fecha/hora
    // futura (ej. reportar algo que "va a pasar" manana). Se limita al
    // momento actual del dispositivo, con margen de un minuto para no
    // pelear con el reloj mientras la persona llena el formulario.
    if(fechaHechoInput){
      const ahora=new Date(Date.now()+60000);
      ahora.setSeconds(0,0);
      fechaHechoInput.max=ahora.toISOString().slice(0,16);
    }
  }
  function close(){modal.classList.remove('open')}
  document.querySelectorAll('[data-open-report]').forEach(x=>x.onclick=open);document.getElementById('reportCancel').onclick=close;
  desc.addEventListener('keydown',e=>{if(e.key==='Enter'&&(desc.value.match(/\n/g)||[]).length>=3)e.preventDefault()});
  desc.addEventListener('input',()=>{
    desc.value=desc.value.replace(/\n{3,}/g,'\n\n');count.textContent=`${desc.value.length}/350`;
    const sugerido=sugerirTipo(desc.value);
    if(sugerido&&tipoSelect){
      const match=types.find(t=>t.nombre===sugerido);
      if(match){
        tipoSelect.value=match.id;
        actualizarPrioridadInfo();
        document.getElementById('aiAssistText').textContent=`Coincide con "${sugerido}" según tu descripción — cámbialo arriba si no es correcto.`;
      }
    }else if(desc.value.trim().length>=8){
      // Antes, si la descripcion no coincidia con ninguna palabra clave,
      // el mensaje se quedaba pegado en la ultima sugerencia (o en el
      // texto generico inicial) sin avisar que esta vez no encontro
      // nada -- daba la impresion de que seguia "pensando" en algo que
      // ya no aplicaba. Esto lo deja explicito.
      document.getElementById('aiAssistText').textContent='No encontramos una coincidencia clara con tu descripción — revisa el tipo elegido arriba y cámbialo si no corresponde.';
    }
  });
  async function compress(file){if(!file)return'';const src=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file)});const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=src});const c=document.createElement('canvas'),s=Math.min(1,520/img.width);c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.55)}
  document.getElementById('reportPhoto').onchange=async e=>{
    try{
      photoData=await compress(e.target.files[0]);
      const im=document.getElementById('reportPhotoPreview');
      im.src=photoData;
      document.getElementById('reportPhotoPreviewWrap').style.display=photoData?'block':'none';
    }catch(err){
      photoData='';
      e.target.value='';
      document.getElementById('reportPhotoPreviewWrap').style.display='none';
      showToast('No se pudo leer esa imagen. Prueba con otra foto.','bi-exclamation-triangle-fill');
    }
  };
  const photoRemove=document.getElementById('reportPhotoRemove');
  if(photoRemove)photoRemove.onclick=()=>{
    photoData='';
    const file=document.getElementById('reportPhoto');
    const preview=document.getElementById('reportPhotoPreview');
    if(file)file.value='';
    if(preview)preview.removeAttribute('src');
    document.getElementById('reportPhotoPreviewWrap').style.display='none';
  };
  const stateLabel={reportada:'Abierta',en_revision:'En progreso',resuelta:'Resuelta',cerrada:'Historial'};
  // Antes la tarjeta mostraba la VISIBILIDAD ("comunidad"/"privada")
  // en el lugar donde deberia ir el autor -- se veia como si esa
  // palabra fuera el nombre de quien reporto. Ahora usa el nombre real
  // que ya viaja incluido desde el backend (reportadoPor).
  function nombreAutor(x){
    const u=x.reportadoPor;
    if(!u)return'Vecino';
    const nombre=`${u.nombre||''} ${u.apellido||''}`.trim();
    return nombre||'Vecino';
  }
  function iniciales(nombre){
    const partes=nombre.trim().split(/\s+/);
    return ((partes[0]||'')[0]||'V').toUpperCase()+((partes[1]||'')[0]||'').toUpperCase();
  }
  // El icono de bandera antes solo distinguia 2 colores (ambar para
  // urgente/alta, verde para el resto) mientras que la etiqueta de
  // texto junto a el ya distinguia 3 (rojo/ambar/verde) -- terminaban
  // sin coincidir entre si en la misma tarjeta. Ahora usan el mismo
  // mapeo: urgente y alta en rojo, media en ambar, baja en verde.
  const ICONO_POR_PRIORIDAD={urgente:'alert',alta:'alert',media:'warn',baja:'ok'};
  function card(x){
    const tipoNombre=(x.tipoIncidencia&&x.tipoIncidencia.nombre)||'Sin tipo';
    const autor=nombreAutor(x);
    const claseIcono=ICONO_POR_PRIORIDAD[x.prioridad]||'ok';
    return `<article class="kcard" data-priority="${escapeHtml(x.prioridad)}" data-id="${x.id}" style="cursor:pointer;" title="Ver detalle"><div class="kcard-top"><span class="kcard-icon ${claseIcono}"><i class="bi bi-flag-fill"></i></span><span class="priority ${escapeHtml(x.prioridad)}">Prioridad ${escapeHtml(x.prioridad)}</span><span class="badge neutral" style="margin-left:.4rem;">${escapeHtml(tipoNombre)}</span></div><h4>${escapeHtml(x.titulo)}</h4><p>${escapeHtml(x.descripcion)}</p><div class="kcard-footer"><div class="kcard-assignee"><span class="mini-av">${escapeHtml(iniciales(autor))}</span> ${escapeHtml(autor)}</div><span class="kcard-updated mono">#INC-${String(x.id).padStart(4,'0')} · ${new Date(x.fecha_hora).toLocaleDateString('es-HN')}</span></div></article>`;
  }

  // Antes no habia NINGUNA forma de ver la evidencia (foto) que se
  // adjuntaba al reportar -- se guardaba bien en el servidor, pero la
  // tarjeta del kanban solo mostraba titulo/descripcion/prioridad. Este
  // modal de detalle llama al mismo GET /incidencias/:id que ya
  // regresaba "evidencias" (ver src/routes/overrides/incidencias.js)
  // pero que nadie en el frontend usaba.
  const detailModal=document.getElementById('detailModal');
  async function verDetalle(id){
    if(!detailModal)return;
    try{
      const r=await VigiaAPI.request(`/incidencias/${id}`);
      const inc=r.data||{};
      document.getElementById('detailTitulo').textContent=inc.titulo||'Incidencia';
      const tipoNombre=(inc.tipoIncidencia&&inc.tipoIncidencia.nombre)||'Sin tipo';
      const fechaHecho=inc.fecha_hora_hecho?new Date(inc.fecha_hora_hecho).toLocaleString('es-HN',{hour12:true}):null;
      document.getElementById('detailMeta').textContent=`#INC-${String(inc.id).padStart(4,'0')} · ${tipoNombre} · Prioridad ${inc.prioridad}${fechaHecho?' · Ocurrió: '+fechaHecho:''}`;
      document.getElementById('detailDescripcion').textContent=inc.descripcion||'';
      const ubicacionWrap=document.getElementById('detailUbicacionWrap');
      if(inc.ubicacion){ubicacionWrap.style.display='block';document.getElementById('detailUbicacion').textContent=inc.ubicacion;}
      else{ubicacionWrap.style.display='none';}
      const evidencias=r.evidencias||[];
      const evWrap=document.getElementById('detailEvidenciasWrap'),evBox=document.getElementById('detailEvidencias');
      if(evidencias.length){
        evWrap.style.display='block';
        evBox.innerHTML=evidencias.map(ev=>ev.tipo_archivo==='imagen'&&ev.url_archivo
          ? `<img src="${ev.url_archivo}" alt="Evidencia — tocar para ampliar" class="incident-evidence-thumb" style="width:120px;height:120px;object-fit:cover;border-radius:10px;border:1px solid var(--line);cursor:zoom-in;">`
          : `<div class="badge neutral"><i class="bi bi-paperclip"></i> ${escapeHtml(ev.tipo_archivo||'archivo')}</div>`).join('');
      }else{
        evWrap.style.display='none';
      }
      evBox.querySelectorAll('.incident-evidence-thumb').forEach(img=>img.addEventListener('click',()=>{
        let lb=document.getElementById('incidentImageLightbox');
        if(!lb){lb=document.createElement('div');lb.id='incidentImageLightbox';lb.className='incident-image-lightbox';const full=document.createElement('img');full.alt='Evidencia ampliada';lb.appendChild(full);lb.addEventListener('click',()=>lb.classList.remove('open'));document.body.appendChild(lb);}
        lb.querySelector('img').src=img.src;lb.classList.add('open');
      }));

      idEnRevision=inc.id;
      const revisionWrap=document.getElementById('detailRevisionWrap');
      const mostrarRevision=esStaffCliente && inc.estado==='pendiente_aprobacion';
      revisionWrap.style.display=mostrarRevision?'block':'none';
      document.getElementById('detailMotivoRechazo').value='';
      document.getElementById('detailSancionar').checked=false;
      document.getElementById('detailSancionarWrap').style.display=puedeSancionarCliente?'flex':'none';

      detailModal.classList.add('open');
    }catch(err){showToast(err.message,'bi-exclamation-triangle-fill');}
  }
  document.getElementById('detailClose').onclick=()=>detailModal.classList.remove('open');

  // Aprobar/rechazar (y, para admin/superadmin, sancionar) solo lo ve
  // guardia/admin/superadmin, y solo mientras el reporte este
  // pendiente de aprobacion -- un residente nunca deberia ver estos
  // botones ni siquiera en su propio reporte.
  const sesionActual=VigiaAPI.getSession()||{};
  const esStaffCliente=['guardia','admin','superadmin'].includes(sesionActual.rol_codigo);
  const puedeSancionarCliente=['admin','superadmin'].includes(sesionActual.rol_codigo);
  let idEnRevision=null;
  async function enviarRevision(aprobar){
    const motivo=document.getElementById('detailMotivoRechazo').value.trim();
    if(!aprobar && !motivo){showToast('Escribe el motivo del rechazo.','bi-exclamation-triangle-fill');return;}
    const sancionar=puedeSancionarCliente && document.getElementById('detailSancionar').checked;
    try{
      await VigiaAPI.request(`/incidencias/${idEnRevision}/revisar`,{method:'PATCH',body:JSON.stringify({aprobar,motivo,sancionar})});
      detailModal.classList.remove('open');
      showToast(aprobar?'Reporte aprobado':'Reporte rechazado'+(sancionar?' y usuario sancionado':''));
      load();
    }catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
  }
  document.getElementById('detailAprobarBtn').onclick=()=>enviarRevision(true);
  document.getElementById('detailRechazarBtn').onclick=()=>enviarRevision(false);
  function render(rows){
    const groups={pendiente_aprobacion:[],reportada:[],en_revision:[],historial:[]};
    rows.forEach(x=>{
      if(x.estado==='pendiente_aprobacion')groups.pendiente_aprobacion.push(x);
      else if(x.estado==='reportada')groups.reportada.push(x);
      else if(x.estado==='en_revision')groups.en_revision.push(x);
      else groups.historial.push(x);
    });
    const columnas=[['pendiente_aprobacion','warn','Pendiente de aprobación'],['reportada','warn','Abierta'],['en_revision','ok','En progreso'],['historial','neutral','Historial']];
    kanban.innerHTML=columnas.map(([key,dot,title])=>`<section><div class="kanban-col-head"><span class="dot ${dot}"></span>${title} <span class="count">${groups[key].length}</span></div>${groups[key].length?groups[key].map(card).join(''):'<div class="incident-empty-note"><i class="bi bi-inbox"></i><span>Sin incidencias en esta etapa.</span></div>'}${key==='reportada'?'<div class="kcard-add" data-open-report><i class="bi bi-plus-lg"></i> Reportar otra incidencia</div>':''}</section>`).join('');
    kanban.querySelectorAll('[data-open-report]').forEach(x=>x.onclick=open);
    kanban.querySelectorAll('.kcard[data-id]').forEach(x=>x.onclick=()=>verDetalle(x.getAttribute('data-id')));
  }
  async function load(){try{const [i,t]=await Promise.all([VigiaAPI.request('/incidencias'),VigiaAPI.request('/tipos-incidencia?limit=100')]);types=t.data||[];poblarTipos();render(i.data||[])}catch(e){kanban.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`}}
  form.onsubmit=async e=>{
    e.preventDefault();
    const ubicacion=ubicacionInput?ubicacionInput.value.trim():'';
    const fechaHecho=fechaHechoInput?fechaHechoInput.value:'';
    if(!ubicacion){showToast('Escribe la ubicación exacta donde ocurrió.','bi-exclamation-triangle-fill');return;}
    if(!fechaHecho){showToast('Indica cuándo ocurrió el hecho.','bi-exclamation-triangle-fill');return;}
    const tipoId=tipoSelect&&tipoSelect.value?Number(tipoSelect.value):null;
    const submitBtn=form.querySelector('button[type="submit"]');
    await withSubmitLock(submitBtn,async()=>{
      try{
        await VigiaAPI.request('/incidencias',{method:'POST',body:JSON.stringify({
          tipo_incidencia_id:tipoId,
          titulo:document.getElementById('reportTitle').value.trim(),
          descripcion:desc.value.trim(),
          ubicacion,
          fecha_hora_hecho:new Date(fechaHecho).toISOString(),
          visibilidad:document.getElementById('reportPrivate').checked?'privada':'comunidad',
          evidencia_url:photoData||null,evidencia_tipo:'imagen',
        })});
        form.reset();photoData='';count.textContent='0/350';document.getElementById('reportPhotoPreviewWrap').style.display='none';close();showToast('Incidencia enviada y guardada');load();
      }catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
    },'<i class="bi bi-arrow-repeat"></i> Enviando...');
  };
  document.getElementById('emergencyContactsBtn').onclick=()=>location.href='emergencias.html';
  // Antes "Alertar a residentes" y "Alertar al guardia" mandaban EXACTAMENTE
  // la misma alerta (solo cambiaba el texto del toast) -- el modal le
  // prometia a la persona que se avisaria a los vecinos de su torre, pero
  // el backend solo notificaba a guardia/admin siempre, sin importar el
  // boton presionado. Ahora se manda "alcance" para que el servidor si
  // notifique tambien a los vecinos de la misma torre cuando corresponde.
  async function panic(target){
    try{
      const r=await VigiaAPI.request('/tipos-alerta?limit=20');
      const type=(r.data||[]).find(x=>x.codigo==='otro')||(r.data||[])[0];
      if(!type)throw new Error('No hay tipo de alerta configurado.');
      const alcance=target==='guardia'?'guardia':'residentes';
      const resp=await VigiaAPI.request('/alertas-panico',{method:'POST',body:JSON.stringify({tipo_alerta_id:type.id,alcance})});
      if(alcance==='guardia'){
        showToast('Alerta privada enviada a garita','bi-broadcast');
      }else{
        const vecinos=(resp&&resp.vecinos_notificados)||0;
        showToast(vecinos>0?`Alerta enviada a garita y a ${vecinos} vecino${vecinos===1?'':'s'} de tu torre`:'Alerta enviada a garita. No se encontraron vecinos registrados en tu torre para avisarles.','bi-broadcast');
      }
    }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
  }
  function modalPanic(button,mid,cancel,confirm,target){const m=document.getElementById(mid);document.getElementById(button).onclick=()=>m.classList.add('open');document.getElementById(cancel).onclick=()=>m.classList.remove('open');document.getElementById(confirm).onclick=async()=>{m.classList.remove('open');await panic(target)}}
  modalPanic('panicGuardBtn','panicGuardModal','panicGuardCancel','panicGuardConfirm','guardia');modalPanic('panicResidentsBtn','panicResidentsModal','panicResidentsCancel','panicResidentsConfirm','residentes');

  // Si se llega aqui desde el boton "Marcar como incidencia" de una
  // publicacion de Comunidad (solo guardia/admin/superadmin la ven),
  // se abre el formulario ya prellenado en vez de auto-enviarlo: el
  // guardia sigue teniendo que adjuntar su propia evidencia (esa regla
  // no se salta) y puede revisar/ajustar el texto antes de mandarlo.
  const params=new URLSearchParams(location.search);
  if(params.get('desde_comunidad')){
    const tituloParam=params.get('titulo')||'';
    const descParam=params.get('descripcion')||'';
    document.getElementById('reportTitle').value=tituloParam.slice(0,80);
    desc.value=descParam.slice(0,350);
    count.textContent=`${desc.value.length}/350`;
    document.getElementById('reportPrivate').checked=false;
    open();
    history.replaceState(null,'',location.pathname);
  }

  load();
})();
