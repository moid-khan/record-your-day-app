/**
 * ScrollMomentumManager - Centralized control to stop all scroll momentum
 *
 * CRITICAL: This solves the topMomentumScrollEnd crash on logout.
 *
 * The Problem:
 * - When ScrollView/FlatList unmounts, queued native momentum events
 *   get dispatched to null instanceHandles, causing crashes.
 * - Setting scrollEnabled={false} prevents NEW scrolls but doesn't
 *   cancel EXISTING momentum.
 *
 * The Solution:
 * - Call scrollTo({y: 0, animated: false}) on all scroll views
 * - This immediately cancels momentum at the native level
 * - Native event queue gets cleared before component unmounts
 */

type StopCallback = () => void;

class ScrollMomentumManager {
  private callbacks: Set<StopCallback> = new Set();

  /**
   * Register a scroll view's stop callback
   * Call this from useEffect and return the unsubscribe function
   */
  subscribe(callback: StopCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Stop all scroll momentum immediately
   * Call this BEFORE changing auth state or unmounting scroll components
   */
  stopAll(): void {
    console.log(`🛑 ScrollMomentumManager: Stopping momentum on ${this.callbacks.size} scroll views`);
    this.callbacks.forEach(callback => {
      try {
        callback();
      } catch (e) {
        // Ignore errors from unmounted components
      }
    });
  }

  /**
   * Get the number of registered scroll views (for debugging)
   */
  getCount(): number {
    return this.callbacks.size;
  }
}

export const scrollMomentumManager = new ScrollMomentumManager();
