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

  // ---- Registrar el ingreso desde la misma pantalla ----
  // Antes esta pagina solo CONFIRMABA que el codigo era valido; para que
  // el uso se descontara, el guardia tenia que ir a otra pantalla. Eso
  // hacia imposible llevar la cuenta de una fiesta ("12 de 40 ingresaron"):
  // un mismo QR de evento se escanea muchas veces y cada entrada debe
  // descontar un cupo. Ahora, con un codigo valido, aparece el boton
  // "Registrar ingreso" (POST /accesos con invitacion_id, que es lo que
  // descuenta el uso en el servidor).
  let puntos=null;
  async function cargarPuntos(){
    if(puntos)return puntos;
    try{const r=await VigiaAPI.request('/puntos-acceso?limit=100');puntos=r.data||[]}catch(e){puntos=[]}
    return puntos;
  }

  async function registrarIngreso(data,btn,selectPunto){
    const punto=Number(selectPunto?selectPunto.value:(puntos&&puntos[0]&&puntos[0].id));
    if(!punto){showToast('No hay un punto de acceso configurado.','bi-exclamation-triangle-fill');return}
    btn.disabled=true;
    try{
      await VigiaAPI.request('/accesos',{method:'POST',body:JSON.stringify({
        punto_acceso_id:punto,invitacion_id:data.id,tipo_movimiento:'entrada',modo_registro:'qr',
        observaciones:(data.nombre_evento||'Visita').slice(0,200)
      })});
      showToast('Ingreso registrado');
      await verificarCodigo(data.codigo_qr);
    }catch(err){
      showToast(err.message,'bi-exclamation-triangle-fill');
      btn.disabled=false;
    }
  }

  async function mostrarResultado(valido,motivo,data){
    resultBox.className='qr-result show '+(valido?'valido':'invalido');
    if(valido&&data){
      const usos=data.usos_actuales||0,max=data.max_usos||1;
      const esEvento=data.tipo==='evento';
      const pct=Math.min(100,Math.round(usos/max*100));
      resultBox.innerHTML=`
        <h4><i class="bi bi-check-circle-fill"></i> Código válido</h4>
        <p><b>${escapeHtml(data.nombre_evento||'Visita')}</b>${esEvento?' · <span class="badge info">Evento</span>':''}</p>
        <p>Este código fue generado por VIGIA y sigue vigente.</p>
        <p>${esEvento?'Ya ingresaron':'Usos'}: <b>${usos} de ${max}</b>${esEvento?' · quedan '+(max-usos)+' cupos':''}</p>
        ${esEvento?`<div class="event-progress"><span style="width:${pct}%"></span></div>`:''}
        ${data.notas&&!esEvento?`<p>${escapeHtml(data.notas)}</p>`:''}
        <div class="qr-result-actions" id="qrResultActions"></div>
      `;
      const lista=await cargarPuntos();
      const cont=document.getElementById('qrResultActions');
      if(!cont)return;
      let sel=null;
      if(lista.length>1){
        sel=document.createElement('select');sel.className='form-control';sel.setAttribute('aria-label','Punto de acceso');
        sel.innerHTML=lista.map(p=>`<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
        cont.appendChild(sel);
      }
      const btn=document.createElement('button');
      btn.type='button';btn.className='btn btn-solid';
      btn.innerHTML='<i class="bi bi-box-arrow-in-right"></i> Registrar ingreso'+(esEvento?' (+1)':'');
      btn.addEventListener('click',()=>registrarIngreso(data,btn,sel));
      cont.appendChild(btn);
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
