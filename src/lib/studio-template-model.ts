export const STUDIO_FORMATS = {
  square: { label: "Square", width: 1080, height: 1080 },
  portrait: { label: "Portrait", width: 1080, height: 1350 },
  story: { label: "Story", width: 1080, height: 1920 },
  landscape: { label: "Landscape", width: 1200, height: 628 },
} as const;
export type DesignFormat = keyof typeof STUDIO_FORMATS;
type Layer = { id: string; name: string; x: number; y: number; opacity: number; rotation: number; brandRole?: "primary" | "secondary" | "logo" };
export type TextElement = Layer & { type: "text"; text: string; color: string; fontSize: number; fontFamily?: string; fontRole?: "heading" | "body" | "accent"; letterSpacing?: number; fontWeight: 400 | 600 | 700; align: CanvasTextAlign };
export type ShapeElement = Layer & { type: "shape"; shape: "rectangle" | "circle"; borderColor?: string; borderWidth?: number; width: number; height: number; color: string };
export type ImageElement = Layer & { type: "image"; sourceType: "media" | "workspace-logo"; assetId: string | null; templateUrl?: string; brightness?: number; contrast?: number; saturation?: number; warmth?: number; highlights?: number; shadows?: number; sharpness?: number; crop?: {x:number;y:number;width:number;height:number}; width:number;height:number };
export type DesignElement = TextElement | ShapeElement | ImageElement;
export type DesignDocument = { version: 1; format: DesignFormat; background: string; elements: DesignElement[] };
export const STUDIO_FONTS = ["DM Sans", "Cormorant Garamond", "Caveat", "Barlow Condensed", "Manrope", "Inter", "Arial", "Georgia", "Courier New"];
export type StudioBrand = { primary:string; secondary?:string; logoUrl?:string|null; headingFont?:string; bodyFont?:string; accentFont?:string };
export function applyStudioBrand(document:DesignDocument, brand:StudioBrand):DesignDocument {
  return {...document,elements:document.elements.map(layer => {
    if(layer.type === "text") return {...layer, ...(layer.brandRole === "primary" ? {color:brand.primary}:layer.brandRole === "secondary" && brand.secondary ? {color:brand.secondary}:{}), ...(layer.fontRole === "heading" && brand.headingFont ? {fontFamily:brand.headingFont}:layer.fontRole === "body" && brand.bodyFont ? {fontFamily:brand.bodyFont}:layer.fontRole === "accent" && brand.accentFont ? {fontFamily:brand.accentFont}:{})};
    if(layer.type === "shape") return {...layer,...(layer.brandRole === "primary" ? {color:brand.primary}:layer.brandRole === "secondary" && brand.secondary ? {color:brand.secondary}:{})};
    if(layer.brandRole === "logo" && brand.logoUrl) return {...layer,sourceType:"workspace-logo",templateUrl:undefined,assetId:null};
    return {...layer};
  })};
}
