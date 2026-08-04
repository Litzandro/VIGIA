// ============ PANIC-STORE.JS ============
// Fuente de datos compartida entre los botones de pánico de incidencias.html
// (residente), la pestaña "Alertas de pánico" de superadmin.html y el
// portal del guardia (guardia.html). Usa localStorage como canal real
// entre las tres pantallas: si las tienes abiertas en pestañas del mismo
// navegador, una alerta activada o actualizada de un lado aparece del
// otro al instante (evento "storage"), igual que ChatStore.
//
// Honestidad sobre el alcance: esto sincroniza dentro del mismo navegador
// / dispositivo. No sustituye un backend real — para que el guardia en su
// propio celular reciba la alerta de un residente en el suyo, se
// necesita un servidor de verdad (websockets, notificaciones push, etc.),
// no localStorage.

const PanicStore=(function(){
  const KEY='vigia_panic_alerts';

  // pendiente: recien activada, nadie la ha tomado.
  // en_camino: un guardia ya va hacia la unidad.
  // atendida: el guardia confirmo que la atendio.
  // falsa_alarma: se activo por error, no requiere mas seguimiento.
  const STATUSES=['pendiente','en_camino','atendida','falsa_alarma'];
  const STATUS_LABEL={
    pendiente:'Pendiente', en_camino:'En camino', atendida:'Atendida', falsa_alarma:'Falsa alarma'
  };

  function readAll(){
    try{ return JSON.parse(localStorage.getItem(KEY))||[]; }
    catch(e){ return []; }
  }
  function writeAll(alerts){
    try{ localStorage.setItem(KEY, JSON.stringify(alerts)); }
    catch(e){ /* almacenamiento no disponible; la alerta sigue funcionando en memoria para esta pestaña */ }
  }
  function formatNow(){
    const now=new Date();
    let h=now.getHours(); const m=String(now.getMinutes()).padStart(2,'0');
    const period=h>=12?'PM':'AM'; h=h%12; if(h===0) h=12;
    return h+':'+m+' '+period;
  }

  // target: 'guardia' (solo el guardia en turno) o 'residentes' (torre completa)
  function addAlert({residentName, unidad, target}){
    let guardAtCreation=null; try{const gs=JSON.parse(localStorage.getItem('vigia_guard_session')||'null');guardAtCreation=gs&&gs.name}catch(e){}
    const alerts=readAll();
    const alert={
      id:'PAN-'+Date.now(),
      residentName, unidad, target,
      status:'pendiente',
      assignedTo:guardAtCreation,
      originalGuard:guardAtCreation,
      note:'', noteTime:null,
      time:formatNow(), ts:Date.now()
    };
    alerts.unshift(alert);
    writeAll(alerts);
    return alert;
  }

  function getAll(){
    return readAll();
  }

  function setStatus(id, status){
    if(STATUSES.indexOf(status)===-1) return null;
    const alerts=readAll();
    const alert=alerts.find(a=>a.id===id);
    if(alert){ alert.status=status; writeAll(alerts); }
    return alert;
  }

  function setAssignee(id, guardName){
    const alerts=readAll();
    const alert=alerts.find(a=>a.id===id);
    if(alert){ alert.assignedTo=guardName||null; writeAll(alerts); }
    return alert;
  }

  function setNote(id, note){
    const alerts=readAll();
    const alert=alerts.find(a=>a.id===id);
    if(alert){ alert.note=note||''; alert.noteTime=formatNow(); writeAll(alerts); }
    return alert;
  }

  // Se dispara cuando OTRA pestaña del mismo navegador agrega o actualiza una alerta.
  function onChange(callback){
    window.addEventListener('storage',(e)=>{
      if(e.key===KEY) callback();
    });
  }

  return { addAlert, getAll, setStatus, setAssignee, setNote, onChange, STATUSES, STATUS_LABEL };
})();
