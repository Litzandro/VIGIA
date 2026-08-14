// ============ ACCESOS.JS ============
// Antes esta pagina era una maqueta: la bitacora completa ("Maria
// Flores ingreso...", "Vehiculo HN-8832 verificado"...) y el panel de
// "Personas vetadas" estaban escritos a mano en accesos.html y nunca se
// conectaban a nada. Ahora la bitacora carga de verdad desde
// GET /api/accesos, y el panel de vetados (que ademas duplicaba, sin
// backend, lo que ya hace de verdad vetos.html) se quito de aqui.

(function(){
  const wrap=document.getElementById('accessTimeline');
  const btn=document.getElementById('exportBtn');
  if(!wrap)return;

  const session=VigiaAPI.getSession();
  let filas=[];

  function formatDia(fecha){
    const hoy=new Date();hoy.setHours(0,0,0,0);
    const ayer=new Date(hoy);ayer.setDate(ayer.getDate()-1);
    const d=new Date(fecha);const diaSolo=new Date(d);diaSolo.setHours(0,0,0,0);
    if(diaSolo.getTime()===hoy.getTime())return 'Hoy, '+d.toLocaleDateString('es-HN',{day:'numeric',month:'long'});
    if(diaSolo.getTime()===ayer.getTime())return 'Ayer, '+d.toLocaleDateString('es-HN',{day:'numeric',month:'long'});
    return d.toLocaleDateString('es-HN',{weekday:'long',day:'numeric',month:'long'}).replace(/^\w/,c=>c.toUpperCase());
  }

  function tituloEvento(x){
    if(x.tipo_movimiento==='entrada')return x.vehiculo_id?'Vehículo ingresó al residencial':'Ingresaste al residencial';
    return x.vehiculo_id?'Vehículo salió del residencial':'Saliste del residencial';
  }

  function detalleEvento(x){
    const modos={qr:'Verificado por QR',foto:'Verificado por foto',documento:'Verificado por documento',manual:'Registro manual en garita',offline:'Registrado sin conexión',integracion:'Registrado por integración'};
    const base=modos[x.modo_registro]||'Registrado en garita';
    return base+(x.observaciones?' · '+x.observaciones:'');
  }

  function render(){
    wrap.innerHTML='';
    if(!filas.length){
      wrap.innerHTML='<div class="empty-state">Todavía no hay accesos registrados.</div>';
      return;
    }
    let ultimoDia=null;
    let tlActual=null;
    filas.forEach(x=>{
      const dia=formatDia(x.fecha_hora);
      if(dia!==ultimoDia){
        const label=document.createElement('div');
        label.className='timeline-day-label';
        label.textContent=dia;
        wrap.appendChild(label);
        tlActual=document.createElement('div');
        tlActual.className='tl-wrap';
        wrap.appendChild(tlActual);
        ultimoDia=dia;
      }
      const tl=tlActual;
      const entry=document.createElement('div');
      entry.className='tl-entry';
      const hora=new Date(x.fecha_hora).toLocaleTimeString('es-HN',{hour:'numeric',minute:'2-digit',hour12:true});
      entry.innerHTML='<div class="row"><b></b><span class="time mono"></span></div><p></p>';
      entry.querySelector('.row b').textContent=tituloEvento(x);
      entry.querySelector('.row .time').textContent=hora;
      entry.querySelector('p').textContent=detalleEvento(x);
      tl.appendChild(entry);
    });
  }

  async function cargar(){
    try{
      const r=await VigiaAPI.request('/accesos?limit=100&sort=fecha_hora:desc');
      let datos=r.data||[];
      // El modelo de accesos no tiene "residente_id" (usa "usuario_id"),
      // asi que el filtrado automatico por dueño no aplica aqui; se
      // filtra en el cliente, igual que ya hacia dashboard.html.
      if(session&&session.id){
        const conUsuario=datos.filter(x=>x.usuario_id!=null);
        if(conUsuario.length)datos=conUsuario.filter(x=>String(x.usuario_id)===String(session.id));
      }
      filas=datos;
      render();
    }catch(e){
      wrap.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;
    }
  }

  if(btn){
    btn.addEventListener('click',()=>{
      const rows=[['Día','Hora','Evento','Detalle']];
      wrap.querySelectorAll('.timeline-day-label').forEach(label=>{
        const tl=label.nextElementSibling;
        if(!tl||!tl.classList.contains('tl-wrap'))return;
        tl.querySelectorAll('.tl-entry').forEach(entry=>{
          const title=entry.querySelector('.row b').textContent.trim();
          const time=entry.querySelector('.row .time').textContent.trim();
          const detail=entry.querySelector('p').textContent.trim();
          rows.push([label.textContent.trim(),time,title,detail]);
        });
      });
      if(rows.length===1){showToast('No hay nada que exportar todavía');return}
      const csv=rows.map(r=>r.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')).join('\r\n');
      const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download='vigia-bitacora-accesos.csv';
      document.body.appendChild(a);a.click();a.remove();
      URL.revokeObjectURL(url);
      showToast('Bitácora exportada como CSV');
    });
  }

  cargar();
})();
