// ============ AUTH-STORE.JS ============
// Autenticación real contra el backend Node/Express.
const AuthStore=(function(){
  async function register(payload){
    try{
      const data=await VigiaAPI.request('/auth/register',{method:'POST',body:JSON.stringify(payload)});
      // A proposito NO se llama VigiaAPI.setSession() aqui: ahora el
      // registro manda a la persona a login.html para que inicie
      // sesion ella misma con la cuenta recien creada (en vez de
      // autologuearla directo al panel) -- dejar una sesion a medias
      // guardada en localStorage que nadie va a usar solo confunde.
      return {ok:true,user:data.usuario};
    }catch(error){ return {ok:false,error:error.message}; }
  }

  async function login(email,password,remember){
    try{
      const data=await VigiaAPI.request('/auth/login',{method:'POST',body:JSON.stringify({email,password,remember:Boolean(remember)})});
      VigiaAPI.setSession(data.usuario,data.expira_en);
      return {ok:true,user:data.usuario};
    }catch(error){ return {ok:false,error:error.message}; }
  }

  function getSession(){ return VigiaAPI.getSession(); }
  function logout(){ VigiaAPI.clearSession(); }

  return {register,login,logout,getSession};
})();
