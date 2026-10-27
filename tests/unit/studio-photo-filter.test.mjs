import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPhotoFilterPixels } from '../../src/lib/studio-photo-filter.ts';
const base = { brightness: 100, contrast: 100, saturation: 100, sepia: 0, hueRotate: 0 };
test('Unchanged sliders leave photo pixels untouched', () => {
  assert.deepEqual(applyPhotoFilterPixels([10, 120, 240, 255], base), [10, 120, 240, 255]);
});
test('Brightness 200% doubles pixel values like the browser canvas filter', () => {
  assert.deepEqual(applyPhotoFilterPixels([100, 100, 100, 255], { ...base, brightness: 200 }), [200, 200, 200, 255]);
});
test('Contrast pushes values away from mid-grey and clamps at the limits', () => {
  assert.deepEqual(applyPhotoFilterPixels([50, 220, 250, 255], { ...base, contrast: 200 }), [0, 255, 255, 255]);
});
test('Saturation 0% turns a colour pixel grey', () => {
  const [r, g, b] = applyPhotoFilterPixels([255, 0, 0, 255], { ...base, saturation: 0 });
  assert.equal(r, g); assert.equal(g, b);
});
