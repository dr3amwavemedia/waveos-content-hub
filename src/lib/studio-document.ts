export const FORMATS = {
  square: { label: "Square", width: 1080, height: 1080 },
  portrait: { label: "Portrait", width: 1080, height: 1350 },
  story: { label: "Story", width: 1080, height: 1920 },
  landscape: { label: "Landscape", width: 1200, height: 628 },
} as const;

export type DesignFormat = keyof typeof FORMATS;
export type TextElement = {
  id: string;
  type: "text";
  name: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  fontFamily?: string;
  fontRole?: "headline" | "body" | "accent";
  lineHeight?: number;
  letterSpacing?: number;
  fontWeight: 400 | 600 | 700;
  align: CanvasTextAlign;
  opacity: number;
  rotation: number;
};
export type ShapeElement = {
  id: string;
  type: "shape";
  name: string;
  shape: "rectangle" | "circle";
  borderColor?: string;
  borderWidth?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  rotation: number;
};
export type ImageElement = {
  id: string;
  type: "image";
  name: string;
  sourceType: "media" | "workspace-logo" | "template-photo";
  templatePhoto?: "trades" | "wellness" | "studio";
  assetId: string | null;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  warmth?: number;
  highlights?: number;
  shadows?: number;
  sharpness?: number;
  crop?: { x: number; y: number; width: number; height: number };
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  rotation: number;
};
export type DesignElement = TextElement | ShapeElement | ImageElement;
export type DesignDocument = {
  version: 1;
  format: DesignFormat;
  background: string;
  elements: DesignElement[];
};

export interface DesignRow {
  id: string;
  name: string;
  format: DesignFormat;
  document: DesignDocument;
  updated_at: string;
}

