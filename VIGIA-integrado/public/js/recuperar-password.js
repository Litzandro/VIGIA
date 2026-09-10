// ============ RECUPERAR-PASSWORD.JS ============
// Flujo nuevo: en vez de mandar un correo con un enlace (que dependia
// del SMTP de Railway y no era confiable), se pide el correo, se
// muestra la pregunta de seguridad que la persona eligio al
// registrarse, y si contesta bien se recibe un token que se usa en
// restablecer-password.html exactamente igual que si hubiera llegado
// por correo.
(function(){
  const forgotForm=document.getElementById('forgotForm');
  if(!forgotForm)return;

  const answerForm=document.getElementById('answerForm');
  const emailInput=document.getElementById('forgotEmail');
  const preguntaLabel=document.getElementById('preguntaLabel');
  const respuestaInput=document.getElementById('respuestaInput');
  const errorBox=document.getElementById('forgotError');
  const subText=document.getElementById('recoverSub');
  const forgotSubmitBtn=document.getElementById('forgotSubmitBtn');
  const answerSubmitBtn=document.getElementById('answerSubmitBtn');

  let emailConfirmado='';

  function showError(msg){ errorBox.querySelector('span').textContent=msg; errorBox.classList.add('show'); }
  function hideError(){ errorBox.classList.remove('show'); }

  forgotForm.addEventListener('submit',async(e)=>{
    e.preventDefault();
    hideError();
    const email=emailInput.value.trim();
    if(!email){ showError('Escribe tu correo electrónico.'); return; }

    const originalHTML=forgotSubmitBtn.innerHTML;
    forgotSubmitBtn.disabled=true;
    forgotSubmitBtn.innerHTML='<i class="bi bi-arrow-repeat"></i> Buscando...';

    try{
      // Endpoint publico (no requiere sesion): se llama directo con
      // fetch en vez de VigiaAPI.request para no arrastrar la logica de
      // cola offline, que no aplica aqui.
      const response=await fetch(VigiaAPI.BASE_URL+'/auth/recuperar-pregunta',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email}),
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||'No pudimos encontrar esa cuenta.');

      emailConfirmado=email;
      preguntaLabel.textContent=data.pregunta;
      subText.textContent='Contesta tu pregunta de seguridad para continuar.';
      forgotForm.style.display='none';
      answerForm.style.display='block';
      respuestaInput.focus();
    }catch(err){
      showError(err.message||'No se pudo conectar con el servidor.');
    }finally{
      forgotSubmitBtn.disabled=false;
      forgotSubmitBtn.innerHTML=originalHTML;
    }
  });

  answerForm.addEventListener('submit',async(e)=>{
    e.preventDefault();
    hideError();
    const respuesta=respuestaInput.value.trim();
    if(!respuesta){ showError('Escribe tu respuesta.'); return; }

    const originalHTML=answerSubmitBtn.innerHTML;
    answerSubmitBtn.disabled=true;
    answerSubmitBtn.innerHTML='<i class="bi bi-arrow-repeat"></i> Verificando...';

    try{
      const response=await fetch(VigiaAPI.BASE_URL+'/auth/verificar-respuesta',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:emailConfirmado,respuesta}),
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||'La respuesta no es correcta.');

      // Mismo token que antes viajaba en el enlace del correo: se reusa
      // restablecer-password.html sin ningun cambio.
      window.location.href='restablecer-password.html?token='+encodeURIComponent(data.token);
    }catch(err){
      showError(err.message||'No se pudo conectar con el servidor.');
      answerSubmitBtn.disabled=false;
      answerSubmitBtn.innerHTML=originalHTML;
    }
  });
})();
