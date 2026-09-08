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
  attachSoloLetras(nameInput, 150);
  const dateInput = document.getElementById('visitDate');
  const timeInput = document.getElementById('visitTime');
  const reasonInput = document.getElementById('visitReason');

  const nowCheckbox = document.getElementById('visitNow');
  const dateTimeGroup = document.getElementById('visitDateTimeGroup');

  const recurringCheckbox = document.getElementById('visitRecurring');
  const frequencyGroup = document.getElementById('visitFrequencyGroup');
  const frequencyInput = document.getElementById('visitFrequency');

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

      invitacionesCache = invitaciones;

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
        reiniciarSelectorColor();

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


          // Guarda el color que eligió libremente, asociado al id real
          // que acaba de asignar la base de datos.
          if (respuesta.data.id != null) {
            guardarColorVisita(respuesta.data.id, colorSeleccionado);
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
          reiniciarSelectorColor();

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

      const recurrentesDelDia = invitacionesRecurrentesActivas.filter(inv => {
        const desde = new Date(inv.fecha_valida_desde);
        const hasta = new Date(inv.fecha_valida_hasta);
        return d >= new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()) &&
               d <= new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
      });

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
          ...invitacionesRecurrentesActivas.filter(inv => {
            const desde = new Date(inv.fecha_valida_desde);
            const hasta = new Date(inv.fecha_valida_hasta);
            const d = new Date(iso + 'T00:00:00');
            return d >= new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()) &&
                   d <= new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
          }),
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
      <div class="vp-row"><i class="bi bi-qr-code"></i> ${escapeHTML(inv.codigo_qr || '—')}</div>
      <div class="vp-row"><span class="badge ${estadoBadge}">${estadoLabel}</span></div>
      <div class="vp-row vp-color-row color-swatch-row">${swatchesHTML}</div>
      ${estado === 'pendiente' ? '<div class="vp-actions"><button type="button" class="btn btn-ghost" id="vpCancelar"><i class="bi bi-x-lg"></i> Cancelar</button></div>' : ''}
    `;
    document.body.appendChild(pop);

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
      if (listaView) listaView.hidden = true;
      if (calendarioView) calendarioView.hidden = false;
      renderMonthCalendar();
    } else {
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
