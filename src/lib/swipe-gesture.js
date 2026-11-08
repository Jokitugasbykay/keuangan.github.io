/** Pure gesture decisions, shared by the UI and regression tests. */
export function getSwipeDecision({ deltaX, deltaY, width, velocityX, lastMoveAge }) {
  const horizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
  if (!horizontal) return false;

  const threshold = Math.min(108, Math.max(72, width * 0.25));
  const passedDistance = Math.abs(deltaX) >= threshold;
  const fastFlick = Math.abs(deltaX) >= 28 &&
    Math.sign(velocityX) === Math.sign(deltaX) &&
    Math.abs(velocityX) >= 0.5 &&
    lastMoveAge < 90;

  // A slow, deliberate drag may be held indefinitely before release.
  return passedDistance || fastFlick;
}

export function getSwipeSnapDuration(remainingDistance, width, springBack = false) {
  if (typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0;
  const fraction = Math.max(0, Math.min(1, remainingDistance / Math.max(1, width)));
  return Math.round(springBack ? 140 + fraction * 100 : 150 + fraction * 110);
}
