import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { getSwipeDecision, getSwipeSnapDuration } from '../src/lib/swipe-gesture.js';

test('swipe follows a deliberate horizontal drag even after a long hold', () => {
  assert.equal(getSwipeDecision({ deltaX: -100, deltaY: 4, width: 390, velocityX: 0, lastMoveAge: 3000 }), true);
  assert.equal(getSwipeDecision({ deltaX: 42, deltaY: 2, width: 390, velocityX: 0, lastMoveAge: 500 }), false);
});

test('flick uses current velocity and rejects reverse or stale flicks', () => {
  assert.equal(getSwipeDecision({ deltaX: -35, deltaY: 3, width: 390, velocityX: -0.8, lastMoveAge: 10 }), true);
  assert.equal(getSwipeDecision({ deltaX: -35, deltaY: 3, width: 390, velocityX: 0.8, lastMoveAge: 10 }), false);
  assert.equal(getSwipeDecision({ deltaX: -35, deltaY: 3, width: 390, velocityX: -0.8, lastMoveAge: 120 }), false);
  assert.equal(getSwipeDecision({ deltaX: -100, deltaY: 100, width: 390, velocityX: -1, lastMoveAge: 10 }), false);
});

test('snap duration is bounded and proportional to the remaining distance', () => {
  assert.equal(getSwipeSnapDuration(0, 390), 150);
  assert.equal(getSwipeSnapDuration(390, 390), 260);
  assert.equal(getSwipeSnapDuration(195, 390, true), 190);
  assert.equal(getSwipeSnapDuration(9999, 390), 260);
});

test('adjacent panels are pre-mounted and gesture move never sets React state', () => {
  const source = readFileSync(new URL('../src/components/SwipeNavigation.jsx', import.meta.url), 'utf8');
  const handler = source.split('const handlePointerMove =')[1].split('const handlePointerUp =')[0];
  assert.match(source, /<TabPreview path=\{prevPath\}/);
  assert.match(source, /<TabPreview path=\{nextPath\}/);
  assert.doesNotMatch(handler, /\b(?:setPreviewRoute|setPreviewDirection|setOptimisticPath)\s*\(/);
  assert.match(source, /onPointerCancel=\{handlePointerCancel\}/);
  assert.match(source, /<Header routeOverride=\{optimisticPath\}/);
});

test('tab previews do not invent balances or portfolio holdings', () => {
  const source = readFileSync(new URL('../src/components/previews/TabPreview.jsx', import.meta.url), 'utf8');
  for (const fabricated of ['18500000', '6450000', '12050000', '0.125', '1.85', '8500000', '1545.0', '1500.0']) {
    assert.equal(source.includes(fabricated), false, `fabricated value found: ${fabricated}`);
  }
  assert.match(source, /calculateCryptoPortfolio\(cryptoWallets/);
});
