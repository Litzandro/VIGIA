// ============ DASHBOARD.JS ============
(function(){
  const session=window.VigiaAPI ? VigiaAPI.getSession() : null;
  if(session){
    const firstName=(session.nombre||session.name||'Usuario').split(' ')[0];
    const hero=document.querySelector('.dash-hero h1');
    if(hero) hero.innerHTML='Hola, <em></em>';
    if(hero){const em=hero.querySelector('em');em.textContent=firstName+'.';}
    document.querySelectorAll('.topnav-user .uname').forEach(el=>el.textContent=session.nombre_completo||session.name||session.email);
    document.querySelectorAll('.topnav-user .av').forEach(el=>{
      const n=session.nombre_completo||session.name||session.email;
      el.textContent=n.split(' ').filter(Boolean).slice(0,2).map(v=>v[0].toUpperCase()).join('');
    });
  }

  const btn=document.getElementById('shareCodeBtn');
  const codeEl=document.getElementById('nextVisitCode');
  if(!btn || !codeEl) return;

  btn.addEventListener('click',()=>{
    const code=codeEl.textContent.trim();
    if(!navigator.clipboard || !navigator.clipboard.writeText){
      if(window.showToast) showToast('Tu navegador no permite copiar automáticamente');
      return;
    }
    navigator.clipboard.writeText(code)
      .then(()=>{if(window.showToast) showToast('Código '+code+' copiado');})
      .catch(()=>{if(window.showToast) showToast('No se pudo copiar el código');});
  });
})();
