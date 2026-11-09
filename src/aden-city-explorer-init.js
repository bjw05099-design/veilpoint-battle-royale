(function(root){'use strict';
 function start(){
  if(!root.VeilpointAdenCityExplorer)throw new Error('City explorer module missing');
  root.VeilpointAdenCityExplorer.attach(root.document);
 }
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})(globalThis);
