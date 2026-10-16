export type StudioBox = { x: number; y: number; width: number; height: number; rotation: number };
export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export function localPoint(box: StudioBox, point: { x: number; y: number }) {
  const radians = -box.rotation * Math.PI / 180;
  const dx = point.x - box.x, dy = point.y - box.y;
  return { x: dx * Math.cos(radians) - dy * Math.sin(radians), y: dx * Math.sin(radians) + dy * Math.cos(radians) };
}
export function containsPoint(box: StudioBox, point: { x: number; y: number }) {
  const local = localPoint(box, point);
  return Math.abs(local.x) <= box.width / 2 && Math.abs(local.y) <= box.height / 2;
}
export function cornerHit(box: StudioBox, point: { x: number; y: number }, tolerance: number) {
  const local = localPoint(box, point);
  return Math.abs(Math.abs(local.x) - box.width / 2) <= tolerance && Math.abs(Math.abs(local.y) - box.height / 2) <= tolerance;
}
export function snapPosition(value: number, size: number, targets: number[], threshold: number) {
  let best = { value, guide: null as number | null }, distance = threshold;
  for (const target of targets) for (const offset of [0, -size / 2, size / 2]) {
    const delta = Math.abs(value + offset - target);
    if (delta < distance) { distance = delta; best = { value: target - offset, guide: target }; }
  }
  return best;
}
export function ratioCrop(sourceRatio: number, targetRatio: number | null) {
  const width = targetRatio && sourceRatio > targetRatio ? targetRatio / sourceRatio : 1;
  const height = targetRatio && sourceRatio < targetRatio ? sourceRatio / targetRatio : 1;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}
export function zoomCrop(crop: { x: number; y: number; width: number; height: number }, scale: number) {
  const width = clamp(crop.width / scale, 0.05, 1), height = clamp(crop.height / scale, 0.05, 1);
  return { x: clamp(crop.x + (crop.width - width) / 2, 0, 1 - width), y: clamp(crop.y + (crop.height - height) / 2, 0, 1 - height), width, height };
}