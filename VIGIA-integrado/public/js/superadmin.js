(function () {
  const form = document.getElementById('accountForm');
  if (!form) return;

  const session = VigiaAPI.getSession();
  const isSuper = session.rol_codigo === 'superadmin';
  let users = [];
  let roles = [];
  let residentials = [];

  if (!isSuper) {
    document.getElementById('residentialPanel').style.display = 'none';
    document.getElementById('subscriptionLink').style.display = 'none';
    // Sin el panel "Nueva residencial", el layout de 2 columnas dejaba
    // "Crear cuenta" ocupando solo la mitad izquierda con la derecha en
    // blanco -- se colapsa a 1 columna para que aproveche todo el ancho.
    document.getElementById('accountsLayout').classList.add('single-col');
  }

  // ---------- RESUMEN OPERATIVO ----------
  // Antes el portal de administracion abria directo en "Crear cuenta":
  // ni una sola metrica de como esta la residencial en este momento
  // (incidencias, SOS, turnos, cola) sin entrar pagina por pagina.
  const NIVEL_CLS={critica:'alert',alta:'warn',media:'info'};
  const RANGO_LABEL={hoy:'Accesos hoy',7:'Accesos últimos 7 días','7':'Accesos últimos 7 días',30:'Accesos últimos 30 días','30':'Accesos últimos 30 días',todo:'Accesos totales'};
  let rangoAccesos='hoy';
  async function cargarResumenOperativo(){
    const sub=document.getElementById('aoSubtitle');
    try{
      const r=await VigiaAPI.request(`/centro-seguridad/resumen?rango=${rangoAccesos}`);
      const d=r.data||{},m=d.metricas||{};
      document.getElementById('aoPorAprobar').textContent=m.incidencias_por_aprobar||0;
      document.getElementById('aoAbiertas').textContent=m.incidencias_abiertas||0;
      document.getElementById('aoSOS').textContent=m.alertas_sos||0;
      document.getElementById('aoTurnos').textContent=m.guardias_activos||0;
      document.getElementById('aoCola').textContent=m.cola_activa||0;
      document.getElementById('aoAccesos').textContent=(m.accesos_rango!=null?m.accesos_rango:m.accesos_hoy)||0;
      document.getElementById('aoAccesosLabel').textContent=RANGO_LABEL[rangoAccesos]||'Accesos hoy';
      document.querySelectorAll('#aoGrid .ao-stat').forEach(el=>{
        const v=Number(el.querySelector('.ao-val').textContent)||0;
        el.classList.toggle('has-value',v>0);
      });
      const box=document.getElementById('aoAlerts');
      const reglas=d.reglas||[];
      box.hidden=!reglas.length;
      box.innerHTML=reglas.map(x=>`<div class="ao-alert ${NIVEL_CLS[x.nivel]||'info'}"><i class="bi bi-exclamation-triangle-fill"></i><span>${escapeHtml(x.mensaje)}</span></div>`).join('');
      sub.textContent=reglas.length?`${reglas.length} cosa${reglas.length===1?'':'s'} necesita${reglas.length===1?'':'n'} tu atención.`:'Todo en orden por ahora.';
    }catch(err){
      sub.textContent='No se pudo cargar el resumen.';
    }
  }
  document.querySelectorAll('#aoRange button').forEach(b=>{
    b.addEventListener('click',()=>{
      if(b.classList.contains('active'))return;
      document.querySelectorAll('#aoRange button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      rangoAccesos=b.dataset.rango;
      cargarResumenOperativo();
    });
  });
  document.getElementById('aoRefresh').addEventListener('click',cargarResumenOperativo);
  cargarResumenOperativo();
  setInterval(cargarResumenOperativo,30000);

  attachTelefonoHNMask(document.getElementById('adPhone'));attachPhoneCountryCode(document.getElementById('adPhone'));
  attachSoloLetras(document.getElementById('adName'),20);
  attachSoloLetras(document.getElementById('adLast'),20);
  attachSoloLetras(document.getElementById('reName'),150);

  const roleSelect = document.getElementById('adRole');
  function toggleFields() {
    document.getElementById('residentFields').style.display = roleSelect.value === 'residente' ? 'grid' : 'none';
    document.getElementById('guardFields').style.display = roleSelect.value === 'guardia' ? 'grid' : 'none';
  }
  roleSelect.addEventListener('change', toggleFields);
  toggleFields();

  function makeCell(text){
    const td=document.createElement('td');td.textContent=text==null?'':String(text);return td;
  }
  function makeButton(label,className,action,id,state){
    const button=document.createElement('button');button.type='button';button.className=className;button.textContent=label;
    button.dataset.action=action;button.dataset.id=id;if(state)button.dataset.state=state;return button;
  }
  async function confirmAction(options){
    return window.VigiaConfirm?VigiaConfirm(options):confirm(options.message||options.title||'¿Confirmar?');
  }

  function render() {
    const roleMap = new Map(roles.map((x) => [String(x.id), x.codigo]));
    const residentialMap = new Map(residentials.map((x) => [String(x.id), x.nombre]));
    const activos = users.filter((x) => x.estado !== 'inactivo');
    document.getElementById('statUsers').textContent = activos.length;
    document.getElementById('statGuards').textContent = activos.filter((x) => roleMap.get(String(x.rol_id)) === 'guardia').length;
    document.getElementById('statResidents').textContent = activos.filter((x) => roleMap.get(String(x.rol_id)) === 'residente').length;
    document.getElementById('statResidentials').textContent = residentials.length;

    const q = document.getElementById('userSearch').value.trim().toLowerCase();
    const rows = activos.filter((x) => !q || `${x.nombre} ${x.apellido} ${x.email}`.toLowerCase().includes(q));
    const tbody=document.getElementById('userRows');tbody.replaceChildren();
    if(!rows.length){const tr=document.createElement('tr');const td=makeCell('No hay resultados.');td.colSpan=6;tr.appendChild(td);tbody.appendChild(tr);return;}

    rows.forEach((x)=>{
      const role=roleMap.get(String(x.rol_id))||`#${x.rol_id}`;
      const residential=residentialMap.get(String(x.residencial_id))||'Global';
      const nextState=x.estado==='activo'?'suspendido':'activo';
      const tr=document.createElement('tr');
      tr.append(makeCell(`${x.nombre} ${x.apellido}`),makeCell(x.email),makeCell(role),makeCell(residential));
      const stateTd=document.createElement('td');const state=document.createElement('span');state.className=`badge ${x.estado==='activo'?'ok':'blocked'}`;state.textContent=x.estado;stateTd.appendChild(state);tr.appendChild(stateTd);
      const actions=document.createElement('td');actions.className='table-actions';
      // Nadie puede suspender ni eliminar su propia cuenta (el servidor tambien lo
      // rechaza), y un admin no gestiona a otros admins: solo superadmin.
      if(String(x.id)===String(session.id)){actions.appendChild(Object.assign(document.createElement('span'),{className:'badge info',textContent:'Tu cuenta'}));tr.appendChild(actions);tbody.appendChild(tr);return;}
      if(!isSuper&&['admin','superadmin'].includes(role)){actions.appendChild(Object.assign(document.createElement('span'),{className:'badge neutral',textContent:'Solo superadmin'}));tr.appendChild(actions);tbody.appendChild(tr);return;}
      const toggle=makeButton(x.estado==='activo'?'Suspender':'Activar',x.estado==='activo'?'btn btn-caution':'btn btn-ok','toggle',x.id,nextState);
      const del=makeButton('Eliminar','btn btn-danger','delete',x.id);
      toggle.addEventListener('click',async()=>{
        const ok=await confirmAction({title:'¿Cambiar estado de la cuenta?',message:`La cuenta pasará a estado ${nextState}.`,confirmText:x.estado==='activo'?'Suspender':'Activar',icon:'bi-person-lock'});if(!ok)return;
        try{await VigiaAPI.request(`/usuarios/${x.id}`,{method:'PATCH',body:JSON.stringify({estado:nextState})});showToast('Cuenta actualizada');await load()}catch(error){showToast(error.message,'bi-exclamation-triangle-fill')}
      });
      del.addEventListener('click',async()=>{
        const ok=await confirmAction({title:'¿Eliminar esta cuenta?',message:'El usuario ya no podrá iniciar sesión ni aparecerá en esta lista.',confirmText:'Eliminar',icon:'bi-trash3'});if(!ok)return;
        try{await VigiaAPI.request(`/usuarios/${x.id}`,{method:'DELETE'});showToast('Usuario eliminado');await load()}catch(error){showToast(error.message,'bi-exclamation-triangle-fill')}
      });
      actions.append(toggle,del);tr.appendChild(actions);tbody.appendChild(tr);
    });
  }

  async function load() {
    try {
      const [usersResult, rolesResult, residentialsResult] = await Promise.all([
        VigiaAPI.request('/usuarios'),
        VigiaAPI.request('/roles?limit=20'),
        VigiaAPI.request('/residenciales?limit=300'),
      ]);
      users = usersResult.data || [];
      roles = rolesResult.data || [];
      residentials = residentialsResult.data || [];
      const residentialSelect=document.getElementById('adResidential');
      residentialSelect.replaceChildren();
      residentials.forEach((x)=>{const option=document.createElement('option');option.value=x.id;option.textContent=x.nombre;residentialSelect.appendChild(option)});
      render();
    } catch (error) {
      showToast(error.message, 'bi-exclamation-triangle-fill');
    }
  }

  document.getElementById('userSearch').addEventListener('input', render);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const role = roleSelect.value;
    const payload = {
      rol_codigo: role,
      residencial_id: Number(document.getElementById('adResidential').value),
      nombre: document.getElementById('adName').value.trim(),
      apellido: document.getElementById('adLast').value.trim(),
      email: document.getElementById('adEmail').value.trim(),
      telefono: document.getElementById('adPhone').value.trim() || null,
      password: document.getElementById('adPassword').value,
    };
    if (role === 'residente') {
      payload.numero_vivienda = document.getElementById('adHome').value.trim();
      payload.bloque_torre = document.getElementById('adBlock').value.trim() || null;
    }
    if (role === 'guardia') {
      payload.numero_empleado = document.getElementById('adEmployee').value.trim() || null;
      payload.turno = document.getElementById('adShift').value;
    }
    try {
      await VigiaAPI.request('/usuarios/admin-create', {
        method: 'POST',
        body: JSON.stringify(payload),
        offline: false,
      });
      form.reset();
      toggleFields();
      showToast('Cuenta creada correctamente');
      await load();
    } catch (error) {
      showToast(error.message, 'bi-exclamation-triangle-fill');
    }
  });

  const residentialForm = document.getElementById('residentialForm');
  residentialForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await VigiaAPI.request('/residenciales', {
        method: 'POST',
        body: JSON.stringify({
          nombre: document.getElementById('reName').value.trim(),
          ciudad: document.getElementById('reCity').value.trim() || null,
          pais: document.getElementById('reCountry').value.trim() || 'Honduras',
          direccion: document.getElementById('reAddress').value.trim() || null,
          email_contacto: document.getElementById('reEmail').value.trim() || null,
          zona_horaria: document.getElementById('reZone').value.trim() || 'America/Tegucigalpa',
        }),
      });
      residentialForm.reset();
      document.getElementById('reCountry').value = 'Honduras';
      document.getElementById('reZone').value = 'America/Tegucigalpa';
      showToast('Residencial creada');
      await load();
    } catch (error) {
      showToast(error.message, 'bi-exclamation-triangle-fill');
    }
  });

  load();
})();
