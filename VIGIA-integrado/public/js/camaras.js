// ============ CAMARAS.JS ============
// Dos modos en la misma pagina:
//
// 1) Sin camaras reales conectadas todavia -- se muestra el grid de
//    referencia (imagenes publicas de nps.gov/vedur.is que se
//    actualizan cada 60s), exactamente como funcionaba antes.
// 2) En cuanto la residencial tiene 1+ camara registrada via la API
//    (/api/camaras), el grid de referencia se oculta y se reproducen
//    las camaras reales: .m3u8 con hls.js, imagenes/MJPEG con <img>,
//    o un aviso claro si la URL es RTSP puro (el navegador no puede
//    reproducir eso sin convertirlo primero -- ver el modal de ayuda).
//
// Solo admin/superadmin ven los botones de agregar/editar/eliminar;
// residente y guardia (con permiso "camaras.ver") solo miran.

(function(){
  const grid=document.getElementById('camGrid');
  const gridReal=document.getElementById('camGridReal');
  if(!grid||!gridReal) return;

  const REFRESH_MS=60000;
  const session=VigiaAPI.getSession();
  const esAdmin=Boolean(session && ['admin','superadmin'].includes(session.rol_codigo));
  // El superadmin no pertenece a ninguna residencial en particular (por
  // diseno, ve todas) -- a diferencia del admin normal, el backend NO
  // puede deducir solo con la sesion a que residencial va esta camara,
  // asi que aqui se le pide explicitamente con un selector aparte.
  const isSuper=Boolean(session && session.rol_codigo==='superadmin');

  const adminActions=document.getElementById('camAdminActions');
  if(esAdmin && adminActions) adminActions.hidden=false;

  const planBloqueado=document.getElementById('camPlanBloqueado');
  // Superadmin nunca se ve limitado por planes (los administra el, no le
  // aplican a el) -- solo se revisa para admin/guardia/residente reales.
  async function revisarPlan(){
    if(isSuper || !planBloqueado) return true;
    try{
      const r=await VigiaAPI.request('/mi-plan');
      const info=r.data;
      if(info && info.incluye_camaras===false){
        planBloqueado.hidden=false;
        if(disclaimer) disclaimer.hidden=true;
        if(adminActions) adminActions.hidden=true;
        grid.hidden=true; gridReal.hidden=true;
        return false;
      }
    }catch(e){ /* si falla la consulta, no se bloquea nada por precaucion */ }
    return true;
  }

  const residencialGroup=document.getElementById('camResidencialGroup');
  const residencialSelect=document.getElementById('camResidencial');
  if(isSuper && residencialGroup) residencialGroup.hidden=false;

  const disclaimer=document.getElementById('camDisclaimer');
  const formModal=document.getElementById('camFormModal');
  const form=document.getElementById('camForm');
  const formTitle=document.getElementById('camFormTitle');
  const addBtn=document.getElementById('camAddBtn');
  const cancelBtn=document.getElementById('camCancelBtn');
  const helpBtn=document.getElementById('camHelpBtn');
  const helpModal=document.getElementById('camHelpModal');
  const helpCloseBtn=document.getElementById('camHelpCloseBtn');
  const puntoSelect=document.getElementById('camPuntoAcceso');

  // ---- Grid de referencia (comportamiento original, sin cambios) ----
  function wireDemoCards(){
    grid.querySelectorAll('.cam-card').forEach(card=>{
      if(card.dataset.wired)return;
      card.dataset.wired='1';
      const baseUrl=card.dataset.img;
      const img=card.querySelector('.cam-live-img');
      const errorBox=card.querySelector('.cam-error');
      const retryBtn=card.querySelector('.cam-retry-btn');
      const fsBtn=card.querySelector('.cam-fullscreen-btn');
      if(!img)return;

      function load(){
        if(errorBox)errorBox.classList.remove('show');
        img.style.display='';
        img.src=baseUrl+'?t='+Date.now();
      }

      img.addEventListener('error',()=>{
        img.style.display='none';
        if(errorBox)errorBox.classList.add('show');
      });

      if(retryBtn) retryBtn.addEventListener('click', load);
      if(fsBtn) fsBtn.addEventListener('click',()=>{
        if(img.requestFullscreen) img.requestFullscreen();
      });

      load();
      setInterval(load, REFRESH_MS);
    });
  }

  // ---- Camaras reales ----
  let hlsInstances=[];
  function destruirReproductores(){
    hlsInstances.forEach(h=>{ try{ h.destroy(); }catch(e){} });
    hlsInstances=[];
  }

  function etiquetaEstado(estado){
    return {activa:'Activa',mantenimiento:'Mantenimiento',inactiva:'Inactiva',desconectada:'Desconectada'}[estado]||'Activa';
  }

  function mostrarErrorReproduccion(wrap,mensaje){
    wrap.querySelectorAll('video,img').forEach(el=>el.remove());
    const err=document.createElement('div');
    err.className='cam-error show';
    const icon=document.createElement('i');icon.className='bi bi-camera-video-off-fill';
    const span=document.createElement('span');span.textContent=mensaje||'No se pudo cargar esta transmisión.';
    err.append(icon,span);
    wrap.appendChild(err);
  }

  function crearTarjetaCamara(cam){
    const card=document.createElement('div');card.className='cam-card';
    const wrap=document.createElement('div');wrap.className='cam-video-wrap';

    const url=String(cam.stream_url||'').trim();
    const esHls=/\.m3u8(\?|$)/i.test(url);
    const esRtspCrudo=/^rtsp:\/\//i.test(url);

    if(!url){
      mostrarErrorReproduccion(wrap,'Todavía no tiene una URL de transmisión configurada.');
    }else if(esRtspCrudo){
      const notice=document.createElement('div');notice.className='cam-needs-conversion';
      const icon=document.createElement('i');icon.className='bi bi-exclamation-triangle-fill';
      const span=document.createElement('span');span.textContent='Esta cámara usa RTSP directo -- el navegador no puede reproducirlo sin convertirlo primero. Toca "Cómo conectar tu cámara".';
      notice.append(icon,span);
      wrap.appendChild(notice);
    }else if(esHls){
      const video=document.createElement('video');
      video.autoplay=true;video.muted=true;video.playsInline=true;video.controls=true;
      video.style.width='100%';video.style.height='100%';video.style.objectFit='cover';video.style.display='block';
      wrap.appendChild(video);
      if(window.Hls && window.Hls.isSupported()){
        const hls=new window.Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.ERROR,(evt,data)=>{ if(data&&data.fatal) mostrarErrorReproduccion(wrap); });
        hlsInstances.push(hls);
      }else if(video.canPlayType('application/vnd.apple.mpegurl')){
        video.src=url; // Safari/iOS reproduce HLS nativo, sin hls.js
      }else{
        mostrarErrorReproduccion(wrap,'Este navegador no puede reproducir HLS.');
      }
    }else{
      // Se asume imagen fija o transmision MJPEG -- ambas se muestran
      // igual con un <img>; Chrome/Firefox/Edge saben renderizar un
      // stream MJPEG multipart directo en un <img src="...">.
      const img=document.createElement('img');img.className='cam-live-img';img.alt=cam.nombre||'Cámara';
      img.addEventListener('error',()=>mostrarErrorReproduccion(wrap));
      img.src=url;
      wrap.appendChild(img);
      setInterval(()=>{ img.src=url+(url.includes('?')?'&':'?')+'t='+Date.now(); }, REFRESH_MS);
    }

    const badge=document.createElement('span');badge.className='cam-live-badge';
    const dot=document.createElement('span');dot.className='cam-live-dot';
    badge.append(dot,document.createTextNode(' EN VIVO'));
    wrap.appendChild(badge);
    card.appendChild(wrap);

    const info=document.createElement('div');info.className='cam-card-info'+(esAdmin?' has-admin-btns':'');
    const textWrap=document.createElement('div');textWrap.className='cam-card-info-text';
    const nombre=document.createElement('b');nombre.textContent=cam.nombre||'Cámara';
    const ubic=document.createElement('span');ubic.className='mono';ubic.textContent=cam.ubicacion||'';
    const statusBadge=document.createElement('span');statusBadge.className='cam-status-badge '+(cam.estado||'activa');statusBadge.textContent=etiquetaEstado(cam.estado);
    textWrap.append(nombre,ubic,statusBadge);
    info.appendChild(textWrap);

    if(esAdmin){
      const btns=document.createElement('div');btns.className='cam-card-admin-btns';
      const editBtn=document.createElement('button');editBtn.type='button';editBtn.className='icon-btn';editBtn.title='Editar';
      editBtn.appendChild(Object.assign(document.createElement('i'),{className:'bi bi-pencil-fill'}));
      editBtn.addEventListener('click',()=>abrirFormulario(cam));
      const delBtn=document.createElement('button');delBtn.type='button';delBtn.className='icon-btn';delBtn.title='Eliminar';
      delBtn.appendChild(Object.assign(document.createElement('i'),{className:'bi bi-trash3-fill'}));
      delBtn.addEventListener('click',()=>eliminarCamara(cam));
      btns.append(editBtn,delBtn);
      info.appendChild(btns);
    }
    card.appendChild(info);
    return card;
  }

  function crearEmptyState(){
    const el=document.createElement('div');el.className='cam-empty-state';
    const icon=document.createElement('i');icon.className='bi bi-camera-video-off';
    const title=document.createElement('b');
    const p=document.createElement('p');
    if(esAdmin){
      title.textContent='Todavía no has conectado ninguna cámara';
      p.textContent='Mientras tanto, abajo se muestran cámaras de referencia. Toca "Agregar cámara" para conectar la primera.';
    }else{
      title.textContent='El administrador todavía no conecta cámaras reales';
      p.textContent='Mientras tanto, abajo se muestran cámaras de referencia (imágenes de gobierno que no son de esta residencial).';
    }
    el.append(icon,title,p);
    return el;
  }

  async function cargarCamaras(){
    try{
      const r=await VigiaAPI.request('/camaras');
      const camaras=r.data||[];
      destruirReproductores();
      gridReal.replaceChildren();

      if(!camaras.length){
        grid.hidden=false;gridReal.hidden=true;
        if(disclaimer)disclaimer.hidden=false;
        wireDemoCards();
        return;
      }

      grid.hidden=true;gridReal.hidden=false;
      if(disclaimer)disclaimer.hidden=true;
      camaras.forEach(cam=>gridReal.appendChild(crearTarjetaCamara(cam)));
    }catch(err){
      // Sin permiso, sin conexion, etc. -- se cae al grid de referencia
      // en vez de dejar la pagina en blanco o con un error crudo.
      grid.hidden=false;gridReal.hidden=true;
      if(disclaimer)disclaimer.hidden=false;
      wireDemoCards();
    }
  }

  // ---- Formulario admin: agregar/editar ----
  function abrirModal(el){ if(el) el.classList.add('open'); }
  function cerrarModal(el){ if(el) el.classList.remove('open'); }

  async function cargarResidenciales(){
    if(!residencialSelect)return;
    try{
      const r=await VigiaAPI.request('/residenciales?limit=300');
      residencialSelect.querySelectorAll('option').forEach((opt,i)=>{ if(i>0) opt.remove(); });
      (r.data||[]).forEach(res=>{
        const opt=document.createElement('option');opt.value=res.id;opt.textContent=res.nombre||`Residencial #${res.id}`;
        residencialSelect.appendChild(opt);
      });
    }catch(e){/* si falla, el select se queda solo con "Selecciona una residencial" */}
  }

  async function cargarPuntosAcceso(){
    if(!puntoSelect)return;
    try{
      const r=await VigiaAPI.request('/puntos-acceso?limit=100');
      puntoSelect.querySelectorAll('option').forEach((opt,i)=>{ if(i>0) opt.remove(); });
      (r.data||[]).forEach(p=>{
        const opt=document.createElement('option');opt.value=p.id;opt.textContent=p.nombre||`Punto #${p.id}`;
        puntoSelect.appendChild(opt);
      });
    }catch(e){/* opcional: si falla, el select se queda solo con "Sin asignar" */}
  }

  function abrirFormulario(cam){
    if(!form)return;
    form.reset();
    document.getElementById('camId').value=cam?cam.id:'';
    formTitle.textContent=cam?'Editar cámara':'Agregar cámara';
    if(residencialSelect) residencialSelect.value=cam&&cam.residencial_id?String(cam.residencial_id):'';
    document.getElementById('camNombre').value=cam?(cam.nombre||''):'';
    document.getElementById('camUbicacion').value=cam?(cam.ubicacion||''):'';
    document.getElementById('camTipo').value=cam?(cam.tipo||'fija'):'fija';
    if(puntoSelect) puntoSelect.value=cam&&cam.punto_acceso_id?String(cam.punto_acceso_id):'';
    document.getElementById('camMarca').value=cam?(cam.marca||''):'';
    document.getElementById('camModelo').value=cam?(cam.modelo||''):'';
    document.getElementById('camStreamUrl').value=cam?(cam.stream_url||''):'';
    document.getElementById('camProtocolo').value=cam?(cam.protocolo||'rtsp'):'rtsp';
    document.getElementById('camEstado').value=cam?(cam.estado||'activa'):'activa';
    document.getElementById('camIp').value=cam?(cam.direccion_ip||''):'';
    document.getElementById('camPuerto').value=cam&&cam.puerto?cam.puerto:'';
    document.getElementById('camUsuario').value=cam?(cam.usuario_stream||''):'';
    const claveInput=document.getElementById('camClave');
    claveInput.value='';
    claveInput.placeholder=cam?'Deja vacío para no cambiarla':'Se guarda cifrada';
    abrirModal(formModal);
  }

  async function eliminarCamara(cam){
    const ok=await VigiaConfirm({
      title:'¿Eliminar esta cámara?',
      message:`Se quitará "${cam.nombre}" de la lista. Puedes volver a agregarla después si lo necesitas.`,
      confirmText:'Eliminar',
      icon:'bi-trash3',
    });
    if(!ok)return;
    try{
      await VigiaAPI.request(`/camaras/${cam.id}`,{method:'DELETE'});
      showToast('Cámara eliminada');
      await cargarCamaras();
    }catch(err){ showToast(err.message,'bi-exclamation-triangle-fill'); }
  }

  if(addBtn) addBtn.addEventListener('click',()=>abrirFormulario(null));
  if(cancelBtn) cancelBtn.addEventListener('click',()=>cerrarModal(formModal));
  if(helpBtn) helpBtn.addEventListener('click',()=>abrirModal(helpModal));
  if(helpCloseBtn) helpCloseBtn.addEventListener('click',()=>cerrarModal(helpModal));
  [formModal,helpModal].forEach(overlay=>{
    if(!overlay)return;
    overlay.addEventListener('click',(e)=>{ if(e.target===overlay) overlay.classList.remove('open'); });
  });

  if(form){
    form.addEventListener('submit', async(e)=>{
      e.preventDefault();
      const id=document.getElementById('camId').value;
      const nombre=document.getElementById('camNombre').value.trim();
      const ubicacion=document.getElementById('camUbicacion').value.trim();
      const streamUrl=document.getElementById('camStreamUrl').value.trim();
      if(!nombre||!ubicacion||!streamUrl){
        showToast('Completa nombre, ubicación y la URL de transmisión.','bi-exclamation-triangle-fill');
        return;
      }
      if(isSuper && residencialSelect && !residencialSelect.value){
        showToast('Selecciona a qué residencial pertenece esta cámara.','bi-exclamation-triangle-fill');
        return;
      }
      const body={
        nombre, ubicacion,
        tipo: document.getElementById('camTipo').value,
        punto_acceso_id: puntoSelect&&puntoSelect.value ? puntoSelect.value : null,
        marca: document.getElementById('camMarca').value.trim()||null,
        modelo: document.getElementById('camModelo').value.trim()||null,
        stream_url: streamUrl,
        protocolo: document.getElementById('camProtocolo').value,
        estado: document.getElementById('camEstado').value,
        direccion_ip: document.getElementById('camIp').value.trim()||null,
        puerto: document.getElementById('camPuerto').value||null,
        usuario_stream: document.getElementById('camUsuario').value.trim()||null,
      };
      if(isSuper && residencialSelect && residencialSelect.value) body.residencial_id=Number(residencialSelect.value);

      const clave=document.getElementById('camClave').value;
      if(clave) body.clave_stream=clave;

      const submitBtn=form.querySelector('button[type="submit"]');
      await withSubmitLock(submitBtn, async()=>{
        try{
          if(id){
            await VigiaAPI.request(`/camaras/${id}`,{method:'PUT',body:JSON.stringify(body)});
            showToast('Cámara actualizada');
          }else{
            await VigiaAPI.request('/camaras',{method:'POST',body:JSON.stringify(body)});
            showToast('Cámara agregada');
          }
          cerrarModal(formModal);
          await cargarCamaras();
        }catch(err){ showToast(err.message,'bi-exclamation-triangle-fill'); }
      }, '<i class="bi bi-arrow-repeat"></i> Guardando...');
    });
  }

  if(esAdmin) cargarPuntosAcceso();
  if(isSuper) cargarResidenciales();
  revisarPlan().then(permitido=>{ if(permitido) cargarCamaras(); });
})();
