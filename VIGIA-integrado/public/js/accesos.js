// ============ ACCESOS.JS ============
// Exclusivo de accesos.html: exporta la bitácora visible como un CSV descargable.

(function(){
  const btn=document.getElementById('exportBtn');
  if(!btn) return;

  btn.addEventListener('click',()=>{
    const rows=[['Día','Hora','Evento','Detalle']];

    document.querySelectorAll('.timeline-day-label').forEach(label=>{
      const wrap=label.nextElementSibling;
      if(!wrap || !wrap.classList.contains('tl-wrap')) return;
      wrap.querySelectorAll('.tl-entry').forEach(entry=>{
        const title=entry.querySelector('.row b').textContent.trim();
        const time=entry.querySelector('.row .time').textContent.trim();
        const detail=entry.querySelector('p').textContent.trim();
        rows.push([label.textContent.trim(), time, title, detail]);
      });
    });

    const csv=rows.map(r=>r.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download='vigia-bitacora-accesos.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    if(window.showToast) showToast('Bitácora exportada como CSV');
  });
})();

// ---- Personas vetadas + deteccion de conflictos de permisos ----
(function(){
  const list=document.getElementById('vetoList');
  const addBtn=document.getElementById('addVetoBtn');
  const modal=document.getElementById('vetoModal');
  if(!list || !addBtn || !modal) return;

  const cancelBtn=document.getElementById('vetoCancel');
  const form=document.getElementById('vetoForm');
  const nameInput=document.getElementById('vetoName');
  const reasonInput=document.getElementById('vetoReason');

  // Autorizaciones activas de otros residentes, usadas para simular
  // el cruce de permisos (vista de conflictos) al vetar a alguien.
  const AUTORIZACIONES_ACTIVAS=[
    {name:'carlos mendoza', residente:'Diego Paz', unidad:'Torre A · 210', fecha:'5 de julio'},
    {name:'ana lopez', residente:'María Flores', unidad:'Torre B · 118', fecha:'2 de julio'}
  ];

  function openModal(){ modal.classList.add('open'); nameInput.focus(); }
  function closeModal(){ modal.classList.remove('open'); }

  addBtn.addEventListener('click',openModal);
  cancelBtn.addEventListener('click',closeModal);
  modal.addEventListener('click',(e)=>{ if(e.target===modal) closeModal(); });

  list.addEventListener('click',(e)=>{
    const btn=e.target.closest('.remove-veto');
    if(btn) btn.closest('.config-row').remove();
  });

  form.addEventListener('submit',(e)=>{
    e.preventDefault();
    const name=nameInput.value.trim();
    const reason=reasonInput.value.trim();
    if(!name || !reason) return;

    const conflict=AUTORIZACIONES_ACTIVAS.find(a=>a.name===name.toLowerCase());

    const row=document.createElement('div');
    row.className='config-row';
    row.innerHTML=
      '<div class="l"><b></b><span></span></div>'+
      (conflict ? '<span class="badge warn" style="margin-right:.8rem;">CONFLICTO</span>' : '')+
      '<button type="button" class="btn btn-ghost remove-veto"><i class="bi bi-trash"></i></button>';
    row.querySelector('b').textContent=name;
    row.querySelector('.l span').textContent='Vetado hoy · Motivo: '+reason+
      (conflict ? ' — ya fue autorizado por '+conflict.residente+' ('+conflict.unidad+')' : '');
    list.prepend(row);

    if(window.showToast){
      if(conflict) showToast('Conflicto de permisos con '+conflict.residente+' — se notificará a administración', 'bi-exclamation-triangle-fill');
      else showToast(name+' fue agregado a tu lista de vetados');
    }

    form.reset();
    closeModal();
  });
})();
