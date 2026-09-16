// ============ ADMIN-LOGIN.JS ============
(function(){
  const form=document.getElementById('adminLoginForm');
  if(!form || typeof AdminAuthStore==='undefined') return;

  const emailInput=document.getElementById('adminLoginEmail');
  const passwordInput=document.getElementById('adminLoginPassword');
  const errorBox=document.getElementById('adminLoginError');
  const toggleBtn=document.getElementById('toggleAdminLoginPassword');
  const submitBtn=document.getElementById('adminLoginSubmitBtn');

  function showError(msg){errorBox.querySelector('span').textContent=msg;errorBox.classList.add('show');}
  function hideError(){errorBox.classList.remove('show');}

  if(new URLSearchParams(location.search).get('sesion')==='expirada'){
    showError('Tu sesión expiró por inactividad. Inicia sesión de nuevo.');
  }
  if(new URLSearchParams(location.search).get('sesion')==='suspendida'){
    showError('El acceso de tu residencial está suspendido por falta de pago. Contacta a administración de VIGIA para reactivarlo.');
  }

  toggleBtn.addEventListener('click',()=>{
    const isPw=passwordInput.type==='password';
    passwordInput.type=isPw?'text':'password';
    setIconContent(toggleBtn,isPw?'bi-eye-slash':'bi-eye');
  });

  form.addEventListener('submit',async(e)=>{
    e.preventDefault();hideError();
    const email=emailInput.value.trim(),password=passwordInput.value;
    if(!email||!password){showError('Escribe tu correo y contraseña.');return;}
    const originalContent=[...submitBtn.childNodes].map(node=>node.cloneNode(true));
    submitBtn.disabled=true;
    setButtonContent(submitBtn,'bi-arrow-repeat','Verificando...');
    const result=await AdminAuthStore.login(email,password);
    if(!result.ok){showError(result.error);submitBtn.disabled=false;submitBtn.replaceChildren(...originalContent.map(node=>node.cloneNode(true)));return;}
    setButtonContent(submitBtn,'bi-check-lg','¡Bienvenido!');
    window.location.href='superadmin.html';
  });
})();
