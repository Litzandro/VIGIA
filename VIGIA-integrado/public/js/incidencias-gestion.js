// ============ INCIDENCIAS-GESTION.JS ============
// Pantalla de incidencias para guardia / admin / superadmin (la del
// residente sigue siendo incidencias.html). Todo viene de la API real:
//   GET   /incidencias            listado (con vivienda del reportante)
//   GET   /incidencias/:id        detalle + evidencias + historial
//   PATCH /incidencias/:id/revisar  aprobar / rechazar un reporte de residente
//   PATCH /incidencias/:id        tomar caso, prioridad, resolver, cerrar, reabrir
//   POST  /incidencias/:id/nota   nota de seguimiento sin cambiar el estado
//   POST  /incidencias            reportar desde garita (foto obligatoria al guardia)
(function(){
  'use strict';
  const session=VigiaAPI.getSession();
  if(!session||!['guardia','admin','superadmin'].includes(session.rol_codigo)){
    location.replace(session?VigiaAPI.destinationForRole(session.rol_codigo):'guardia-login.html');return;
  }
  const esGuardia=session.rol_codigo==='guardia';
  const puedeSancionar=['admin','superadmin'].includes(session.rol_codigo);
  const $=(id)=>document.getElementById(id);

  const ESTADO={
    pendiente_aprobacion:{label:'Por aprobar',cls:'warn'},
    reportada:{label:'Abierta',cls:'info'},
    en_revision:{label:'En progreso',cls:'ok'},
    resuelta:{label:'Resuelta',cls:'ok'},
    cerrada:{label:'Cerrada',cls:'neutral'},
    rechazada:{label:'Rechazada',cls:'alert'}
  };
  const PRIO={urgente:{label:'Urgente',cls:'alert',peso:0},alta:{label:'Alta',cls:'warn',peso:1},media:{label:'Media',cls:'info',peso:2},baja:{label:'Baja',cls:'neutral',peso:3}};
  const ABIERTAS=['pendiente_aprobacion','reportada','en_revision'];

  let rows=[],types=[],tab='',query='',prio='',mine=false,detail=null,photoData='';

  function fol(id){return '#INC-'+String(id).padStart(4,'0')}
  function nombreDe(u){return u?`${u.nombre||''} ${u.apellido||''}`.trim():''}
  function hace(v){
    const ms=Math.max(0,Date.now()-new Date(v).getTime()),m=Math.floor(ms/60000);
    if(m<1)return 'hace un momento';if(m<60)return `hace ${m} min`;
    const h=Math.floor(m/60);if(h<24)return `hace ${h} h`;
    const d=Math.floor(h/24);return `hace ${d} ${d===1?'día':'días'}`;
  }
  function cuando(v){const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('es-HN',{day:'2-digit',month:'short',hour:'numeric',minute:'2-digit',hour12:true})}
  function badge(text,cls){return `<span class="badge ${cls||'neutral'}">${escapeHtml(text)}</span>`}

  // ---------- listado ----------
  function coincideTab(x,t){
    if(t==='por_aprobar')return x.estado==='pendiente_aprobacion';
    if(t==='abiertas')return x.estado==='reportada';
    if(t==='en_progreso')return x.estado==='en_revision';
    if(t==='historial')return ['resuelta','cerrada','rechazada'].includes(x.estado);
    if(t==='urgentes')return x.prioridad==='urgente'&&ABIERTAS.includes(x.estado);
    return true;
  }
  function filtradas(){
    const q=query.toLowerCase();
    return rows.filter(x=>{
      if(!coincideTab(x,tab))return false;
      if(prio&&x.prioridad!==prio)return false;
      if(mine&&String(x.asignado_a)!==String(session.id))return false;
      if(q){
        const txt=`${x.titulo} ${nombreDe(x.reportadoPor)} ${x.reportante_vivienda||''} ${x.ubicacion||''} ${fol(x.id)}`.toLowerCase();
        if(!txt.includes(q))return false;
      }
      return true;
    }).sort((a,b)=>{
      if(tab==='por_aprobar')return new Date(a.fecha_hora)-new Date(b.fecha_hora); // la que lleva mas esperando primero
      const pa=(PRIO[a.prioridad]||{peso:2}).peso,pb=(PRIO[b.prioridad]||{peso:2}).peso;
      if(ABIERTAS.includes(a.estado)&&ABIERTAS.includes(b.estado)&&pa!==pb)return pa-pb;
      return new Date(b.fecha_hora)-new Date(a.fecha_hora);
    });
  }
  function renderCounts(){
    const c=(f)=>rows.filter(f).length;
    const pa=c(x=>x.estado==='pendiente_aprobacion');
    $('igCPorAprobar').textContent=pa;
    $('igCAbiertas').textContent=c(x=>x.estado==='reportada');
    $('igCProgreso').textContent=c(x=>x.estado==='en_revision');
    $('igCUrgentes').textContent=c(x=>x.prioridad==='urgente'&&ABIERTAS.includes(x.estado));
    document.querySelector('.ig-stat.warn').classList.toggle('pulse',pa>0);
    const n={por_aprobar:pa,abiertas:c(x=>x.estado==='reportada'),en_progreso:c(x=>x.estado==='en_revision'),historial:c(x=>['resuelta','cerrada','rechazada'].includes(x.estado)),todas:rows.length};
    document.querySelectorAll('#igTabs button').forEach(b=>{
      b.classList.toggle('active',b.dataset.tab===tab);
      let s=b.querySelector('.n');if(!s){s=document.createElement('span');s.className='n';b.appendChild(s)}
      s.textContent=n[b.dataset.tab];
    });
  }
  function card(x){
    const est=ESTADO[x.estado]||{label:x.estado,cls:'neutral'},pr=PRIO[x.prioridad]||PRIO.media;
    const el=document.createElement('article');
    el.className='ig-card'+(x.estado==='pendiente_aprobacion'?' pending':'');
    el.dataset.prio=x.prioridad;el.dataset.id=x.id;
    const autor=nombreDe(x.reportadoPor)||'Residente';
    const asignada=x.asignadoA?` · Asignada a ${nombreDe(x.asignadoA)}`:'';
    const tipo=(x.tipoIncidencia&&x.tipoIncidencia.nombre)||'Sin tipo';
    el.innerHTML=`<span class="bar"></span>
      <div class="ig-card-main">
        <div class="ig-card-title"><b>${escapeHtml(x.titulo)}</b>${badge(pr.label,pr.cls)}${badge(est.label,est.cls)}${x.evidencias_count?`<span class="badge neutral"><i class="bi bi-camera-fill"></i> ${x.evidencias_count}</span>`:''}</div>
        <div class="ig-card-meta">${fol(x.id)} · ${escapeHtml(tipo)} · ${escapeHtml(autor)}${x.reportante_vivienda?' · '+escapeHtml(x.reportante_vivienda):''}<br>${escapeHtml(x.ubicacion||'Sin ubicación')} · ${hace(x.fecha_hora)}${escapeHtml(asignada)}</div>
      </div>
      <div class="ig-card-side"></div>`;
    const side=el.querySelector('.ig-card-side');
    if(x.estado==='pendiente_aprobacion'){
      const box=document.createElement('div');box.className='ig-card-actions';
      const ok=document.createElement('button');ok.type='button';ok.className='btn btn-solid btn-sm';ok.innerHTML='<i class="bi bi-check-lg"></i> Aprobar';
      ok.onclick=(e)=>{e.stopPropagation();aprobarRapido(x,ok)};
      const no=document.createElement('button');no.type='button';no.className='btn btn-danger btn-sm';no.innerHTML='<i class="bi bi-x-lg"></i> Rechazar';
      no.onclick=(e)=>{e.stopPropagation();abrirDetalle(x.id,true)};
      box.append(ok,no);side.appendChild(box);
    }else if(x.estado==='reportada'){
      const take=document.createElement('button');take.type='button';take.className='btn btn-info btn-sm';take.innerHTML='<i class="bi bi-hand-index-thumb"></i> Tomar caso';
      take.onclick=(e)=>{e.stopPropagation();cambiarEstado(x.id,'en_revision','',take)};
      side.appendChild(take);
    }
    el.onclick=()=>abrirDetalle(x.id);
    return el;
  }
  function render(){
    renderCounts();
    const list=$('igList'),data=filtradas();
    list.replaceChildren();
    if(!data.length){
      const vacio={por_aprobar:'No hay reportes esperando aprobación. ¡Todo al día!',abiertas:'No hay incidencias abiertas sin tomar.',en_progreso:'No hay incidencias en progreso.',historial:'Todavía no hay incidencias resueltas o cerradas.',urgentes:'No hay incidencias urgentes abiertas.',todas:'Todavía no hay incidencias registradas.'};
      const d=document.createElement('div');d.className='ig-empty';
      d.textContent=(query||prio||mine)?'Ninguna incidencia coincide con los filtros.':(vacio[tab]||'Sin incidencias.');
      list.appendChild(d);return;
    }
    data.forEach(x=>list.appendChild(card(x)));
  }
  async function cargar(){
    try{
      const [i,t]=await Promise.all([VigiaAPI.request('/incidencias'),VigiaAPI.request('/tipos-incidencia?limit=100')]);
      rows=i.data||[];types=(t.data||[]).filter(x=>x.activo!==false);
      if(!tab)tab=rows.some(x=>x.estado==='pendiente_aprobacion')?'por_aprobar':'abiertas';
      render();
    }catch(e){$('igList').innerHTML='';const d=document.createElement('div');d.className='ig-empty';d.textContent=e.message;$('igList').appendChild(d)}
  }

  // ---------- acciones ----------
  async function aprobarRapido(x,btn){
    const ok=await VigiaConfirm({title:`¿Aprobar ${fol(x.id)}?`,message:'El reporte pasará a ser una incidencia oficial y el residente recibirá un aviso.',confirmText:'Aprobar',icon:'bi-check-circle'});
    if(!ok)return;
    await withSubmitLock(btn,async()=>{
      try{await VigiaAPI.request(`/incidencias/${x.id}/revisar`,{method:'PATCH',body:JSON.stringify({aprobar:true})});showToast('Reporte aprobado');await cargar()}
      catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
    });
  }
  async function cambiarEstado(id,estado,comentario,btn){
    await withSubmitLock(btn,async()=>{
      try{
        await VigiaAPI.request(`/incidencias/${id}`,{method:'PATCH',body:JSON.stringify({estado,comentario:comentario||undefined})});
        showToast({en_revision:'Caso tomado',resuelta:'Marcada como resuelta',cerrada:'Incidencia cerrada',reportada:'Devuelta a abiertas'}[estado]||'Estado actualizado');
        await cargar();
        if(detail&&String(detail.id)===String(id))await abrirDetalle(id);
      }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
    });
  }

  // ---------- detalle ----------
  function zoom(url){
    const o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:9999;padding:2rem;cursor:zoom-out;';
    const im=document.createElement('img');im.src=url;im.style.cssText='max-width:min(92vw,900px);max-height:90vh;border-radius:12px;';
    o.appendChild(im);o.onclick=()=>o.remove();document.body.appendChild(o);
  }
  function btn(cls,icon,label,fn){
    const b=document.createElement('button');b.type='button';b.className='btn '+cls;
    b.innerHTML=`<i class="bi ${icon}"></i> ${escapeHtml(label)}`;b.onclick=()=>fn(b);return b;
  }
  function accionesDe(inc){
    const box=$('igDActions');box.replaceChildren();
    const title=document.createElement('span');title.className='ig-actions-title';box.appendChild(title);
    const row=document.createElement('div');row.className='ig-row';
    const e=inc.estado;
    if(e==='pendiente_aprobacion'){
      title.textContent='Este reporte de residente espera tu decisión';
      const motivo=document.createElement('textarea');motivo.className='form-control';motivo.id='igDMotivo';motivo.rows=2;motivo.maxLength=255;
      motivo.placeholder='Motivo (obligatorio solo para rechazar)';box.appendChild(motivo);
      let sanc=null;
      if(puedeSancionar){
        const l=document.createElement('label');l.className='ig-check';
        l.innerHTML='<input type="checkbox" id="igDSancionar"><span><b>Sancionar al usuario</b><br>Solo si el reporte es falso, irrespetuoso o de mala fe.</span>';
        box.appendChild(l);sanc=l.querySelector('input');
      }
      const revisar=async(aprobar,b)=>{
        const m=motivo.value.trim();
        if(!aprobar&&!m){showToast('Escribe el motivo del rechazo.','bi-exclamation-triangle-fill');motivo.focus();return}
        await withSubmitLock(b,async()=>{
          try{
            await VigiaAPI.request(`/incidencias/${inc.id}/revisar`,{method:'PATCH',body:JSON.stringify({aprobar,motivo:m,sancionar:Boolean(sanc&&sanc.checked)})});
            showToast(aprobar?'Reporte aprobado':'Reporte rechazado'+(sanc&&sanc.checked?' y usuario sancionado':''));
            await cargar();await abrirDetalle(inc.id);
          }catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
        });
      };
      row.append(btn('btn-solid','bi-check-lg','Aprobar reporte',b=>revisar(true,b)),btn('btn-danger','bi-x-lg','Rechazar',b=>revisar(false,b)));
    }else if(e==='reportada'){
      title.textContent='Incidencia abierta';
      row.append(btn('btn-info','bi-hand-index-thumb','Tomar caso',b=>cambiarEstado(inc.id,'en_revision','',b)));
    }else if(e==='en_revision'){
      title.textContent=inc.asignadoA?`En progreso · a cargo de ${nombreDe(inc.asignadoA)}`:'En progreso';
      const c=document.createElement('textarea');c.className='form-control';c.rows=2;c.maxLength=255;c.placeholder='Cómo se resolvió (opcional)';box.appendChild(c);
      row.append(btn('btn-solid','bi-check2-circle','Marcar resuelta',b=>cambiarEstado(inc.id,'resuelta',c.value.trim(),b)),
                 btn('btn-caution','bi-arrow-counterclockwise','Devolver a abiertas',b=>cambiarEstado(inc.id,'reportada',c.value.trim(),b)));
    }else if(e==='resuelta'){
      title.textContent='Resuelta';
      row.append(btn('btn-solid','bi-archive','Cerrar incidencia',b=>cambiarEstado(inc.id,'cerrada','',b)),
                 btn('btn-caution','bi-arrow-counterclockwise','Reabrir',b=>cambiarEstado(inc.id,'en_revision','Reabierta',b)));
    }else if(e==='cerrada'){
      title.textContent='Cerrada';
      row.append(btn('btn-caution','bi-arrow-counterclockwise','Reabrir',b=>cambiarEstado(inc.id,'en_revision','Reabierta',b)));
    }else{
      title.textContent='Rechazada · no admite más cambios';
    }
    // Prioridad (solo mientras esta abierta)
    if(ABIERTAS.includes(e)&&e!=='pendiente_aprobacion'){
      const sel=document.createElement('select');sel.className='form-control';sel.style.cssText='width:auto;min-width:150px;margin:0;';
      sel.innerHTML=Object.entries(PRIO).map(([k,v])=>`<option value="${k}" ${k===inc.prioridad?'selected':''}>Prioridad ${v.label.toLowerCase()}</option>`).join('');
      sel.onchange=async()=>{
        try{await VigiaAPI.request(`/incidencias/${inc.id}`,{method:'PATCH',body:JSON.stringify({prioridad:sel.value})});showToast('Prioridad actualizada');await cargar();await abrirDetalle(inc.id)}
        catch(err){showToast(err.message,'bi-exclamation-triangle-fill');sel.value=inc.prioridad}
      };
      row.appendChild(sel);
    }
    box.appendChild(row);
  }
  function timeline(items){
    const box=$('igDTimeline');box.replaceChildren();
    if(!items.length){const p=document.createElement('p');p.textContent='Todavía no hay movimientos.';box.appendChild(p);return}
    items.forEach(s=>{
      const d=document.createElement('div');d.className='ig-tl';
      const quien=nombreDe(s.usuario)||'Sistema';
      const cambio=s.estado_anterior!==s.estado_nuevo;
      const head=cambio?`${(ESTADO[s.estado_anterior]||{label:'Nuevo'}).label} → ${(ESTADO[s.estado_nuevo]||{label:s.estado_nuevo}).label}`:'Nota';
      d.innerHTML=`<b>${escapeHtml(head)}</b>${s.comentario?` · ${escapeHtml(s.comentario)}`:''}<small>${escapeHtml(quien)} · ${cuando(s.fecha_hora)}</small>`;
      box.appendChild(d);
    });
  }
  async function abrirDetalle(id,enfocarMotivo){
    try{
      const r=await VigiaAPI.request(`/incidencias/${id}`);
      const inc=r.data;detail=inc;
      const est=ESTADO[inc.estado]||{label:inc.estado,cls:'neutral'},pr=PRIO[inc.prioridad]||PRIO.media;
      $('igDBadges').innerHTML=badge(est.label,est.cls)+badge('Prioridad '+pr.label.toLowerCase(),pr.cls)+badge((inc.tipoIncidencia&&inc.tipoIncidencia.nombre)||'Sin tipo','neutral');
      $('igDTitle').textContent=inc.titulo;
      $('igDMeta').textContent=`${fol(inc.id)} · reportada ${cuando(inc.fecha_hora)} · visibilidad: ${inc.visibilidad}`;
      $('igDDesc').textContent=inc.descripcion||'';
      $('igDWhere').textContent=`${inc.ubicacion||'Sin ubicación'}${inc.fecha_hora_hecho?' · ocurrió '+cuando(inc.fecha_hora_hecho):''}`;
      // Quien reporto
      const p=$('igDPerson');p.replaceChildren();
      const rep=r.reportante;
      const nom=document.createElement('b');nom.textContent=rep?nombreDe(rep):(nombreDe(inc.reportadoPor)||'Residente');p.appendChild(nom);
      if(rep&&rep.vivienda){const s=document.createElement('small');s.textContent=rep.vivienda;p.appendChild(s)}
      if(rep&&rep.telefono){const s=document.createElement('small');s.textContent='Tel. '+rep.telefono;p.appendChild(s)}
      if(rep&&rep.id!==session.id){
        const acts=document.createElement('div');acts.className='ig-person-actions';
        const m=document.createElement('a');m.className='btn btn-info btn-sm';m.href=`mensajeria.html?abrir_residente=${encodeURIComponent(rep.id)}`;m.innerHTML='<i class="bi bi-chat-dots-fill"></i> Mensaje';acts.appendChild(m);
        if(rep.telefono){const t=document.createElement('button');t.type='button';t.className='btn btn-ghost btn-sm';t.innerHTML='<i class="bi bi-telephone-fill"></i> Copiar tel.';
          t.onclick=async()=>{try{await navigator.clipboard.writeText(rep.telefono);showToast('Teléfono copiado')}catch(e){showToast('Tel. '+rep.telefono)}};acts.appendChild(t)}
        p.appendChild(acts);
      }
      // Evidencia
      const ev=(r.evidencias||[]).filter(x=>x.tipo_archivo==='imagen'&&x.url_archivo);
      $('igDEvidWrap').hidden=!ev.length;
      const eb=$('igDEvid');eb.replaceChildren();
      ev.forEach(x=>{const im=document.createElement('img');im.src=x.url_archivo;im.alt='Evidencia';im.onclick=()=>zoom(x.url_archivo);eb.appendChild(im)});
      $('igDRejectedWrap').hidden=inc.estado!=='rechazada'||!inc.motivo_rechazo;
      $('igDRejected').textContent=inc.motivo_rechazo||'';
      accionesDe(inc);
      timeline(r.seguimiento||[]);
      $('igDNote').value='';
      $('igDNoteBox').style.display=inc.estado==='rechazada'?'none':'flex';
      $('igDetail').classList.add('open');
      if(enfocarMotivo&&$('igDMotivo'))$('igDMotivo').focus();
    }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
  }
  $('igDClose').onclick=()=>$('igDetail').classList.remove('open');
  $('igDetail').onclick=e=>{if(e.target===$('igDetail'))$('igDetail').classList.remove('open')};
  $('igDNoteBtn').onclick=async()=>{
    const c=$('igDNote').value.trim();
    if(c.length<3){showToast('Escribe la nota.','bi-exclamation-triangle-fill');return}
    await withSubmitLock($('igDNoteBtn'),async()=>{
      try{await VigiaAPI.request(`/incidencias/${detail.id}/nota`,{method:'POST',body:JSON.stringify({comentario:c})});showToast('Nota agregada');await abrirDetalle(detail.id)}
      catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
    });
  };

  // ---------- reportar ----------
  const modal=$('igReport'),form=$('igReportForm'),desc=$('igRDesc');
  async function comprimir(file){
    const src=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file)});
    const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=src});
    const s=Math.min(1,1024/Math.max(img.width,img.height)),c=document.createElement('canvas');
    c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    return c.toDataURL('image/jpeg',.72);
  }
  function abrirReporte(pre){
    $('igRType').innerHTML=types.map(t=>`<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
    const otro=types.find(t=>t.nombre==='Otro');if(otro)$('igRType').value=otro.id;
    const ahora=new Date();ahora.setSeconds(0,0);
    const local=new Date(ahora.getTime()-ahora.getTimezoneOffset()*60000).toISOString().slice(0,16);
    $('igRWhen').max=local;$('igRWhen').value=local;
    $('igRPhotoLabel').textContent=esGuardia?'Evidencia fotográfica (obligatoria)':'Evidencia fotográfica (opcional)';
    if(pre){$('igRTitle').value=(pre.titulo||'').slice(0,80);desc.value=(pre.descripcion||'').slice(0,350);$('igRCount').textContent=desc.value.length+'/350'}
    modal.classList.add('open');$('igRTitle').focus();
  }
  function cerrarReporte(){modal.classList.remove('open');form.reset();photoData='';$('igRPhotoWrap').hidden=true;$('igRCount').textContent='0/350'}
  $('igNew').onclick=()=>abrirReporte();
  $('igRCancel').onclick=cerrarReporte;
  modal.onclick=e=>{if(e.target===modal)cerrarReporte()};
  desc.addEventListener('input',()=>{$('igRCount').textContent=desc.value.length+'/350'});
  $('igRPhoto').onchange=async e=>{
    try{photoData=await comprimir(e.target.files[0]);$('igRPhotoImg').src=photoData;$('igRPhotoWrap').hidden=!photoData}
    catch(err){photoData='';e.target.value='';$('igRPhotoWrap').hidden=true;showToast('No se pudo leer esa imagen. Prueba con otra foto.','bi-exclamation-triangle-fill')}
  };
  form.onsubmit=async e=>{
    e.preventDefault();
    const titulo=$('igRTitle').value.trim(),d=desc.value.trim(),ub=$('igRWhere').value.trim(),cuandoV=$('igRWhen').value;
    if(titulo.length<3||d.length<3){showToast('El título y la descripción necesitan al menos 3 caracteres.','bi-exclamation-triangle-fill');return}
    if(!ub){showToast('Escribe la ubicación exacta.','bi-exclamation-triangle-fill');return}
    if(!cuandoV){showToast('Indica cuándo ocurrió.','bi-exclamation-triangle-fill');return}
    if(esGuardia&&!photoData){showToast('Adjunta una fotografía como evidencia.','bi-exclamation-triangle-fill');return}
    const body={tipo_incidencia_id:Number($('igRType').value)||null,titulo,descripcion:d,ubicacion:ub,fecha_hora_hecho:new Date(cuandoV).toISOString(),visibilidad:$('igRVis').value,evidencia_url:photoData||null,evidencia_tipo:'imagen'};
    if($('igRPriority').value)body.prioridad=$('igRPriority').value;
    await withSubmitLock(form.querySelector('button[type=submit]'),async()=>{
      try{await VigiaAPI.request('/incidencias',{method:'POST',body:JSON.stringify(body)});showToast('Incidencia registrada');cerrarReporte();await cargar()}
      catch(err){showToast(err.message,'bi-exclamation-triangle-fill')}
    },'<i class="bi bi-arrow-repeat"></i> Enviando...');
  };

  // ---------- filtros ----------
  document.querySelectorAll('#igTabs button,#igSummary .ig-stat').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;render()}));
  $('igSearch').addEventListener('input',e=>{query=e.target.value.trim();render()});
  $('igPriority').addEventListener('change',e=>{prio=e.target.value;render()});
  $('igMine').addEventListener('change',e=>{mine=e.target.checked;render()});
  $('igRefresh').addEventListener('click',cargar);
  window.addEventListener('keydown',e=>{if(e.key==='Escape'){$('igDetail').classList.remove('open');if(modal.classList.contains('open'))cerrarReporte()}});

  // ---------- entrada desde otras pantallas ----------
  // ?inc=ID (notificaciones) abre el detalle; ?desde_comunidad=... (boton
  // "Marcar como incidencia" de Comunidad) abre el reporte ya prellenado.
  cargar().then(()=>{
    const p=new URLSearchParams(location.search);
    if(p.get('inc'))abrirDetalle(p.get('inc'));
    else if(p.get('desde_comunidad'))abrirReporte({titulo:p.get('titulo')||'',descripcion:p.get('descripcion')||''});
    if([...p.keys()].length)history.replaceState(null,'',location.pathname);
  });
  setInterval(()=>{if(!document.hidden&&!$('igDetail').classList.contains('open')&&!modal.classList.contains('open'))cargar()},30000);
})();
