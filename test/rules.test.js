import test from 'node:test';
import assert from 'node:assert/strict';
import { clampOpinion, applyOpinionDelta } from '../src/rules.js';

test('clampOpinion constrains relationship scores to 1..100 integers', () => {
  assert.equal(clampOpinion(-50), 1);
  assert.equal(clampOpinion(0), 1);
  assert.equal(clampOpinion(1), 1);
  assert.equal(clampOpinion(50.6), 51);
  assert.equal(clampOpinion(100), 100);
  assert.equal(clampOpinion(500), 100);
});

test('applyOpinionDelta applies personality response deltas without escaping bounds', () => {
  assert.equal(applyOpinionDelta(50, 6), 56);
  assert.equal(applyOpinionDelta(97, 8), 100);
  assert.equal(applyOpinionDelta(3, -8), 1);
});
