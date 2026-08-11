// ============ VISITAS.JS ============
// VIGIA - Visitas conectadas a MySQL

(function () {

  if (typeof VigiaAPI === 'undefined') {
    console.error('VigiaAPI no está disponible.');
    return;
  }

  const session = VigiaAPI.getSession();

  if (!session) {
    location.replace('login.html');
    return;
  }

  const tabsGroup = document.querySelector('.agenda-tabs');
  const emptyMsg = document.getElementById('visitEmptyMsg');

  const modal = document.getElementById('newVisitModal');
  const cancelBtn = document.getElementById('newVisitCancel');
  const form = document.getElementById('newVisitForm');

  const nameInput = document.getElementById('visitName');
  const dateInput = document.getElementById('visitDate');
  const timeInput = document.getElementById('visitTime');
  const reasonInput = document.getElementById('visitReason');

  const nowCheckbox = document.getElementById('visitNow');
  const dateTimeGroup = document.getElementById('visitDateTimeGroup');

  const recurringCheckbox = document.getElementById('visitRecurring');
  const frequencyGroup = document.getElementById('visitFrequencyGroup');
  const frequencyInput = document.getElementById('visitFrequency');

  const MESES = [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Oct',
    'Nov',
    'Dic'
  ];

  const STATUS_BY_LABEL = {
    'Próximas': 'proxima',
    'Historial': 'historial',
    'Recurrentes': 'recurrente'
  };

  const EMPTY_TEXT = {
    proxima: 'No tienes visitas próximas agendadas.',
    historial: 'Aún no hay visitas en tu historial.',
    recurrente: 'No tienes visitas recurrentes configuradas.'
  };


  // ==============================
  // UTILIDADES
  // ==============================

  function pad(numero) {
    return String(numero).padStart(2, '0');
  }


  function escapeHTML(valor) {

    const div = document.createElement('div');

    div.textContent = valor == null
      ? ''
      : String(valor);

    return div.innerHTML;
  }


  function currentStatus() {

    if (!tabsGroup) {
      return 'proxima';
    }

    const active =
      tabsGroup.querySelector('button.active');

    return active
      ? STATUS_BY_LABEL[active.textContent.trim()]
      : 'proxima';
  }


  function formatTime(fecha) {

    const d = new Date(fecha);

    if (Number.isNaN(d.getTime())) {
      return '';
    }

    return d.toLocaleTimeString(
      'es-HN',
      {
        hour: 'numeric',
        minute: '2-digit'
      }
    );
  }


  function fechaLocalParaISO(fecha, hora) {

    const fechaCompleta =
      new Date(`${fecha}T${hora}:00`);

    if (Number.isNaN(fechaCompleta.getTime())) {
      return null;
    }

    return fechaCompleta.toISOString();
  }


  function mostrarError(mensaje) {

    console.error(mensaje);

    if (typeof showToast === 'function') {
      showToast(mensaje);
    } else {
      alert(mensaje);
    }
  }


  // ==============================
  // PESTAÑAS
  // ==============================

  function applyTab() {

    const status = currentStatus();

    let visibleCount = 0;

    document
      .querySelectorAll('.visit-row')
      .forEach(row => {

        const match =
          row.dataset.status === status;

        row.style.display =
          match ? '' : 'none';

        if (match) {
          visibleCount++;
        }

      });


    if (emptyMsg) {

      emptyMsg.textContent =
        visibleCount === 0
          ? EMPTY_TEXT[status]
          : '';

    }

  }


  function activateTab(label) {

    if (!tabsGroup) {
      return;
    }

    tabsGroup
      .querySelectorAll('button')
      .forEach(button => {

        button.classList.toggle(
          'active',
          button.textContent.trim() === label
        );

      });

    applyTab();
  }


  if (tabsGroup) {

    tabsGroup
      .querySelectorAll('button')
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            tabsGroup
              .querySelectorAll('button')
              .forEach(b => {
                b.classList.remove('active');
              });

            button.classList.add('active');

            applyTab();

          }
        );

      });

  }


  // ==============================
  // ESTADO DE UNA INVITACIÓN
  // ==============================

  function obtenerEstadoVisual(invitacion) {

    const ahora = Date.now();

    const hasta =
      new Date(
        invitacion.fecha_valida_hasta
      ).getTime();

    const estado =
      String(
        invitacion.estado || ''
      ).toLowerCase();


    if (
      invitacion.tipo === 'temporal' &&
      String(invitacion.notas || '')
        .includes('Frecuencia:')
    ) {
      return 'recurrente';
    }


    if (
      estado === 'cancelada' ||
      estado === 'usada' ||
      estado === 'expirada' ||
      hasta < ahora
    ) {
      return 'historial';
    }


    return 'proxima';
  }


  // ==============================
  // CREAR FILA VISUAL
  // ==============================

  function crearFila(invitacion) {

    const inicio =
      new Date(
        invitacion.fecha_valida_desde
      );

    const status =
      obtenerEstadoVisual(invitacion);


    const row =
      document.createElement('div');

    row.className = 'visit-row';

    row.dataset.status = status;

    row.dataset.id = invitacion.id;


    let fechaHTML = '';


    if (status === 'recurrente') {

      fechaHTML = `
        <div class="visit-date">

          <div
            class="d"
            style="font-size:1.1rem;">

            <i class="bi bi-arrow-repeat"></i>

          </div>

          <div class="m">
            REC
          </div>

        </div>
      `;

    } else {

      fechaHTML = `
        <div class="visit-date">

          <div class="d">
            ${inicio.getDate()}
          </div>

          <div class="m">
            ${MESES[inicio.getMonth()]}
          </div>

        </div>
      `;

    }


    let badgeClass = 'warn';
    let badgeText = 'Pendiente';


    if (status === 'recurrente') {

      badgeClass = 'ok';
      badgeText = 'Autorizado';

    } else if (
      status === 'historial'
    ) {

      badgeClass = '';
      badgeText =
        invitacion.estado === 'usada'
          ? 'Utilizada'
          : 'Finalizada';

    }


    const nombre =
      invitacion.nombre_evento ||
      'Visitante';


    let detalle = '';


    if (status === 'recurrente') {

      detalle =
        invitacion.notas ||
        'Visita recurrente';

    } else {

      detalle =
        `${formatTime(
          invitacion.fecha_valida_desde
        )} · ${
          invitacion.notas ||
          'Visita'
        }`;

    }


    row.innerHTML = `

      ${fechaHTML}

      <div class="visit-info">

        <b>
          ${escapeHTML(nombre)}
        </b>

        <span>
          ${escapeHTML(detalle)}
        </span>

      </div>

      <div class="visit-code">
        ${escapeHTML(
          invitacion.codigo_qr ||
          'Generando...'
        )}
      </div>

      <span class="badge ${badgeClass}">
        ${badgeText}
      </span>
    `;


    return row;
  }


  function insertarFila(row) {

    const firstRow =
      document.querySelector('.visit-row');


    if (firstRow) {

      firstRow.parentElement.insertBefore(
        row,
        firstRow
      );

      return;

    }


    if (
      emptyMsg &&
      emptyMsg.parentElement
    ) {

      emptyMsg.parentElement.insertBefore(
        row,
        emptyMsg
      );

    }

  }


  // ==============================
  // CARGAR VISITAS DESDE MYSQL
  // ==============================

  async function cargarVisitas() {

    try {

      const respuesta =
        await VigiaAPI.request(
          '/invitaciones?limit=100&sort=fecha_valida_desde:asc'
        );


      const invitaciones =
        Array.isArray(respuesta.data)
          ? respuesta.data
          : [];


      document
        .querySelectorAll('.visit-row')
        .forEach(row => row.remove());


      invitaciones.forEach(
        invitacion => {

          insertarFila(
            crearFila(invitacion)
          );

        }
      );


      applyTab();


    } catch (error) {

      console.error(
        'Error cargando visitas:',
        error
      );

      if (emptyMsg) {

        emptyMsg.textContent =
          'No se pudieron cargar las visitas.';

      }

    }

  }


  // ==============================
  // MODAL
  // ==============================

  function resetConditionalFields() {

    if (dateTimeGroup) {
      dateTimeGroup.style.display = 'flex';
    }

    if (frequencyGroup) {
      frequencyGroup.style.display = 'none';
    }

    if (nowCheckbox) {
      nowCheckbox.disabled = false;
    }

  }


  function openModal() {

    if (!modal) {
      return;
    }

    modal.classList.add('open');

    if (nameInput) {
      nameInput.focus();
    }

  }


  function closeModal() {

    if (!modal) {
      return;
    }

    modal.classList.remove('open');

  }


  document
    .querySelectorAll('[data-open-visit]')
    .forEach(button => {

      button.addEventListener(
        'click',
        openModal
      );

    });


  if (cancelBtn) {

    cancelBtn.addEventListener(
      'click',
      () => {

        if (form) {
          form.reset();
        }

        resetConditionalFields();

        closeModal();

      }
    );

  }


  if (modal) {

    modal.addEventListener(
      'click',
      event => {

        if (event.target === modal) {
          closeModal();
        }

      }
    );

  }


  // ==============================
  // INGRESO INMEDIATO
  // ==============================

  if (nowCheckbox) {

    nowCheckbox.addEventListener(
      'change',
      () => {

        if (!dateInput || !timeInput) {
          return;
        }


        if (nowCheckbox.checked) {

          const now = new Date();

          dateInput.value =
            `${now.getFullYear()}-` +
            `${pad(now.getMonth() + 1)}-` +
            `${pad(now.getDate())}`;

          timeInput.value =
            `${pad(now.getHours())}:` +
            `${pad(now.getMinutes())}`;


          if (dateTimeGroup) {
            dateTimeGroup.style.display =
              'none';
          }


        } else {

          if (dateTimeGroup) {
            dateTimeGroup.style.display =
              'flex';
          }

        }

      }
    );

  }


  // ==============================
  // VISITA RECURRENTE
  // ==============================

  if (recurringCheckbox) {

    recurringCheckbox.addEventListener(
      'change',
      () => {

        if (
          recurringCheckbox.checked
        ) {

          if (dateTimeGroup) {
            dateTimeGroup.style.display =
              'none';
          }

          if (frequencyGroup) {
            frequencyGroup.style.display =
              '';
          }

          if (nowCheckbox) {

            nowCheckbox.checked = false;

            nowCheckbox.disabled = true;

          }


        } else {

          if (frequencyGroup) {
            frequencyGroup.style.display =
              'none';
          }

          if (dateTimeGroup) {
            dateTimeGroup.style.display =
              'flex';
          }

          if (nowCheckbox) {
            nowCheckbox.disabled = false;
          }

        }

      }
    );

  }


  // ==============================
  // MOTIVOS RÁPIDOS
  // ==============================

  document
    .querySelectorAll('.quick-reason')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          if (reasonInput) {

            reasonInput.value =
              button.dataset.reason || '';

          }

          if (nameInput) {
            nameInput.focus();
          }

        }
      );

    });


  // ==============================
  // GUARDAR EN MYSQL
  // ==============================

  if (form) {

    form.addEventListener(
      'submit',
      async event => {

        event.preventDefault();


        const nombre =
          nameInput
            ? nameInput.value.trim()
            : '';


        const motivo =
          reasonInput
            ? reasonInput.value
            : 'Visita';


        if (!nombre) {

          mostrarError(
            'Escribe el nombre del visitante.'
          );

          return;
        }


        const submitButton =
          form.querySelector(
            'button[type="submit"]'
          );


        if (submitButton) {

          submitButton.disabled = true;

          submitButton.dataset.textoOriginal =
            submitButton.innerHTML;

          submitButton.innerHTML =
            '<i class="bi bi-hourglass-split"></i> Guardando...';

        }


        try {

          let payload;


          // ==========================
          // VISITA RECURRENTE
          // ==========================

          if (
            recurringCheckbox &&
            recurringCheckbox.checked
          ) {

            const inicio = new Date();

            const fin =
              new Date(inicio);

            fin.setFullYear(
              fin.getFullYear() + 1
            );


            payload = {

              tipo: 'temporal',

              nombre_evento:
                nombre,

              fecha_valida_desde:
                inicio.toISOString(),

              fecha_valida_hasta:
                fin.toISOString(),

              max_usos:
                365,

              canal_envio:
                'manual',

              notas:
                `Frecuencia: ${
                  frequencyInput
                    ? frequencyInput.value
                    : 'Recurrente'
                } · ${motivo}`

            };


          // ==========================
          // VISITA NORMAL
          // ==========================

          } else {

            const dateVal =
              dateInput
                ? dateInput.value
                : '';

            const time =
              timeInput
                ? timeInput.value
                : '';


            if (
              !dateVal ||
              !time
            ) {

              mostrarError(
                'Selecciona la fecha y la hora.'
              );

              return;
            }


            const inicioISO =
              fechaLocalParaISO(
                dateVal,
                time
              );


            if (!inicioISO) {

              mostrarError(
                'La fecha seleccionada no es válida.'
              );

              return;
            }


            const inicio =
              new Date(inicioISO);


            // La invitación será válida durante 6 horas.
            const fin =
              new Date(
                inicio.getTime() +
                6 * 60 * 60 * 1000
              );


            payload = {

              tipo:
                'unico_uso',

              nombre_evento:
                nombre,

              fecha_valida_desde:
                inicio.toISOString(),

              fecha_valida_hasta:
                fin.toISOString(),

              max_usos:
                1,

              canal_envio:
                'manual',

              notas:
                motivo

            };

          }


          // AQUÍ SÍ SE GUARDA EN MYSQL
          const respuesta =
            await VigiaAPI.request(
              '/invitaciones',
              {
                method: 'POST',

                body:
                  JSON.stringify(
                    payload
                  )
              }
            );


          if (
            !respuesta ||
            !respuesta.data
          ) {

            throw new Error(
              'El servidor no devolvió la invitación.'
            );

          }


          if (
            typeof showToast ===
            'function'
          ) {

            showToast(
              recurringCheckbox &&
              recurringCheckbox.checked

                ? `${nombre} fue autorizado como visitante recurrente`

                : 'Visita agendada correctamente'
            );

          }


          form.reset();

          resetConditionalFields();

          closeModal();


          // Vuelve a leer MySQL.
          await cargarVisitas();


          if (
            recurringCheckbox &&
            recurringCheckbox.checked
          ) {

            activateTab(
              'Recurrentes'
            );

          } else {

            activateTab(
              'Próximas'
            );

          }


        } catch (error) {

          console.error(
            'Error guardando visita:',
            error
          );


          mostrarError(
            error.message ||
            'No se pudo guardar la visita.'
          );


        } finally {

          if (submitButton) {

            submitButton.disabled = false;

            submitButton.innerHTML =
              submitButton.dataset.textoOriginal ||
              'Guardar';

          }

        }

      }
    );

  }


  // ==============================
  // INICIAR
  // ==============================

  cargarVisitas();

})();
