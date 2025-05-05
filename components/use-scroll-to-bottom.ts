import { useEffect, useRef, type RefObject } from 'react';

/**
 * @hook useScrollToBottom
 * @template T - The type of HTML element for the container and end references (e.g., HTMLDivElement).
 * @description A custom hook that provides refs for a container element and an end target element within it.
 * It sets up a `MutationObserver` on the container. Whenever the container's direct or indirect children,
 * attributes, or character data change, it automatically scrolls the end target element into view instantly.
 * This is typically used for chat logs or similar containers where you always want the latest content visible.
 *
 * **Upstream:** Takes no arguments.
 * **Downstream:**
 * - Returns two React refs (`RefObject<T>`). The first should be attached to the scrollable container element,
 *   and the second should be attached to a stable element at the very bottom of the container's content.
 * - Uses `useRef` to create the refs.
 * - Uses `useEffect` to set up and tear down the `MutationObserver` on mount/unmount.
 *
 * @returns {[RefObject<T>, RefObject<T>]} A tuple containing the container ref and the end target ref.
 */
export function useScrollToBottom<T extends HTMLElement>(): [
  RefObject<T>, // Ref for the scrollable container
  RefObject<T>, // Ref for the target element at the bottom
] {
  // Ref for the scrollable container element
  const containerRef = useRef<T>(null);
  // Ref for the element marking the end of the content
  const endRef = useRef<T>(null);

  // Effect to set up the MutationObserver
  useEffect(() => {
    const container = containerRef.current;
    const end = endRef.current;

    // Only proceed if both refs are attached to elements
    if (container && end) {
      // Create an observer that scrolls the end element into view on any mutation
      const observer = new MutationObserver(() => {
        // Scrolls the `end` element to be visible at the bottom of the scrollable area.
        // 'instant' ensures no smooth scrolling animation.
        // 'block: end' aligns the bottom of the element with the bottom of the scrollport.
        end.scrollIntoView({ behavior: 'instant', block: 'end' });
      });

      // Observe the container for changes in children, subtree, attributes, and text content.
      observer.observe(container, {
        childList: true, // Direct children changes
        subtree: true, // Changes in deeper descendants
        attributes: true, // Attribute changes
        characterData: true, // Text content changes
      });

      // Cleanup function: disconnect the observer when the component unmounts
      // or the effect re-runs (though dependencies are empty, so only on unmount).
      return () => observer.disconnect();
    }
  }, []); // Empty dependency array means this effect runs only once on mount

  // Return the refs for the parent component to attach
  return [containerRef, endRef];
}
