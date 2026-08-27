(function(){
  const session=VigiaAPI.getSession();
  if(!session||!['guardia','admin','superadmin'].includes(session.rol_codigo)){location.replace(VigiaAPI.destinationForRole(session&&session.rol_codigo));return;}
  const $=(id)=>document.getElementById(id);
  function clear(el){while(el.firstChild)el.removeChild(el.firstChild)}
  function empty(el,text){clear(el);const d=document.createElement('div');d.className='empty-state';d.textContent=text;el.appendChild(d)}
  function row(title,sub,badge,klass){const d=document.createElement('div');d.className='security-row';const copy=document.createElement('div');const b=document.createElement('b');b.textContent=title;copy.appendChild(b);if(sub){const s=document.createElement('small');s.textContent=sub;copy.appendChild(s)}const st=document.createElement('span');st.className=`badge security-status ${klass||'neutral'}`;st.textContent=badge||'';d.append(copy,st);return d}
  function ruleItem(r){const d=document.createElement('div');d.className=`security-alert ${r.nivel||'media'}`;const i=document.createElement('i');i.className=r.nivel==='critica'?'bi bi-exclamation-octagon-fill':r.nivel==='alta'?'bi bi-shield-exclamation':'bi bi-info-circle-fill';const c=document.createElement('div');const b=document.createElement('b');b.textContent=r.codigo.replaceAll('_',' ');const p=document.createElement('div');p.textContent=r.mensaje;c.append(b,p);d.append(i,c);return d}
  function fmt(v){const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('es-HN',{dateStyle:'short',timeStyle:'short'})}
  async function load(){
    try{
      const r=await VigiaAPI.request('/centro-seguridad/resumen',{offline:false});const d=r.data||{},m=d.metricas||{};
      $('mAccess').textContent=m.accesos_hoy||0;$('mQueue').textContent=m.cola_activa||0;$('mIncidents').textContent=m.incidencias_abiertas||0;$('mSOS').textContent=m.alertas_sos||0;$('mGuards').textContent=m.guardias_activos||0;$('mPackages').textContent=m.paquetes_pendientes||0;$('mArrivals').textContent=m.llegadas_en_curso||0;$('mInvites').textContent=m.invitaciones_vigentes||0;
      $('updatedAt').textContent=d.actualizado_en?`Actualizado ${fmt(d.actualizado_en)}`:'';
      $('emergencyBanner').classList.toggle('active',(m.alertas_sos||0)>0);$('emergencyText').textContent=(m.alertas_sos||0)===1?'Hay 1 alerta SOS activa que requiere atención.':`Hay ${m.alertas_sos||0} alertas SOS activas que requieren atención.`;
      const rules=$('ruleList');clear(rules);(d.reglas||[]).forEach(x=>rules.appendChild(ruleItem(x)));if(!(d.reglas||[]).length)empty(rules,'Sin alertas inteligentes. La operación está dentro de parámetros normales.');
      const q=$('queueList');clear(q);(d.cola||[]).forEach(x=>q.appendChild(row(x.nombre_persona||'Persona en garita',`${x.vivienda_destino||'Destino no indicado'} · ${fmt(x.fecha_llegada)}`,x.estado,x.estado==='rechazada'||x.estado==='bloqueada'?'blocked':x.estado==='esperando'?'warn':'info')));if(!(d.cola||[]).length)empty(q,'No hay personas esperando validación.');
      const inc=$('incidentList');clear(inc);(d.incidencias||[]).forEach(x=>inc.appendChild(row(x.titulo||`Incidencia #${x.id}`,`${x.ubicacion||'Sin ubicación'} · ${fmt(x.fecha_hora)}`,x.prioridad||x.estado,x.prioridad==='urgente'?'blocked':x.prioridad==='alta'?'warn':'info')));if(!(d.incidencias||[]).length)empty(inc,'No hay incidencias abiertas.');
      const act=$('activityList');clear(act);(d.actividad||[]).forEach(x=>act.appendChild(row(x.accion||'Actividad',`${x.modulo||'sistema'} · ${fmt(x.fecha_hora)}`,x.usuario_id?`USR ${x.usuario_id}`:'SISTEMA','neutral')));if(!(d.actividad||[]).length)empty(act,'Aún no hay actividad reciente.');
    }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
  }
  $('reloadSecurityCenter').addEventListener('click',load);load();setInterval(load,30000);
})();
