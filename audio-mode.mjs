export function chooseAudioMode({search='',userAgent='',platform='',maxTouchPoints=0}={}){
 const requested=new URLSearchParams(search).get('audio');
 if(requested==='media'||requested==='buffer')return {engine:requested,reason:'explicit'};
 const ios=/iPhone|iPad|iPod/i.test(userAgent)||(platform==='MacIntel'&&maxTouchPoints>1);
 return {engine:ios?'buffer':'media',reason:ios?'iOS-default':'desktop-default'};
}
