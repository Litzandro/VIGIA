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

  attachTelefonoHNMask(document.getElementById('adPhone'));

  const roleSelect = document.getElementById('adRole');
  function toggleFields() {
    document.getElementById('residentFields').style.display = roleSelect.value === 'residente' ? 'grid' : 'none';
    document.getElementById('guardFields').style.display = roleSelect.value === 'guardia' ? 'grid' : 'none';
  }
  roleSelect.addEventListener('change', toggleFields);
  toggleFields();

  function render() {
    const roleMap = new Map(roles.map((x) => [String(x.id), x.codigo]));
    const residentialMap = new Map(residentials.map((x) => [String(x.id), x.nombre]));
    document.getElementById('statUsers').textContent = users.length;
    document.getElementById('statGuards').textContent = users.filter((x) => roleMap.get(String(x.rol_id)) === 'guardia').length;
    document.getElementById('statResidents').textContent = users.filter((x) => roleMap.get(String(x.rol_id)) === 'residente').length;
    document.getElementById('statResidentials').textContent = residentials.length;

    const q = document.getElementById('userSearch').value.trim().toLowerCase();
    const rows = users.filter((x) => !q || `${x.nombre} ${x.apellido} ${x.email}`.toLowerCase().includes(q));
    document.getElementById('userRows').innerHTML = rows.length
      ? rows.map((x) => {
        const role = roleMap.get(String(x.rol_id)) || `#${x.rol_id}`;
        const residential = residentialMap.get(String(x.residencial_id)) || 'Global';
        const nextState = x.estado === 'activo' ? 'suspendido' : 'activo';
        return `<tr>
          <td>${escapeHtml(`${x.nombre} ${x.apellido}`)}</td>
          <td>${escapeHtml(x.email)}</td>
          <td>${escapeHtml(role)}</td>
          <td>${escapeHtml(residential)}</td>
          <td><span class="badge ${x.estado === 'activo' ? 'ok' : 'blocked'}">${escapeHtml(x.estado)}</span></td>
          <td><button class="btn btn-ghost" data-id="${x.id}" data-state="${nextState}">${x.estado === 'activo' ? 'Suspender' : 'Activar'}</button></td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="6">No hay resultados.</td></tr>';

    document.querySelectorAll('#userRows button').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm(`¿Cambiar la cuenta a ${button.dataset.state}?`)) return;
        try {
          await VigiaAPI.request(`/usuarios/${button.dataset.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ estado: button.dataset.state }),
          });
          showToast('Cuenta actualizada');
          await load();
        } catch (error) {
          showToast(error.message, 'bi-exclamation-triangle-fill');
        }
      });
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
      document.getElementById('adResidential').innerHTML = residentials
        .map((x) => `<option value="${x.id}">${escapeHtml(x.nombre)}</option>`)
        .join('');
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
