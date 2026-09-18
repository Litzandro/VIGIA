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
  }

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
      const toggle=makeButton(x.estado==='activo'?'Suspender':'Activar','btn btn-ghost','toggle',x.id,nextState);
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
