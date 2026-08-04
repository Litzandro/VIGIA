// ============ VISITAS.JS ============
// Exclusivo de visitas.html: pestañas que filtran la agenda de verdad
// y el formulario "Nueva visita" (incluye visitas recurrentes).

const AgendaVisitas=(function(){
  const tabsGroup=document.querySelector('.agenda-tabs');
  const listWrap=document.querySelector('.page');
  const emptyMsg=document.getElementById('visitEmptyMsg');
  if(!tabsGroup || !listWrap) return { addVisit(){}, addRecurringVisit(){} };

  const STATUS_BY_LABEL={ 'Próximas':'proxima', 'Historial':'historial', 'Recurrentes':'recurrente' };
  const EMPTY_TEXT={
    proxima:'No tienes visitas próximas agendadas.',
    historial:'Aún no hay visitas en tu historial.',
    recurrente:'No tienes visitas recurrentes configuradas. Regístralas para autorizar buses escolares, servicios de limpieza, etc.'
  };

  function currentStatus(){
    const active=tabsGroup.querySelector('button.active');
    return active ? STATUS_BY_LABEL[active.textContent.trim()] : 'proxima';
  }

  function applyTab(){
    const status=currentStatus();
    let visibleCount=0;
    document.querySelectorAll('.visit-row').forEach(row=>{
      const match=row.dataset.status===status;
      row.style.display= match ? '' : 'none';
      if(match) visibleCount++;
    });
    if(emptyMsg) emptyMsg.textContent = visibleCount===0 ? EMPTY_TEXT[status] : '';
  }

  tabsGroup.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click',()=>{
      tabsGroup.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      applyTab();
    });
  });

  // ---- Alta de una nueva visita (usado por el formulario) ----
  let nextCode=2313;
  const MESES=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  function formatTime(value){
    const [hh,mm]=value.split(':').map(Number);
    const period=hh>=12 ? 'PM' : 'AM';
    let h12=hh%12; if(h12===0) h12=12;
    return h12+':'+String(mm).padStart(2,'0')+' '+period;
  }

  function activateTab(label){
    tabsGroup.querySelectorAll('button').forEach(b=>{
      b.classList.toggle('active', b.textContent.trim()===label);
    });
    applyTab();
  }

  function insertRow(row){
    const firstRow=document.querySelector('.visit-row');
    if(firstRow) firstRow.parentElement.insertBefore(row, firstRow);
    else if(emptyMsg) emptyMsg.parentElement.insertBefore(row, emptyMsg);
  }

  // Visita puntual (con fecha y hora concretas)
  function addVisit({name, dateVal, time, reason}){
    const [, m, d]=dateVal.split('-').map(Number);

    const row=document.createElement('div');
    row.className='visit-row';
    row.dataset.status='proxima';
    row.innerHTML=
      '<div class="visit-date"><div class="d">'+d+'</div><div class="m">'+MESES[m-1]+'</div></div>'+
      '<div class="visit-info"><b></b><span></span></div>'+
      '<div class="visit-code">VG-'+(nextCode++)+'</div>'+
      '<span class="badge warn">Pendiente</span>';
    row.querySelector('.visit-info b').textContent=name;
    row.querySelector('.visit-info span').textContent=formatTime(time)+' · '+reason;

    insertRow(row);
    activateTab('Próximas');
  }

  // Visita recurrente (sin fecha fija: bus escolar, servicio de limpieza, etc.)
  function addRecurringVisit({name, frequency, reason}){
    const row=document.createElement('div');
    row.className='visit-row';
    row.dataset.status='recurrente';
    row.innerHTML=
      '<div class="visit-date"><div class="d" style="font-size:1.1rem;"><i class="bi bi-arrow-repeat"></i></div><div class="m"></div></div>'+
      '<div class="visit-info"><b></b><span></span></div>'+
      '<div class="visit-code">VG-'+(nextCode++)+'</div>'+
      '<span class="badge ok">Autorizado</span>';
    row.querySelector('.visit-info b').textContent=name;
    row.querySelector('.visit-info span').textContent=frequency+' · '+reason;
    row.querySelector('.m').textContent=frequency;

    insertRow(row);
    activateTab('Recurrentes');
  }

  applyTab();
  return { addVisit, addRecurringVisit };
})();

// ---- Formulario "Nueva visita" ----
(function(){
  const modal=document.getElementById('newVisitModal');
  if(!modal) return;
  const cancelBtn=document.getElementById('newVisitCancel');
  const form=document.getElementById('newVisitForm');
  const nameInput=document.getElementById('visitName');
  const dateInput=document.getElementById('visitDate');
  const timeInput=document.getElementById('visitTime');
  const reasonInput=document.getElementById('visitReason');
  const nowCheckbox=document.getElementById('visitNow');
  const dateTimeGroup=document.getElementById('visitDateTimeGroup');
  const recurringCheckbox=document.getElementById('visitRecurring');
  const frequencyGroup=document.getElementById('visitFrequencyGroup');
  const frequencyInput=document.getElementById('visitFrequency');

  function pad(n){ return String(n).padStart(2,'0'); }

  function resetConditionalFields(){
    dateTimeGroup.style.display='flex';
    frequencyGroup.style.display='none';
    nowCheckbox.disabled=false;
  }

  // ---- Visita recurrente: oculta fecha/hora puntual y pide frecuencia ----
  recurringCheckbox.addEventListener('change',()=>{
    if(recurringCheckbox.checked){
      dateTimeGroup.style.display='none';
      frequencyGroup.style.display='';
      nowCheckbox.checked=false;
      nowCheckbox.disabled=true;
    } else {
      frequencyGroup.style.display='none';
      dateTimeGroup.style.display='flex';
      nowCheckbox.disabled=false;
    }
  });

  // ---- Ingreso inmediato: oculta fecha/hora y usa el momento actual ----
  nowCheckbox.addEventListener('change',()=>{
    if(nowCheckbox.checked){
      const now=new Date();
      dateInput.value=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());
      timeInput.value=pad(now.getHours())+':'+pad(now.getMinutes());
      dateTimeGroup.style.display='none';
    } else {
      dateTimeGroup.style.display='flex';
    }
  });

  // ---- Accesos rápidos: prellenan el motivo mas comun para agilizar el registro ----
  document.querySelectorAll('.quick-reason').forEach(btn=>{
    btn.addEventListener('click',()=>{
      reasonInput.value=btn.dataset.reason;
      nameInput.focus();
    });
  });

  function openModal(){ modal.classList.add('open'); nameInput.focus(); }
  function closeModal(){ modal.classList.remove('open'); }

  document.querySelectorAll('[data-open-visit]').forEach(btn=>{
    btn.addEventListener('click',()=>openModal());
  });
  cancelBtn.addEventListener('click',()=>{
    form.reset();
    resetConditionalFields();
    closeModal();
  });
  modal.addEventListener('click',(e)=>{ if(e.target===modal) closeModal(); });

  form.addEventListener('submit',(e)=>{
    e.preventDefault();
    const name=nameInput.value.trim();
    if(!name) return;

    if(recurringCheckbox.checked){
      AgendaVisitas.addRecurringVisit({name, frequency:frequencyInput.value, reason:reasonInput.value});
      if(window.showToast) showToast(name+' fue autorizado como visitante recurrente');
    } else {
      const dateVal=dateInput.value;
      const time=timeInput.value;
      if(!dateVal || !time) return;
      AgendaVisitas.addVisit({name, dateVal, time, reason:reasonInput.value});
      if(window.showToast) showToast('Visita agendada correctamente');
    }

    form.reset();
    resetConditionalFields();
    closeModal();
  });
})();
