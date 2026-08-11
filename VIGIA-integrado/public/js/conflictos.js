(function(){
  const session=VigiaAPI.getSession();
  const admin=['admin','superadmin'].includes(session.rol_codigo);

  function badge(x){
    return `<span class="badge ${['activo','resuelto_bloquear'].includes(x)?'blocked':x==='pendiente'||x==='abierto'?'pending':'neutral'}">${escapeHtml(x)}</span>`;
  }
  function formatFecha(iso){
    if(!iso) return '';
    return new Date(iso).toLocaleString('es-HN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function isImageUrl(url){
    return typeof url==='string' && (url.startsWith('data:image') || /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(url));
  }
  function openLightbox(url){
    const overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;z-index:9999;padding:2rem;cursor:zoom-out;';
    const img=document.createElement('img');
    img.src=url;
    img.style.cssText='max-width:min(90vw,900px);max-height:90vh;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.5);';
    img.addEventListener('click', e=> e.stopPropagation());
    const close=()=>overlay.remove();
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', function onEsc(e){ if(e.key==='Escape'){ close(); document.removeEventListener('keydown',onEsc); } });
    overlay.appendChild(img);
    document.body.appendChild(overlay);
  }

  async function resolveVeto(id,state){
    try{
      await VigiaAPI.request(`/vetos-acceso/${id}/resolver`,{method:'PATCH',body:JSON.stringify({estado:state})});
      showToast('Veto actualizado');
      load();
    }catch(e){ showToast(e.message,'bi-exclamation-triangle-fill'); }
  }
  async function resolveConflict(id,state){
    const note=prompt('Escribe una resolución breve:')||'';
    if(!note) return;
    try{
      await VigiaAPI.request(`/conflictos-permisos/${id}`,{method:'PATCH',body:JSON.stringify({estado:state,resolucion:note,resuelto_por:session.id,fecha_resolucion:new Date().toISOString()})});
      showToast('Conflicto resuelto');
      load();
    }catch(e){ showToast(e.message,'bi-exclamation-triangle-fill'); }
  }

  // El bloque de detalles se abre haciendo clic en cualquier parte de la
  // tarjeta (no un boton aparte): asi no compite por espacio con
  // Aprobar/Rechazar dentro de queue-actions, que es lo que rompia el
  // ancho de la columna de texto en tarjetas con varios botones.
  function expandHint(){
    return `<i class="bi bi-chevron-down" style="font-size:.7rem;color:var(--mist);margin-left:.4rem;"></i>`;
  }

  // Bloque de detalles expandible. No agrega clases CSS nuevas al
  // stylesheet compartido (style.css es de todo el equipo): todo el
  // estilo va inline, reusando las variables de color ya definidas.
  function buildDetails(rows, evidenciaUrl){
    const details=document.createElement('div');
    details.style.cssText='display:none;grid-column:1 / -1;margin-top:.7rem;padding-top:.7rem;border-top:1px dashed var(--line);';
    details.innerHTML=rows.map(([label,value])=>{
      const text=String(value);
      // Textos cortos van en una fila lado a lado; los largos (como el
      // motivo, hasta 255 caracteres) van en bloque para no verse
      // amontonados contra el borde derecho.
      if(text.length<=28){
        return `<div style="display:flex;justify-content:space-between;gap:1rem;font-size:.78rem;padding:.25rem 0;">`+
          `<span style="color:var(--mist);">${escapeHtml(label)}</span>`+
          `<b style="color:var(--bone-dim);text-align:right;">${escapeHtml(text)}</b>`+
        `</div>`;
      }
      return `<div style="font-size:.78rem;padding:.25rem 0;">`+
        `<span style="color:var(--mist);display:block;margin-bottom:.15rem;">${escapeHtml(label)}</span>`+
        `<b style="color:var(--bone-dim);font-weight:500;">${escapeHtml(text)}</b>`+
      `</div>`;
    }).join('');
    if(evidenciaUrl){
      if(isImageUrl(evidenciaUrl)){
        const img=document.createElement('img');
        img.src=evidenciaUrl; img.alt='Evidencia (clic para ampliar)';
        img.style.cssText='max-width:220px;max-height:220px;border-radius:10px;margin-top:.6rem;display:block;border:1px solid var(--line);cursor:zoom-in;';
        img.addEventListener('click', e=>{ e.stopPropagation(); openLightbox(evidenciaUrl); });
        details.appendChild(img);
      }else{
        const link=document.createElement('a');
        link.href=evidenciaUrl; link.target='_blank'; link.rel='noopener'; link.className='btn btn-ghost';
        link.style.marginTop='.6rem';
        link.innerHTML='<i class="bi bi-paperclip"></i> Ver evidencia';
        details.appendChild(link);
      }
    }
    return details;
  }

  function wireToggle(el, details, hintIcon){
    el.style.cursor='pointer';
    el.addEventListener('click',()=>{
      const open=details.style.display!=='none';
      details.style.display=open?'none':'grid';
      if(hintIcon) hintIcon.className=open?'bi bi-chevron-down':'bi bi-chevron-up';
    });
    // Los botones de accion no deben disparar el expandir/contraer.
    el.querySelectorAll('.queue-actions button').forEach(b=> b.addEventListener('click', e=> e.stopPropagation()));
  }

  function renderVeto(x){
    const el=document.createElement('div');
    el.className='queue-item';
    el.innerHTML=
      `<div class="queue-number"><i class="bi bi-shield-x"></i></div>`+
      `<div class="queue-copy"><b>${escapeHtml(x.nombre_persona)}</b><span>${escapeHtml(x.numero_documento||'Sin documento')} · ${escapeHtml(x.alcance)}</span><span>${escapeHtml(x.motivo)}</span></div>`+
      `<div class="queue-actions">${badge(x.estado)}`+
        (admin&&x.estado==='pendiente' ? `<button class="btn btn-alert" data-s="activo">Aprobar</button><button class="btn btn-ghost" data-s="rechazado">Rechazar</button>` : '')+
        (admin&&x.estado==='activo' ? `<button class="btn btn-ghost" data-s="revocado">Revocar</button>` : '')+
      `</div>`;
    el.querySelector('.queue-copy span:last-child').appendChild(document.createRange().createContextualFragment(expandHint()));

    const rows=[
      ['Motivo', x.motivo],
      ['Teléfono', x.telefono || 'No proporcionado'],
      ['Solicitado', formatFecha(x.fecha_creacion)],
    ];
    if(x.estado==='activo') rows.push(['Vigente desde', formatFecha(x.fecha_desde)], ['Vigente hasta', x.fecha_hasta ? formatFecha(x.fecha_hasta) : 'Indefinido']);
    if(x.fecha_resolucion) rows.push(['Resuelto', formatFecha(x.fecha_resolucion)]);
    const details=buildDetails(rows, x.evidencia_url);
    el.appendChild(details);

    el.querySelectorAll('[data-s]').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); resolveVeto(x.id,b.dataset.s); });
    wireToggle(el, details, el.querySelector('.queue-copy span:last-child i'));
    return el;
  }

  function renderConflicto(x){
    const el=document.createElement('div');
    el.className='queue-item';
    el.innerHTML=
      `<div class="queue-number"><i class="bi bi-exclamation-diamond-fill"></i></div>`+
      `<div class="queue-copy"><b>${escapeHtml(x.nombre_persona)}</b><span>${escapeHtml(x.numero_documento||'Sin documento')}</span><span>${escapeHtml(x.descripcion)}</span>`+
        (x.resolucion ? `<span>Resolución: ${escapeHtml(x.resolucion)}</span>` : '')+
      `</div>`+
      `<div class="queue-actions">${badge(x.estado)}`+
        (admin&&['abierto','en_revision'].includes(x.estado) ? `<button class="btn btn-solid" data-c="resuelto_autorizar">Autorizar</button><button class="btn btn-alert" data-c="resuelto_bloquear">Bloquear</button>` : '')+
      `</div>`;
    el.querySelector('.queue-copy span:last-child').appendChild(document.createRange().createContextualFragment(expandHint()));

    const rows=[['Detectado', formatFecha(x.fecha_deteccion)]];
    if(x.fecha_resolucion) rows.push(['Resuelto', formatFecha(x.fecha_resolucion)]);
    const details=buildDetails(rows, null);
    el.appendChild(details);

    el.querySelectorAll('[data-c]').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); resolveConflict(x.id,b.dataset.c); });
    wireToggle(el, details, el.querySelector('.queue-copy span:last-child i'));
    return el;
  }

  async function load(){
    const vb=document.getElementById('adminVetoList'),cb=document.getElementById('conflictList');
    try{
      const [v,c]=await Promise.all([
        VigiaAPI.request('/vetos-acceso'),
        VigiaAPI.request('/conflictos-permisos?limit=200&sort=fecha_deteccion:desc'),
      ]);
      const vetos=v.data||[], conf=c.data||[];
      document.getElementById('pendingVetoCount').textContent=vetos.filter(x=>x.estado==='pendiente').length;
      document.getElementById('conflictCount').textContent=conf.filter(x=>['abierto','en_revision'].includes(x.estado)).length;

      vb.innerHTML=vetos.length?'':'<div class="empty-state">Sin solicitudes.</div>';
      vetos.forEach(x=> vb.appendChild(renderVeto(x)));

      cb.innerHTML=conf.length?'':'<div class="empty-state">No hay conflictos detectados.</div>';
      conf.forEach(x=> cb.appendChild(renderConflicto(x)));
    }catch(e){
      vb.innerHTML=cb.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;
    }
  }

  document.getElementById('reloadConflicts').onclick=load;
  load();
})();
