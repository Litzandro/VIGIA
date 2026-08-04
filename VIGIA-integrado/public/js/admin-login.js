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
    const result=await AdminAuthStore.login(email,password);
    if(!result.ok){showError(result.error);submitBtn.disabled=false;submitBtn.innerHTML=originalHTML;return;}
    submitBtn.innerHTML='<i class="bi bi-check-lg"></i> ¡Bienvenido!';
    window.location.href='superadmin.html';
  });
})();
