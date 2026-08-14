// ============ PERFIL.JS ============
// Antes esta pagina era una maqueta: "Jorge Paz", correo inventado,
// "Torre B, Depto 402" fijos en el HTML, y el boton EDITAR/GUARDAR no
// mandaba nada al servidor (solo cambiaba el texto en pantalla y
// desaparecia al recargar). Ahora carga el usuario real via
// GET /api/usuarios/me y el boton EDITAR si guarda de verdad con
// PUT /api/usuarios/me.

(function(){
  const editBtn=document.getElementById('editProfileBtn');
  const cancelBtn=document.getElementById('cancelEditBtn');
  const grid=document.querySelector('.info-grid');
  if(!editBtn || !grid) return;

  const ROLE_LABELS={residente:'RESIDENTE',guardia:'GUARDIA',admin:'ADMINISTRADOR',superadmin:'SUPERADMINISTRADOR'};
  const EDITABLE_IDS={nombre:'pfNombreField',apellido:'pfApellidoField',email:'pfEmailField',telefono:'pfTelefonoField'};

  let usuario=null;
  let editing=false;
  let originalValues={};

  function initials(nombre,apellido){
    const text=[nombre,apellido].filter(Boolean).join(' ')||'VG';
    return text.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x.charAt(0)).join('').toUpperCase()||'VG';
  }

  function pintar(u){
    document.getElementById('pfAvatar').textContent=initials(u.nombre,u.apellido);
    document.getElementById('pfNombre').textContent=[u.nombre,u.apellido].filter(Boolean).join(' ')||'Usuario';
    document.getElementById('pfRol').textContent=ROLE_LABELS[u.rol_codigo]||(u.rol_codigo||'').toUpperCase();
    const ubicacion=[u.unidad,u.residencial&&u.residencial.nombre].filter(Boolean).join(' · ');
    document.getElementById('pfUbicacion').textContent=ubicacion||'Sin unidad asignada';
    document.getElementById('pfNombreField').textContent=u.nombre||'—';
    document.getElementById('pfApellidoField').textContent=u.apellido||'—';
    document.getElementById('pfEmailField').textContent=u.email||'—';
    document.getElementById('pfTelefonoField').textContent=u.telefono||'Sin registrar';
    document.getElementById('pfUnidadField').textContent=u.unidad||'Sin asignar';
    document.getElementById('pfResidencialField').textContent=(u.residencial&&u.residencial.nombre)||'—';
  }

  async function cargarStats(rolCodigo){
    if(rolCodigo!=='residente')return; // los contadores solo aplican a residentes
    const metas=[
      ['pfStatVisitas','/invitaciones?limit=1'],
      ['pfStatAccesos','/accesos?limit=1'],
      ['pfStatVehiculos','/vehiculos?limit=1'],
    ];
    await Promise.all(metas.map(async([id,ruta])=>{
      try{
        const r=await VigiaAPI.request(ruta);
        document.getElementById(id).textContent=(r.meta&&r.meta.total)||0;
      }catch(e){
        document.getElementById(id).textContent='—';
      }
    }));
  }

  async function cargarPerfil(){
    try{
      const r=await VigiaAPI.request('/usuarios/me');
      // GET /usuarios/me devuelve la fila cruda de la tabla "usuarios",
      // que no trae rol_codigo (eso solo vive en el token/sesion). Lo
      // completamos desde la sesion para no perderlo.
      const session=VigiaAPI.getSession()||{};
      usuario={...r.data,rol_codigo:r.data.rol_codigo||session.rol_codigo};
      pintar(usuario);
      cargarStats(usuario.rol_codigo);
    }catch(e){
      showToast('No se pudo cargar tu perfil: '+e.message,'bi-exclamation-triangle-fill');
    }
  }

  function enterEditMode(){
    originalValues={};
    Object.entries(EDITABLE_IDS).forEach(([field,id])=>{
      const div=document.getElementById(id);
      originalValues[field]=div.textContent.trim();
      const input=document.createElement('input');
      input.type=field==='email'?'email':'text';
      input.className='form-control v-input';
      input.id=id;
      input.value=(usuario&&usuario[field])||'';
      div.replaceWith(input);
      if(field==='telefono'&&window.attachTelefonoHNMask)attachTelefonoHNMask(input);
    });
    editBtn.textContent='GUARDAR';
    cancelBtn.style.display='';
    editing=true;
  }

  async function exitEditMode(save){
    const valores={};
    Object.entries(EDITABLE_IDS).forEach(([field,id])=>{
      const input=document.getElementById(id);
      valores[field]=input.value.trim();
    });

    if(save){
      if(!valores.nombre||!valores.apellido||!valores.email){
        showToast('Nombre, apellido y correo son obligatorios','bi-exclamation-triangle-fill');
        return;
      }
      try{
        const r=await VigiaAPI.request('/usuarios/me',{method:'PUT',body:JSON.stringify(valores)});
        usuario={...usuario,...r.data};
        showToast('Perfil actualizado');
      }catch(err){
        showToast(err.message,'bi-exclamation-triangle-fill');
        return; // no salir de modo edicion si el guardado fallo
      }
    }

    Object.entries(EDITABLE_IDS).forEach(([field,id])=>{
      const input=document.getElementById(id);
      const div=document.createElement('div');
      div.className='v';
      div.id=id;
      div.textContent=(usuario&&usuario[field])||'—';
      input.replaceWith(div);
    });

    editBtn.textContent='EDITAR';
    cancelBtn.style.display='none';
    editing=false;
    if(save)pintar(usuario);
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

  cargarPerfil();
})();
