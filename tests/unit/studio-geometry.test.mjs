import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsPoint, cornerHit, snapPosition, ratioCrop, zoomCrop } from '../../src/lib/studio-geometry.ts';
test('rotated objects retain correct direct-touch hit testing', () => {
  const box = { x: 100, y: 100, width: 100, height: 20, rotation: 90 };
  assert.equal(containsPoint(box, { x: 100, y: 140 }), true);
  assert.equal(containsPoint(box, { x: 140, y: 100 }), false);
});
test('corner handles resize proportionally from their rotated coordinates', () => {
  assert.equal(cornerHit({ x: 50, y: 50, width: 80, height: 40, rotation: 0 }, { x: 90, y: 70 }, 5), true);
  assert.equal(cornerHit({ x: 50, y: 50, width: 80, height: 40, rotation: 0 }, { x: 50, y: 50 }, 5), false);
});
test('temporary center and edge snapping stays subtle', () => {
  assert.deepEqual(snapPosition(498, 100, [0, 500, 1000], 6), { value: 500, guide: 500 });
  assert.deepEqual(snapPosition(480, 100, [500], 6), { value: 480, guide: null });
});
test('9:16 crop and pinch preserve valid source bounds', () => {
  const crop = ratioCrop(16 / 9, 9 / 16);
  assert.equal(crop.width, 81 / 256);
  const zoomed = zoomCrop(crop, 2);
  assert.equal(zoomed.width, crop.width / 2);
  assert.ok(zoomed.x >= 0 && zoomed.x + zoomed.width <= 1);
});