/* Offline PC bodycam stills: the pixels come from the current rendered frame,
 * not a separate omniscient camera or an external screenshot service. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.VeilpointBodycamStill=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_PIXELS=4096*4096;
  function encodeFrame(canvas,renderer,documentRef){
    if(!canvas||!documentRef||typeof documentRef.createElement!=='function')
      throw new RangeError('bodycam_canvas_unavailable');
    const width=canvas.width,height=canvas.height;
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
        width<1||height<1||width*height>MAX_PIXELS)
      throw new RangeError('bodycam_invalid_frame_size');
    const output=documentRef.createElement('canvas');
    output.width=width;output.height=height;
    const ctx=output.getContext('2d');
    if(!ctx)throw new RangeError('bodycam_2d_unavailable');
    if(renderer&&renderer.gl&&!renderer.fallback){
      const gl=renderer.gl;
      if(typeof gl.isContextLost==='function'&&gl.isContextLost())
        throw new RangeError('bodycam_graphics_context_lost');
      const pixels=new Uint8Array(width*height*4);
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      if(typeof gl.getError==='function'&&gl.getError()!==gl.NO_ERROR)
        throw new RangeError('bodycam_frame_read_failed');
      // WebGL pixel origin is bottom-left; a PNG must preserve the real
      // top-to-bottom player perspective without stretching or mirroring.
      const image=ctx.createImageData(width,height);
      const stride=width*4;
      for(let y=0;y<height;y++)
        image.data.set(pixels.subarray((height-y-1)*stride,(height-y)*stride),y*stride);
      ctx.putImageData(image,0,0);
    }else ctx.drawImage(canvas,0,0,width,height);
    const png=output.toDataURL('image/png');
    if(typeof png!=='string'||!png.startsWith('data:image/png;base64,'))
      throw new RangeError('bodycam_png_encoding_failed');
    return png;
  }
  function saveStill({canvas,renderer,document:documentRef,mode,elapsed}){
    if(!['br','ch01'].includes(mode)||!Number.isFinite(elapsed)||elapsed<0)
      throw new RangeError('bodycam_invalid_capture');
    const png=encodeFrame(canvas,renderer,documentRef);
    const anchor=documentRef.createElement('a');
    const tick=Math.floor(elapsed*60+1e-6);
    anchor.download='veilpoint-'+mode+'-frame-'+String(tick).padStart(7,'0')+'.png';
    anchor.href=png;
    if(typeof anchor.click!=='function')throw new RangeError('bodycam_download_unavailable');
    // In-page, user-requested F8 download; no upload, network, localStorage
    // mutation, world-state mutation or new render pass.
    anchor.click();
    return anchor.download;
  }
  return Object.freeze({encodeFrame,saveStill});
});
