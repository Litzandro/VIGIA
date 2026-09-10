// ============ AUTH-STORE.JS ============
// Autenticación real contra el backend Node/Express.
const AuthStore=(function(){
  async function register(payload){
    try{
      // A proposito NO se llama VigiaAPI.setSession() aqui: la cuenta
      // recien creada todavia no esta verificada (hay que confirmar el
      // correo primero, ver verificar-correo en authController.js), asi
      // que el backend ya no regresa una sesion utilizable -- solo un
      // mensaje. register.js manda a la persona a login.html despues.
      const data=await VigiaAPI.request('/auth/register',{method:'POST',body:JSON.stringify(payload)});
      return {ok:true,mensaje:data.mensaje};
    }catch(error){ return {ok:false,error:error.message}; }
  }

  async function reenviarVerificacion(email){
    try{
      const data=await VigiaAPI.request('/auth/reenviar-verificacion',{method:'POST',body:JSON.stringify({email})});
      return {ok:true,mensaje:data.mensaje};
    }catch(error){ return {ok:false,error:error.message}; }
  }

  async function login(email,password,remember){
    try{
      const data=await VigiaAPI.request('/auth/login',{method:'POST',body:JSON.stringify({email,password,remember:Boolean(remember)})});
      VigiaAPI.setSession(data.usuario,data.expira_en);
      return {ok:true,user:data.usuario};
    }catch(error){ return {ok:false,error:error.message,necesitaVerificacion:Boolean(error.necesitaVerificacion)}; }
  }

  function getSession(){ return VigiaAPI.getSession(); }
  function logout(){ VigiaAPI.clearSession(); }

  return {register,login,logout,getSession,reenviarVerificacion};
})();
