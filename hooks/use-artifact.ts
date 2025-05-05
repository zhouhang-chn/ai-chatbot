'use client';

import useSWR from 'swr';
import { UIArtifact } from '@/components/artifact';
import { useCallback, useMemo } from 'react';

/**
 * @constant initialArtifactData
 * @description Default initial state for the artifact panel when no artifact is active.
 */
export const initialArtifactData: UIArtifact = {
  documentId: 'init',
  content: '',
  kind: 'text',
  title: '',
  status: 'idle',
  isVisible: false,
  boundingBox: {
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  },
};

/**
 * @typedef Selector
 * @template T
 * @description Function type for selecting a specific part of the UIArtifact state.
 * @param {UIArtifact} state - The current artifact state.
 * @returns {T} The selected value.
 */
type Selector<T> = (state: UIArtifact) => T;

/**
 * @hook useArtifactSelector
 * @template Selected
 * @description A hook to select and subscribe to a specific part of the global artifact state (`UIArtifact`).
 * It uses SWR's local cache ('artifact' key) to access the state managed by `useArtifact`.
 * This allows components to re-render only when the selected part of the state changes.
 *
 * **Upstream:** Relies on the SWR cache entry with key 'artifact' being populated/managed by `useArtifact`.
 * **Downstream:** Returns the selected value derived from the current `UIArtifact` state.
 *
 * @param {Selector<Selected>} selector - A function that takes the current `UIArtifact` state and returns the desired slice/value.
 * @returns {Selected} The selected value from the artifact state.
 */
export function useArtifactSelector<Selected>(selector: Selector<Selected>) {
  // Access the artifact state from SWR cache with key 'artifact'.
  // `null` as fetcher indicates client-side state only.
  const { data: localArtifact } = useSWR<UIArtifact>('artifact', null, {
    fallbackData: initialArtifactData,
  });

  // Memoize the selector application to prevent re-computation if artifact/selector haven't changed.
  const selectedValue = useMemo(() => {
    // Use fallback if data isn't loaded yet (shouldn't happen with fallbackData, but good practice)
    if (!localArtifact) return selector(initialArtifactData);
    return selector(localArtifact);
  }, [localArtifact, selector]);

  return selectedValue;
}

/**
 * @hook useArtifact
 * @description Manages the global state for the currently active artifact displayed in the side panel.
 * It uses SWR's mutation capability (`mutate`) to update the client-side state stored under the 'artifact' key.
 * It also manages separate SWR states for artifact-specific metadata.
 *
 * **Upstream:** Does not directly take props, but manages shared client-side state.
 * **Downstream:**
 * - Provides the current `artifact` state (`UIArtifact`).
 * - Provides a `setArtifact` function to update the artifact state.
 * - Provides `metadata` specific to the current `artifact.documentId`.
 * - Provides a `setMetadata` function to update the metadata.
 * - Components like `Artifact` and `Chat` use this hook to read and update the active artifact.
 *
 * @returns {{ artifact: UIArtifact; setArtifact: (updaterFn: UIArtifact | ((currentArtifact: UIArtifact) => UIArtifact)) => void; metadata: any; setMetadata: <Data = any>(data?: Data | Promise<Data> | ((currentData?: Data | undefined) => Promise<Data | undefined> | Data | undefined), opts?: import("swr").MutatorOptions<Data> | undefined) => Promise<Data | undefined>; }}
 * An object containing the artifact state, update function, metadata state, and metadata update function.
 */
export function useArtifact() {
  // Manage the main artifact state using SWR client-side cache.
  const { data: localArtifact, mutate: setLocalArtifact } = useSWR<UIArtifact>(
    'artifact',
    null,
    {
      fallbackData: initialArtifactData,
    },
  );

  // Memoize the artifact object reference to prevent unnecessary re-renders in consumers.
  const artifact = useMemo(() => {
    return localArtifact || initialArtifactData;
  }, [localArtifact]);

  /**
   * Callback function to update the global artifact state.
   * Accepts either a new artifact object or an updater function.
   * Wraps SWR's `mutate` function (`setLocalArtifact`).
   */
  const setArtifact = useCallback(
    (updaterFn: UIArtifact | ((currentArtifact: UIArtifact) => UIArtifact)) => {
      // Call SWR's mutate function for the 'artifact' key
      setLocalArtifact((currentArtifact) => {
        // Use current state or initial data as base for updater function
        const artifactToUpdate = currentArtifact || initialArtifactData;
        // Apply updater function if it's a function, otherwise use the direct value
        return typeof updaterFn === 'function' ? updaterFn(artifactToUpdate) : updaterFn;
      }, false); // `false` prevents revalidation after mutation for client-side state
    },
    [setLocalArtifact],
  );

  // Manage artifact-specific metadata using a dynamic SWR key based on documentId.
  const { data: localArtifactMetadata, mutate: setLocalArtifactMetadata } =
    useSWR<any>(
      () =>
        artifact.documentId && artifact.documentId !== 'init' ? `artifact-metadata-${artifact.documentId}` : null,
      null,
      {
        fallbackData: {},
      },
    );

  // Memoize the returned object containing state and setters.
  return useMemo(
    () => ({
      artifact,
      setArtifact,
      metadata: localArtifactMetadata ?? {},
      setMetadata: setLocalArtifactMetadata,
    }),
    [artifact, setArtifact, localArtifactMetadata, setLocalArtifactMetadata],
  );
}
