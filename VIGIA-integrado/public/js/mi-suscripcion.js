// ============ MI-SUSCRIPCION.JS ============
// Le muestra al admin de una residencial el plan que tiene contratado
// (que incluye y que no), el estado de su suscripcion, y los datos
// para pagarle a VIGIA -- usa /api/mi-plan (solo su propia residencial,
// nunca la de otros clientes; eso sigue siendo exclusivo de superadmin
// via /api/suscripciones).
(function(){
  const cargando=document.getElementById('miPlanCargando');
  const contenido=document.getElementById('miPlanContenido');
  const errorBox=document.getElementById('miPlanError');
  if(!cargando||!contenido)return;

  const money=n=>n==null?'—':new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL'}).format(Number(n));
  const CICLO_LABEL={mensual:'Mensual',trimestral:'Trimestral',anual:'Anual'};
  const ESTADO_LABEL={prueba:'Periodo de prueba',activa:'Activa',suspendida:'Suspendida',vencida:'Vencida',cancelada:'Cancelada'};
  const ESTADO_BADGE={prueba:'pending',activa:'ok',suspendida:'blocked',vencida:'blocked',cancelada:'blocked'};

  function fechaLarga(iso){
    if(!iso)return '—';
    try{ return new Date(iso+'T00:00:00').toLocaleDateString('es-HN',{day:'2-digit',month:'long',year:'numeric'}); }
    catch(e){ return iso; }
  }

  async function load(){
    try{
      const r=await VigiaAPI.request('/mi-plan');
      const info=r.data;
      cargando.hidden=true;

      if(!info){
        errorBox.hidden=false;
        errorBox.querySelector('span').textContent='Esta cuenta no pertenece a una residencial.';
        return;
      }

      contenido.hidden=false;
      document.getElementById('miPlanNombre').textContent=info.plan_nombre||'Sin plan asignado';
      document.getElementById('miPlanPrecio').textContent=money(info.precio_acordado!=null?info.precio_acordado:info.precio_mensual);
      document.getElementById('miPlanCiclo').textContent=CICLO_LABEL[info.ciclo]||'—';
      document.getElementById('miPlanInicio').textContent=fechaLarga(info.fecha_inicio);
      document.getElementById('miPlanProximoPago').textContent=fechaLarga(info.proxima_facturacion);

      const badge=document.getElementById('miPlanEstadoBadge');
      if(info.estado_suscripcion){
        badge.textContent=ESTADO_LABEL[info.estado_suscripcion]||info.estado_suscripcion;
        badge.className='badge '+(ESTADO_BADGE[info.estado_suscripcion]||'neutral');
      }else{
        badge.textContent='Sin registrar';
        badge.className='badge neutral';
        document.getElementById('miPlanAvisoSinDatos').hidden=false;
      }

      if(['suspendida','vencida','cancelada'].includes(info.estado_suscripcion)){
        document.getElementById('miPlanAvisoSuspendida').hidden=false;
      }

      const camBadge=document.getElementById('miPlanBadgeCamaras');
      camBadge.className='badge '+(info.incluye_camaras?'ok':'neutral');
      const soBadge=document.getElementById('miPlanBadgeSoporte');
      soBadge.className='badge '+(info.incluye_soporte?'ok':'neutral');
    }catch(e){
      cargando.hidden=true;
      errorBox.hidden=false;
      errorBox.querySelector('span').textContent=e.message;
    }
  }

  load();
})();
