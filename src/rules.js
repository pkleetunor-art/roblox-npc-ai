export function clampOpinion(value) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? Math.round(number) : 50;
  return Math.max(1, Math.min(100, safe));
}

export function applyOpinionDelta(current, delta) {
  return clampOpinion(clampOpinion(current) + Math.round(Number(delta) || 0));
}
