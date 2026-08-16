// ============ AUTH-STORE.JS ============
// Autenticación real contra el backend Node/Express.
const AuthStore=(function(){
  async function register(payload){
    try{
      const data=await VigiaAPI.request('/auth/register',{method:'POST',body:JSON.stringify(payload)});
      VigiaAPI.setSession(data.usuario,data.expira_en);
      return {ok:true,user:data.usuario};
    }catch(error){ return {ok:false,error:error.message}; }
  }

  async function login(email,password){
    try{
      const data=await VigiaAPI.request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
      VigiaAPI.setSession(data.usuario,data.expira_en);
      return {ok:true,user:data.usuario};
    }catch(error){ return {ok:false,error:error.message}; }
  }

  function getSession(){ return VigiaAPI.getSession(); }
  function logout(){ VigiaAPI.clearSession(); }

  return {register,login,logout,getSession};
})();
