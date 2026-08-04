// ============ CHAT-STORE.JS ============
// Fuente de datos compartida entre chat.html (residente) y la pestaña
// "Chat con residentes" de superadmin.html. Usa localStorage como canal
// real entre ambas pantallas: si las tienes abiertas en dos pestañas del
// mismo navegador, un mensaje enviado de un lado aparece del otro al
// instante (evento "storage").
//
// Honestidad sobre el alcance: esto sincroniza dentro del mismo navegador
// / dispositivo. No sustituye un backend real — para que un guardia en su
// propio celular vea los mensajes de un residente en el suyo, se necesita
// un servidor de verdad (websockets, base de datos, etc.), no localStorage.

const ChatStore=(function(){
  const KEY='vigia_chat_threads';

  function readAll(){
    try{ return JSON.parse(localStorage.getItem(KEY))||{}; }
    catch(e){ return {}; }
  }
  function writeAll(threads){
    try{ localStorage.setItem(KEY, JSON.stringify(threads)); }
    catch(e){ /* almacenamiento no disponible; el chat sigue funcionando en memoria para esta pestaña */ }
  }
  function formatNow(){
    const now=new Date();
    let h=now.getHours(); const m=String(now.getMinutes()).padStart(2,'0');
    const period=h>=12?'PM':'AM'; h=h%12; if(h===0) h=12;
    return h+':'+m+' '+period;
  }

  // Crea el hilo con mensajes iniciales SOLO si todavia no existe,
  // para no pisar una conversacion real con la semilla de ejemplo.
  function ensureSeed(name, seedMessages){
    const threads=readAll();
    if(!threads[name]){
      threads[name]=seedMessages || [];
      writeAll(threads);
    }
  }

  function getThread(name){
    return readAll()[name] || [];
  }

  // sender: 'resident' (el residente) o 'staff' (guardia/administracion)
  function addMessage(name, sender, text){
    const threads=readAll();
    if(!threads[name]) threads[name]=[];
    const msg={sender, text, time:formatNow(), ts:Date.now()};
    threads[name].push(msg);
    writeAll(threads);
    return msg;
  }

  // Se dispara cuando OTRA pestaña del mismo navegador escribe en el chat.
  function onChange(callback){
    window.addEventListener('storage',(e)=>{
      if(e.key===KEY) callback();
    });
  }

  return { ensureSeed, getThread, addMessage, onChange };
})();
