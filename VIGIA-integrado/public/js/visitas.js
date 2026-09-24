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
  const weekdayGroup = document.getElementById('visitWeekdayGroup');
  const monthDayGroup = document.getElementById('visitMonthDayGroup');
  const monthDayInput = document.getElementById('visitMonthDay');


  // ---- Nombre: límite de caracteres + contador en vivo ----
  // Antes el tope era 150 (el de la columna de la base) y nada lo hacía
  // visible: la persona podía pegar un párrafo entero como "nombre". 60 es
  // más que suficiente para un nombre completo o el nombre de una fiesta, y
  // el contador (0/60) deja claro cuánto queda.
  const NOMBRE_MAX = 60;
  const EVENTO_MAX_INVITADOS = 300;
  const nameCount = document.getElementById('visitNameCount');
  const nameLabel = document.getElementById('visitNameLabel');
  const eventCheckbox = document.getElementById('visitEvent');
  const eventGroup = document.getElementById('visitEventGroup');
  const guestsInput = document.getElementById('visitGuests');
  const durationInput = document.getElementById('visitDuration');
  const reasonGroup = document.getElementById('visitReasonGroup');
  const RE_NOMBRE_PERSONA = /[^A-Za-zÀ-ÖØ-öø-ÿÑñ'.\- ]/g;
  const RE_NOMBRE_EVENTO = /[^A-Za-zÀ-ÖØ-öø-ÿÑñ0-9'.,&\- ]/g;

  function esModoEvento() {
    return Boolean(eventCheckbox && eventCheckbox.checked);
  }

  function actualizarContadorNombre() {
    if (!nameInput || !nameCount) return;
    const n = nameInput.value.length;
    nameCount.textContent = `${n}/${NOMBRE_MAX}`;
    nameCount.classList.toggle('near', n >= NOMBRE_MAX * 0.85 && n < NOMBRE_MAX);
    nameCount.classList.toggle('max', n >= NOMBRE_MAX);
  }

  if (nameInput) {
    nameInput.setAttribute('maxlength', String(NOMBRE_MAX));
    nameInput.addEventListener('input', () => {
      const re = esModoEvento() ? RE_NOMBRE_EVENTO : RE_NOMBRE_PERSONA;
      const cursor = nameInput.selectionStart;
      let limpio = nameInput.value.replace(re, '').replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
      if (limpio.length > NOMBRE_MAX) limpio = limpio.slice(0, NOMBRE_MAX);
      if (limpio !== nameInput.value) {
        const quitados = nameInput.value.length - limpio.length;
        nameInput.value = limpio;
        if (cursor != null) {
          const pos = Math.max(0, cursor - quitados);
          nameInput.setSelectionRange(pos, pos);
        }
      }
      actualizarContadorNombre();
    });
    actualizarContadorNombre();
  }

  // Antes una visita "recurrente" simplemente tomaba el dia de HOY (el
  // momento en que se llena el formulario) como el dia de la semana o
  // del mes en que se repite -- nunca se le preguntaba a quien la crea
  // que dia querian de verdad. Esto rellena el selector de dia del mes
  // (1..31) y deja los radios de dia de la semana listos para usarse.
  if (monthDayInput) {
    for (let dia = 1; dia <= 31; dia++) {
      const opt = document.createElement('option');
      opt.value = String(dia);
      opt.textContent = String(dia);
      monthDayInput.appendChild(opt);
    }
  }

  function marcarDiaActualPorDefecto() {
    const hoy = new Date();
    const radioHoy = document.querySelector(`input[name="visitWeekday"][value="${hoy.getDay()}"]`);
    if (radioHoy) radioHoy.checked = true;
    if (monthDayInput) monthDayInput.value = String(hoy.getDate());
  }

  // Muestra el selector que corresponde segun la frecuencia elegida
  // (dia de la semana para "Semanal", dia del mes para "Mensual",
  // ninguno para "Diario" porque ese ya aplica todos los dias).
  function actualizarSelectorDeDia() {
    if (!recurringCheckbox || !recurringCheckbox.checked) {
      if (weekdayGroup) weekdayGroup.style.display = 'none';
      if (monthDayGroup) monthDayGroup.style.display = 'none';
      return;
    }
    const frecuencia = frequencyInput ? frequencyInput.value : 'Diario';
    if (weekdayGroup) weekdayGroup.style.display = frecuencia === 'Semanal' ? '' : 'none';
    if (monthDayGroup) monthDayGroup.style.display = frecuencia === 'Mensual' ? '' : 'none';
  }

  if (frequencyInput) {
    frequencyInput.addEventListener('change', actualizarSelectorDeDia);
  }

  // Calcula la PRIMERA fecha real en la que debe empezar a aplicar la
  // recurrencia, segun el dia que se elija en el formulario -- en vez
  // de asumir que es hoy (que es lo que hacia antes: comparar new
  // Date() y ya, sin preguntar nada). "Diario" no necesita elegir dia
  // (aplica siempre), asi que empieza hoy mismo.
  function calcularInicioRecurrente(frecuencia) {
    const hoy = new Date();
    hoy.setHours(9, 0, 0, 0);

    if (frecuencia === 'Semanal') {
      const radioMarcado = document.querySelector('input[name="visitWeekday"]:checked');
      const diaElegido = radioMarcado ? Number(radioMarcado.value) : hoy.getDay();
      const fecha = new Date(hoy);
      const diff = (diaElegido - fecha.getDay() + 7) % 7;
      fecha.setDate(fecha.getDate() + diff);
      return fecha;
    }

    if (frecuencia === 'Mensual') {
      const diaElegido = monthDayInput ? Number(monthDayInput.value) : hoy.getDate();
      let fecha = new Date(hoy.getFullYear(), hoy.getMonth(), diaElegido, 9, 0, 0, 0);
      // Si ese dia de este mes ya paso (o el mes no tiene ese dia, ej.
      // 31 en un mes de 30), se pasa al mes siguiente. new Date con un
      // dia fuera de rango ya "rueda" solo al mes que sigue, pero se
      // vuelve a armar explicito para que quede claro y no dependa de
      // ese comportamiento implicito.
      if (fecha.getTime() < hoy.getTime()) {
        fecha = new Date(hoy.getFullYear(), hoy.getMonth() + 1, diaElegido, 9, 0, 0, 0);
      }
      return fecha;
    }

    // 'Diario' (o cualquier valor desconocido): empieza hoy mismo.
    return hoy;
  }

  // ---- Selector de color libre para la visita que se está creando ----
  const colorSwatches = document.getElementById('visitColorSwatches');
  const colorCustomInput = document.getElementById('visitColorCustom');
  let colorSeleccionado = '#12E8A0';

  if (colorSwatches) {
    colorSwatches.querySelectorAll('.color-swatch[data-color]').forEach(boton => {
      boton.addEventListener('click', () => {
        colorSwatches.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
        boton.classList.add('active');
        colorSeleccionado = boton.dataset.color;
        if (colorCustomInput) colorCustomInput.value = boton.dataset.color;
      });
    });
  }

  if (colorCustomInput) {
    colorCustomInput.addEventListener('input', () => {
      if (colorSwatches) colorSwatches.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
      colorSeleccionado = colorCustomInput.value;
    });
  }

  function reiniciarSelectorColor() {
    colorSeleccionado = '#12E8A0';
    if (colorSwatches) {
      colorSwatches.querySelectorAll('.color-swatch').forEach(b => b.classList.toggle('active', b.dataset.color === colorSeleccionado));
    }
    if (colorCustomInput) colorCustomInput.value = colorSeleccionado;
  }

  // ==============================
  // VISTA CALENDARIO (mes)
  // ==============================

  let invitacionesCache = [];
  let mesReferencia = new Date();

  const DIAS_CORTOS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const DIAS_LARGOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const MAX_CHIPS_VISIBLES = 3;

  const viewSwitch = document.getElementById('viewSwitch');
  const listaView = document.getElementById('listaView');
  const calendarioView = document.getElementById('calendarioView');
  const monthGrid = document.getElementById('monthGrid');
  const monthLabel = document.getElementById('monthLabel');
  const monthPrevBtn = document.getElementById('monthPrev');
  const monthNextBtn = document.getElementById('monthNext');
  const monthTodayBtn = document.getElementById('monthToday');
  const heatSwitch = document.getElementById('heatSwitch');
  const monthFilters = document.getElementById('monthFilters');

  // ---- Filtros de categoria y estado (panel lateral del calendario) ----
  // Empiezan con todo marcado (nada se oculta) para que el calendario se
  // vea completo la primera vez que alguien lo abre.
  const filtroCategoria = new Set(['familiar', 'entrega', 'mantenimiento', 'otro']);
  const filtroEstado = new Set(['pendiente', 'usada', 'cancelada', 'expirada']);
  let modoMapaCalor = false;

  if (monthFilters) {
    monthFilters.querySelectorAll('[data-cat-filter]').forEach(chk => {
      chk.addEventListener('change', () => {
        const cat = chk.dataset.catFilter;
        if (chk.checked) filtroCategoria.add(cat); else filtroCategoria.delete(cat);
        renderMonthCalendar();
      });
    });
    monthFilters.querySelectorAll('[data-estado-filter]').forEach(chk => {
      chk.addEventListener('change', () => {
        const est = chk.dataset.estadoFilter;
        if (chk.checked) filtroEstado.add(est); else filtroEstado.delete(est);
        renderMonthCalendar();
      });
    });
  }

  if (heatSwitch) {
    heatSwitch.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        heatSwitch.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        modoMapaCalor = btn.dataset.heat === 'on';
        renderMonthCalendar();
      });
    });
  }

  // ---- Colores elegidos libremente por el usuario, por visita ----
  // No hay columna de color en la base de datos, así que se guarda por
  // cuenta en este dispositivo (igual que el tema o el tamaño de letra
  // en common.js) -- puramente cosmético, no afecta a nadie más.
  const CLAVE_COLORES = session && session.id ? `vigia_visit_colors_${session.id}` : 'vigia_visit_colors';
  let coloresVisita = {};
  try { coloresVisita = JSON.parse(localStorage.getItem(CLAVE_COLORES) || '{}'); } catch (e) {}

  function guardarColorVisita(id, color) {
    coloresVisita[id] = color;
    try { localStorage.setItem(CLAVE_COLORES, JSON.stringify(coloresVisita)); } catch (e) {}
  }

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
        minute: '2-digit',
        hour12: true
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

    } else if (invitacion.tipo === 'evento') {

      badgeClass = 'info';
      badgeText = 'Evento';

    }


    const nombre =
      invitacion.nombre_evento ||
      'Visitante';


    let detalle = '';


    if (status === 'recurrente') {

      detalle =
        invitacion.notas ||
        'Visita recurrente';

    } else if (invitacion.tipo === 'evento') {

      detalle =
        `${formatTime(
          invitacion.fecha_valida_desde
        )} · Evento · ${
          invitacion.usos_actuales || 0
        } de ${
          invitacion.max_usos
        } ingresaron`;

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

      invitacionesCache = invitaciones;

      renderRecientes();

      if (typeof renderMonthCalendar === 'function') {
        renderMonthCalendar();
      }


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

    if (weekdayGroup) {
      weekdayGroup.style.display = 'none';
    }

    if (monthDayGroup) {
      monthDayGroup.style.display = 'none';
    }

    if (nowCheckbox) {
      nowCheckbox.disabled = false;
    }

    resetEvento();
    actualizarContadorNombre();

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
        reiniciarSelectorColor();

        closeModal();

      }
    );

  }


  if (modal) {

    modal.addEventListener(
      'click',
      event => {

        // No cerrar al tocar fuera: evita perder datos del formulario por accidente.
        if (event.target === modal) { event.preventDefault(); }

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

          marcarDiaActualPorDefecto();
          actualizarSelectorDeDia();


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

          actualizarSelectorDeDia();

        }

      }
    );

  }


  // ==============================
  // FIESTA / EVENTO (un solo QR para varios invitados)
  // ==============================
  // Antes, para una fiesta había que crear una visita por cada invitado.
  // El backend ya soportaba invitaciones tipo "evento" con max_usos > 1
  // (cada ingreso en garita descuenta un cupo), pero la pantalla nunca lo
  // exponía. Ahora se crea UNA invitación con cupo para N personas.

  function fijarFechaHoraSugerida() {
    if (!dateInput || !timeInput) return;
    if (dateInput.value && timeInput.value) return;
    const t = new Date(Date.now() + 30 * 60000);
    t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15, 0, 0);
    if (!dateInput.value) {
      dateInput.value = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    }
    if (!timeInput.value) {
      timeInput.value = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
    }
  }

  function limitarInvitados(valor) {
    let n = parseInt(valor, 10);
    if (Number.isNaN(n)) n = 20;
    return Math.min(EVENTO_MAX_INVITADOS, Math.max(2, n));
  }

  function setEventMode(activo) {
    if (!eventCheckbox) return;
    eventCheckbox.checked = activo;
    if (eventGroup) eventGroup.style.display = activo ? '' : 'none';
    if (reasonGroup) reasonGroup.style.display = activo ? 'none' : '';
    const recientesBox = document.getElementById('quickRecent');
    if (recientesBox) recientesBox.style.display = activo ? 'none' : '';
    if (nameLabel) nameLabel.textContent = activo ? 'Nombre del evento' : 'Nombre del visitante';
    if (nameInput) nameInput.placeholder = activo ? 'Ej. Cumpleaños de Sofía' : 'Ej. Ana Martínez';

    if (activo) {
      // Evento y recurrente/inmediato son excluyentes.
      if (recurringCheckbox) { recurringCheckbox.checked = false; recurringCheckbox.disabled = true; }
      if (frequencyGroup) frequencyGroup.style.display = 'none';
      actualizarSelectorDeDia();
      if (nowCheckbox) { nowCheckbox.checked = false; nowCheckbox.disabled = true; }
      if (dateTimeGroup) dateTimeGroup.style.display = 'flex';
      fijarFechaHoraSugerida();
    } else {
      if (recurringCheckbox) recurringCheckbox.disabled = false;
      if (nowCheckbox && !(recurringCheckbox && recurringCheckbox.checked)) nowCheckbox.disabled = false;
    }
    // Vuelve a filtrar el nombre con el juego de caracteres del modo nuevo
    // (el de evento permite números: "Fiesta de 15 años").
    if (nameInput) nameInput.dispatchEvent(new Event('input'));
  }

  function resetEvento() {
    if (!eventCheckbox) return;
    setEventMode(false);
    if (guestsInput) guestsInput.value = '20';
    marcarPresetActivo(null);
    mostrarHintRapido('');
  }

  if (eventCheckbox) {
    eventCheckbox.addEventListener('change', () => {
      setEventMode(eventCheckbox.checked);
      marcarPresetActivo(eventCheckbox.checked ? 'fiesta' : null);
    });
  }

  if (guestsInput) {
    guestsInput.addEventListener('blur', () => { guestsInput.value = String(limitarInvitados(guestsInput.value)); });
  }
  const guestsMinus = document.getElementById('guestsMinus');
  const guestsPlus = document.getElementById('guestsPlus');
  if (guestsMinus) guestsMinus.addEventListener('click', () => { guestsInput.value = String(limitarInvitados((parseInt(guestsInput.value, 10) || 20) - 1)); });
  if (guestsPlus) guestsPlus.addEventListener('click', () => { guestsInput.value = String(limitarInvitados((parseInt(guestsInput.value, 10) || 20) + 1)); });
  document.querySelectorAll('#guestPresets button').forEach(b => {
    b.addEventListener('click', () => { guestsInput.value = String(limitarInvitados(b.dataset.n)); });
  });


  // ==============================
  // ACCESO RÁPIDO
  // ==============================
  // Antes estos botones solo cambiaban el <select> de motivo (algo que el
  // propio select ya hace en un clic) -- no aportaban nada. Ahora cada uno
  // es un atajo real: fija motivo, color del calendario, tipo de ingreso y
  // una fecha/hora sugerida, de modo que solo falta escribir el nombre.
  // Debajo aparecen "Recientes": a quién invitaste antes, para repetir la
  // visita con un toque.

  const quickHint = document.getElementById('quickHint');
  const HINT_POR_DEFECTO = 'Un toque llena el motivo, el color y la hora por ti. Solo falta el nombre.';

  function mostrarHintRapido(texto) {
    if (quickHint) quickHint.textContent = texto || HINT_POR_DEFECTO;
  }

  function marcarPresetActivo(clave) {
    document.querySelectorAll('#quickPresets .quick-chip').forEach(b => {
      b.classList.toggle('active', Boolean(clave) && b.dataset.preset === clave);
    });
  }

  function aplicarColorVisita(color) {
    colorSeleccionado = color;
    if (colorSwatches) {
      colorSwatches.querySelectorAll('.color-swatch').forEach(b => b.classList.toggle('active', (b.dataset.color || '').toLowerCase() === color.toLowerCase()));
    }
    if (colorCustomInput) colorCustomInput.value = color;
  }

  function salirDeRecurrente() {
    if (recurringCheckbox && recurringCheckbox.checked) {
      recurringCheckbox.checked = false;
      recurringCheckbox.dispatchEvent(new Event('change'));
    }
  }

  const PRESETS_RAPIDOS = {
    familiar: { motivo: 'Visita familiar', color: '#12E8A0', hint: 'Familiar: válida 6 horas desde la hora que elijas.' },
    entrega: { motivo: 'Entrega', color: '#579AFF', ahora: true, hint: 'Delivery: ingreso inmediato, válido 6 horas.' },
    servicio: { motivo: 'Mantenimiento', color: '#F0B43C', hint: 'Servicio técnico: te sugerimos la próxima media hora.' },
    fiesta: { evento: true, color: '#B98AFF', hint: 'Fiesta: un solo QR para todos tus invitados.' }
  };

  function aplicarPreset(clave) {
    const p = PRESETS_RAPIDOS[clave];
    if (!p) return;

    // Tocar "Fiesta" estando activa la apaga.
    if (p.evento && esModoEvento()) {
      setEventMode(false);
      marcarPresetActivo(null);
      mostrarHintRapido('');
      return;
    }

    if (p.evento) {
      setEventMode(true);
    } else {
      if (esModoEvento()) setEventMode(false);
      salirDeRecurrente();
      if (reasonInput) reasonInput.value = p.motivo;
      if (nowCheckbox) {
        if (p.ahora && !nowCheckbox.checked) {
          nowCheckbox.checked = true;
          nowCheckbox.dispatchEvent(new Event('change'));
        } else if (!p.ahora && nowCheckbox.checked) {
          nowCheckbox.checked = false;
          nowCheckbox.dispatchEvent(new Event('change'));
        }
      }
      if (!p.ahora) fijarFechaHoraSugerida();
    }

    aplicarColorVisita(p.color);
    marcarPresetActivo(clave);
    mostrarHintRapido(p.hint);
    if (nameInput) nameInput.focus();
  }

  document.querySelectorAll('#quickPresets .quick-chip').forEach(boton => {
    boton.addEventListener('click', () => aplicarPreset(boton.dataset.preset));
  });

  const MOTIVO_POR_CATEGORIA = {
    familiar: 'Visita familiar',
    entrega: 'Entrega',
    mantenimiento: 'Mantenimiento',
    otro: 'Otro'
  };

  function renderRecientes() {
    const cont = document.getElementById('quickRecent');
    const lista = document.getElementById('quickRecentList');
    if (!cont || !lista) return;

    const vistos = new Set();
    const recientes = (invitacionesCache || [])
      .filter(inv => inv.nombre_evento && inv.tipo !== 'evento' && !esRecurrente(inv))
      .sort((a, b) => Number(b.id) - Number(a.id))
      .filter(inv => {
        const k = inv.nombre_evento.trim().toLowerCase();
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      })
      .slice(0, 5);

    lista.innerHTML = '';
    recientes.forEach(inv => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'quick-recent-chip';
      chip.title = 'Repetir esta visita';
      chip.innerHTML = '<i class="bi bi-arrow-repeat"></i><span></span>';
      chip.querySelector('span').textContent = inv.nombre_evento;
      chip.addEventListener('click', () => {
        if (esModoEvento()) setEventMode(false);
        salirDeRecurrente();
        const cat = categoriaVisita(inv.notas);
        if (nameInput) {
          nameInput.value = inv.nombre_evento;
          nameInput.dispatchEvent(new Event('input'));
        }
        if (reasonInput) reasonInput.value = MOTIVO_POR_CATEGORIA[cat] || 'Otro';
        aplicarColorVisita(coloresVisita[inv.id] || COLOR_POR_CATEGORIA[cat] || '#12E8A0');
        fijarFechaHoraSugerida();
        marcarPresetActivo(null);
        mostrarHintRapido(`Repitiendo la visita de ${inv.nombre_evento}. Revisa la fecha y la hora.`);
      });
      lista.appendChild(chip);
    });
    cont.hidden = recientes.length === 0;
  }


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


        const esEvento = esModoEvento();

        if (!nombre) {

          mostrarError(
            esEvento
              ? 'Escribe el nombre del evento.'
              : 'Escribe el nombre del visitante.'
          );

          return;
        }

        if (nombre.length < 2) {
          mostrarError('El nombre debe tener al menos 2 caracteres.');
          return;
        }

        let invitados = 0;
        let horasValidez = 6;

        if (esEvento) {
          invitados = parseInt(guestsInput ? guestsInput.value : '', 10);
          if (Number.isNaN(invitados) || invitados < 2 || invitados > EVENTO_MAX_INVITADOS) {
            mostrarError(`Indica entre 2 y ${EVENTO_MAX_INVITADOS} invitados.`);
            return;
          }
          horasValidez = Number(durationInput ? durationInput.value : 6) || 6;
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
          const eraRecurrente = Boolean(recurringCheckbox && recurringCheckbox.checked);


          // ==========================
          // VISITA RECURRENTE
          // ==========================

          if (eraRecurrente) {

            const frecuenciaElegida =
              frequencyInput
                ? frequencyInput.value
                : 'Diario';

            const inicio = calcularInicioRecurrente(frecuenciaElegida);

            const fin =
              new Date(inicio);

            fin.setFullYear(
              fin.getFullYear() + 1
            );

            // Aparte de "Frecuencia: Semanal/Mensual" (que ya leia
            // recurrenteAplicaEnDia para saber que dia mostrar), se
            // agrega tambien un texto legible del dia elegido, solo
            // para que quede claro en la nota de la invitacion --
            // recurrenteAplicaEnDia sigue basandose en inicio.getDay()/
            // getDate(), no en este texto.
            const DIAS_LARGOS_NOTA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
            let detalleDia = '';
            if (frecuenciaElegida === 'Semanal') {
              detalleDia = ` (todos los ${DIAS_LARGOS_NOTA[inicio.getDay()]})`;
            } else if (frecuenciaElegida === 'Mensual') {
              detalleDia = ` (día ${inicio.getDate()} de cada mes)`;
            }

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
                `Frecuencia: ${frecuenciaElegida}${detalleDia} · ${motivo}`

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

            // Evita crear invitaciones que ya nacen vencidas por elegir una
            // fecha/hora pasada. Damos dos minutos de tolerancia para el caso
            // "Ingreso inmediato" mientras se termina de llenar el formulario.
            if (inicio.getTime() < Date.now() - 2 * 60 * 1000) {
              mostrarError('La fecha y hora de la visita no pueden estar en el pasado.');
              return;
            }

            // La invitación será válida durante 6 horas (o la duración
            // elegida, si es un evento).
            const fin =
              new Date(
                inicio.getTime() +
                horasValidez * 60 * 60 * 1000
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

            if (esEvento) {
              payload.tipo = 'evento';
              payload.max_usos = invitados;
              payload.notas = `Evento · ${invitados} invitados`;
            }

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


          // Guarda el color que eligió libremente, asociado al id real
          // que acaba de asignar la base de datos.
          if (respuesta.data.id != null) {
            guardarColorVisita(respuesta.data.id, colorSeleccionado);
          }

          // Antes esta imagen (que el backend ya generaba en cada
          // creación, ver src/routes/overrides/invitaciones.js) se
          // descartaba por completo -- el residente no tenía ninguna
          // forma de ver un QR de verdad para pasárselo a su invitado,
          // solo el código en texto. Se muestra apenas se crea, y
          // también se puede volver a ver después desde el detalle de
          // la visita (abrirPopoverVisita).
          if (respuesta.qr) {
            mostrarQR(respuesta.qr, respuesta.data.nombre_evento || nombre, {
              codigo: respuesta.data.codigo_qr,
              invitados: esEvento ? invitados : 0
            });
          }


          if (
            typeof showToast ===
            'function'
          ) {

            showToast(
              eraRecurrente

                ? `${nombre} fue autorizado como visitante recurrente`

                : esEvento
                  ? `Evento creado: un QR para hasta ${invitados} invitados`
                  : 'Visita agendada correctamente'
            );

          }


          form.reset();

          resetConditionalFields();
          reiniciarSelectorColor();

          closeModal();


          // Vuelve a leer MySQL.
          await cargarVisitas();


          if (eraRecurrente) {

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
  // CATEGORÍA / ICONOS / COLOR
  // ==============================

  function categoriaVisita(motivo) {
    const t = String(motivo || '').toLowerCase();
    if (t.includes('familiar')) return 'familiar';
    if (t.includes('entrega') || t.includes('delivery')) return 'entrega';
    if (t.includes('mantenimiento') || t.includes('técnico') || t.includes('tecnico') || t.includes('servicio')) return 'mantenimiento';
    return 'otro';
  }

  function iconoCategoria(cat) {
    return {
      familiar: 'bi-people-fill',
      entrega: 'bi-box-seam-fill',
      mantenimiento: 'bi-tools',
      otro: 'bi-person-badge-fill'
    }[cat] || 'bi-person-badge-fill';
  }

  function esRecurrente(inv) {
    return inv.tipo === 'temporal' && String(inv.notas || '').includes('Frecuencia:');
  }

  // Bug real reportado: una visita "recurrente" semanal o mensual
  // aparecia en el calendario TODOS los dias del año de vigencia --
  // "Frecuencia: Semanal/Mensual" solo se guardaba como texto dentro de
  // notas, pero nada volvia a leerlo para decidir en que dias mostrar
  // el chip; el filtro de "esta dentro del rango de fecha_valida_desde
  // a fecha_valida_hasta" (un año completo) se trataba como si fuera
  // el unico criterio. Ahora si se respeta la frecuencia: semanal repite
  // el mismo dia de la semana en que se creo, mensual repite el mismo
  // dia del mes.
  function frecuenciaDeVisita(inv) {
    const m = String(inv.notas || '').match(/Frecuencia:\s*(Diario|Semanal|Mensual)/i);
    return m ? m[1].toLowerCase() : null;
  }

  function recurrenteAplicaEnDia(inv, d) {
    const desde = new Date(inv.fecha_valida_desde);
    const hasta = new Date(inv.fecha_valida_hasta);
    const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const desdeSoloFecha = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
    const hastaSoloFecha = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
    if (dia < desdeSoloFecha || dia > hastaSoloFecha) return false;
    const frecuencia = frecuenciaDeVisita(inv);
    if (frecuencia === 'diario') return true;
    if (frecuencia === 'semanal') return dia.getDay() === desde.getDay();
    if (frecuencia === 'mensual') return dia.getDate() === desde.getDate();
    // Frecuencia desconocida (dato viejo sin la etiqueta): se mantiene
    // el comportamiento anterior en vez de ocultarla por completo.
    return true;
  }

  const COLOR_POR_CATEGORIA = {
    familiar: '#12E8A0',
    entrega: '#579AFF',
    mantenimiento: '#F0B43C',
    otro: '#B98AFF'
  };

  // El color elegido a mano por el usuario (guardado en este dispositivo)
  // siempre gana; si nunca eligió uno, se usa el color automático de su
  // categoría detectada por el motivo -- así el calendario nunca se ve
  // "sin color" aunque el usuario no haya tocado el selector.
  function colorDeVisita(inv) {
    if (coloresVisita[inv.id]) return coloresVisita[inv.id];
    return COLOR_POR_CATEGORIA[categoriaVisita(inv.notas)] || '#8a8a86';
  }


  // ==============================
  // FECHAS DEL MES
  // ==============================

  function inicioMes(fecha) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  }

  function inicioGridMes(fecha) {
    const primero = inicioMes(fecha);
    const offset = (primero.getDay() + 6) % 7; // lunes = 0
    const d = new Date(primero);
    d.setDate(d.getDate() - offset);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function formatMesEtiqueta(fecha) {
    const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${nombres[fecha.getMonth()]} ${fecha.getFullYear()}`;
  }

  function fechaISOLocal(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Numero de semana del año (ISO 8601: la semana que contiene el primer
  // jueves de enero es la semana 1). Es solo una referencia visual junto
  // a cada fila del calendario, como en la mayoria de apps de agenda.
  function numeroSemana(fecha) {
    const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
    const diaISO = (d.getUTCDay() + 6) % 7; // lunes=0 ... domingo=6
    d.setUTCDate(d.getUTCDate() - diaISO + 3); // mueve al jueves de esa semana
    const primerJueves = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const diferenciaDias = (d - primerJueves) / 86400000;
    return 1 + Math.round(diferenciaDias / 7);
  }


  // ==============================
  // HTML DE UN CHIP DEL MES
  // ==============================

  function chipMesHTML(inv, delay) {
    const color = colorDeVisita(inv);
    const nombre = escapeHTML(inv.nombre_evento || 'Visitante');
    const estado = String(inv.estado || '').toLowerCase();
    const cls = ['month-chip'];
    if (estado === 'cancelada') cls.push('estado-cancelada');
    if (estado === 'expirada') cls.push('estado-expirada');
    return `<div class="${cls.join(' ')}" style="--chip-color:${color};animation-delay:${delay}s" data-id="${inv.id}">
      <span class="mc-title">${nombre}</span>
    </div>`;
  }


  // ==============================
  // RENDER PRINCIPAL DEL CALENDARIO
  // ==============================

  // Un evento pasa el filtro si su categoria Y su estado estan
  // marcados en el panel lateral -- ambos filtros se combinan con "Y",
  // no con "O" (asi "solo entregas pendientes" funciona como se espera).
  function pasaFiltros(inv) {
    const cat = categoriaVisita(inv.notas);
    const estado = String(inv.estado || '').toLowerCase();
    return filtroCategoria.has(cat) && filtroEstado.has(estado);
  }

  function renderMonthCalendar(direction) {

    if (!monthGrid || !monthLabel) {
      return;
    }

    const inicioGrid = inicioGridMes(mesReferencia);
    const mesActual = mesReferencia.getMonth();
    const hoy = new Date();
    const hoyISO = fechaISOLocal(hoy);

    monthLabel.textContent = formatMesEtiqueta(mesReferencia);

    const totalCeldas = 42; // 6 semanas x 7 dias, cubre cualquier mes
    const dias = [];
    for (let i = 0; i < totalCeldas; i++) {
      const d = new Date(inicioGrid);
      d.setDate(inicioGrid.getDate() + i);
      dias.push(d);
    }
    // Si el mes cabe en 5 semanas, no mostramos la sexta fila vacia.
    const necesitaSexta = dias[34].getMonth() === mesActual || dias.slice(35).some(d => d.getMonth() === mesActual);
    const diasVisibles = necesitaSexta ? dias : dias.slice(0, 35);

    const finGrid = new Date(diasVisibles[diasVisibles.length - 1]);
    finGrid.setHours(23, 59, 59, 999);

    const invitacionesRecurrentesActivas = invitacionesCache.filter(inv => {
      if (!esRecurrente(inv)) return false;
      if (String(inv.estado || '').toLowerCase() === 'cancelada') return false;
      const desde = new Date(inv.fecha_valida_desde);
      const hasta = new Date(inv.fecha_valida_hasta);
      return desde <= finGrid && hasta >= inicioGrid;
    }).filter(pasaFiltros);

    // Primera pasada: juntamos los eventos (ya filtrados) de cada dia,
    // para poder calcular el maximo del mes antes de dibujar nada -- el
    // mapa de calor necesita ese maximo para escalar la intensidad.
    const todosPorDia = diasVisibles.map(d => {
      const iso = fechaISOLocal(d);
      const eventosDia = invitacionesCache.filter(inv => {
        if (esRecurrente(inv)) return false;
        const di = new Date(inv.fecha_valida_desde);
        return !Number.isNaN(di.getTime()) && fechaISOLocal(di) === iso;
      }).filter(pasaFiltros);

      const recurrentesDelDia = invitacionesRecurrentesActivas.filter(inv => recurrenteAplicaEnDia(inv, d));

      return [...recurrentesDelDia, ...eventosDia];
    });

    const maxDelMes = Math.max(1, ...todosPorDia.map(t => t.length));

    let gridHTML = '';

    diasVisibles.forEach((d, idx) => {
      const iso = fechaISOLocal(d);
      const esOtroMes = d.getMonth() !== mesActual;
      const esHoy = iso === hoyISO;
      const todos = todosPorDia[idx];

      // Al inicio de cada fila (cada 7 dias) va la columna con el
      // numero de semana, antes que la primera casilla (lunes) de esa
      // fila -- por eso se agrega fuera del div de la celda del dia.
      if (idx % 7 === 0) {
        gridHTML += `<div class="mc-weeknum">${numeroSemana(d)}</div>`;
      }

      const clases = ['month-cal-cell'];
      if (esOtroMes) clases.push('other-month');
      if (esHoy) clases.push('today');

      if (modoMapaCalor) {
        clases.push('heat-cell');
        const alpha = todos.length ? 0.08 + (todos.length / maxDelMes) * 0.55 : 0;
        gridHTML += `<div class="${clases.join(' ')}" data-fecha="${iso}" data-idx="${idx}" style="--heat-alpha:${alpha}">
          <span class="mc-daynum">${d.getDate()}</span>
          ${todos.length ? `<span class="heat-count">${todos.length}</span><span class="heat-label">visita${todos.length === 1 ? '' : 's'}</span>` : ''}
        </div>`;
        return;
      }

      let chipsHTML = '';
      todos.slice(0, MAX_CHIPS_VISIBLES).forEach((inv, ordinal) => {
        chipsHTML += chipMesHTML(inv, ordinal * 0.04);
      });

      const restantes = todos.length - MAX_CHIPS_VISIBLES;
      if (restantes > 0) {
        chipsHTML += `<div class="mc-more" data-fecha="${iso}">+${restantes} más</div>`;
      }

      gridHTML += `<div class="${clases.join(' ')}" data-fecha="${iso}" data-idx="${idx}">
        <span class="mc-daynum">${d.getDate()}</span>
        <div class="mc-chips">${chipsHTML}</div>
        <span class="month-cal-empty-hint"><i class="bi bi-plus-lg"></i></span>
      </div>`;
    });

    monthGrid.innerHTML = gridHTML;

    // En modo mapa de calor no hay chips que abrir ni "+N mas" que
    // expandir -- solo dejamos que se pueda seguir agendando una visita
    // nueva haciendo clic en cualquier dia, igual que en modo normal.
    if (modoMapaCalor) {
      monthGrid.querySelectorAll('.month-cal-cell').forEach(celda => {
        celda.addEventListener('click', () => alClicEnDiaVacio(celda.dataset.fecha));
      });
      if (direction) {
        const frame = document.querySelector('.month-cal-frame');
        if (frame) {
          frame.classList.remove('month-cal-slide');
          void frame.offsetWidth;
          frame.style.setProperty('--slide-from', direction === 'prev' ? '-14px' : '14px');
          frame.classList.add('month-cal-slide');
        }
      }
      return;
    }

    // Clic en un chip -> detalle. Clic en "+N más" -> abre el detalle del
    // primer evento extra (rapido) y ademas expande la celda por completo.
    monthGrid.querySelectorAll('.month-chip').forEach(chip => {
      chip.addEventListener('click', event => {
        event.stopPropagation();
        const inv = invitacionesCache.find(x => String(x.id) === String(chip.dataset.id));
        if (inv) abrirPopoverVisita(inv, chip);
      });
    });

    monthGrid.querySelectorAll('.mc-more').forEach(masBtn => {
      masBtn.addEventListener('click', event => {
        event.stopPropagation();
        const celda = masBtn.closest('.month-cal-cell');
        if (!celda) return;
        const iso = celda.dataset.fecha;
        const todos = [
          ...invitacionesRecurrentesActivas.filter(inv => recurrenteAplicaEnDia(inv, new Date(iso + 'T00:00:00'))),
          ...invitacionesCache.filter(inv => {
            if (esRecurrente(inv)) return false;
            const di = new Date(inv.fecha_valida_desde);
            return !Number.isNaN(di.getTime()) && fechaISOLocal(di) === iso;
          }).filter(pasaFiltros)
        ];
        let expandidoHTML = '';
        todos.forEach((inv, ordinal) => { expandidoHTML += chipMesHTML(inv, ordinal * 0.03); });
        const contenedor = celda.querySelector('.mc-chips');
        contenedor.innerHTML = expandidoHTML;
        contenedor.querySelectorAll('.month-chip').forEach(chip => {
          chip.addEventListener('click', ev => {
            ev.stopPropagation();
            const inv = invitacionesCache.find(x => String(x.id) === String(chip.dataset.id));
            if (inv) abrirPopoverVisita(inv, chip);
          });
        });
      });
    });

    // Clic en un dia vacio -> prellenar y abrir "Nueva visita".
    monthGrid.querySelectorAll('.month-cal-cell').forEach(celda => {
      celda.addEventListener('click', event => {
        if (event.target.closest('.month-chip') || event.target.closest('.mc-more')) return;
        alClicEnDiaVacio(celda.dataset.fecha);
      });
    });

    if (direction) {
      const frame = document.querySelector('.month-cal-frame');
      if (frame) {
        frame.classList.remove('month-cal-slide');
        void frame.offsetWidth;
        frame.style.setProperty('--slide-from', direction === 'prev' ? '-14px' : '14px');
        frame.classList.add('month-cal-slide');
      }
    }
  }


  // ==============================
  // POPOVER DE DETALLE DE VISITA
  // ==============================

  function cerrarPopover() {
    const existente = document.getElementById('visitPopover');
    if (existente) existente.remove();
    document.querySelectorAll('.visit-popover-backdrop').forEach(b => b.remove());
  }

  // ==============================
  // MODAL DEL CODIGO QR
  // ==============================
  // Antes el residente solo veia el codigo_qr como texto plano (un
  // UUID largo tipo "3f9a2b1c-...") -- servia para copiar/pegar a mano,
  // pero no era algo que se le pudiera "pasar al invitado" para que la
  // garita lo escaneara, que es justo para lo que existe un QR. Esto
  // muestra la imagen real (PNG) que ya generaba el backend
  // (qrService.js) pero que el frontend nunca pintaba.
  function cerrarModalQr() {
    const existente = document.getElementById('qrModal');
    if (existente) existente.remove();
  }

  // opciones: { codigo, invitados } -- "codigo" habilita Copiar/WhatsApp;
  // "invitados" (>0) cambia el texto para un evento con varios cupos.
  function mostrarQR(dataUrl, titulo, opciones) {
    const opts = opciones || {};
    cerrarModalQr();
    const backdrop = document.createElement('div');
    backdrop.className = 'qr-modal-backdrop';
    backdrop.id = 'qrModal';
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cerrarModalQr(); });
    const esEventoQr = Number(opts.invitados) > 0;
    const explicacion = esEventoQr
      ? `Un solo QR para hasta ${opts.invitados} invitados. Envíalo a todos: cada entrada descuenta un cupo.`
      : 'Muéstraselo a tu invitado para que lo enseñe en garita, o descárgalo y envíaselo.';
    backdrop.innerHTML = `
      <div class="qr-modal">
        <h4>${escapeHTML(titulo || 'Código de acceso')}</h4>
        <p>${escapeHTML(explicacion)}</p>
        <img src="${dataUrl}" alt="Código QR de acceso">
        ${opts.codigo ? `<div class="qr-code-text mono" id="qrCodeText" title="Código para escribir a mano en garita">${escapeHTML(opts.codigo)}</div>` : ''}
        <div class="qr-modal-actions">
          <a class="btn btn-ghost" href="${dataUrl}" download="vigia-qr.png"><i class="bi bi-download"></i> Descargar</a>
          ${opts.codigo ? '<button type="button" class="btn btn-ghost" id="qrModalCopiar"><i class="bi bi-clipboard"></i> Copiar</button>' : ''}
        </div>
        <div class="qr-modal-actions">
          ${opts.codigo ? '<button type="button" class="btn btn-ghost" id="qrModalWhats"><i class="bi bi-whatsapp"></i> WhatsApp</button>' : ''}
          <button type="button" class="btn btn-solid" id="qrModalCerrar"><i class="bi bi-check-lg"></i> Listo</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    document.getElementById('qrModalCerrar').addEventListener('click', cerrarModalQr);

    const copiar = document.getElementById('qrModalCopiar');
    if (copiar) {
      copiar.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(opts.codigo);
          showToast('Código copiado');
        } catch (e) {
          showToast('No se pudo copiar. Selecciona el código y cópialo a mano.', 'bi-exclamation-triangle-fill');
        }
      });
    }
    const whats = document.getElementById('qrModalWhats');
    if (whats) {
      whats.addEventListener('click', () => {
        const nombre = titulo || 'la visita';
        const texto = esEventoQr
          ? `Estás invitado a ${nombre}. Muestra este código en la garita del residencial: ${opts.codigo}`
          : `Te autorizaron el ingreso (${nombre}). Muestra este código en la garita del residencial: ${opts.codigo}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
      });
    }
  }
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarModalQr(); });

  const PALETA_POPOVER = ['#12E8A0', '#579AFF', '#F0B43C', '#FF7B72', '#B98AFF', '#FF8AC4'];

  function abrirPopoverVisita(inv, targetEl) {
    cerrarPopover();

    const backdrop = document.createElement('div');
    backdrop.className = 'visit-popover-backdrop';
    backdrop.addEventListener('click', cerrarPopover);
    document.body.appendChild(backdrop);

    const estado = String(inv.estado || '').toLowerCase();
    const estadoLabel = { pendiente: 'Pendiente', usada: 'Utilizada', expirada: 'Expirada', cancelada: 'Cancelada' }[estado] || estado;
    const estadoBadge = { pendiente: 'warn', usada: 'ok', expirada: 'neutral', cancelada: 'alert' }[estado] || 'neutral';
    const colorActual = colorDeVisita(inv);

    const swatchesHTML = PALETA_POPOVER.map(c =>
      `<button type="button" class="color-swatch${c.toLowerCase() === colorActual.toLowerCase() ? ' active' : ''}" data-color="${c}" style="background:${c}"></button>`
    ).join('') + `<label class="color-swatch-custom"><input type="color" id="vpColorCustom" value="${colorActual}"></label>`;

    const pop = document.createElement('div');
    pop.className = 'visit-popover';
    pop.id = 'visitPopover';
    pop.innerHTML = `
      <h4>${escapeHTML(inv.nombre_evento || 'Visitante')}</h4>
      <div class="vp-row"><i class="bi bi-clock"></i> ${esRecurrente(inv) ? 'Visita recurrente' : formatTime(inv.fecha_valida_desde)}</div>
      <div class="vp-row"><i class="bi bi-chat-left-text"></i> ${escapeHTML(inv.notas || 'Sin motivo indicado')}</div>
      ${inv.tipo === 'evento' ? `<div class="vp-row vp-event"><i class="bi bi-people-fill"></i> ${inv.usos_actuales || 0} de ${inv.max_usos} invitados ingresaron</div><div class="event-progress"><span style="width:${Math.min(100, Math.round(((inv.usos_actuales || 0) / (inv.max_usos || 1)) * 100))}%"></span></div>` : ''}
      <div class="vp-row"><span class="badge ${estadoBadge}">${estadoLabel}</span></div>
      <div class="vp-row vp-color-row color-swatch-row">${swatchesHTML}</div>
      <div class="vp-actions">
        ${inv.codigo_qr ? '<button type="button" class="btn btn-ghost" id="vpVerQr"><i class="bi bi-qr-code"></i> Ver código QR</button>' : ''}
        ${estado === 'pendiente' ? '<button type="button" class="btn btn-ghost" id="vpCancelar"><i class="bi bi-x-lg"></i> Cancelar</button>' : ''}
      </div>
    `;
    document.body.appendChild(pop);

    const vpVerQr = document.getElementById('vpVerQr');
    if (vpVerQr) {
      vpVerQr.addEventListener('click', async () => {
        vpVerQr.disabled = true;
        try {
          const r = await VigiaAPI.request(`/invitaciones/${inv.id}/qr`);
          mostrarQR(r.qr, inv.nombre_evento || 'Código de acceso', {
            codigo: inv.codigo_qr,
            invitados: inv.tipo === 'evento' ? inv.max_usos : 0
          });
        } catch (err) {
          showToast(err.message, 'bi-exclamation-triangle-fill');
        } finally {
          vpVerQr.disabled = false;
        }
      });
    }

    const rect = targetEl.getBoundingClientRect();
    const popW = pop.offsetWidth || 270;
    const popH = pop.offsetHeight || 200;
    let left = rect.right + 10;
    let top = rect.top;
    if (left + popW > window.innerWidth - 12) left = rect.left - popW - 10;
    if (left < 8) left = Math.min(Math.max(8, rect.left), window.innerWidth - popW - 8);
    if (top + popH > window.innerHeight - 12) top = window.innerHeight - popH - 12;
    if (top < 8) top = 8;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';

    // Volver a colorear esta visita, a mano, desde el detalle -- la
    // libertad de elegir color no es solo al crearla, tambien despues.
    function aplicarNuevoColor(color) {
      guardarColorVisita(inv.id, color);
      pop.querySelectorAll('.vp-color-row .color-swatch').forEach(b => b.classList.toggle('active', b.dataset.color && b.dataset.color.toLowerCase() === color.toLowerCase()));
      renderMonthCalendar();
    }

    pop.querySelectorAll('.vp-color-row .color-swatch[data-color]').forEach(boton => {
      boton.addEventListener('click', () => aplicarNuevoColor(boton.dataset.color));
    });
    const vpColorCustom = document.getElementById('vpColorCustom');
    if (vpColorCustom) {
      vpColorCustom.addEventListener('input', () => aplicarNuevoColor(vpColorCustom.value));
    }

    const cancelarBtn = document.getElementById('vpCancelar');
    if (cancelarBtn) {
      cancelarBtn.addEventListener('click', async () => {
        cancelarBtn.disabled = true;
        cancelarBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Cancelando...';
        try {
          await VigiaAPI.request(`/invitaciones/${inv.id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'cancelada' }) });
          if (typeof showToast === 'function') showToast('Visita cancelada');
          cerrarPopover();
          await cargarVisitas();
        } catch (err) {
          mostrarError(err.message || 'No se pudo cancelar la visita.');
          cancelarBtn.disabled = false;
          cancelarBtn.innerHTML = '<i class="bi bi-x-lg"></i> Cancelar';
        }
      });
    }
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') cerrarPopover();
  });


  // ==============================
  // CLIC EN DÍA VACÍO -> PRELLENAR "NUEVA VISITA"
  // ==============================

  function alClicEnDiaVacio(fechaISO) {
    if (dateInput) dateInput.value = fechaISO;
    if (timeInput) {
      const ahora = new Date();
      timeInput.value = `${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;
    }
    if (nowCheckbox) nowCheckbox.checked = false;
    if (recurringCheckbox) recurringCheckbox.checked = false;

    resetConditionalFields();
    reiniciarSelectorColor();
    openModal();
  }


  // ==============================
  // NAVEGACIÓN DE MES
  // ==============================

  function cambiarMes(delta, direccion) {
    mesReferencia = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth() + delta, 1);
    renderMonthCalendar(direccion);
  }

  if (monthPrevBtn) monthPrevBtn.addEventListener('click', () => cambiarMes(-1, 'prev'));
  if (monthNextBtn) monthNextBtn.addEventListener('click', () => cambiarMes(1, 'next'));
  if (monthTodayBtn) monthTodayBtn.addEventListener('click', () => {
    mesReferencia = new Date();
    renderMonthCalendar('today');
  });


  // ==============================
  // SWITCH LISTA / CALENDARIO
  // ==============================

  function activarVista(vista) {
    if (viewSwitch) {
      viewSwitch.querySelectorAll('button').forEach(b => {
        b.classList.toggle('active', b.dataset.view === vista);
      });
    }
    if (vista === 'calendario') {
      document.body.classList.add('visitas-calendar-active');
      if (listaView) listaView.hidden = true;
      if (calendarioView) calendarioView.hidden = false;
      renderMonthCalendar();
    } else {
      document.body.classList.remove('visitas-calendar-active');
      if (listaView) listaView.hidden = false;
      if (calendarioView) calendarioView.hidden = true;
      cerrarPopover();
    }
  }

  if (viewSwitch) {
    viewSwitch.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => activarVista(btn.dataset.view));
    });
  }


  // ==============================
  // INICIAR
  // ==============================

  // Si llegamos desde el mini calendario del dashboard (?fecha=2026-09-03&view=calendario),
  // abrimos directo en el mes de esa fecha, en vista calendario.
  const parametros = new URLSearchParams(location.search);
  const fechaParam = parametros.get('fecha');
  const vistaParam = parametros.get('view');

  if (fechaParam) {
    const fechaDestino = new Date(`${fechaParam}T00:00:00`);
    if (!Number.isNaN(fechaDestino.getTime())) {
      mesReferencia = fechaDestino;
    }
  }

  if (vistaParam === 'calendario') {
    activarVista('calendario');
  }

  cargarVisitas();

})();
