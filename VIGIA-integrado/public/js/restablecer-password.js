// ============ RESTABLECER-PASSWORD.JS ============
(function(){
  const form=document.getElementById('resetForm');
  if(!form)return;

  const passwordInput=document.getElementById('resetPassword');
  const confirmInput=document.getElementById('resetPasswordConfirm');
  const errorBox=document.getElementById('resetError');
  const successBox=document.getElementById('resetSuccess');
  const submitBtn=document.getElementById('resetSubmitBtn');
  const toggleBtn=document.getElementById('toggleResetPassword');

  const token=new URLSearchParams(location.search).get('token');

  function showError(msg){ successBox.classList.remove('show'); errorBox.querySelector('span').textContent=msg; errorBox.classList.add('show'); }
  function showSuccess(msg){ errorBox.classList.remove('show'); successBox.querySelector('span').textContent=msg; successBox.classList.add('show'); }

  if(!token){
    showError('Este enlace no es válido. Solicita uno nuevo desde "Recuperar contraseña".');
    form.querySelectorAll('input,button').forEach(el=>el.disabled=true);
    return;
  }

  toggleBtn.addEventListener('click',()=>{
    const isPw=passwordInput.type==='password';
    passwordInput.type=isPw ? 'text' : 'password';
    setIconContent(toggleBtn,isPw?'bi-eye-slash':'bi-eye');
  });

  form.addEventListener('submit',async(e)=>{
    e.preventDefault();
    const password=passwordInput.value;
    const confirm=confirmInput.value;

    if(!password || !confirm){ showError('Completa ambos campos.'); return; }
    if(password!==confirm){ showError('Las contraseñas no coinciden.'); return; }
    if(password.length<8){ showError('La contraseña debe tener al menos 8 caracteres.'); return; }

    const originalContent=[...submitBtn.childNodes].map(node=>node.cloneNode(true));
    submitBtn.disabled=true;
    setButtonContent(submitBtn,'bi-arrow-repeat','Guardando...');

    try{
      const response=await fetch(VigiaAPI.BASE_URL+'/auth/reset-password',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,password}),
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||'No se pudo actualizar la contraseña.');

      showSuccess((data.mensaje||'Tu contraseña se actualizó correctamente.')+' Redirigiendo al inicio de sesión...');
      form.reset();
      form.querySelectorAll('input,button').forEach(el=>el.disabled=true);
      setTimeout(()=>{ window.location.href='login.html'; },2200);
    }catch(err){
      showError(err.message||'No se pudo conectar con el servidor.');
      submitBtn.disabled=false;
      submitBtn.replaceChildren(...originalContent.map(node=>node.cloneNode(true)));
    }
  });
})();
