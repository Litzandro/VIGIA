// ============ REGISTER.JS ============
(function(){
  const form=document.getElementById('registerForm');
  if(!form || typeof AuthStore==='undefined') return;

  const nameInput=document.getElementById('regName');
  const emailInput=document.getElementById('regEmail');
  const phoneInput=document.getElementById('regPhone');
  const unidadInput=document.getElementById('regUnidad');
  const coloniaInput=document.getElementById('regColonia');
  const passwordInput=document.getElementById('regPassword');
  const passwordConfirmInput=document.getElementById('regPasswordConfirm');
  const termsInput=document.getElementById('acceptTerms');
  const errorBox=document.getElementById('registerError');
  const toggleBtn=document.getElementById('toggleRegPassword');
  const submitBtn=document.getElementById('registerSubmitBtn');

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
    const payload={
      name:nameInput.value.trim(), email:emailInput.value.trim(), phone:phoneInput.value.trim(),
      unidad:unidadInput.value.trim(), colonia:coloniaInput.value, password:passwordInput.value
    };
    const passwordConfirm=passwordConfirmInput.value;

    if(Object.values(payload).some(v=>!v) || !passwordConfirm){showError('Completa todos los campos para continuar.');return;}
    if(payload.password.length<6){showError('La contraseña debe tener al menos 6 caracteres.');return;}
    if(payload.password!==passwordConfirm){showError('Las contraseñas no coinciden.');return;}
    if(!termsInput.checked){showError('Debes aceptar los términos de uso para continuar.');return;}

    const originalHTML=submitBtn.innerHTML;
    submitBtn.disabled=true;
    submitBtn.innerHTML='<i class="bi bi-arrow-repeat"></i> Creando cuenta...';

    const result=await AuthStore.register(payload);
    if(!result.ok){
      showError(result.error);
      submitBtn.disabled=false;
      submitBtn.innerHTML=originalHTML;
      return;
    }
    submitBtn.innerHTML='<i class="bi bi-check-lg"></i> ¡Cuenta creada!';
    window.location.href=VigiaAPI.destinationForRole(result.user.rol_codigo);
  });
})();
