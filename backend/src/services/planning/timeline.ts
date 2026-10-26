import type { EventContext, PlanTask, TaskPhase } from '../../domain/models.js';
import { SHORT_NOTICE_DAYS, TIMELINE_TEMPLATES } from './templates.js';

export interface TimelineResult {
  tasks: PlanTask[];
  warnings: string[];
}

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const PHASE_ORDER: Readonly<Record<TaskPhase, number>> = {
  Now: 0,
  'This month': 1,
  'Final weeks': 2,
  'Event week': 3,
};

function parseDateOnly(value: string): Date {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new RangeError('Event date must use YYYY-MM-DD format.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError('Event date is not a valid calendar date.');
  }
  return parsed;
}

function utcStartOfDay(value: Date): Date {
  if (Number.isNaN(value.getTime()))
    throw new RangeError('Today must be a valid date.');
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function taskPhase(
  overdue: boolean,
  daysUntilDue: number,
  offsetDays: number,
): TaskPhase {
  if (overdue) return 'Now';
  if (offsetDays <= 7) return 'Event week';
  if (offsetDays <= 21) return 'Final weeks';
  if (daysUntilDue <= 30) return 'This month';
  return 'Now';
}

export function generateTimeline(
  context: EventContext,
  today: Date,
): TimelineResult {
  const eventDate = parseDateOnly(context.date);
  const currentDate = utcStartOfDay(today);
  if (eventDate.getTime() < currentDate.getTime()) {
    throw new RangeError('Event date cannot be in the past.');
  }

  const daysUntilEvent = Math.floor(
    (eventDate.getTime() - currentDate.getTime()) / DAY_MS,
  );
  const tasks = TIMELINE_TEMPLATES[context.type].map((template) => {
    const dueDate = new Date(
      eventDate.getTime() - template.offsetDays * DAY_MS,
    );
    const daysUntilDue = Math.floor(
      (dueDate.getTime() - currentDate.getTime()) / DAY_MS,
    );
    const overdue = dueDate.getTime() < currentDate.getTime();
    const urgent = template.offsetDays > daysUntilEvent;

    return {
      id: `task-${context.type}-${template.key}`,
      title: template.title,
      category: template.category,
      dueDate: formatDate(dueDate),
      status: 'pending' as const,
      priority: template.priority,
      phase: taskPhase(overdue, daysUntilDue, template.offsetDays),
      urgent,
      overdue,
    };
  });

  tasks.sort(
    (left, right) =>
      PHASE_ORDER[left.phase] - PHASE_ORDER[right.phase] ||
      Number(right.urgent) - Number(left.urgent) ||
      (left.urgent && right.urgent ? left.priority - right.priority : 0) ||
      left.dueDate.localeCompare(right.dueDate) ||
      left.priority - right.priority ||
      left.id.localeCompare(right.id),
  );

  const warnings: string[] = [];
  if (daysUntilEvent < SHORT_NOTICE_DAYS[context.type]) {
    warnings.push(
      `This ${context.type} is only ${daysUntilEvent} day${daysUntilEvent === 1 ? '' : 's'} away; prioritize urgent tasks and confirm vendor availability immediately.`,
    );
  }
  const overdueCount = tasks.filter((task) => task.overdue).length;
  if (overdueCount > 0) {
    warnings.push(
      `${overdueCount} planning task${overdueCount === 1 ? ' is' : 's are'} past the recommended due date and marked urgent.`,
    );
  }

  return { tasks, warnings };
}
