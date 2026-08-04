// ============ NOTIFICACIONES.JS ============
// Exclusivo de notificaciones.html: marcar notificaciones como leídas
// (individualmente o todas a la vez) y mantener sincronizado el punto
// de "no leídas" de la campana en el topnav (via localStorage).

(function(){
  const markAllBtn=document.getElementById('markAllRead');
  if(!markAllBtn) return;

  function syncBellDot(){
    const anyUnread=document.querySelectorAll('.notif-item.unread').length>0;
    localStorage.setItem('vigia_notifs_unread', anyUnread ? '1' : '0');
    const dot=document.getElementById('bellDot');
    if(dot) dot.style.display = anyUnread ? '' : 'none';
  }

  document.querySelectorAll('.notif-item').forEach(item=>{
    item.addEventListener('click',()=>{
      if(!item.classList.contains('unread')) return;
      item.classList.remove('unread');
      syncBellDot();
    });
  });

  markAllBtn.addEventListener('click',()=>{
    const hadUnread=document.querySelectorAll('.notif-item.unread').length>0;
    document.querySelectorAll('.notif-item.unread').forEach(i=>i.classList.remove('unread'));
    syncBellDot();
    if(hadUnread && window.showToast) showToast('Todas las notificaciones están al día');
  });

  syncBellDot();
})();
