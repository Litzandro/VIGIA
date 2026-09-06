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

  // ==============================
  // VISTA CALENDARIO (semana)
  // ==============================

  let invitacionesCache = [];
  let semanaReferencia = new Date();

  const DIAS_CORTOS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const DIAS_LARGOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const HORA_INICIO = 6;
  const HORA_FIN = 22;
  const ALTURA_HORA = 52;
  const DURACION_VISUAL_MIN = 45;

  const viewSwitch = document.getElementById('viewSwitch');
  const listaView = document.getElementById('listaView');
  const calendarioView = document.getElementById('calendarioView');
  const weekHeadRow = document.getElementById('weekHeadRow');
  const weekAllDay = document.getElementById('weekAllDay');
  const weekHours = document.getElementById('weekHours');
  const weekDays = document.getElementById('weekDays');
  const weekRange = document.getElementById('weekRange');
  const weekPrevBtn = document.getElementById('weekPrev');
  const weekNextBtn = document.getElementById('weekNext');
  const weekTodayBtn = document.getElementById('weekToday');

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

      if (typeof renderWeekCalendar === 'function') {
        renderWeekCalendar();
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
  // CATEGORÍA / ICONOS
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


  // ==============================
  // FECHAS DE LA SEMANA
  // ==============================

  function inicioSemana(fecha) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    const offset = (d.getDay() + 6) % 7; // lunes = 0
    d.setDate(d.getDate() - offset);
    return d;
  }

  function etiquetaHora(h) {
    const h12 = ((h + 11) % 12) + 1;
    return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
  }

  function formatRangoSemana(inicio, fin) {
    const mismoMes = inicio.getMonth() === fin.getMonth();
    const mesInicio = MESES[inicio.getMonth()];
    const mesFin = MESES[fin.getMonth()];
    if (mismoMes) {
      return `${inicio.getDate()}–${fin.getDate()} ${mesInicio} ${fin.getFullYear()}`;
    }
    return `${inicio.getDate()} ${mesInicio} – ${fin.getDate()} ${mesFin} ${fin.getFullYear()}`;
  }

  function fechaISOLocal(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }


  // ==============================
  // EMPAQUETAR EVENTOS QUE SE CRUZAN
  // ==============================

  function empaquetarEventos(eventos) {
    eventos.sort((a, b) => a.inicioMin - b.inicioMin);
    const columnas = [];
    eventos.forEach(ev => {
      let colocado = false;
      for (let c = 0; c < columnas.length; c++) {
        if (columnas[c] <= ev.inicioMin) {
          ev._col = c;
          columnas[c] = ev.finMin;
          colocado = true;
          break;
        }
      }
      if (!colocado) {
        ev._col = columnas.length;
        columnas.push(ev.finMin);
      }
    });
    eventos.forEach(ev => { ev._totalCol = columnas.length; });
  }


  // ==============================
  // HTML DE UN CHIP DE VISITA
  // ==============================

  function chipHTML(inv, opts) {
    opts = opts || {};
    const cat = categoriaVisita(inv.notas);
    const icon = iconoCategoria(cat);
    const nombre = escapeHTML(inv.nombre_evento || 'Visitante');
    const estado = String(inv.estado || '').toLowerCase();

    const cls = ['visit-chip', 'cat-' + cat];
    if (estado === 'cancelada') cls.push('estado-cancelada');
    if (estado === 'expirada') cls.push('estado-expirada');

    const styleParts = [`animation-delay:${opts.delay || 0}s`];
    let horaTxt;

    if (opts.allDay) {
      cls.push('allday');
      horaTxt = esRecurrente(inv) ? 'Recurrente' : 'Todo el día';
    } else {
      styleParts.push(`top:${opts.top}px`, `height:${opts.height}px`);
      if (opts.anchoPct != null) {
        styleParts.push(`width:calc(${opts.anchoPct}% - 4px)`, `left:calc(${opts.leftPct}% + 2px)`);
      }
      horaTxt = formatTime(inv.fecha_valida_desde);
    }

    return `<div class="${cls.join(' ')}" style="${styleParts.join(';')}" data-id="${inv.id}">
      <span class="vc-icon"><i class="bi ${icon}"></i></span>
      <span class="vc-body">
        <span class="vc-title">${nombre}</span>
        <span class="vc-time">${horaTxt}</span>
      </span>
    </div>`;
  }


  // ==============================
  // RENDER PRINCIPAL DEL CALENDARIO
  // ==============================

  function renderWeekCalendar(direction) {

    if (!weekDays || !weekHeadRow || !weekAllDay || !weekHours || !weekRange) {
      return;
    }

    const inicio = inicioSemana(semanaReferencia);
    const hoy = new Date();
    const diasSemana = [];

    let headHTML = '<div class="gutter"></div>';
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      diasSemana.push(d);
      const esHoy = d.toDateString() === hoy.toDateString();
      headHTML += `<div class="week-cal-daylabel${esHoy ? ' today' : ''}" data-idx="${i}"><div class="dow">${DIAS_CORTOS[i]}</div><div class="dnum">${d.getDate()}</div></div>`;
    }
    weekHeadRow.innerHTML = headHTML;

    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 6);
    weekRange.textContent = formatRangoSemana(inicio, fin);

    const finExclusivo = new Date(inicio);
    finExclusivo.setDate(inicio.getDate() + 7);

    const invitacionesSemana = invitacionesCache.filter(inv => {
      const d = new Date(inv.fecha_valida_desde);
      if (Number.isNaN(d.getTime())) return false;
      return d >= inicio && d < finExclusivo;
    });

    const invitacionesRecurrentesActivas = invitacionesCache.filter(inv => {
      if (!esRecurrente(inv)) return false;
      if (String(inv.estado || '').toLowerCase() === 'cancelada') return false;
      const desde = new Date(inv.fecha_valida_desde);
      const hasta = new Date(inv.fecha_valida_hasta);
      return desde <= fin && hasta >= inicio;
    });

    const porDiaTimed = [[], [], [], [], [], [], []];
    const porDiaAllDay = [[], [], [], [], [], [], []];

    invitacionesSemana.forEach(inv => {
      if (esRecurrente(inv)) return; // ya cubierta abajo, para no duplicar
      const d = new Date(inv.fecha_valida_desde);
      const idx = (d.getDay() + 6) % 7;
      const duracionHoras = (new Date(inv.fecha_valida_hasta) - d) / 3600000;
      if (duracionHoras >= 20) {
        porDiaAllDay[idx].push(inv);
      } else {
        porDiaTimed[idx].push(inv);
      }
    });

    invitacionesRecurrentesActivas.forEach(inv => {
      for (let i = 0; i < 7; i++) {
        porDiaAllDay[i].push(inv);
      }
    });

    let allDayHTML = '<div class="gutter">Todo<br>el día</div>';
    for (let i = 0; i < 7; i++) {
      allDayHTML += `<div class="week-cal-allday-cell" data-idx="${i}">`;
      porDiaAllDay[i].forEach((inv, ordinal) => {
        allDayHTML += chipHTML(inv, { allDay: true, delay: ordinal * 0.04 });
      });
      allDayHTML += '</div>';
    }
    weekAllDay.innerHTML = allDayHTML;

    let horasHTML = '';
    for (let h = HORA_INICIO; h < HORA_FIN; h++) {
      horasHTML += `<div class="week-cal-hour-label" style="height:${ALTURA_HORA}px">${etiquetaHora(h)}</div>`;
    }
    weekHours.innerHTML = horasHTML;

    const alturaTotal = (HORA_FIN - HORA_INICIO) * ALTURA_HORA;
    let diasHTML = '';

    for (let i = 0; i < 7; i++) {
      const d = diasSemana[i];
      const esHoy = d.toDateString() === hoy.toDateString();

      diasHTML += `<div class="week-cal-daycol${esHoy ? ' today' : ''}" data-idx="${i}" style="height:${alturaTotal}px">`;
      diasHTML += '<div class="week-cal-empty-hint">+ visita</div>';

      const eventosDia = porDiaTimed[i].map(inv => {
        const d0 = new Date(inv.fecha_valida_desde);
        const inicioMin = d0.getHours() * 60 + d0.getMinutes();
        return { inv, inicioMin, finMin: inicioMin + DURACION_VISUAL_MIN };
      });
      empaquetarEventos(eventosDia);

      eventosDia.forEach(ev => {
        const topPx = Math.max(0, (ev.inicioMin - HORA_INICIO * 60) / 60 * ALTURA_HORA);
        const heightPx = Math.max(26, (ev.finMin - ev.inicioMin) / 60 * ALTURA_HORA - 2);
        const anchoPct = 100 / ev._totalCol;
        const leftPct = anchoPct * ev._col;
        diasHTML += chipHTML(ev.inv, { top: topPx, height: heightPx, leftPct, anchoPct });
      });

      if (esHoy) {
        const ahoraMin = hoy.getHours() * 60 + hoy.getMinutes();
        if (ahoraMin >= HORA_INICIO * 60 && ahoraMin <= HORA_FIN * 60) {
          const topPx = (ahoraMin - HORA_INICIO * 60) / 60 * ALTURA_HORA;
          diasHTML += `<div class="week-cal-nowline" style="top:${topPx}px"><span class="nl-time">${formatTime(hoy)}</span></div>`;
        }
      }

      diasHTML += '</div>';
    }
    weekDays.innerHTML = diasHTML;

    // Clic en área vacía de un día → prellenar y abrir "Nueva visita"
    weekDays.querySelectorAll('.week-cal-daycol').forEach((col, idx) => {
      col.addEventListener('click', event => {
        if (event.target.closest('.visit-chip')) return;
        alClicEnDiaVacio(event, diasSemana[idx], col);
      });
    });

    // Clic en un chip → popover con detalle y cancelar
    weekDays.querySelectorAll('.visit-chip').forEach(chip => {
      chip.addEventListener('click', event => {
        event.stopPropagation();
        const inv = invitacionesCache.find(x => String(x.id) === String(chip.dataset.id));
        if (inv) abrirPopoverVisita(inv, chip);
      });
    });
    weekAllDay.querySelectorAll('.visit-chip').forEach(chip => {
      chip.addEventListener('click', event => {
        event.stopPropagation();
        const inv = invitacionesCache.find(x => String(x.id) === String(chip.dataset.id));
        if (inv) abrirPopoverVisita(inv, chip);
      });
    });

    // Clic en el nombre del día → centra esa columna (útil en móvil)
    weekHeadRow.querySelectorAll('.week-cal-daylabel').forEach((label, idx) => {
      label.addEventListener('click', () => {
        const col = weekDays.querySelector(`.week-cal-daycol[data-idx="${idx}"]`);
        if (col) col.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });
    });

    // Animación de deslizamiento al cambiar de semana
    if (direction) {
      const frame = document.querySelector('.week-cal-frame');
      if (frame) {
        frame.classList.remove('week-cal-slide');
        void frame.offsetWidth; // fuerza reflow para reiniciar la animación
        frame.style.setProperty('--slide-from', direction === 'prev' ? '-12px' : '12px');
        frame.classList.add('week-cal-slide');
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

  function abrirPopoverVisita(inv, targetEl) {
    cerrarPopover();

    const backdrop = document.createElement('div');
    backdrop.className = 'visit-popover-backdrop';
    backdrop.addEventListener('click', cerrarPopover);
    document.body.appendChild(backdrop);

    const estado = String(inv.estado || '').toLowerCase();
    const estadoLabel = { pendiente: 'Pendiente', usada: 'Utilizada', expirada: 'Expirada', cancelada: 'Cancelada' }[estado] || estado;
    const estadoBadge = { pendiente: 'warn', usada: 'ok', expirada: 'neutral', cancelada: 'alert' }[estado] || 'neutral';

    const pop = document.createElement('div');
    pop.className = 'visit-popover';
    pop.id = 'visitPopover';
    pop.innerHTML = `
      <h4>${escapeHTML(inv.nombre_evento || 'Visitante')}</h4>
      <div class="vp-row"><i class="bi bi-clock"></i> ${esRecurrente(inv) ? 'Visita recurrente' : formatTime(inv.fecha_valida_desde)}</div>
      <div class="vp-row"><i class="bi bi-chat-left-text"></i> ${escapeHTML(inv.notas || 'Sin motivo indicado')}</div>
      <div class="vp-row"><i class="bi bi-qr-code"></i> ${escapeHTML(inv.codigo_qr || '—')}</div>
      <div class="vp-row"><span class="badge ${estadoBadge}">${estadoLabel}</span></div>
      ${estado === 'pendiente' ? '<div class="vp-actions"><button type="button" class="btn btn-ghost" id="vpCancelar"><i class="bi bi-x-lg"></i> Cancelar</button></div>' : ''}
    `;
    document.body.appendChild(pop);

    const rect = targetEl.getBoundingClientRect();
    const popW = pop.offsetWidth || 250;
    const popH = pop.offsetHeight || 160;
    let left = rect.right + 10;
    let top = rect.top;
    if (left + popW > window.innerWidth - 12) left = rect.left - popW - 10;
    if (left < 8) left = Math.min(Math.max(8, rect.left), window.innerWidth - popW - 8);
    if (top + popH > window.innerHeight - 12) top = window.innerHeight - popH - 12;
    if (top < 8) top = 8;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';

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
  // CLIC EN ÁREA VACÍA → PRELLENAR "NUEVA VISITA"
  // ==============================

  function alClicEnDiaVacio(event, fechaDia, colEl) {
    const rect = colEl.getBoundingClientRect();
    const y = event.clientY - rect.top + colEl.scrollTop;
    let minutos = HORA_INICIO * 60 + (y / ALTURA_HORA) * 60;
    minutos = Math.round(minutos / 15) * 15;
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;

    if (dateInput) dateInput.value = fechaISOLocal(fechaDia);
    if (timeInput) timeInput.value = `${pad(h)}:${pad(m)}`;
    if (nowCheckbox) nowCheckbox.checked = false;
    if (recurringCheckbox) recurringCheckbox.checked = false;

    resetConditionalFields();
    openModal();
  }


  // ==============================
  // NAVEGACIÓN DE SEMANA
  // ==============================

  function cambiarSemana(delta, direccion) {
    semanaReferencia = new Date(semanaReferencia);
    semanaReferencia.setDate(semanaReferencia.getDate() + delta * 7);
    renderWeekCalendar(direccion);
  }

  if (weekPrevBtn) weekPrevBtn.addEventListener('click', () => cambiarSemana(-1, 'prev'));
  if (weekNextBtn) weekNextBtn.addEventListener('click', () => cambiarSemana(1, 'next'));
  if (weekTodayBtn) weekTodayBtn.addEventListener('click', () => {
    semanaReferencia = new Date();
    renderWeekCalendar('today');
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
      renderWeekCalendar();
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
  // abrimos directo en esa semana en vista calendario.
  const parametros = new URLSearchParams(location.search);
  const fechaParam = parametros.get('fecha');
  const vistaParam = parametros.get('view');

  if (fechaParam) {
    const fechaDestino = new Date(`${fechaParam}T00:00:00`);
    if (!Number.isNaN(fechaDestino.getTime())) {
      semanaReferencia = fechaDestino;
    }
  }

  if (vistaParam === 'calendario') {
    activarVista('calendario');
  }

  cargarVisitas();

})();
