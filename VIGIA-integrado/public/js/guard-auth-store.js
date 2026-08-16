// ============ GUARD-AUTH-STORE.JS ============
// Sesión real del guardia usando la misma API y JWT del sistema.
const GuardAuthStore=(function(){
  async function login(email,password){
    try{
      const data=await VigiaAPI.request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
      if(!['guardia','admin','superadmin'].includes(data.usuario.rol_codigo)){
        VigiaAPI.clearSession();
        return {ok:false,error:'Esta cuenta no tiene acceso al portal del guardia.'};
      }
      const guard=VigiaAPI.setSession(data.usuario,data.expira_en);
      return {ok:true,guard};
    }catch(error){ return {ok:false,error:error.message}; }
  }

  function getSession(){ return VigiaAPI.getSession(); }
  function logout(){ VigiaAPI.clearSession(); }

  return {login,logout,getSession};
})();
