'use strict';

/*
 * ============================================================
 * INCIDENCIAS DEL RESIDENTE - PORTAL DEL GUARDIA
 * ============================================================
 *
 * Usa la API real:
 *
 * GET   /api/incidencias
 * PATCH /api/incidencias/:id
 *
 * No modifica PanicStore ni ChatStore.
 */

(function () {

  const list = document.getElementById('guardIncidenciasList');
  const refreshBtn = document.getElementById('refreshIncidenciasBtn');

  if (!list) return;

  let incidencias = [];
  let filtroActual = 'todas';


  // ==========================================================
  // ESTADOS
  // ==========================================================

  const STATUS_LABEL = {
    reportada: 'Nueva',
    en_revision: 'En progreso',
    resuelta: 'Resuelta',
    cerrada: 'Cerrada'
  };


  const PRIORITY_LABEL = {
    baja: 'Baja',
    media: 'Media',
    alta: 'Alta',
    urgente: 'Urgente'
  };


  // ==========================================================
  // FORMATEAR FECHA
  // ==========================================================

  function formatDate(value) {

    if (!value) return 'Sin fecha';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Sin fecha';
    }

    return date.toLocaleString('es-HN', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  }


  // ==========================================================
  // ESCAPE HTML
  // ==========================================================

  function safe(value) {

    if (typeof escapeHtml === 'function') {
      return escapeHtml(value == null ? '' : String(value));
    }

    const div = document.createElement('div');

    div.textContent = value == null ? '' : String(value);

    return div.innerHTML;
  }


  // ==========================================================
  // ESTADO
  // ==========================================================

  function statusLabel(status) {

    return STATUS_LABEL[status] || status || 'Desconocido';

  }


  // ==========================================================
  // PRIORIDAD
  // ==========================================================

  function priorityLabel(priority) {

    return PRIORITY_LABEL[priority] || priority || 'Media';

  }


  // ==========================================================
  // CLASE DEL ESTADO
  // ==========================================================

  function statusClass(status) {

    if (status === 'en_revision') {
      return 'status-revision';
    }

    if (status === 'resuelta') {
      return 'status-resuelta';
    }

    if (status === 'cerrada') {
      return 'status-cerrada';
    }

    return 'status-reportada';

  }


  // ==========================================================
  // CLASE DE PRIORIDAD
  // ==========================================================

  function priorityClass(priority) {

    return 'priority-' + (
      ['baja', 'media', 'alta', 'urgente'].includes(priority)
        ? priority
        : 'media'
    );

  }


  // ==========================================================
  // BOTONES SEGÚN ESTADO
  // ==========================================================

  function actionButtons(incidencia) {

    const estado = incidencia.estado;

    const buttons = [];


    if (estado === 'reportada') {

      buttons.push(`
        <button
          type="button"
          class="btn btn-solid incidencia-status-btn"
          data-id="${safe(incidencia.id)}"
          data-status="en_revision"
        >
          <i class="bi bi-play-fill"></i>
          Tomar en progreso
        </button>
      `);

    }


    if (estado === 'en_revision') {

      buttons.push(`
        <button
          type="button"
          class="btn btn-solid incidencia-status-btn"
          data-id="${safe(incidencia.id)}"
          data-status="resuelta"
        >
          <i class="bi bi-check-lg"></i>
          Marcar resuelta
        </button>
      `);

    }


    if (estado === 'resuelta') {

      buttons.push(`
        <button
          type="button"
          class="btn btn-ghost incidencia-status-btn"
          data-id="${safe(incidencia.id)}"
          data-status="cerrada"
        >
          <i class="bi bi-archive"></i>
          Cerrar incidencia
        </button>
      `);

    }


    return buttons.join('');

  }


  // ==========================================================
  // TARJETA
  // ==========================================================

  function renderCard(incidencia) {

    const article = document.createElement('article');

    article.className = 'incidencia-guardia-card';

    const id = String(incidencia.id || '').padStart(4, '0');

    article.innerHTML = `

      <div class="incidencia-guardia-head">

        <div>

          <div
            class="mono"
            style="color:var(--mist);font-size:.7rem;margin-bottom:.35rem;"
          >
            #INC-${id}
          </div>

          <h3 class="incidencia-guardia-title">
            ${safe(incidencia.titulo)}
          </h3>

        </div>

        <span
          class="incidencia-chip ${priorityClass(incidencia.prioridad)}"
        >
          <i class="bi bi-flag-fill"></i>
          ${safe(priorityLabel(incidencia.prioridad))}
        </span>

      </div>


      <p class="incidencia-guardia-description">
        ${safe(incidencia.descripcion)}
      </p>


      <div class="incidencia-guardia-meta">

        <span
          class="incidencia-chip ${statusClass(incidencia.estado)}"
        >
          <i class="bi bi-circle-fill"></i>
          ${safe(statusLabel(incidencia.estado))}
        </span>


        <span class="incidencia-chip">

          <i class="bi bi-eye"></i>

          ${safe(incidencia.visibilidad || 'privada')}

        </span>


        <span class="incidencia-chip">

          <i class="bi bi-clock"></i>

          ${safe(formatDate(incidencia.fecha_hora))}

        </span>


        ${
          incidencia.ubicacion
            ? `
              <span class="incidencia-chip">
                <i class="bi bi-geo-alt"></i>
                ${safe(incidencia.ubicacion)}
              </span>
            `
            : ''
        }

      </div>


      <div class="incidencia-guardia-footer">

        <span class="incidencia-guardia-id">

          <i class="bi bi-person-fill"></i>

          Reportada por usuario #${safe(incidencia.reportado_por)}

          ${
            incidencia.asignado_a
              ? ` · Asignada a #${safe(incidencia.asignado_a)}`
              : ''
          }

        </span>


        <div class="incidencia-guardia-actions">

          ${actionButtons(incidencia)}

        </div>

      </div>

    `;


    // Eventos de cambio de estado

    article
      .querySelectorAll('.incidencia-status-btn')
      .forEach(button => {

        button.addEventListener('click', async () => {

          const id = button.dataset.id;

          const status = button.dataset.status;

          await updateStatus(id, status, button);

        });

      });


    return article;

  }


  // ==========================================================
  // RENDER
  // ==========================================================

  function render() {

    list.innerHTML = '';

    const filtered = incidencias.filter(item => {

      if (filtroActual === 'todas') {
        return true;
      }

      return item.estado === filtroActual;

    });


    if (!filtered.length) {

      list.innerHTML = `

        <div class="incidencia-guardia-empty">

          <i
            class="bi bi-inbox"
            style="font-size:2rem;display:block;margin-bottom:.75rem;"
          ></i>

          No hay incidencias en esta categoría.

        </div>

      `;

      return;

    }


    filtered.forEach(incidencia => {

      list.appendChild(
        renderCard(incidencia)
      );

    });

  }


  // ==========================================================
  // CARGAR INCIDENCIAS
  // ==========================================================

  async function loadIncidencias() {

    list.innerHTML = `

      <div class="incidencia-guardia-empty">

        <i class="bi bi-arrow-repeat"></i>

        Cargando incidencias...

      </div>

    `;


    try {

      const response = await VigiaAPI.request(
        '/incidencias'
      );

      incidencias = response.data || [];

      render();

    } catch (error) {

      console.error(
        'Error cargando incidencias:',
        error
      );


      list.innerHTML = `

        <div class="incidencia-guardia-error">

          <strong>
            No se pudieron cargar las incidencias.
          </strong>

          <div style="margin-top:.4rem;">
            ${safe(error.message)}
          </div>

        </div>

      `;

    }

  }


  // ==========================================================
  // CAMBIAR ESTADO
  // ==========================================================

  async function updateStatus(
    id,
    status,
    button
  ) {

    const originalHTML = button.innerHTML;

    button.disabled = true;

    button.innerHTML = `
      <i class="bi bi-arrow-repeat"></i>
      Guardando...
    `;


    try {

      await VigiaAPI.request(
        `/incidencias/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',

          body: JSON.stringify({
            estado: status
          })
        }
      );


      showToast(
        `Incidencia actualizada: ${statusLabel(status)}`,
        'bi-check-circle-fill'
      );


      await loadIncidencias();


    } catch (error) {

      console.error(
        'Error actualizando incidencia:',
        error
      );


      showToast(
        error.message || 'No se pudo actualizar la incidencia.',
        'bi-exclamation-triangle-fill'
      );


      button.disabled = false;

      button.innerHTML = originalHTML;

    }

  }


  // ==========================================================
  // FILTROS
  // ==========================================================

  document
    .querySelectorAll('[data-inc-filter]')
    .forEach(button => {

      button.addEventListener('click', () => {

        document
          .querySelectorAll('[data-inc-filter]')
          .forEach(item => {
            item.classList.remove('active');
          });


        button.classList.add('active');


        filtroActual =
          button.dataset.incFilter || 'todas';


        render();

      });

    });


  // ==========================================================
  // BOTÓN ACTUALIZAR
  // ==========================================================

  if (refreshBtn) {

    refreshBtn.addEventListener(
      'click',
      async () => {

        const originalHTML =
          refreshBtn.innerHTML;

        refreshBtn.disabled = true;

        refreshBtn.innerHTML = `
          <i class="bi bi-arrow-repeat"></i>
          Actualizando...
        `;


        await loadIncidencias();


        refreshBtn.disabled = false;

        refreshBtn.innerHTML =
          originalHTML;

      }
    );

  }


  // ==========================================================
  // TABS
  // ==========================================================

  const tabsGroup =
    document.querySelector('.agenda-tabs');


  const panels = {

    alertas:
      document.querySelector('[data-panel="alertas"]'),

    incidencias:
      document.querySelector('[data-panel="incidencias"]'),

    chat:
      document.querySelector('[data-panel="chat"]')

  };


  if (tabsGroup) {

    tabsGroup
      .querySelectorAll('button')
      .forEach(button => {

        button.addEventListener('click', () => {

          const selected =
            button.dataset.tab;


          if (!selected) return;


          tabsGroup
            .querySelectorAll('button')
            .forEach(item => {
              item.classList.toggle(
                'active',
                item === button
              );
            });


          Object.entries(panels)
            .forEach(([key, panel]) => {

              if (!panel) return;

              panel.style.display =
                key === selected
                  ? ''
                  : 'none';

            });


          if (selected === 'incidencias') {

            loadIncidencias();

          }

        });

      });

  }


  // ==========================================================
  // CARGA INICIAL
  // ==========================================================

  loadIncidencias();

})();
