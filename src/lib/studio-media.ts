import type { DesignDocument, ImageElement } from "./studio-template-model";

export function studioMediaSlots(document: DesignDocument) {
  return document.elements.filter((layer): layer is ImageElement => layer.type === "image").map(layer => ({
    layer,
    role: layer.mediaRole ?? (layer.brandRole === "logo" || layer.sourceType === "workspace-logo" ? "logo" : layer.width >= 1000 && layer.x === .5 && layer.y === .5 ? "background" : "secondary"),
  }));
}

export function replaceStudioMedia(document: DesignDocument, id: string, source: {assetId: string | null; templateUrl?: string; sourceType?: ImageElement["sourceType"]}): DesignDocument {
  return {...document, elements: document.elements.map(layer => layer.id === id && layer.type === "image"
    ? {...layer, assetId: source.assetId, templateUrl: source.templateUrl, sourceType: source.sourceType ?? "media"}
    : layer)};
}

export function supportedBrandFont(font: unknown) {
  const supported = ["DM Sans", "Cormorant Garamond", "Caveat", "Barlow Condensed", "Manrope", "Inter", "Arial", "Georgia", "Courier New"];
  return typeof font === "string" && supported.includes(font) ? font : undefined;
}