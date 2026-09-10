// ============ REGISTER.JS ============
(function(){
  const form=document.getElementById('registerForm');
  if(!form || typeof AuthStore==='undefined') return;

  const nombreInput=document.getElementById('regNombre');
  const apellidoInput=document.getElementById('regApellido');
  attachSoloLetras(nombreInput,50);
  attachSoloLetras(apellidoInput,50);
  const emailInput=document.getElementById('regEmail');
  const phoneInput=document.getElementById('regPhone');
  attachTelefonoHNMask(phoneInput);
  attachPhoneCountryCode(phoneInput);
  const unidadInput=document.getElementById('regUnidad');
  if(unidadInput)unidadInput.setAttribute('maxlength','60');
  const coloniaInput=document.getElementById('regColonia');
  const codigoInput=document.getElementById('regCodigo');
  const passwordInput=document.getElementById('regPassword');
  const passwordConfirmInput=document.getElementById('regPasswordConfirm');
  const termsInput=document.getElementById('acceptTerms');
  const errorBox=document.getElementById('registerError');
  const toggleBtn=document.getElementById('toggleRegPassword');
  const submitBtn=document.getElementById('registerSubmitBtn');

  function showError(msg){ errorBox.querySelector('span').textContent=msg; errorBox.classList.add('show'); }
  function hideError(){ errorBox.classList.remove('show'); }

  // Un correo valido siempre tiene texto-arroba-texto-punto-texto. Antes
  // el formulario tenia novalidate (para poder mostrar los errores en
  // el mismo cuadro rojo en vez del globo nativo del navegador) pero
  // nunca se reemplazo esa validacion con una propia -- "juanperez",
  // sin arroba ni dominio, pasaba igual de bien que un correo real,
  // aqui y en el backend (ver authController.js).
  const RE_EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Los numeros de Honduras empiezan por 2 (fijo), 3/8/9 (celular) o 7
  // (algunos VoIP/rurales) -- nunca por 0,1,4,5,6. Antes cualquier
  // secuencia de 8 digitos, aunque empezara con un numero que no existe
  // en el plan de numeracion real, se aceptaba igual.
  const RE_TEL_HN=/^[23789]\d{3}-?\d{4}$/;

  toggleBtn.addEventListener('click',()=>{
    const isPw=passwordInput.type==='password';
    passwordInput.type=isPw ? 'text' : 'password';
    toggleBtn.innerHTML=isPw ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
    toggleBtn.setAttribute('aria-label',isPw?'Ocultar contraseña':'Mostrar contraseña');
  });

  form.addEventListener('submit',async(e)=>{
    e.preventDefault();
    hideError();
    const payload={
      nombre:nombreInput.value.trim(), apellido:apellidoInput.value.trim(),
      email:emailInput.value.trim(), phone:phoneInput.value.trim(),
      unidad:unidadInput.value.trim(), colonia:coloniaInput.value,
      codigo_colonia:codigoInput.value.trim(), password:passwordInput.value,
    };
    const passwordConfirm=passwordConfirmInput.value;

    if(Object.values(payload).some(v=>!v) || !passwordConfirm){showError('Completa todos los campos para continuar.');return;}
    if(!RE_EMAIL.test(payload.email)){showError('Escribe un correo electrónico válido (ej. tu@correo.com).');return;}
    if(!RE_TEL_HN.test(payload.phone)){showError('Escribe un teléfono hondureño válido (empieza con 2, 3, 7, 8 o 9).');return;}
    if(payload.password.length<8){showError('La contraseña debe tener al menos 8 caracteres.');return;}
    if(!/[a-z]/.test(payload.password)||!/[A-Z]/.test(payload.password)||!/[0-9]/.test(payload.password)){showError('La contraseña debe incluir mayúscula, minúscula y número.');return;}
    if(payload.password!==passwordConfirm){showError('Las contraseñas no coinciden.');return;}
    if(!termsInput.checked){showError('Debes aceptar los Términos y Condiciones para continuar.');return;}

    const originalHTML=submitBtn.innerHTML;
    submitBtn.disabled=true;
    submitBtn.innerHTML='<i class="bi bi-arrow-repeat"></i> Creando cuenta...';

    // Antes esto se juntaba en un solo campo "name" y el backend lo
    // volvia a partir por el primer espacio -- eso rompia cualquier
    // nombre o apellido con mas de una palabra (ej. "Ana Maria" o
    // "Rodriguez Lopez"). Ahora nombre y apellido viajan por separado
    // de punta a punta, tal como la persona los escribio.
    const result=await AuthStore.register({
      nombre:payload.nombre, apellido:payload.apellido,
      email:payload.email, phone:payload.phone, unidad:payload.unidad,
      colonia:payload.colonia, codigo_colonia:payload.codigo_colonia,
      password:payload.password,
    });
    if(!result.ok){
      showError(result.error);
      submitBtn.disabled=false;
      submitBtn.innerHTML=originalHTML;
      return;
    }
    submitBtn.innerHTML='<i class="bi bi-check-lg"></i> ¡Cuenta creada!';
    // La cuenta ya quedo guardada, pero todavia no esta verificada --
    // no puede iniciar sesion hasta confirmar el correo (authController
    // lo rechaza con "necesita_verificacion"). Se manda a login con un
    // aviso especifico en vez del generico "cuenta creada" de antes.
    window.location.href='login.html?cuenta=verificar';
  });
})();
