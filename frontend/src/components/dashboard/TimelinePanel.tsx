import { useState } from 'react';
import type { TaskPhase } from '../../api/types';
import type { EventController } from '../../hooks/useEvent';
import { date, errorMessage } from '../../utils/format';
const phases: TaskPhase[] = ['Now', 'This month', 'Final weeks', 'Event week'];
export function TimelinePanel({ controller }: { controller: EventController }) {
  const plan = controller.plan!;
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const toggle = async (id: string, checked: boolean) => {
    setSaving(id);
    setError('');
    try {
      await controller.updateTask(id, checked ? 'completed' : 'pending');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving('');
    }
  };
  return (
    <section aria-labelledby="timeline-title">
      <h2 id="timeline-title">Timeline</h2>
      {error && (
        <p className="field-error" role="alert">
          {error}{' '}
          <button
            type="button"
            className="button-link"
            onClick={controller.retry}
          >
            Reload plan
          </button>
        </p>
      )}
      {phases.map((phase) => {
        const tasks = plan.tasks.filter((task) => task.phase === phase);
        return (
          <section
            className="phase"
            key={phase}
            aria-labelledby={`phase-${phase.replaceAll(' ', '-')}`}
          >
            <h3 id={`phase-${phase.replaceAll(' ', '-')}`}>{phase}</h3>
            {tasks.length ? (
              <ul className="clean-list task-list">
                {tasks.map((task) => (
                  <li key={task.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={task.status === 'completed'}
                        disabled={saving === task.id}
                        onChange={(event) =>
                          void toggle(task.id, event.target.checked)
                        }
                      />
                      <span>
                        <strong>{task.title}</strong>
                        <small>
                          Due {date(task.dueDate)} · {task.category}
                        </small>
                      </span>
                    </label>
                    <span className="badges">
                      {task.urgent && <span>⚑ Urgent</span>}
                      {task.overdue && <span>! Overdue</span>}
                      {saving === task.id && <span role="status">Saving…</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No tasks in this phase.</p>
            )}
          </section>
        );
      })}
    </section>
  );
}
