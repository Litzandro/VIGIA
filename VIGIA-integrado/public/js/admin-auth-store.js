// ============ ADMIN-AUTH-STORE.JS ============
// Sesión real del portal de administración usando la misma API y JWT
// del sistema (el mismo login que residentes y guardias), solo que
// aquí se exige que el rol devuelto sea admin o superadmin.
const AdminAuthStore=(function(){
  async function login(email,password){
    try{
      const data=await VigiaAPI.request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
      if(!['admin','superadmin'].includes(data.usuario.rol_codigo)){
        VigiaAPI.clearSession();
        return {ok:false,error:'Esta cuenta no tiene acceso al portal de administración.'};
      }
      const admin=VigiaAPI.setSession(data.usuario,data.expira_en);
      return {ok:true,admin};
    }catch(error){ return {ok:false,error:error.message}; }
  }

  function getSession(){ return VigiaAPI.getSession(); }
  function logout(){ VigiaAPI.clearSession(); }

  return {login,logout,getSession};
})();
