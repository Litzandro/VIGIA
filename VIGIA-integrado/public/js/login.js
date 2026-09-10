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
  if(new URLSearchParams(location.search).get('cuenta')==='creada'){
    const successBox=document.getElementById('loginSuccess');
    if(successBox){ successBox.querySelector('span').textContent='Tu cuenta se creó correctamente. Inicia sesión para continuar.'; successBox.classList.add('show'); }
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
      submitBtn.disabled=false;
      submitBtn.innerHTML=originalHTML;
      return;
    }
    submitBtn.innerHTML='<i class="bi bi-check-lg"></i> ¡Bienvenido!';
    window.location.href=VigiaAPI.destinationForRole(result.user.rol_codigo);
  });
})();
