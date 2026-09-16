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
  function fmtDate(v){const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('es-HN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
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
    if(turno.estado==='programado'){btn.dataset.action='iniciar';btn.replaceChildren(icon('bi-play-fill'),document.createTextNode(' Iniciar turno'));}
    else if(['activo','relevado'].includes(turno.estado)){btn.dataset.action='finalizar';btn.replaceChildren(icon('bi-stop-fill'),document.createTextNode(' Finalizar turno'));}
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

  function renderKPIs(d){const m=d.metricas||{};$('gInside').textContent=(d.en_sitio||[]).length;$('gQueue').textContent=m.cola_activa||0;$('gSOS').textContent=m.alertas_sos||0;$('gIncidents').textContent=m.incidencias_abiertas||0;$('gEntries').textContent=m.entradas_hoy||0;$('gExits').textContent=m.salidas_hoy||0;const active=m.alertas_sos||0;$('guardSosBanner').hidden=!active;$('guardSosTitle').textContent=active===1?'1 alerta SOS activa':`${active} alertas SOS activas`;$('guardSosText').textContent='Atención inmediata requerida en la residencial.';}

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
    const details=[];if(x.vivienda)details.push(x.vivienda);if(x.placa)details.push(x.placa);if(x.punto)details.push(x.punto);copy.appendChild(text('span',details.join(' · ')||'Sin detalles adicionales'));
    const time=document.createElement('div');time.className='guard-inside-time';const hours=(Date.now()-new Date(x.fecha_entrada).getTime())/3600000;time.append(text('b',elapsed(x.fecha_entrada)),text('span',hours>=4?'Permanencia prolongada · revisar':`Entrada ${fmtDate(x.fecha_entrada)}`));if(hours>=4)row.classList.add('long-stay');
    const actions=document.createElement('div');actions.className='guard-inside-actions';
    if(x.residente_id){const msg=document.createElement('a');msg.className='btn btn-ghost';msg.href=`mensajeria.html?abrir_residente=${encodeURIComponent(x.residente_id)}`;msg.title='Contactar residente';msg.appendChild(icon('bi-chat-dots'));actions.appendChild(msg)}
    if(x.telefono){const phone=document.createElement('button');phone.type='button';phone.className='btn btn-ghost';phone.title='Copiar teléfono';phone.appendChild(icon('bi-telephone'));phone.onclick=async()=>{try{await navigator.clipboard.writeText(x.telefono);showToast(`Teléfono copiado: ${x.telefono}`)}catch(e){showToast(`Teléfono: ${x.telefono}`)}};actions.appendChild(phone)}
    const action=document.createElement('button');action.type='button';action.className='btn btn-solid guard-exit-btn';action.append(icon('bi-box-arrow-right'),document.createTextNode(' Registrar salida'));action.addEventListener('click',()=>registerExit(x,action));actions.appendChild(action);
    row.append(avatar,copy,time,actions);return row;
  }

  function renderInside(){
    const list=$('insideList'),all=(state.summary&&state.summary.en_sitio)||[],rows=all.filter(insideMatches);clear(list);rows.forEach(x=>list.appendChild(insideRow(x)));if(!rows.length)empty(list,state.insideQuery||state.insideFilter!=='all'?'No hay coincidencias con este filtro.':'No hay visitantes registrados dentro.');$('insideCount').textContent=`${all.length} DENTRO`;
  }

  async function registerExit(x,btn){
    const ok=await VigiaConfirm({title:'¿Registrar salida?',message:`Se marcará la salida de ${x.nombre||'esta persona'}.`,confirmText:'Registrar salida',icon:'bi-box-arrow-right'});if(!ok)return;
    btn.disabled=true;
    try{await VigiaAPI.request(`/centro-seguridad/salida/${x.entrada_id}`,{method:'POST',body:JSON.stringify({})});showToast('Salida registrada correctamente');await loadSummary();}
    catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}finally{btn.disabled=false}
  }

  function compactRow(title,sub,badge,cls){const row=document.createElement('div');row.className='guard-compact-row';const c=document.createElement('div');c.append(text('b',title),text('span',sub));const b=text('span',badge,`badge ${cls||'neutral'}`);row.append(c,b);return row}
  function renderQueue(d){const list=$('guardQueueList'),rows=d.cola||[];clear(list);rows.slice(0,6).forEach(x=>{const cls=['rechazada','bloqueada'].includes(x.estado)?'alert':x.estado==='esperando'?'warn':'info';list.appendChild(compactRow(x.nombre_persona||'Persona en garita',`${x.vivienda_destino||'Destino no indicado'} · ${fmtDate(x.fecha_llegada)}`,String(x.estado||'').replace('_',' '),cls))});if(!rows.length)empty(list,'No hay personas esperando validación.');}
  function renderIncidents(d){const list=$('guardIncidentList'),rows=d.incidencias||[];clear(list);rows.slice(0,6).forEach(x=>{const p=x.prioridad||x.estado||'pendiente',cls=p==='urgente'?'alert':p==='alta'?'warn':'info';list.appendChild(compactRow(x.titulo||`Incidencia #${x.id}`,`${x.ubicacion||'Sin ubicación'} · ${fmtDate(x.fecha_hora)}`,p,cls))});if(!rows.length)empty(list,'No hay incidencias abiertas.');}

  function beep(){try{const C=window.AudioContext||window.webkitAudioContext,c=new C(),now=c.currentTime;[0,.28].forEach(o=>{const osc=c.createOscillator(),g=c.createGain();osc.frequency.value=880;g.gain.setValueAtTime(0,now+o);g.gain.linearRampToValueAtTime(.25,now+o+.02);g.gain.linearRampToValueAtTime(0,now+o+.22);osc.connect(g);g.connect(c.destination);osc.start(now+o);osc.stop(now+o+.25)})}catch(e){}}
  function notifyNew(a){beep();if('Notification'in window&&Notification.permission==='granted'){const n=new Notification('VIGIA · SOS activo',{body:`${a.usuario_nombre||'Residente'}${a.vivienda?' · '+a.vivienda:''}`,tag:`vigia-sos-${a.id}`,requireInteraction:true});n.onclick=()=>{window.focus();$('sosSection').scrollIntoView({behavior:'smooth'});n.close()}}}

  async function alertAction(a,status,btn){btn.disabled=true;try{await VigiaAPI.request(`/alertas-panico/${a.id}`,{method:'PATCH',body:JSON.stringify({estado:status,atendida_por:session.id,fecha_atencion:new Date().toISOString()})});showToast(status==='atendida'?'Alerta atendida':'Marcada como falsa alarma');await Promise.all([loadAlerts(),loadSummary()]);}catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}finally{btn.disabled=false}}
  function panicCard(a){
    const card=document.createElement('article');card.className=`guard-sos-card ${a.estado==='activa'?'active':''}`;
    const top=document.createElement('div');top.className='guard-sos-card-top';const who=document.createElement('div');who.className='guard-sos-who';const ico=document.createElement('span');ico.appendChild(icon('bi-exclamation-octagon-fill'));const cp=document.createElement('div');cp.append(text('b',a.usuario_nombre||'Residente'),text('span',`${a.vivienda||'Ubicación sin especificar'} · ${a.tipo_alerta_nombre||'SOS'} · ${fmtDate(a.fecha_hora)}`));who.append(ico,cp);top.append(who,text('span',STATUS_LABEL[a.estado]||a.estado,`badge ${STATUS_CLASS[a.estado]||'neutral'}`));card.appendChild(top);
    if(a.estado==='activa'){
      const actions=document.createElement('div');actions.className='guard-sos-actions';
      const attend=document.createElement('button');attend.type='button';attend.className='btn btn-solid';attend.append(icon('bi-check2-circle'),document.createTextNode(' Atender'));attend.onclick=()=>alertAction(a,'atendida',attend);actions.appendChild(attend);
      const falseBtn=document.createElement('button');falseBtn.type='button';falseBtn.className='btn btn-ghost';falseBtn.append(icon('bi-x-circle'),document.createTextNode(' Falsa alarma'));falseBtn.onclick=()=>alertAction(a,'falsa_alarma',falseBtn);actions.appendChild(falseBtn);
      if(a.usuario_telefono){const phone=document.createElement('button');phone.type='button';phone.className='btn btn-ghost';phone.append(icon('bi-telephone-fill'),document.createTextNode(' Teléfono'));phone.onclick=async()=>{try{await navigator.clipboard.writeText(a.usuario_telefono);showToast(`Teléfono copiado: ${a.usuario_telefono}`)}catch(e){showToast(`Teléfono: ${a.usuario_telefono}`)}};actions.appendChild(phone)}
      if(a.usuario_id){const msg=document.createElement('a');msg.className='btn btn-ghost';msg.href=`mensajeria.html?abrir_residente=${encodeURIComponent(a.usuario_id)}`;msg.append(icon('bi-chat-dots-fill'),document.createTextNode(' Mensaje'));actions.appendChild(msg)}
      card.appendChild(actions);
    }
    return card;
  }
  function renderAlerts(){const list=$('guardPanicList'),active=state.alerts.filter(a=>a.estado==='activa'),today=state.alerts.filter(a=>a.estado!=='activa'&&new Date(a.fecha_atencion||a.fecha_hora).toDateString()===new Date().toDateString()),rows=[...active,...today.slice(0,4)];clear(list);rows.forEach(a=>list.appendChild(panicCard(a)));$('guardPanicEmptyMsg').style.display=rows.length?'none':'';$('sosUpdated').textContent=`Actualizado ${new Date().toLocaleTimeString('es-HN',{hour:'2-digit',minute:'2-digit'})}`;}
  async function loadAlerts(){try{const r=await VigiaAPI.request('/alertas-panico?limit=100&sort=fecha_hora:desc',{offline:false});state.alerts=r.data||[];const active=state.alerts.filter(a=>a.estado==='activa');if(state.knownActiveIds!==null)active.filter(a=>!state.knownActiveIds.has(a.id)).forEach(notifyNew);state.knownActiveIds=new Set(active.map(a=>a.id));renderAlerts();}catch(e){empty($('guardPanicList'),e.message)}}

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
