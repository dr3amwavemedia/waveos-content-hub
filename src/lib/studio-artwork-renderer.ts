import { logoContainSize, studioDocumentSize, type DesignDocument, type ImageElement } from "./studio-template-model";
import { applyPhotoFilterPixels, isIdentityPhotoFilter, photoFilterCss, type PhotoFilterParams } from "./studio-photo-filter";
const imageCache = new Map<string,Promise<HTMLImageElement>>();

// Safari/WebKit exposes ctx.filter but ignores it when drawing, so detect real support once by reading back a pixel.
let canvasFilterSupport: boolean | null = null;
function canvasFilterWorks() {
  if (canvasFilterSupport !== null) return canvasFilterSupport;
  try {
    const probe = window.document.createElement("canvas"); probe.width = probe.height = 1;
    const p = probe.getContext("2d", { willReadFrequently: true });
    if (!p || !("filter" in p)) return (canvasFilterSupport = false);
    p.filter = "brightness(200%)"; p.fillStyle = "rgb(100,100,100)"; p.fillRect(0, 0, 1, 1);
    canvasFilterSupport = p.getImageData(0, 0, 1, 1).data[0] > 150;
  } catch { canvasFilterSupport = false; }
  return canvasFilterSupport;
}

const MAX_FILTER_PIXELS = 2400;
const filteredCache = new Map<string, HTMLCanvasElement>();
function drawFilteredPixels(ctx: CanvasRenderingContext2D, image: HTMLImageElement, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number, filter: PhotoFilterParams) {
  const t = ctx.getTransform(); const scale = Math.max(Math.hypot(t.a, t.b), 0.01);
  const fit = Math.min(1, MAX_FILTER_PIXELS / Math.max(dw * scale, dh * scale, 1));
  const w = Math.max(1, Math.round(dw * scale * fit)), h = Math.max(1, Math.round(dh * scale * fit));
  const key = [image.src, sx, sy, sw, sh, w, h, photoFilterCss(filter)].join("|");
  let off = filteredCache.get(key);
  if (!off) {
    off = window.document.createElement("canvas"); off.width = w; off.height = h;
    const o = off.getContext("2d", { willReadFrequently: true });
    if (!o) { ctx.drawImage(image, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh); return; }
    o.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
    try {
      const pixels = o.getImageData(0, 0, w, h);
      applyPhotoFilterPixels(pixels.data, filter);
      o.putImageData(pixels, 0, 0);
    } catch { /* Image without CORS access: draw unadjusted rather than fail. */ }
    filteredCache.set(key, off);
    if (filteredCache.size > 12) filteredCache.delete(filteredCache.keys().next().value as string);
  }
  ctx.drawImage(off, -dw / 2, -dh / 2, dw, dh);
}
export function loadStudioImage(url:string) {
  const cached=imageCache.get(url);if(cached)return cached;
  const pending=new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.crossOrigin="anonymous";image.onload=()=>resolve(image);image.onerror=()=>{imageCache.delete(url);reject(new Error("Image could not load"));};image.src=url;});
  imageCache.set(url,pending);return pending;
}
export function studioImageUrl(element:ImageElement,urls:Record<string,string>,logo?:string|null){return element.sourceType === "workspace-logo" ? logo : element.templateUrl ?? urls[element.assetId ?? ""];}
export async function renderStudioArtwork(canvas:HTMLCanvasElement,document:DesignDocument,urls:Record<string,string>,logo?:string|null,targetWidth?:number){
  const format=studioDocumentSize(document);canvas.width=targetWidth??format.width;canvas.height=Math.round(canvas.width*format.height/format.width);
  const ctx=canvas.getContext("2d");if(!ctx)return false;
  await Promise.all(document.elements.filter(e=>e.type === "text").map(async e=>{if(e.type === "text")try{await window.document.fonts.load(`${e.fontWeight} ${e.fontSize}px "${e.fontFamily??"Inter"}"`);}catch{/* System font fallback remains editable. */}}));
  ctx.scale(canvas.width/format.width,canvas.height/format.height);ctx.fillStyle=document.background;ctx.fillRect(0,0,format.width,format.height);let ready=true;
  for(const element of document.elements){ctx.save();ctx.translate(element.x*format.width,element.y*format.height);ctx.rotate((element.rotation??0)*Math.PI/180);ctx.globalAlpha=element.opacity??1;
    if(element.type === "shape"){ctx.fillStyle=element.color;if(element.shape === "circle"){ctx.beginPath();ctx.ellipse(0,0,element.width/2,element.height/2,0,0,Math.PI*2);ctx.fill();}else ctx.fillRect(-element.width/2,-element.height/2,element.width,element.height);if((element.borderWidth??0)>0){ctx.strokeStyle=element.borderColor??element.color;ctx.lineWidth=element.borderWidth??0;if(element.shape === "circle")ctx.stroke();else ctx.strokeRect(-element.width/2,-element.height/2,element.width,element.height);}}
    else if(element.type === "text"){ctx.fillStyle=element.color;ctx.font=`${element.fontWeight} ${element.fontSize}px "${element.fontFamily??"Inter"}"`;ctx.textAlign=element.align;ctx.textBaseline="middle";ctx.letterSpacing=`${element.letterSpacing??0}px`;const lines=element.text.split("\n").slice(0,8),lineHeight=element.fontSize*1.18;lines.forEach((line,i)=>ctx.fillText(line,0,(i-(lines.length-1)/2)*lineHeight,format.width*.88));}
    else{const url=studioImageUrl(element,urls,logo);if(url)try{const image=await loadStudioImage(url);const exposure=element.exposure??0,warmth=element.warmth??0,highlights=element.highlights??0,shadows=element.shadows??0;
      const exposureMultiplier=Math.pow(2,(exposure/100)*1.5);
      const effectiveBrightness=clampFilter((element.brightness??100)*exposureMultiplier+highlights*.30+shadows*.22);
      const effectiveContrast=clampFilter((element.contrast??100)+highlights*.12-shadows*.16);
      const effectiveSaturation=clampFilter(element.saturation??100);
      const warmSepia=Math.max(0,warmth)/160;
      const warmHue=warmth>0?Math.min(10,warmth*.10):0;
      const coolHue=warmth<0?Math.min(22,Math.abs(warmth)*.22):0;
      const filter:PhotoFilterParams={brightness:effectiveBrightness,contrast:effectiveContrast,saturation:effectiveSaturation,sepia:warmSepia,hueRotate:warmHue-coolHue};
      const isLogo=element.brandRole==="logo"||element.mediaRole==="logo"||element.sourceType==="workspace-logo";const crop=isLogo?{x:0,y:0,width:1,height:1}:element.crop??{x:0,y:0,width:1,height:1};const size=isLogo?logoContainSize(element.width,element.height,image.naturalWidth,image.naturalHeight):element;
      const sx=image.naturalWidth*crop.x,sy=image.naturalHeight*crop.y,sw=image.naturalWidth*crop.width,sh=image.naturalHeight*crop.height;
      if(isIdentityPhotoFilter(filter)||canvasFilterWorks()){ctx.filter=photoFilterCss(filter);ctx.drawImage(image,sx,sy,sw,sh,-size.width/2,-size.height/2,size.width,size.height);}
      else drawFilteredPixels(ctx,image,sx,sy,sw,sh,size.width,size.height,filter);}catch{ready=false;}else ready=false;}
    ctx.restore();
  }
  return ready;
}


function clampFilter(value:number){
  return Math.max(0,Math.min(300,value));
}
