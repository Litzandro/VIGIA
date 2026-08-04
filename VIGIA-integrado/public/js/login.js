// ============ LOGIN.JS ============
(function(){
  const form=document.getElementById('loginForm');
  if(!form || typeof AuthStore==='undefined') return;

  const emailInput=document.getElementById('loginEmail');
  const passwordInput=document.getElementById('loginPassword');
  const errorBox=document.getElementById('loginError');
  const toggleBtn=document.getElementById('toggleLoginPassword');
  const submitBtn=document.getElementById('loginSubmitBtn');

  function showError(msg){ errorBox.querySelector('span').textContent=msg; errorBox.classList.add('show'); }
  function hideError(){ errorBox.classList.remove('show'); }

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

    const result=await AuthStore.login(email,password);
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
