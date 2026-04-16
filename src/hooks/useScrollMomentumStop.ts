import { useEffect, useRef, useCallback } from 'react';
import { ScrollView, FlatList } from 'react-native';
import { scrollMomentumManager } from '../utils/scrollMomentumManager';

type ScrollableRef = ScrollView | FlatList<any> | null;

/**
 * Hook to register a scroll view with the momentum manager
 *
 * Usage:
 * ```
 * const scrollRef = useScrollMomentumStop<ScrollView>();
 * return <ScrollView ref={scrollRef} ... />;
 * ```
 *
 * When scrollMomentumManager.stopAll() is called (e.g., before logout),
 * this scroll view's momentum will be immediately cancelled.
 */
export function useScrollMomentumStop<T extends ScrollableRef>() {
  const ref = useRef<T>(null);

  const stopMomentum = useCallback(() => {
    if (!ref.current) return;

    // For ScrollView
    if ('scrollTo' in ref.current && typeof ref.current.scrollTo === 'function') {
      (ref.current as ScrollView).scrollTo({ y: 0, animated: false });
    }
    // For FlatList
    if ('scrollToOffset' in ref.current && typeof ref.current.scrollToOffset === 'function') {
      (ref.current as FlatList<any>).scrollToOffset({ offset: 0, animated: false });
    }
  }, []);

  useEffect(() => {
    const unsubscribe = scrollMomentumManager.subscribe(stopMomentum);
    return unsubscribe;
  }, [stopMomentum]);

  return ref;
}
