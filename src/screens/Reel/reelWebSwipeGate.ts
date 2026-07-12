/** Short gate so a web touch-swipe doesn't also fire video tap (pause). */
let lastReelWebSwipeAt = 0;

export function markReelWebSwipe() {
  lastReelWebSwipeAt = Date.now();
}

export function wasRecentReelWebSwipe(ms = 480) {
  return Date.now() - lastReelWebSwipeAt < ms;
}
