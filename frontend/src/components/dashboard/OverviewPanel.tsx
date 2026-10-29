import type { EventController } from '../../hooks/useEvent';
import { currency, daysUntil, date } from '../../utils/format';
import { Icon } from '../Icons';
import { ProgressRing } from '../ProgressRing';
import { Refinement } from '../refinement/Refinement';
export function OverviewPanel({ controller }: { controller: EventController }) {
  const plan = controller.plan!;
  const completed = plan.tasks.filter(
    (task) => task.status === 'completed',
  ).length;
  const spent = plan.budget.reduce((sum, item) => sum + item.spent, 0);
  const days = daysUntil(plan.event.date);
  const taskPercent = plan.tasks.length
    ? Math.round((completed / plan.tasks.length) * 100)
    : 0;
  const budgetPercent =
    plan.event.totalBudget > 0
      ? Math.round((spent / plan.event.totalBudget) * 100)
      : 0;
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
            <span className="stat-icon">
              <Icon name="calendar" />
            </span>
            <strong>{days}</strong>
            <span>days until {date(plan.event.date)}</span>
          </div>
          <div className="stat">
            <span className="stat-icon">
              <Icon name="check" />
            </span>
            <strong>
              {completed} of {plan.tasks.length}
            </strong>
            <span>tasks complete ({taskPercent}%)</span>
          </div>
          <div className="stat">
            <span className="stat-icon">
              <Icon name="wallet" />
            </span>
            <strong>{currency(spent, plan.event.currency)}</strong>
            <span>
              spent of {currency(plan.event.totalBudget, plan.event.currency)}
            </span>
          </div>
        </div>
        <div className="progress-card" aria-hidden="true">
          <ProgressRing percent={taskPercent} />
          <div className="progress-card__bars">
            <p>Budget used</p>
            <div className="bar">
              <span
                className="bar-fill"
                style={{ width: `${Math.min(100, budgetPercent)}%` }}
              />
            </div>
            <p className="progress-card__caption">
              {budgetPercent}% of budget · ring shows tasks complete
            </p>
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
          <p className="state">All tasks are complete. Nicely done.</p>
        )}
      </section>
      <section aria-labelledby="warnings-title">
        <h2 id="warnings-title">Plan checks</h2>
        {plan.warnings.length ? (
          <ul className="warning-list clean-list">
            {plan.warnings.map((warning) => (
              <li key={warning}>
                <Icon name="warning" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="all-clear">
            <Icon name="check" />
            No warnings right now.
          </p>
        )}
      </section>
      <Refinement controller={controller} />
    </div>
  );
}
