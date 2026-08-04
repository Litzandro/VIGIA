// ============ PERFIL.JS ============
// Exclusivo de perfil.html: edición en línea de la información de contacto.

(function(){
  const editBtn=document.getElementById('editProfileBtn');
  const cancelBtn=document.getElementById('cancelEditBtn');
  const grid=document.querySelector('.info-grid');
  if(!editBtn || !grid) return;

  let editing=false;
  let originalValues=[];

  function enterEditMode(){
    const fields=grid.querySelectorAll('.info-field .v');
    originalValues=[...fields].map(f=>f.textContent.trim());
    fields.forEach(f=>{
      const input=document.createElement('input');
      input.type='text';
      input.className='form-control v-input';
      input.value=f.textContent.trim();
      f.replaceWith(input);
    });
    editBtn.textContent='GUARDAR';
    cancelBtn.style.display='';
    editing=true;
  }

  function exitEditMode(save){
    const inputs=grid.querySelectorAll('.info-field input.v-input');
    inputs.forEach((input,i)=>{
      const div=document.createElement('div');
      div.className='v';
      div.textContent = save ? (input.value.trim() || originalValues[i]) : originalValues[i];
      input.replaceWith(div);
    });
    editBtn.textContent='EDITAR';
    cancelBtn.style.display='none';
    editing=false;
    if(save && window.showToast) showToast('Perfil actualizado');
  }

  editBtn.addEventListener('click',(e)=>{
    e.preventDefault();
    if(!editing) enterEditMode();
    else exitEditMode(true);
  });

  cancelBtn.addEventListener('click',(e)=>{
    e.preventDefault();
    if(editing) exitEditMode(false);
  });
})();
