// ============ VERIFICACIONES.JS ============
// Escanea (o recibe a mano) el codigo QR de una invitacion y confirma
// contra el backend (GET /invitaciones/validar/:codigo_qr) si de verdad
// lo genero VIGIA -- un codigo inventado nunca va a coincidir con
// ninguna fila real (codigo_qr es un UUID al azar), asi que esto ya es
// suficiente para detectar un codigo falso sin necesitar nada mas.
(function(){
  const video=document.getElementById('qrVideo');
  if(!video)return;

  const videoWrap=document.getElementById('qrVideoWrap');
  const canvas=document.getElementById('qrCanvas');
  const toggleBtn=document.getElementById('qrToggleCam');
  const badge=document.getElementById('qrScanBadge');
  const hint=document.getElementById('qrScanHint');
  const manualInput=document.getElementById('qrManualInput');
  const manualBtn=document.getElementById('qrManualBtn');
  const uploadBtn=document.getElementById('qrUploadBtn');
  const fileInput=document.getElementById('qrFileInput');
  const resultBox=document.getElementById('qrResult');
  const ctx=canvas.getContext('2d',{willReadFrequently:true});

  let stream=null;
  let rafId=null;
  let escaneando=false;

  // La libreria jsQR, cargada por <script> desde CDN (no por import), deja
  // el global como un objeto { default: jsQR } y no como la funcion
  // directa -- un problema conocido de su build UMD. Si se llamara
  // "jsQR(...)" a secas aca (como haria un import normal), fallaria en
  // silencio con "jsQR is not a function". Esto cubre ambos casos.
  function obtenerJsQR(){
    if(typeof jsQR==='function')return jsQR;
    if(typeof jsQR==='object'&&jsQR&&typeof jsQR.default==='function')return jsQR.default;
    return null;
  }

  function estadoLabel(estado){
    return {pendiente:'Pendiente',usada:'Utilizada',expirada:'Expirada',cancelada:'Cancelada'}[estado]||estado;
  }

  function mostrarResultado(valido,motivo,data){
    resultBox.className='qr-result show '+(valido?'valido':'invalido');
    if(valido&&data){
      resultBox.innerHTML=`
        <h4><i class="bi bi-check-circle-fill"></i> Código válido</h4>
        <p><b>${escapeHtml(data.nombre_evento||'Visita')}</b></p>
        <p>Este código fue generado por VIGIA y sigue vigente.</p>
        <p>Usos: ${data.usos_actuales||0} de ${data.max_usos}</p>
        ${data.notas?`<p>${escapeHtml(data.notas)}</p>`:''}
      `;
    }else{
      resultBox.innerHTML=`
        <h4><i class="bi bi-x-circle-fill"></i> Código no válido</h4>
        <p>${escapeHtml(motivo||'No se pudo verificar este código.')}</p>
      `;
    }
  }

  async function verificarCodigo(codigo){
    const limpio=String(codigo||'').trim();
    if(!limpio){showToast('Escribe o escanea un código primero.','bi-exclamation-triangle-fill');return}
    try{
      // /invitaciones/validar/:codigo_qr responde 200 tanto si el
      // codigo es valido como si existe pero ya no aplica (vencido,
      // cancelado, sin usos, todavia no empieza) -- SIEMPRE hay que
      // mirar el "valido"/"motivo" que manda el backend, nunca asumir
      // que un 200 significa que el codigo es valido. Antes esta linea
      // llamaba mostrarResultado(true,null,r.data) sin condicion
      // alguna, por eso un codigo real pero vencido/cancelado/etc
      // siempre terminaba mostrando el mensaje generico de "no se pudo
      // verificar" en vez de la razon real (esto era el bug).
      const r=await VigiaAPI.request(`/invitaciones/validar/${encodeURIComponent(limpio)}`);
      mostrarResultado(r.valido,r.motivo,r.data);
    }catch(err){
      // VigiaAPI.request lanza un Error para el 404 "no valido de
      // verdad" (codigo inventado que no existe en la base) -- el
      // mensaje ya viene en espanol y listo para mostrar tal cual.
      mostrarResultado(false,err.message);
    }
  }

  manualBtn.addEventListener('click',()=>verificarCodigo(manualInput.value));
  manualInput.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();verificarCodigo(manualInput.value)}});

  // Subir una imagen (captura de pantalla o foto del QR) en vez de usar
  // la camara en vivo -- util cuando el visitante manda el QR por
  // WhatsApp en lugar de mostrarlo en persona, o cuando la camara del
  // dispositivo del guardia da problemas.
  if(uploadBtn&&fileInput){
    uploadBtn.addEventListener('click',()=>fileInput.click());
    fileInput.addEventListener('change',async()=>{
      const file=fileInput.files&&fileInput.files[0];
      fileInput.value='';
      if(!file)return;
      const decodeQr=obtenerJsQR();
      if(!decodeQr){
        showToast('No se pudo cargar el lector de QR.','bi-exclamation-triangle-fill');
        return;
      }
      try{
        const bitmap=await cargarImagenComoBitmap(file);
        canvas.width=bitmap.width;
        canvas.height=bitmap.height;
        ctx.drawImage(bitmap,0,0);
        const frame=ctx.getImageData(0,0,canvas.width,canvas.height);
        const code=decodeQr(frame.data,frame.width,frame.height,{inversionAttempts:'attemptBoth'});
        if(code&&code.data){
          manualInput.value=code.data;
          verificarCodigo(code.data);
        }else{
          showToast('No se encontró ningún código QR en esa imagen.','bi-exclamation-triangle-fill');
        }
      }catch(err){
        showToast('No se pudo leer esa imagen. Intenta con otra.','bi-exclamation-triangle-fill');
      }
    });
  }

  function cargarImagenComoBitmap(file){
    if(window.createImageBitmap){
      return createImageBitmap(file);
    }
    // Respaldo para navegadores sin createImageBitmap (ej. Safari viejo).
    return new Promise((resolve,reject)=>{
      const img=new Image();
      const url=URL.createObjectURL(file);
      img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('No se pudo cargar la imagen'))};
      img.src=url;
    });
  }

  function detenerCamara(){
    escaneando=false;
    if(rafId)cancelAnimationFrame(rafId);
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
    videoWrap.classList.add('hidden');
    badge.textContent='CÁMARA APAGADA';
    toggleBtn.innerHTML='<i class="bi bi-camera-fill"></i> Iniciar cámara';
  }

  function tick(){
    if(!escaneando)return;
    const decodeQr=obtenerJsQR();
    if(video.readyState===video.HAVE_ENOUGH_DATA && decodeQr){
      canvas.width=video.videoWidth;
      canvas.height=video.videoHeight;
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const frame=ctx.getImageData(0,0,canvas.width,canvas.height);
      const code=decodeQr(frame.data,frame.width,frame.height,{inversionAttempts:'dontInvert'});
      if(code&&code.data){
        manualInput.value=code.data;
        verificarCodigo(code.data);
        detenerCamara();
        return;
      }
    }
    rafId=requestAnimationFrame(tick);
  }

  async function iniciarCamara(){
    if(!obtenerJsQR()){
      showToast('No se pudo cargar el lector de QR. Usa el campo manual.','bi-exclamation-triangle-fill');
      return;
    }
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      video.srcObject=stream;
      await video.play();
      videoWrap.classList.remove('hidden');
      badge.textContent='ESCANEANDO';
      toggleBtn.innerHTML='<i class="bi bi-stop-fill"></i> Detener cámara';
      escaneando=true;
      rafId=requestAnimationFrame(tick);
    }catch(err){
      showToast('No se pudo acceder a la cámara. Usa el campo manual para verificar.','bi-exclamation-triangle-fill');
      detenerCamara();
    }
  }

  toggleBtn.addEventListener('click',()=>{
    if(escaneando)detenerCamara();
    else iniciarCamara();
  });

  // Si la persona cambia de pantalla sin apagar la camara a mano, esto
  // evita que se quede prendida de fondo consumiendo bateria/dando una
  // falsa sensacion de privacidad.
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&escaneando)detenerCamara();
  });
})();
