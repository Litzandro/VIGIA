// ============ GUARDIA-LOGIN.JS ============
(function(){
  const form=document.getElementById('guardLoginForm');
  if(!form || typeof GuardAuthStore==='undefined') return;

  const emailInput=document.getElementById('guardLoginEmail');
  const passwordInput=document.getElementById('guardLoginPassword');
  const errorBox=document.getElementById('guardLoginError');
  const toggleBtn=document.getElementById('toggleGuardLoginPassword');
  const submitBtn=document.getElementById('guardLoginSubmitBtn');

  function showError(msg){errorBox.querySelector('span').textContent=msg;errorBox.classList.add('show');}
  function hideError(){errorBox.classList.remove('show');}

  toggleBtn.addEventListener('click',()=>{
    const isPw=passwordInput.type==='password';
    passwordInput.type=isPw?'text':'password';
    toggleBtn.innerHTML=isPw?'<i class="bi bi-eye-slash"></i>':'<i class="bi bi-eye"></i>';
  });

  form.addEventListener('submit',async(e)=>{
    e.preventDefault();hideError();
    const email=emailInput.value.trim(),password=passwordInput.value;
    if(!email||!password){showError('Escribe tu correo y contraseña.');return;}
    const originalHTML=submitBtn.innerHTML;
    submitBtn.disabled=true;
    submitBtn.innerHTML='<i class="bi bi-arrow-repeat"></i> Verificando...';
    const result=await GuardAuthStore.login(email,password);
    if(!result.ok){showError(result.error);submitBtn.disabled=false;submitBtn.innerHTML=originalHTML;return;}
    submitBtn.innerHTML='<i class="bi bi-check-lg"></i> ¡Bienvenido!';
    window.location.href='guardia.html';
  });
})();
