// ============ ACCESOS.JS ============
// "Mis accesos" = la bitacora de quien entro a tu hogar gracias a tus
// invitaciones. Antes solo mostraba movimientos con usuario_id igual al
// tuyo (el guardia casi nunca lo llena al registrar a una visita), asi que
// la pagina quedaba vacia aunque tus invitados ya hubieran entrado. Ahora
// el servidor tambien devuelve los accesos ligados a tus invitaciones
// (ver applyOwnershipScope en src/utils/crudFactory.js) y aqui se les pone
// nombre cruzandolos con GET /invitaciones.
//
// Se agregaron: resumen (hoy / dentro ahora / 7 dias), filtros por rango,
// tipo y nombre, progreso de fiestas ("12 de 40 ingresaron") y "cargar
// mas". El panel de "Personas vetadas" se quito: solo era un enlace a
// Vetos, que ya esta en el menu lateral.

(function(){
  const wrap=document.getElementById('accessTimeline');
  if(!wrap)return;
  const btnExport=document.getElementById('exportBtn');
  const tipoFiltro=document.getElementById('tipoFiltro');
  const buscar=document.getElementById('buscarAcceso');
  const rangoTabs=document.getElementById('rangoTabs');
  const masWrap=document.getElementById('masWrap');
  const masBtn=document.getElementById('masBtn');
  const PAGE=100;

  let accesos=[];
  let invitaciones={};
  let pagina=1;
  let hayMas=false;
  let rango='7';

  const inicioDia=(d)=>{const x=new Date(d);x.setHours(0,0,0,0);return x};

  function formatDia(fecha){
    const hoy=inicioDia(new Date());
    const ayer=new Date(hoy);ayer.setDate(ayer.getDate()-1);
    const d=new Date(fecha);const solo=inicioDia(d);
    const largo=d.toLocaleDateString('es-HN',{day:'numeric',month:'long'});
    if(solo.getTime()===hoy.getTime())return 'Hoy, '+largo;
    if(solo.getTime()===ayer.getTime())return 'Ayer, '+largo;
    return d.toLocaleDateString('es-HN',{weekday:'long',day:'numeric',month:'long'}).replace(/^\w/,c=>c.toUpperCase());
  }

  function nombreDe(x){
    const inv=x.invitacion_id!=null?invitaciones[String(x.invitacion_id)]:null;
    return inv&&inv.nombre_evento?inv.nombre_evento:null;
  }
  function esEventoDe(x){
    const inv=x.invitacion_id!=null?invitaciones[String(x.invitacion_id)]:null;
    return !!(inv&&inv.tipo==='evento');
  }

  function tituloEvento(x){
    const nombre=nombreDe(x);
    const verbo=x.tipo_movimiento==='entrada'?'ingresó':'salió';
    if(nombre&&esEventoDe(x))return 'Invitado de «'+nombre+'» '+verbo;
    if(nombre)return nombre+' '+verbo;
    if(x.vehiculo_id)return x.tipo_movimiento==='entrada'?'Vehículo ingresó al residencial':'Vehículo salió del residencial';
    return x.tipo_movimiento==='entrada'?'Ingresaste al residencial':'Saliste del residencial';
  }

  function detalleEvento(x){
    const modos={qr:'Verificado por QR',foto:'Verificado por foto',documento:'Verificado por documento',manual:'Registro manual en garita',offline:'Registrado sin conexión',integracion:'Registrado por integración'};
    const base=modos[x.modo_registro]||'Registrado en garita';
    // Si la observacion es solo el nombre que ya se muestra arriba, no se repite.
    const obs=x.observaciones&&x.observaciones!==nombreDe(x)?' · '+x.observaciones:'';
    return base+obs;
  }

  function filtrados(){
    const ahora=new Date();
    let desde=null;
    if(rango==='hoy')desde=inicioDia(ahora);
    else if(rango==='7'){desde=inicioDia(ahora);desde.setDate(desde.getDate()-6)}
    else if(rango==='30'){desde=inicioDia(ahora);desde.setDate(desde.getDate()-29)}
    const tipo=tipoFiltro?tipoFiltro.value:'';
    const q=(buscar?buscar.value:'').trim().toLowerCase();
    return accesos.filter(x=>{
      if(desde&&new Date(x.fecha_hora)<desde)return false;
      if(tipo&&x.tipo_movimiento!==tipo)return false;
      if(q){
        const txt=(tituloEvento(x)+' '+(x.observaciones||'')).toLowerCase();
        if(!txt.includes(q))return false;
      }
      return true;
    });
  }

  function renderResumen(){
    const hoy=inicioDia(new Date());
    const sem=new Date(hoy);sem.setDate(sem.getDate()-6);
    const entradas=accesos.filter(x=>x.tipo_movimiento==='entrada');
    document.getElementById('mHoy').textContent=entradas.filter(x=>new Date(x.fecha_hora)>=hoy).length;
    document.getElementById('mSemana').textContent=entradas.filter(x=>new Date(x.fecha_hora)>=sem).length;
    // "Dentro ahora": por cada invitacion, entradas menos salidas (nunca menos de 0).
    const balance={};
    accesos.forEach(x=>{
      if(x.invitacion_id==null)return;
      const k=String(x.invitacion_id);
      balance[k]=(balance[k]||0)+(x.tipo_movimiento==='entrada'?1:-1);
    });
    const dentro=Object.values(balance).reduce((a,n)=>a+Math.max(0,n),0);
    document.getElementById('mDentro').textContent=dentro;
  }

  function renderEventos(){
    const panel=document.getElementById('eventosPanel');
    const lista=document.getElementById('eventosList');
    if(!panel||!lista)return;
    const eventos=Object.values(invitaciones)
      .filter(i=>i.tipo==='evento'&&i.estado!=='cancelada')
      .sort((a,b)=>new Date(b.fecha_valida_desde)-new Date(a.fecha_valida_desde))
      .slice(0,3);
    panel.hidden=eventos.length===0;
    lista.innerHTML='';
    eventos.forEach(ev=>{
      const usos=ev.usos_actuales||0,max=ev.max_usos||1;
      const pct=Math.min(100,Math.round(usos/max*100));
      const activo=new Date(ev.fecha_valida_hasta)>new Date()&&usos<max;
      const fila=document.createElement('div');
      fila.className='acc-event';
      fila.innerHTML='<div class="acc-event-head"><b></b><span class="badge"></span></div><div class="event-progress"><span></span></div><p class="mono"></p>';
      fila.querySelector('b').textContent=ev.nombre_evento||'Evento';
      const badge=fila.querySelector('.badge');
      badge.textContent=activo?'Abierto':(usos>=max?'Cupo lleno':'Finalizado');
      badge.classList.add(activo?'ok':'neutral');
      fila.querySelector('.event-progress span').style.width=pct+'%';
      fila.querySelector('p').textContent=usos+' de '+max+' invitados ingresaron · válido hasta '+new Date(ev.fecha_valida_hasta).toLocaleString('es-HN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true});
      lista.appendChild(fila);
    });
  }

  function render(){
    wrap.innerHTML='';
    const filas=filtrados();
    if(!filas.length){
      wrap.innerHTML=accesos.length
        ?'<div class="empty-state">Ningún movimiento coincide con los filtros.</div>'
        :'<div class="empty-state">Todavía no hay accesos. Cuando la garita registre la entrada de alguien que invitaste, aparecerá aquí.<br><a href="visitas.html" class="btn btn-ghost" style="margin-top:.8rem;"><i class="bi bi-person-plus-fill"></i> Invitar a alguien</a></div>';
      return;
    }
    let ultimoDia=null,tl=null;
    filas.forEach(x=>{
      const dia=formatDia(x.fecha_hora);
      if(dia!==ultimoDia){
        const label=document.createElement('div');
        label.className='timeline-day-label';
        label.textContent=dia;
        wrap.appendChild(label);
        tl=document.createElement('div');
        tl.className='tl-wrap';
        wrap.appendChild(tl);
        ultimoDia=dia;
      }
      const entry=document.createElement('div');
      entry.className='tl-entry'+(x.tipo_movimiento==='salida'?' warn':'');
      const hora=new Date(x.fecha_hora).toLocaleTimeString('es-HN',{hour:'numeric',minute:'2-digit',hour12:true});
      entry.innerHTML='<div class="row"><b></b><span class="time mono"></span></div><p></p>';
      entry.querySelector('.row b').textContent=tituloEvento(x);
      entry.querySelector('.row .time').textContent=hora;
      entry.querySelector('p').textContent=detalleEvento(x);
      tl.appendChild(entry);
    });
  }

  function renderTodo(){renderResumen();renderEventos();render();if(masWrap)masWrap.hidden=!hayMas}

  async function cargarInvitaciones(){
    try{
      const r=await VigiaAPI.request('/invitaciones?limit=100&sort=fecha_valida_desde:desc');
      invitaciones={};
      (r.data||[]).forEach(i=>{invitaciones[String(i.id)]=i});
    }catch(e){/* sin nombres: se muestran los titulos genericos */}
  }

  async function cargarAccesos(reset){
    if(reset){pagina=1;accesos=[]}
    const r=await VigiaAPI.request('/accesos?limit='+PAGE+'&page='+pagina+'&sort=fecha_hora:desc');
    const datos=r.data||[];
    accesos=accesos.concat(datos);
    hayMas=datos.length>=PAGE;
  }

  async function iniciar(){
    try{
      await Promise.all([cargarInvitaciones(),cargarAccesos(true)]);
      renderTodo();
    }catch(e){
      wrap.innerHTML='<div class="empty-state"></div>';
      wrap.firstChild.textContent=e.message;
    }
  }

  if(rangoTabs){
    rangoTabs.querySelectorAll('button').forEach(b=>{
      b.addEventListener('click',()=>{
        rangoTabs.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');rango=b.dataset.rango;render();
      });
    });
  }
  if(tipoFiltro)tipoFiltro.addEventListener('change',render);
  if(buscar)buscar.addEventListener('input',render);
  if(masBtn){
    masBtn.addEventListener('click',async()=>{
      masBtn.disabled=true;
      try{pagina+=1;await cargarAccesos(false);renderTodo()}
      catch(e){pagina-=1;showToast(e.message,'bi-exclamation-triangle-fill')}
      finally{masBtn.disabled=false}
    });
  }

  if(btnExport){
    btnExport.addEventListener('click',()=>{
      const filas=filtrados();
      if(!filas.length){showToast('No hay nada que exportar todavía');return}
      const rows=[['Fecha','Hora','Movimiento','Persona / evento','Detalle']];
      filas.forEach(x=>{
        const d=new Date(x.fecha_hora);
        rows.push([
          d.toLocaleDateString('es-HN'),
          d.toLocaleTimeString('es-HN',{hour:'numeric',minute:'2-digit',hour12:true}),
          x.tipo_movimiento==='entrada'?'Entrada':'Salida',
          nombreDe(x)||'',
          detalleEvento(x)
        ]);
      });
      const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
      const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download='vigia-bitacora-accesos.csv';
      document.body.appendChild(a);a.click();a.remove();
      URL.revokeObjectURL(url);
      showToast('Bitácora exportada como CSV');
    });
  }

  iniciar();
})();
