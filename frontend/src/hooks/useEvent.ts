import { useCallback, useEffect, useRef, useState } from 'react';
import * as events from '../api/events';
import type {
  EventPlan,
  RefinementProposal,
  TaskStatus,
  VendorStatus,
} from '../api/types';
import { errorMessage } from '../utils/format';

export function useEvent(id: string) {
  const [plan, setPlan] = useState<EventPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestRef = useRef<Promise<EventPlan> | null>(null);
  const requestSequence = useRef(0);
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());

  const load = useCallback(
    async (signal?: AbortSignal, force = false) => {
      if (!force && !signal && requestRef.current) return requestRef.current;
      const sequence = ++requestSequence.current;
      setLoading(true);
      setError('');
      const promise = events.getEvent(id, signal);
      if (!signal && !force) requestRef.current = promise;
      try {
        const next = await promise;
        if (sequence === requestSequence.current) setPlan(next);
        return next;
      } catch (reason) {
        if (
          sequence === requestSequence.current &&
          !(reason instanceof DOMException && reason.name === 'AbortError')
        ) {
          setError(errorMessage(reason));
        }
        throw reason;
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
        if (!signal && !force) requestRef.current = null;
      }
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [load]);

  const mutate = useCallback(
    <T>(
      action: () => Promise<T>,
      authoritativePlan?: (value: T) => EventPlan,
    ) => {
      const operation = mutationQueue.current.then(async () => {
        const result = await action();
        const committed = authoritativePlan?.(result);
        if (committed) setPlan(committed);
        try {
          await load(undefined, true);
        } catch {
          setError(
            'Your changes were saved, but the latest plan could not be refreshed. Retry to update this view.',
          );
        }
        return result;
      });
      mutationQueue.current = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    [load],
  );

  return {
    plan,
    setPlan,
    loading,
    error,
    retry: () => void load(undefined, true).catch(() => undefined),
    updateTask: (taskId: string, status: TaskStatus) =>
      mutate(() => events.updateTask(id, taskId, status)),
    updateBudget: (category: string, spent: number) =>
      mutate(() => events.updateBudget(id, category, spent)),
    updateVendor: (
      vendorId: string,
      input: { status?: VendorStatus; quote?: number },
    ) => mutate(() => events.updateVendor(id, vendorId, input)),
    applyRefinement: (
      baseVersion: number,
      proposedChanges: RefinementProposal,
    ) =>
      mutate(
        () => events.applyRefinement(id, baseVersion, proposedChanges),
        (committed) => committed,
      ),
    refetch: (signal?: AbortSignal) => load(signal, true),
  };
}

export type EventController = ReturnType<typeof useEvent>;
