import type { EventController } from '../../hooks/useEvent';
import { currency, date } from '../../utils/format';
import { Refinement } from '../refinement/Refinement';
export function OverviewPanel({ controller }: { controller: EventController }) {
  const plan = controller.plan!;
  const completed = plan.tasks.filter(
    (task) => task.status === 'completed',
  ).length;
  const spent = plan.budget.reduce((sum, item) => sum + item.spent, 0);
  const days = Math.max(
    0,
    Math.ceil(
      (new Date(`${plan.event.date}T00:00:00`).getTime() - Date.now()) /
        86_400_000,
    ),
  );
  const pending = plan.tasks
    .filter((task) => task.status === 'pending')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);
  return (
    <div className="panel-stack">
      <section aria-labelledby="snapshot-title">
        <h2 id="snapshot-title">At a glance</h2>
        <div className="stat-grid">
          <div className="stat">
            <strong>{days}</strong>
            <span>days until {date(plan.event.date)}</span>
          </div>
          <div className="stat">
            <strong>
              {completed} of {plan.tasks.length}
            </strong>
            <span>
              tasks complete (
              {plan.tasks.length
                ? Math.round((completed / plan.tasks.length) * 100)
                : 0}
              %)
            </span>
          </div>
          <div className="stat">
            <strong>{currency(spent, plan.event.currency)}</strong>
            <span>
              spent of {currency(plan.event.totalBudget, plan.event.currency)}
            </span>
          </div>
        </div>
      </section>
      <section aria-labelledby="next-title">
        <h2 id="next-title">Next up</h2>
        {pending.length ? (
          <ol className="task-preview">
            {pending.map((task) => (
              <li key={task.id}>
                <strong>{task.title}</strong>
                <span>
                  Due {date(task.dueDate)}
                  {task.urgent ? ' · Urgent' : ''}
                  {task.overdue ? ' · Overdue' : ''}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p>All tasks are complete. Nicely done.</p>
        )}
      </section>
      <section aria-labelledby="warnings-title">
        <h2 id="warnings-title">Plan checks</h2>
        {plan.warnings.length ? (
          <ul className="warning-list">
            {plan.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p>No warnings right now.</p>
        )}
      </section>
      <Refinement controller={controller} />
    </div>
  );
}
