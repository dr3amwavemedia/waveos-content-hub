import { STUDIO_FORMATS, logoContainSize, type DesignDocument, type ImageElement } from "./studio-template-model";
const imageCache = new Map<string,Promise<HTMLImageElement>>();
export function loadStudioImage(url:string) {
  const cached=imageCache.get(url);if(cached)return cached;
  const pending=new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.crossOrigin="anonymous";image.onload=()=>resolve(image);image.onerror=()=>{imageCache.delete(url);reject(new Error("Image could not load"));};image.src=url;});
  imageCache.set(url,pending);return pending;
}
export function studioImageUrl(element:ImageElement,urls:Record<string,string>,logo?:string|null){return element.sourceType === "workspace-logo" ? logo : element.templateUrl ?? urls[element.assetId ?? ""];}
export async function renderStudioArtwork(canvas:HTMLCanvasElement,document:DesignDocument,urls:Record<string,string>,logo?:string|null,targetWidth?:number){
  const format=STUDIO_FORMATS[document.format];canvas.width=targetWidth??format.width;canvas.height=Math.round(canvas.width*format.height/format.width);
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
      ctx.filter=`brightness(${effectiveBrightness}%) contrast(${effectiveContrast}%) saturate(${effectiveSaturation}%) sepia(${warmSepia}) hue-rotate(${warmHue-coolHue}deg)`;const isLogo=element.brandRole==="logo"||element.mediaRole==="logo"||element.sourceType==="workspace-logo";const crop=isLogo?{x:0,y:0,width:1,height:1}:element.crop??{x:0,y:0,width:1,height:1};const size=isLogo?logoContainSize(element.width,element.height,image.naturalWidth,image.naturalHeight):element;ctx.drawImage(image,image.naturalWidth*crop.x,image.naturalHeight*crop.y,image.naturalWidth*crop.width,image.naturalHeight*crop.height,-size.width/2,-size.height/2,size.width,size.height);}catch{ready=false;}else ready=false;}
    ctx.restore();
  }
  return ready;
}


function clampFilter(value:number){
  return Math.max(0,Math.min(300,value));
}
