// ============ RECUPERAR-PASSWORD.JS ============
(function(){
  const form=document.getElementById('forgotForm');
  if(!form)return;

  const emailInput=document.getElementById('forgotEmail');
  const errorBox=document.getElementById('forgotError');
  const successBox=document.getElementById('forgotSuccess');
  const submitBtn=document.getElementById('forgotSubmitBtn');

  function showError(msg){ successBox.classList.remove('show'); errorBox.querySelector('span').textContent=msg; errorBox.classList.add('show'); }
  function showSuccess(msg){ errorBox.classList.remove('show'); successBox.querySelector('span').textContent=msg; successBox.classList.add('show'); }

  form.addEventListener('submit',async(e)=>{
    e.preventDefault();
    const email=emailInput.value.trim();
    if(!email){ showError('Escribe tu correo electrónico.'); return; }

    const originalHTML=submitBtn.innerHTML;
    submitBtn.disabled=true;
    submitBtn.innerHTML='<i class="bi bi-arrow-repeat"></i> Enviando...';

    try{
      // Endpoint publico (no requiere sesion): se llama directo con fetch
      // en vez de VigiaAPI.request para no arrastrar la logica de cola
      // offline, que no aplica aqui.
      const response=await fetch(VigiaAPI.BASE_URL+'/auth/forgot-password',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email}),
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||'No se pudo procesar la solicitud.');

      showSuccess(data.mensaje||'Si el correo esta registrado, te enviamos un enlace para recuperar tu contraseña.');
      form.reset();
    }catch(err){
      showError(err.message||'No se pudo conectar con el servidor.');
    }finally{
      submitBtn.disabled=false;
      submitBtn.innerHTML=originalHTML;
    }
  });
})();
