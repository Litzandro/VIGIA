// ============ LOGIN.JS ============
(function(){
  const form=document.getElementById('loginForm');
  if(!form || typeof AuthStore==='undefined') return;

  const emailInput=document.getElementById('loginEmail');
  const passwordInput=document.getElementById('loginPassword');
  const rememberInput=document.getElementById('rememberMe');
  const errorBox=document.getElementById('loginError');
  const toggleBtn=document.getElementById('toggleLoginPassword');
  const submitBtn=document.getElementById('loginSubmitBtn');

  function showError(msg){ errorBox.querySelector('span').textContent=msg; errorBox.classList.add('show'); }
  function hideError(){ errorBox.classList.remove('show'); }

  // Si nos mandaron aqui porque el token expiro a mitad de sesion (ver
  // VigiaAPI.request en common.js), lo decimos claro en vez de dejar a
  // la persona adivinar por que de repente esta en login otra vez.
  if(new URLSearchParams(location.search).get('sesion')==='expirada'){
    showError('Tu sesión expiró por inactividad. Inicia sesión de nuevo.');
  }
  const successBox=document.getElementById('loginSuccess');
  function showSuccess(msg){ if(successBox){ successBox.querySelector('span').textContent=msg; successBox.classList.add('show'); } }

  const cuentaParam=new URLSearchParams(location.search).get('cuenta');
  if(cuentaParam==='creada'){
    // Se deja por compatibilidad con enlaces viejos (ej. un marcador
    // guardado antes de este cambio) -- el flujo nuevo ya no manda
    // "cuenta=creada" (ver register.js), manda "cuenta=verificar".
    showSuccess('Tu cuenta se creó correctamente. Inicia sesión para continuar.');
  }
  if(cuentaParam==='verificar'){
    showSuccess('Revisa tu correo (y la carpeta de spam) y confirma tu cuenta antes de iniciar sesión.');
  }

  const verificacionParam=new URLSearchParams(location.search).get('verificacion');
  if(verificacionParam==='ok'){
    showSuccess('Tu correo quedó confirmado. Ya puedes iniciar sesión.');
  }
  if(verificacionParam==='invalida'){
    showError('El enlace de confirmación no es válido o ya venció. Pide que te reenviemos uno nuevo abajo.');
  }

  // Boton de reenvio: solo aparece cuando hace falta (cuenta sin
  // confirmar, o enlace de confirmacion vencido/invalido) -- no tiene
  // sentido mostrarlo siempre en la pantalla de login.
  const resendBox=document.getElementById('resendVerification');
  const resendBtn=document.getElementById('resendVerificationBtn');
  function mostrarReenvio(){ if(resendBox)resendBox.classList.add('show'); }
  if(verificacionParam==='invalida')mostrarReenvio();
  if(resendBtn){
    resendBtn.addEventListener('click',async()=>{
      const email=emailInput.value.trim();
      if(!email){ showError('Escribe tu correo arriba primero, y vuelve a tocar "Reenviar correo".'); return; }
      resendBtn.disabled=true;
      const original=resendBtn.textContent;
      resendBtn.textContent='Enviando...';
      const result=await AuthStore.reenviarVerificacion(email);
      resendBtn.disabled=false;
      resendBtn.textContent=original;
      if(result.ok)showSuccess(result.mensaje||'Si la cuenta existe y no esta confirmada, te reenviamos el correo.');
      else showError(result.error);
    });
  }

  toggleBtn.addEventListener('click',()=>{
    const isPw=passwordInput.type==='password';
    passwordInput.type=isPw ? 'text' : 'password';
    toggleBtn.innerHTML=isPw ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
  });

  form.addEventListener('submit',async(e)=>{
    e.preventDefault();
    hideError();
    const email=emailInput.value.trim();
    const password=passwordInput.value;
    if(!email || !password){ showError('Escribe tu correo y contraseña.'); return; }

    const originalHTML=submitBtn.innerHTML;
    submitBtn.disabled=true;
    submitBtn.innerHTML='<i class="bi bi-arrow-repeat"></i> Verificando...';

    const result=await AuthStore.login(email,password,rememberInput&&rememberInput.checked);
    if(!result.ok){
      showError(result.error);
      if(result.necesitaVerificacion)mostrarReenvio();
      submitBtn.disabled=false;
      submitBtn.innerHTML=originalHTML;
      return;
    }
    submitBtn.innerHTML='<i class="bi bi-check-lg"></i> ¡Bienvenido!';
    window.location.href=VigiaAPI.destinationForRole(result.user.rol_codigo);
  });
})();
