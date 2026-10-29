import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { refineEvent } from '../../api/ai';
import { ApiError } from '../../api/http';
import type { RefineResponse } from '../../api/types';
import type { EventController } from '../../hooks/useEvent';
import { currency, errorMessage } from '../../utils/format';
import { AiUnavailable } from '../Feedback';
function ProposalDialog({
  preview,
  controller,
  close,
  conflict,
}: {
  preview: RefineResponse;
  controller: EventController;
  close: () => void;
  conflict: (message: string) => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plan = controller.plan!;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => previous?.focus();
  }, []);
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = dialog.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex="0"]',
    );
    if (!controls?.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      await controller.applyRefinement(
        preview.baseVersion,
        preview.proposedChanges,
      );
      close();
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        close();
        conflict(
          'Your plan changed after this preview. Generate a new refinement before applying.',
        );
      } else setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-title"
        ref={dialog}
        aria-busy={busy}
        onKeyDown={keys}
      >
        <h2 id="proposal-title">Review proposed changes</h2>
        <p>
          Based on plan version {preview.baseVersion}. Nothing changes until you
          apply.
        </p>
        {preview.proposedChanges.budgetShifts.length > 0 && (
          <section aria-labelledby="allocations-title">
            <h3 id="allocations-title">Allocation changes</h3>
            <div
              className="table-scroll"
              role="region"
              aria-label="Allocation changes table"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Before</th>
                    <th scope="col">After</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.proposedChanges.budgetShifts.map((shift) => {
                    const item = plan.budget.find(
                      (entry) => entry.category === shift.category,
                    );
                    return (
                      <tr key={shift.category}>
                        <th scope="row">{item?.label ?? shift.category}</th>
                        <td>
                          {currency(item?.allocated ?? 0, plan.event.currency)}
                        </td>
                        <td>
                          {currency(
                            (item?.allocated ?? 0) + shift.delta,
                            plan.event.currency,
                          )}
                        </td>
                        <td>{shift.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {preview.proposedChanges.newTasks.length > 0 && (
          <section aria-labelledby="tasks-added-title">
            <h3 id="tasks-added-title">Tasks to add</h3>
            <ul>
              {preview.proposedChanges.newTasks.map((task) => (
                <li key={`${task.title}-${task.dueDate}`}>
                  <strong>{task.title}</strong> — {task.dueDate}
                  <br />
                  {task.reason}
                </li>
              ))}
            </ul>
          </section>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button
            ref={closeButton}
            className="secondary"
            type="button"
            aria-disabled={busy}
            onClick={() => {
              if (!busy) close();
            }}
          >
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void apply()}>
            {busy ? 'Applying…' : 'Apply changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
export function Refinement({ controller }: { controller: EventController }) {
  const plan = controller.plan!;
  const [instruction, setInstruction] = useState('');
  const [preview, setPreview] = useState<RefineResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!instruction.trim() || loading) return;
    setLoading(true);
    setError('');
    setUnavailable(false);
    try {
      const result = await refineEvent(plan.event.id, instruction.trim());
      const nonempty =
        result.proposedChanges.budgetShifts.length > 0 ||
        result.proposedChanges.newTasks.length > 0;
      if (!result.aiAvailable || !nonempty) {
        setUnavailable(true);
        setPreview(null);
      } else setPreview(result);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };
  return (
    <section aria-labelledby="refine-title">
      <h2 id="refine-title">Refine this plan</h2>
      <p>Ask for a change, then review it before anything is saved.</p>
      {unavailable && <AiUnavailable />}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor="refinement">Refinement request</label>
          <textarea
            id="refinement"
            rows={3}
            maxLength={500}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Move more budget to food and add a tasting task"
          />
        </div>
        <button disabled={loading || !instruction.trim()}>
          {loading ? 'Preparing preview…' : 'Preview refinement'}
        </button>
      </form>
      {preview && (
        <ProposalDialog
          preview={preview}
          controller={controller}
          close={() => setPreview(null)}
          conflict={(message) => setError(message)}
        />
      )}
    </section>
  );
}
