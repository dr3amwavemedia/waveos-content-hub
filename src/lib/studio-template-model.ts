export const STUDIO_FORMATS = {
  square: { label: "Square", width: 1080, height: 1080 },
  portrait: { label: "Portrait", width: 1080, height: 1350 },
  story: { label: "Story", width: 1080, height: 1920 },
  landscape: { label: "Landscape", width: 1200, height: 628 },
} as const;
export type DesignFormat = keyof typeof STUDIO_FORMATS;
type Layer = { id: string; name: string; x: number; y: number; opacity: number; rotation: number; brandRole?: "primary" | "secondary" | "logo" };
export type TextElement = Layer & { type: "text"; text: string; contentRole?: "business-name" | "cta" | "website" | "services" | "service-area"; color: string; fontSize: number; fontFamily?: string; fontRole?: "heading" | "body" | "accent"; letterSpacing?: number; fontWeight: 400 | 600 | 700; align: CanvasTextAlign };
export type ShapeElement = Layer & { type: "shape"; shape: "rectangle" | "circle"; borderColor?: string; borderWidth?: number; width: number; height: number; color: string };
export type ImageElement = Layer & { type: "image"; mediaRole?: "background" | "secondary" | "logo"; sourceType: "media" | "workspace-logo"; assetId: string | null; templateUrl?: string; exposure?: number; brightness?: number; contrast?: number; saturation?: number; warmth?: number; highlights?: number; shadows?: number; sharpness?: number; crop?: {x:number;y:number;width:number;height:number}; width:number;height:number };
export type DesignElement = TextElement | ShapeElement | ImageElement;
export type DesignDocument = { version: 1; format: DesignFormat; customWidth?: number; customHeight?: number; background: string; elements: DesignElement[] };
export function studioDocumentSize(document: DesignDocument) {
  const preset = STUDIO_FORMATS[document.format];
  const width = document.customWidth && document.customWidth > 0 ? document.customWidth : preset.width;
  const height = document.customHeight && document.customHeight > 0 ? document.customHeight : preset.height;
  return { label: document.customWidth && document.customHeight ? "Original" : preset.label, width, height };
}
export const STUDIO_FONTS = ["DM Sans", "Cormorant Garamond", "Caveat", "Barlow Condensed", "Manrope", "Inter", "Arial", "Georgia", "Courier New"];
export type StudioBrand = { primary:string; secondary?:string; logoUrl?:string|null; headingFont?:string; bodyFont?:string; accentFont?:string; businessName?:string; cta?:string; website?:string; services?:string; serviceArea?:string };
export type BrandApplyMode = "colors" | "fonts" | "light" | "full" | "logo";
export function logoContainSize(frameWidth:number,frameHeight:number,sourceWidth:number,sourceHeight:number){
  const scale=Math.min(frameWidth/sourceWidth,frameHeight/sourceHeight);
  return {width:sourceWidth*scale,height:sourceHeight*scale};
}
export function applyStudioBrand(document:DesignDocument, brand:StudioBrand, mode?:BrandApplyMode):DesignDocument {
  const colors=mode!=="logo", fonts=mode!=="colors"&&mode!=="logo", logos=mode===undefined||mode==="full"||mode==="logo", copy=mode===undefined||mode==="full";
  return {...document,elements:document.elements.map(layer => {
    if(layer.type === "text") {
      const values = {"business-name":brand.businessName,cta:brand.cta,website:brand.website,services:brand.services,"service-area":brand.serviceArea};
      const content = copy && layer.contentRole ? values[layer.contentRole]?.trim() : undefined;
      return {...layer, ...(content ? {text:content}:{}), ...(colors && layer.brandRole === "primary" ? {color:brand.primary}:colors && layer.brandRole === "secondary" && brand.secondary ? {color:brand.secondary}:{}), ...(fonts && layer.fontRole === "heading" && brand.headingFont ? {fontFamily:brand.headingFont}:fonts && layer.fontRole === "body" && brand.bodyFont ? {fontFamily:brand.bodyFont}:fonts && layer.fontRole === "accent" && brand.accentFont ? {fontFamily:brand.accentFont}:{})};
    }
    if(layer.type === "shape") return {...layer,...(colors && layer.brandRole === "primary" ? {color:brand.primary}:colors && layer.brandRole === "secondary" && brand.secondary ? {color:brand.secondary}:{})};
    if(logos && (layer.brandRole === "logo" || layer.mediaRole === "logo" || layer.sourceType === "workspace-logo") && brand.logoUrl) return {...layer,sourceType:"workspace-logo",templateUrl:undefined,assetId:null};
    return {...layer};
  })};
}
