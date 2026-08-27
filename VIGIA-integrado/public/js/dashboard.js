// ============ DASHBOARD.JS ============
(function(){
  const session=window.VigiaAPI ? VigiaAPI.getSession() : null;
  if(session){
    // Si el backend no manda nombre_completo (bug de saludo reportado en
    // retroalimentacion), nunca mostramos el correo tal cual: se arma un
    // nombre de cortesia a partir de la parte antes del "@", separando
    // puntos/guiones y poniendo mayuscula inicial. Ej: "jorge.paz@..." -> "Jorge Paz".
    function nombreDesdeCorreo(email){
      if(!email)return'Usuario';
      const local=String(email).split('@')[0]||'usuario';
      return local.split(/[.\-_]+/).filter(Boolean).map(p=>p[0].toUpperCase()+p.slice(1)).join(' ')||'Usuario';
    }
    const displayName=(session.nombre_completo||session.name||'').trim()||nombreDesdeCorreo(session.email);
    const firstName=displayName.split(' ')[0]||'Usuario';
    const hero=document.querySelector('.dash-hero h1');
    if(hero) hero.innerHTML='Hola, <em></em>';
    if(hero){const em=hero.querySelector('em');em.textContent=firstName+'.';}
    document.querySelectorAll('.topnav-user .uname').forEach(el=>el.textContent=displayName);
    document.querySelectorAll('.topnav-user .av').forEach(el=>{
      el.textContent=displayName.split(' ').filter(Boolean).slice(0,2).map(v=>v[0].toUpperCase()).join('');
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
