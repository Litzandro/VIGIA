(function(){
  'use strict';
  const session=VigiaAPI.getSession();
  if(!session||!['guardia','admin','superadmin'].includes(session.rol_codigo)){
    location.replace(session?VigiaAPI.destinationForRole(session.rol_codigo):'guardia-login.html');return;
  }

  const $=(id)=>document.getElementById(id);
  const state={summary:null,alerts:[],insideFilter:'all',insideQuery:'',knownActiveIds:null,loading:false};
  const STATUS_LABEL={activa:'Pendiente',atendida:'Atendida',falsa_alarma:'Falsa alarma'};
  const STATUS_CLASS={activa:'alert',atendida:'ok',falsa_alarma:'neutral'};

  function clear(el){while(el&&el.firstChild)el.removeChild(el.firstChild)}
  function text(tag,value,cls){const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=value??'';return e}
  function empty(el,msg){clear(el);el.appendChild(text('div',msg,'empty-state'))}
  function fmtDate(v){const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('es-HN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:true})}
  function elapsed(v){const ms=Math.max(0,Date.now()-new Date(v).getTime()),min=Math.floor(ms/60000);if(min<60)return `${min} min`;const h=Math.floor(min/60),m=min%60;return `${h} h ${m} min`}
  function icon(name){const i=document.createElement('i');i.className=`bi ${name}`;return i}

  async function checkConnection(){
    const el=$('guardConnection');
    try{await VigiaAPI.request('/health',{offline:false});el.classList.remove('offline');el.classList.add('online');el.lastElementChild.textContent='En línea';}
    catch(e){el.classList.remove('online');el.classList.add('offline');el.lastElementChild.textContent='Sin conexión';}
  }

  function renderShift(turno){
    const line=$('guardShiftLine'),btn=$('guardShiftAction');
    if(!turno){line.textContent='Sin turno programado activo';btn.hidden=true;return;}
    const start=fmtDate(turno.inicio_real||turno.inicio_programado),end=fmtDate(turno.fin_programado);
    line.textContent=`${turno.estado==='activo'?'Turno activo':turno.estado==='relevado'?'Turno relevado':'Turno programado'} · ${start}${end?' — '+end:''}`;
    if(session.rol_codigo!=='guardia'){btn.hidden=true;return;}
    btn.hidden=false;
    if(turno.estado==='programado'){btn.className='btn btn-solid';btn.dataset.action='iniciar';btn.replaceChildren(icon('bi-play-fill'),document.createTextNode(' Iniciar turno'));}
    else if(['activo','relevado'].includes(turno.estado)){btn.className='btn btn-danger';btn.dataset.action='finalizar';btn.replaceChildren(icon('bi-stop-fill'),document.createTextNode(' Finalizar turno'));}
    else btn.hidden=true;
  }

  async function shiftAction(){
    const turno=state.summary&&state.summary.turno_actual,btn=$('guardShiftAction');if(!turno||!btn.dataset.action)return;
    const action=btn.dataset.action;
    const ok=await VigiaConfirm({title:action==='iniciar'?'¿Iniciar tu turno?':'¿Finalizar tu turno?',message:action==='iniciar'?'Se registrará la hora real de inicio.':'Se registrará la hora real de cierre del turno.',confirmText:action==='iniciar'?'Iniciar turno':'Finalizar turno',icon:action==='iniciar'?'bi-play-circle-fill':'bi-stop-circle-fill'});
    if(!ok)return;
    btn.disabled=true;
    try{await VigiaAPI.request(`/turnos-guardia/${turno.id}/accion`,{method:'PATCH',body:JSON.stringify({accion:action})});showToast(action==='iniciar'?'Turno iniciado':'Turno finalizado');await loadSummary();}
    catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}finally{btn.disabled=false}
  }

  function renderKPIs(d){const m=d.metricas||{};const dentro=(d.en_sitio||[]).reduce((n,x)=>n+(x.cantidad||1),0);$('gInside').textContent=dentro;$('gQueue').textContent=m.cola_activa||0;if(!state.alertsLoaded)$('gSOS').textContent=m.alertas_sos||0;$('gIncidents').textContent=m.incidencias_abiertas||0;const lbl=$('gIncidents').nextElementSibling;if(lbl)lbl.textContent=m.incidencias_por_aprobar?`Incidencias abiertas · ${m.incidencias_por_aprobar} por aprobar`:'Incidencias abiertas';$('gEntries').textContent=m.entradas_hoy||0;$('gExits').textContent=m.salidas_hoy||0;}

  function insideMatches(x){
    const q=state.insideQuery.toLowerCase();
    if(q&&!`${x.nombre||''} ${x.telefono||''} ${x.placa||''} ${x.vivienda||''} ${x.punto||''}`.toLowerCase().includes(q))return false;
    const hours=(Date.now()-new Date(x.fecha_entrada).getTime())/3600000;
    if(state.insideFilter==='recent'&&hours>=1)return false;
    if(state.insideFilter==='long'&&hours<2)return false;
    return true;
  }

  function insideRow(x){
    const row=document.createElement('article');row.className='guard-inside-row';
    const avatar=document.createElement('div');avatar.className='guard-person-avatar';avatar.appendChild(icon('bi-person-fill'));
    const copy=document.createElement('div');copy.className='guard-inside-copy';copy.appendChild(text('b',x.nombre||'Visitante'));
    const details=[];if(x.es_evento)details.push(`Evento · ${x.cantidad} ${x.cantidad===1?'persona dentro':'personas dentro'}`);if(x.vivienda)details.push(x.vivienda);if(x.placa)details.push(x.placa);if(x.punto)details.push(x.punto);copy.appendChild(text('span',details.join(' · ')||'Sin detalles adicionales'));
    const time=document.createElement('div');time.className='guard-inside-time';const hours=(Date.now()-new Date(x.fecha_entrada).getTime())/3600000;time.append(text('b',elapsed(x.fecha_entrada)),text('span',hours>=4?'Permanencia prolongada · revisar':`Entrada ${fmtDate(x.fecha_entrada)}`));if(hours>=4)row.classList.add('long-stay');
    const actions=document.createElement('div');actions.className='guard-inside-actions';
    if(x.residente_id){const msg=document.createElement('a');msg.className='btn btn-info';msg.href=`mensajeria.html?abrir_residente=${encodeURIComponent(x.residente_id)}`;msg.title='Contactar residente';msg.appendChild(icon('bi-chat-dots'));actions.appendChild(msg)}
    if(x.telefono){const phone=document.createElement('button');phone.type='button';phone.className='btn btn-info';phone.title='Copiar teléfono';phone.appendChild(icon('bi-telephone'));phone.onclick=async()=>{try{await navigator.clipboard.writeText(x.telefono);showToast(`Teléfono copiado: ${x.telefono}`)}catch(e){showToast(`Teléfono: ${x.telefono}`)}};actions.appendChild(phone)}
    const action=document.createElement('button');action.type='button';action.className='btn btn-caution guard-exit-btn';action.append(icon('bi-box-arrow-right'),document.createTextNode(x.es_evento?' Salió 1':' Registrar salida'));action.addEventListener('click',()=>registerExit(x,action,1));actions.appendChild(action);if(x.es_evento&&x.cantidad>1){const all=document.createElement('button');all.type='button';all.className='btn btn-caution guard-exit-btn';all.append(icon('bi-people-fill'),document.createTextNode(` Salieron todos (${x.cantidad})`));all.addEventListener('click',()=>registerExit(x,all,x.cantidad));actions.appendChild(all)}
    row.append(avatar,copy,time,actions);return row;
  }

  function renderInside(){
    const list=$('insideList'),all=(state.summary&&state.summary.en_sitio)||[],rows=all.filter(insideMatches);clear(list);rows.forEach(x=>list.appendChild(insideRow(x)));if(!rows.length)empty(list,state.insideQuery||state.insideFilter!=='all'?'No hay coincidencias con este filtro.':'No hay visitantes registrados dentro.');$('insideCount').textContent=`${all.reduce((n,x)=>n+(x.cantidad||1),0)} DENTRO`;
  }

  async function registerExit(x,btn,cantidad){
    const n=cantidad||1;
    const ok=await VigiaConfirm({title:'¿Registrar salida?',message:x.es_evento?`Se registrará la salida de ${n} ${n===1?'persona':'personas'} de «${x.nombre}».`:`Se marcará la salida de ${x.nombre||'esta persona'}.`,confirmText:'Registrar salida',icon:'bi-box-arrow-right',tone:'warn'});if(!ok)return;
    btn.disabled=true;
    try{await VigiaAPI.request(`/centro-seguridad/salida/${x.entrada_id}`,{method:'POST',body:JSON.stringify(x.es_evento?{cantidad:n}:{})});showToast('Salida registrada correctamente');await loadSummary();}
    catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}finally{btn.disabled=false}
  }

  function compactRow(title,sub,badge,cls){const row=document.createElement('div');row.className='guard-compact-row';const c=document.createElement('div');c.append(text('b',title),text('span',sub));const b=text('span',badge,`badge ${cls||'neutral'}`);row.append(c,b);return row}
  function renderQueue(d){const list=$('guardQueueList'),rows=d.cola||[];clear(list);rows.slice(0,6).forEach(x=>{const cls=['rechazada','bloqueada'].includes(x.estado)?'alert':x.estado==='esperando'?'warn':'info';list.appendChild(compactRow(x.nombre_persona||'Persona en garita',`${x.vivienda_destino||'Destino no indicado'} · ${fmtDate(x.fecha_llegada)}`,String(x.estado||'').replace('_',' '),cls))});if(!rows.length)empty(list,'No hay personas esperando validación.');}
  function renderIncidents(d){
    const list=$('guardIncidentList'),rows=d.incidencias||[];clear(list);
    const LABEL={urgente:'Urgente',alta:'Alta',media:'Media',baja:'Baja'};
    rows.slice(0,6).forEach(x=>{
      const pend=x.estado==='pendiente_aprobacion',p=pend?'por aprobar':(LABEL[x.prioridad]||x.prioridad||'—').toLowerCase(),cls=pend?'warn':x.prioridad==='urgente'?'alert':x.prioridad==='alta'?'warn':'info';
      const row=document.createElement('a');row.className='guard-compact-row guard-compact-link';row.href=`incidencias-gestion.html?inc=${encodeURIComponent(x.id)}`;
      const c=document.createElement('div');c.append(text('b',x.titulo||`Incidencia #${x.id}`),text('span',`${x.ubicacion||'Sin ubicación'} · ${fmtDate(x.fecha_hora)}`));
      row.append(c,text('span',p,`badge ${cls}`));list.appendChild(row);
    });
    if(!rows.length)empty(list,'No hay incidencias abiertas.');
  }

  function beep(){try{const C=window.AudioContext||window.webkitAudioContext,c=new C(),now=c.currentTime;[0,.28].forEach(o=>{const osc=c.createOscillator(),g=c.createGain();osc.frequency.value=880;g.gain.setValueAtTime(0,now+o);g.gain.linearRampToValueAtTime(.25,now+o+.02);g.gain.linearRampToValueAtTime(0,now+o+.22);osc.connect(g);g.connect(c.destination);osc.start(now+o);osc.stop(now+o+.25)})}catch(e){}}
  function notifyNew(a){beep();if('Notification'in window&&Notification.permission==='granted'){const n=new Notification('VIGIA · SOS activo',{body:`${a.usuario_nombre||'Residente'}${a.vivienda?' · '+a.vivienda:''}`,tag:`vigia-sos-${a.id}`,requireInteraction:true});n.onclick=()=>{window.focus();$('sosSection').scrollIntoView({behavior:'smooth'});n.close()}}}

  // ---------- SOS ----------
  // Antes: cada alerta activa era una tarjeta igual, sin importar si tenia 2
  // minutos o 3 dias; la misma persona podia tener 3 tarjetas por pulsar el
  // boton varias veces; y "Atender" mandaba un PATCH generico con la hora y
  // el id armados en el navegador. Ahora:
  //  - se separan las FRESCAS (menos de 2 h) de las ANTIGUAS, que casi
  //    siempre son pruebas o casos olvidados y se cierran juntas;
  //  - las repetidas de una misma persona se agrupan en una tarjeta;
  //  - atender usa PATCH /alertas-panico/:id/atender (lo registra el servidor).
  const STALE_MS=2*3600000;
  async function closeAlerts(ids,status,btn,okMsg){
    if(btn)btn.disabled=true;
    try{
      if(ids.length===1)await VigiaAPI.request(`/alertas-panico/${ids[0]}/atender`,{method:'PATCH',body:JSON.stringify({estado:status}),offline:false});
      else await VigiaAPI.request('/alertas-panico/atender-lote',{method:'PATCH',body:JSON.stringify({estado:status,ids}),offline:false});
      showToast(okMsg);
    }catch(e){
      showToast(e.message,'bi-exclamation-triangle-fill');
    }finally{
      // Se recarga siempre: si otro guardia ya la cerro (409) o hubo un error, la lista queda al dia.
      await Promise.all([loadAlerts(),loadSummary()]);
      if(btn)btn.disabled=false;
    }
  }
  function ago(v){const m=Math.max(0,Math.floor((Date.now()-new Date(v).getTime())/60000));if(m<1)return 'ahora mismo';if(m<60)return `hace ${m} min`;const h=Math.floor(m/60);if(h<24)return `hace ${h} h`;const d=Math.floor(h/24);return `hace ${d} ${d===1?'día':'días'}`}
  function alertBtn(cls,ico,label,fn){const b=document.createElement('button');b.type='button';b.className='btn '+cls;b.append(icon(ico),document.createTextNode(' '+label));b.onclick=()=>fn(b);return b}
  function panicCard(g){
    const a=g.items[0],ids=g.items.map(x=>x.id),active=a.estado==='activa';
    const card=document.createElement('article');card.className=`guard-sos-card ${active?'active':''}`;
    const top=document.createElement('div');top.className='guard-sos-card-top';
    const who=document.createElement('div');who.className='guard-sos-who';
    const ico=document.createElement('span');ico.appendChild(icon('bi-exclamation-octagon-fill'));
    const cp=document.createElement('div');
    const title=text('b',a.usuario_nombre||'Residente');
    if(g.items.length>1)title.appendChild(text('span',` ×${g.items.length}`,'guard-sos-count'));
    const waiting=Date.now()-new Date(g.items[g.items.length-1].fecha_hora).getTime();
    cp.append(title,text('span',`${a.vivienda||'Ubicación sin especificar'} · ${a.tipo_alerta_nombre||'SOS'} · ${ago(a.fecha_hora)}`));
    who.append(ico,cp);
    const badge=active?(waiting>5*60000?'Sin atender':'Pendiente'):(STATUS_LABEL[a.estado]||a.estado);
    top.append(who,text('span',badge,`badge ${STATUS_CLASS[a.estado]||'neutral'}`));card.appendChild(top);
    if(active){
      const actions=document.createElement('div');actions.className='guard-sos-actions';
      actions.appendChild(alertBtn('btn-solid','bi-check2-circle',g.items.length>1?`Atender (${g.items.length})`:'Atender',b=>closeAlerts(ids,'atendida',b,g.items.length>1?'Alertas atendidas':'Alerta atendida')));
      actions.appendChild(alertBtn('btn-caution','bi-x-circle','Falsa alarma',async b=>{
        const ok=await VigiaConfirm({title:'¿Marcar como falsa alarma?',message:`Se cerrará la alerta de ${a.usuario_nombre||'este residente'} y se le avisará. Úsalo solo si confirmaste que no hay emergencia.`,confirmText:'Marcar falsa alarma',icon:'bi-x-circle'});
        if(ok)closeAlerts(ids,'falsa_alarma',b,'Marcada como falsa alarma');
      }));
      if(a.usuario_telefono)actions.appendChild(alertBtn('btn-info','bi-telephone-fill','Teléfono',async()=>{try{await navigator.clipboard.writeText(a.usuario_telefono);showToast(`Teléfono copiado: ${a.usuario_telefono}`)}catch(e){showToast(`Teléfono: ${a.usuario_telefono}`)}}));
      if(a.usuario_id){const msg=document.createElement('a');msg.className='btn btn-info';msg.href=`mensajeria.html?abrir_residente=${encodeURIComponent(a.usuario_id)}`;msg.append(icon('bi-chat-dots-fill'),document.createTextNode(' Mensaje'));actions.appendChild(msg)}
      card.appendChild(actions);
    }
    return card;
  }
  function groupAlerts(list){
    const map=new Map();
    list.forEach(a=>{const k=`${a.usuario_id}|${a.tipo_alerta_id}`;if(!map.has(k))map.set(k,{items:[]});map.get(k).items.push(a)});
    return [...map.values()];
  }
  function renderAlerts(){
    const list=$('guardPanicList');
    const active=state.alerts.filter(a=>a.estado==='activa');
    const fresh=active.filter(a=>Date.now()-new Date(a.fecha_hora).getTime()<STALE_MS);
    const stale=active.filter(a=>Date.now()-new Date(a.fecha_hora).getTime()>=STALE_MS);
    const today=state.alerts.filter(a=>a.estado!=='activa'&&new Date(a.fecha_atencion||a.fecha_hora).toDateString()===new Date().toDateString()).slice(0,4);
    clear(list);
    groupAlerts(fresh).forEach(g=>list.appendChild(panicCard(g)));
    if(stale.length){
      const box=document.createElement('article');box.className='guard-sos-card stale';
      const head=document.createElement('div');head.className='guard-sos-card-top';
      const who=document.createElement('div');who.className='guard-sos-who';
      const ico=document.createElement('span');ico.appendChild(icon('bi-clock-history'));
      const cp=document.createElement('div');
      cp.append(text('b',`${stale.length} alerta${stale.length===1?'':'s'} antigua${stale.length===1?'':'s'} sin cerrar`),text('span',`La más vieja es ${ago(stale[stale.length-1].fecha_hora)}. Suelen ser pruebas o casos que ya nadie atiende.`));
      who.append(ico,cp);
      head.append(who,text('span','Revisar','badge warn'));box.appendChild(head);
      const acts=document.createElement('div');acts.className='guard-sos-actions';
      acts.appendChild(alertBtn('btn-caution','bi-x-circle',`Cerrar las ${stale.length} como falsa alarma`,async b=>{
        const ok=await VigiaConfirm({title:'¿Cerrar alertas antiguas?',message:`Se cerrarán ${stale.length} alertas activas de hace más de 2 horas como falsa alarma. Si alguna era real, ya pasó el momento de atenderla.`,confirmText:'Cerrar todas',icon:'bi-x-circle'});
        if(ok)closeAlerts(stale.map(a=>a.id),'falsa_alarma',b,'Alertas antiguas cerradas');
      }));
      const det=alertBtn('btn-ghost','bi-list-ul','Ver una por una',()=>{const open=box.classList.toggle('open');det.lastChild.textContent=open?' Ocultar':' Ver una por una'});
      acts.appendChild(det);box.appendChild(acts);
      const inner=document.createElement('div');inner.className='guard-sos-stale-list';
      groupAlerts(stale).forEach(g=>inner.appendChild(panicCard(g)));box.appendChild(inner);
      list.appendChild(box);
    }
    today.forEach(a=>list.appendChild(panicCard({items:[a]})));
    const total=fresh.length+stale.length;
    $('guardPanicEmptyMsg').style.display=list.children.length?'none':'';
    $('sosUpdated').textContent=`Actualizado ${new Date().toLocaleTimeString('es-HN',{hour:'2-digit',minute:'2-digit',hour12:true})}`;
    // Banner y contador salen de la MISMA lista que se muestra (antes venian
    // de otra consulta y podian no coincidir con las tarjetas).
    state.alertsLoaded=true;
    $('gSOS').textContent=total;
    const banner=$('guardSosBanner');banner.hidden=!total;
    banner.classList.toggle('stale-only',total>0&&!fresh.length);
    $('guardSosTitle').textContent=fresh.length?(fresh.length===1?'1 alerta SOS activa':`${fresh.length} alertas SOS activas`):`${stale.length} alerta${stale.length===1?'':'s'} SOS antigua${stale.length===1?'':'s'} sin cerrar`;
    $('guardSosText').textContent=fresh.length?'Atención inmediata requerida en la residencial.':'Ciérralas o atiéndelas para que no tapen una emergencia nueva.';
  }
  // Bug real (encontrado comparando el resumen del superadmin contra este
  // panel): el resumen (/centro-seguridad/resumen) cuenta TODAS las
  // alertas activas sin limite, pero este panel pedia solo las 100 mas
  // RECIENTES sin filtrar por estado -- en una residencial con mucho
  // historial de pruebas, 100 alertas ya cerradas mas nuevas podian
  // desplazar fuera de esa ventana a una activa mas vieja, y esta
  // pantalla la mostraba como si no existiera ("0 SOS activos") mientras
  // el resumen si la contaba. Ahora se piden las activas aparte, sin
  // depender de que quepan dentro de las ultimas 100 en general -- el
  // segundo pedido (las mas recientes de cualquier estado) sigue
  // existiendo solo para mostrar las "cerradas hoy".
  async function loadAlerts(){
    try{
      const [activasR,recientesR]=await Promise.all([
        VigiaAPI.request('/alertas-panico?estado=activa&limit=100&sort=fecha_hora:desc',{offline:false}),
        VigiaAPI.request('/alertas-panico?limit=30&sort=fecha_hora:desc',{offline:false}),
      ]);
      const activas=activasR.data||[],recientes=recientesR.data||[];
      const vistos=new Set(activas.map(a=>a.id));
      state.alerts=[...activas,...recientes.filter(a=>!vistos.has(a.id))];
      if(state.knownActiveIds!==null)activas.filter(a=>!state.knownActiveIds.has(a.id)).forEach(notifyNew);
      state.knownActiveIds=new Set(activas.map(a=>a.id));
      renderAlerts();
    }catch(e){empty($('guardPanicList'),e.message)}
  }

  async function loadSummary(){try{const r=await VigiaAPI.request('/centro-seguridad/resumen',{offline:false});state.summary=r.data||{};renderKPIs(state.summary);renderShift(state.summary.turno_actual);renderInside();renderQueue(state.summary);renderIncidents(state.summary);}catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}}
  async function refreshAll(){if(state.loading)return;state.loading=true;$('guardRefresh').disabled=true;try{await Promise.all([loadSummary(),loadAlerts(),checkConnection()]);}finally{state.loading=false;$('guardRefresh').disabled=false}}

  $('insideSearch').addEventListener('input',e=>{state.insideQuery=e.target.value.trim();renderInside()});
  $('insideFilters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;state.insideFilter=b.dataset.filter;document.querySelectorAll('#insideFilters .guard-filter').forEach(x=>x.classList.toggle('active',x===b));renderInside()});
  document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.jump).scrollIntoView({behavior:'smooth',block:'start'})));
  $('guardFocusSOS').addEventListener('click',()=>$('sosSection').scrollIntoView({behavior:'smooth'}));
  $('guardRefresh').addEventListener('click',refreshAll);$('guardShiftAction').addEventListener('click',shiftAction);
  if('Notification'in window&&Notification.permission==='default')Notification.requestPermission().catch(()=>{});
  refreshAll();setInterval(()=>{loadSummary();loadAlerts();checkConnection()},20000);
})();
