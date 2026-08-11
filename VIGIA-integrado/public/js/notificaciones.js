// ============ NOTIFICACIONES.JS ============
// Centro de notificaciones real (requisito 2): ya no hay texto fijo en
// el HTML. Todo sale de GET /api/notificaciones (backend -> MySQL) y
// las acciones (leida, marcar todas) se guardan de vuelta en la BD.

(function(){
  const list=document.getElementById('notifList');
  if(!list) return;
  const markAllBtn=document.getElementById('markAllRead');
  const chips=document.querySelectorAll('.filter-chip');
  let rows=[];
  let filter='todas';

  const ICONS={
    ingreso_visita:{icon:'bi-qr-code-scan',bg:'var(--accent-soft)',color:'var(--accent)'},
    incidencia:{icon:'bi-exclamation-triangle-fill',bg:'var(--warn-soft)',color:'var(--warn)'},
    comunidad:{icon:'bi-megaphone-fill',bg:'rgba(237,231,214,.08)',color:'var(--bone-dim)'},
    alerta:{icon:'bi-shield-x',bg:'var(--alert-soft)',color:'var(--alert)'},
    chat:{icon:'bi-chat-dots-fill',bg:'var(--accent-soft)',color:'var(--accent)'},
  };
  const DEFAULT_ICON={icon:'bi-bell-fill',bg:'rgba(237,231,214,.08)',color:'var(--bone-dim)'};

  // referencia_tipo/referencia_id -> a donde navega la notificacion al
  // presionarla (requisito 2.6). Las claves deben coincidir EXACTO con
  // el "referencia_tipo" que cada override de notificacionesService.crear
  // ya usa en el backend (incidencias.js, publicacionesComunidad.js,
  // accesos.js, alertasPanico.js, mensajes.js).
  const DESTINOS={
    incidencia:(id)=>`incidencias.html?inc=${id}`,
    publicacion:(id)=>`comunidad.html?post=${id}`,
    accesos:()=>'accesos.html',
    alertas_panico:()=>'emergencias.html',
    mensaje:()=>'chat.html',
  };

  function relativeTime(iso){
    const d=new Date(iso);
    if(isNaN(d))return '';
    const diffMs=Date.now()-d.getTime();
    const min=Math.floor(diffMs/60000);
    if(min<1)return 'Justo ahora';
    if(min<60)return `Hace ${min} min`;
    const h=Math.floor(min/60);
    if(h<24)return `Hace ${h} h`;
    const days=Math.floor(h/24);
    if(days===1)return 'Ayer';
    if(days<7)return `Hace ${days} días`;
    return d.toLocaleDateString('es-HN');
  }

  function item(n){
    const cfg=ICONS[n.tipo]||DEFAULT_ICON;
    const unread=!n.leida;
    const el=document.createElement('div');
    el.className='notif-item'+(unread?' unread':'');
    el.dataset.id=n.id;
    el.innerHTML=`<span class="ic" style="background:${cfg.bg};color:${cfg.color};"><i class="bi ${cfg.icon}"></i></span>`+
      `<div class="txt" style="flex:1;"><b>${escapeHtml(n.titulo)}</b><p>${escapeHtml(n.mensaje||'')}</p></div>`+
      `<span class="time">${relativeTime(n.fecha_creacion)}</span>`;
    el.addEventListener('click',()=>onOpen(n,el));
    return el;
  }

  function render(){
    const visible=filter==='no-leidas'?rows.filter((r)=>!r.leida):rows;
    list.innerHTML='';
    if(!visible.length){
      list.innerHTML='<div class="empty-state"><i class="bi bi-bell-slash"></i><span>No tienes notificaciones todavía.</span></div>';
      return;
    }
    visible.forEach((n)=>list.appendChild(item(n)));
  }

  async function onOpen(n,el){
    if(!n.leida){
      try{
        await VigiaAPI.request(`/notificaciones/${n.id}`,{method:'PATCH',body:JSON.stringify({leida:true})});
        n.leida=true;
        el.classList.remove('unread');
        window.dispatchEvent(new CustomEvent('vigia:notifs-changed'));
      }catch(err){ showToast(err.message,'bi-exclamation-triangle-fill'); }
    }
    const buildHref=n.referencia_tipo && DESTINOS[n.referencia_tipo];
    if(buildHref) location.href=buildHref(n.referencia_id);
  }

  async function load(){
    try{
      const r=await VigiaAPI.request('/notificaciones?sort=fecha_creacion:desc&limit=100');
      rows=r.data||[];
      render();
    }catch(e){
      list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;
    }
  }

  chips.forEach((chip)=>chip.addEventListener('click',()=>{
    chips.forEach((c)=>c.classList.remove('active'));
    chip.classList.add('active');
    filter=chip.dataset.filter;
    render();
  }));

  if(markAllBtn){
    markAllBtn.addEventListener('click',async()=>{
      const hadUnread=rows.some((r)=>!r.leida);
      if(!hadUnread){ showToast('Ya estás al día'); return; }
      try{
        await VigiaAPI.request('/notificaciones/marcar-todas',{method:'PATCH'});
        rows.forEach((r)=>{r.leida=true});
        render();
        window.dispatchEvent(new CustomEvent('vigia:notifs-changed'));
        showToast('Todas las notificaciones están al día');
      }catch(err){ showToast(err.message,'bi-exclamation-triangle-fill'); }
    });
  }

  load();
})();
