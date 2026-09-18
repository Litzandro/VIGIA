(function(){
  const fingerprint=localStorage.getItem('vigia_device_id')||(crypto.randomUUID?crypto.randomUUID():String(Date.now()));
  localStorage.setItem('vigia_device_id',fingerprint);

  // Antes esta pagina mostraba el User-Agent crudo tal cual llega del
  // navegador (ej. "Mozilla/5.0 (Windows NT 10.0; Win64; x64)
  // AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0
  // Safari/537.36 Edg/153.0.0.0"), algo ilegible para la mayoria de
  // quienes usan VIGIA (segun el propio equipo, casi nadie sabe de
  // computadoras). No se toca lo que se guarda en la base de datos
  // (sigue siendo util para soporte/depuracion): esto solo traduce el
  // texto a algo humano en el momento de mostrarlo, ej. "Chrome en
  // Windows".
  function humanizeUA(ua){
    const raw=String(ua||'').trim();
    if(!raw)return 'Dispositivo desconocido';
    // Si no parece un User-Agent de navegador (no trae "Mozilla" ni
    // "AppleWebKit"), probablemente ya es un texto amigable puesto a
    // mano en otro lado -- se deja tal cual en vez de intentar
    // "traducir" algo que no es un UA.
    if(!/mozilla|applewebkit|gecko/i.test(raw))return raw;

    let os='Dispositivo';
    if(/windows/i.test(raw))os='Windows';
    else if(/iphone|ipad|ipod/i.test(raw))os='iPhone/iPad';
    else if(/android/i.test(raw))os='Android';
    else if(/mac os x|macintosh/i.test(raw))os='Mac';
    else if(/linux/i.test(raw))os='Linux';

    let nav='Navegador';
    if(/edg\//i.test(raw))nav='Edge';
    else if(/opr\/|opera/i.test(raw))nav='Opera';
    else if(/firefox/i.test(raw))nav='Firefox';
    else if(/chrome\//i.test(raw))nav='Chrome';
    else if(/safari/i.test(raw))nav='Safari';

    return `${nav} en ${os}`;
  }

  function clear(el){ if(el) el.replaceChildren(); }
  function textEl(tag,className,text){
    const el=document.createElement(tag);
    if(className)el.className=className;
    el.textContent=text==null?'':String(text);
    return el;
  }
  function icon(className){
    const i=document.createElement('i');
    i.className=`bi ${className}`;
    i.setAttribute('aria-hidden','true');
    return i;
  }
  function emptyState(message){return textEl('div','empty-state',message)}
  function badge(label,className){return textEl('span',`badge ${className}`,label)}

  function sessionRow(x){
    const el=document.createElement('div');el.className='queue-item';
    const number=document.createElement('div');number.className='queue-number';number.appendChild(icon('bi-browser-chrome'));
    const copy=document.createElement('div');copy.className='queue-copy';
    copy.appendChild(textEl('b','',humanizeUA(x.dispositivo)||'Navegador'));
    copy.appendChild(textEl('span','',`${x.ip_origen||'IP no disponible'} · ${new Date(x.fecha_inicio).toLocaleString('es-HN',{hour12:true})}`));
    const actions=document.createElement('div');actions.className='queue-actions';
    actions.appendChild(badge(x.activa?'activa':'cerrada',x.activa?'ok':'neutral'));
    if(x.activa){
      const b=textEl('button','btn btn-ghost','Revocar');b.type='button';b.dataset.id=x.id;
      b.addEventListener('click',async()=>{try{await VigiaAPI.request(`/auth/sessions/${x.id}/revoke`,{method:'PATCH'});showToast('Sesión revocada');await load()}catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}});
      actions.appendChild(b);
    }
    el.append(number,copy,actions);return el;
  }

  function deviceRow(x){
    const el=document.createElement('div');el.className='queue-item';
    const number=document.createElement('div');number.className='queue-number';number.appendChild(icon('bi-phone-fill'));
    const copy=document.createElement('div');copy.className='queue-copy';
    copy.appendChild(textEl('b','',x.nombre||'Dispositivo'));
    copy.appendChild(textEl('span','',`${humanizeUA(x.plataforma)||'Plataforma desconocida'} · ${x.confiable?'Confiable':'No confiable'}`));
    const actions=document.createElement('div');actions.className='queue-actions';
    actions.appendChild(badge(x.revocado?'revocado':'activo',x.revocado?'blocked':'ok'));
    if(!x.revocado){
      const b=textEl('button','btn btn-ghost','Revocar');b.type='button';b.dataset.id=x.id;
      b.addEventListener('click',async()=>{try{await VigiaAPI.request(`/dispositivos-usuario/${x.id}/revocar`,{method:'PATCH'});showToast('Dispositivo revocado');await load()}catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}});
      actions.appendChild(b);
    }
    el.append(number,copy,actions);return el;
  }

  async function load(){
    try{
      const [s,d]=await Promise.all([VigiaAPI.request('/auth/sessions'),VigiaAPI.request('/dispositivos-usuario/me')]);
      const sessions=s.data||[],devices=d.data||[];
      document.getElementById('sessionCount').textContent=sessions.filter(x=>x.activa).length;
      document.getElementById('deviceCount').textContent=devices.filter(x=>!x.revocado).length;
      document.getElementById('biometricStatus').textContent=window.PublicKeyCredential?'Sí':'No';

      const sl=document.getElementById('sessionsList');clear(sl);
      if(!sessions.length)sl.appendChild(emptyState('No hay sesiones.'));else sessions.forEach(x=>sl.appendChild(sessionRow(x)));

      const dl=document.getElementById('devicesList');clear(dl);
      if(!devices.length)dl.appendChild(emptyState('Aún no registras dispositivos.'));else devices.forEach(x=>dl.appendChild(deviceRow(x)));
    }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
  }

  document.getElementById('registerDevice').addEventListener('click',async()=>{
    try{
      await VigiaAPI.request('/dispositivos-usuario/registrar',{method:'POST',body:JSON.stringify({
        nombre:`${navigator.platform||'Dispositivo'} · Navegador`,
        identificador:fingerprint,
        plataforma:navigator.userAgent.slice(0,80),
        biometria_disponible:Boolean(window.PublicKeyCredential),
        confiable:true
      })});
      showToast('Dispositivo registrado');await load();
    }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
  });

  document.getElementById('logoutAll').addEventListener('click',async()=>{
    const ok=window.VigiaConfirm?await VigiaConfirm({title:'¿Cerrar todas las sesiones?',message:'Tendrás que iniciar sesión nuevamente en tus dispositivos.',confirmText:'Cerrar sesiones',icon:'bi-box-arrow-right'}):confirm('¿Cerrar todas las sesiones activas? Tendrás que iniciar sesión nuevamente.');
    if(!ok)return;
    try{
      const s=await VigiaAPI.request('/auth/sessions');
      await Promise.all((s.data||[]).filter(x=>x.activa).map(x=>VigiaAPI.request(`/auth/sessions/${x.id}/revoke`,{method:'PATCH'}).catch(()=>null)));
      VigiaAPI.clearSession();location.replace('login.html');
    }catch(e){showToast(e.message,'bi-exclamation-triangle-fill')}
  });
  document.getElementById('reloadSecurity').addEventListener('click',load);
  load();
})();
