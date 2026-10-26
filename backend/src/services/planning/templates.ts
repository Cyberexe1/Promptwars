import type { EventType } from '../../domain/models.js';

export interface BudgetTemplateItem {
  category: string;
  label: string;
  weight: number;
}

export interface TimelineTemplateItem {
  key: string;
  title: string;
  category: string;
  offsetDays: number;
  priority: number;
}

export interface VendorTemplateItem {
  key: string;
  category: string;
  budgetCategory: string;
  name: string;
  whyNeeded: string;
  leadTimeDays: number;
  questions: readonly string[];
  budgetShare?: number;
}

export const HIGH_GUEST_COUNT = 150;

export const MINIMUM_BUDGET_PER_GUEST: Readonly<Record<EventType, number>> = {
  wedding: 75,
  birthday: 25,
  community: 15,
};

export const SHORT_NOTICE_DAYS: Readonly<Record<EventType, number>> = {
  wedding: 60,
  birthday: 14,
  community: 30,
};

export const BASE_CONTINGENCY_PERCENT: Readonly<Record<EventType, number>> = {
  wedding: 7,
  birthday: 7,
  community: 5,
};

export const BUDGET_TEMPLATES: Readonly<
  Record<EventType, readonly BudgetTemplateItem[]>
> = {
  wedding: [
    { category: 'venue', label: 'Venue', weight: 35 },
    { category: 'catering', label: 'Catering', weight: 30 },
    { category: 'photography', label: 'Photography', weight: 10 },
    { category: 'attire', label: 'Attire', weight: 8 },
    { category: 'decor', label: 'Decor', weight: 8 },
    { category: 'music', label: 'Music', weight: 5 },
    { category: 'misc', label: 'Miscellaneous', weight: 4 },
  ],
  birthday: [
    { category: 'venue', label: 'Venue', weight: 25 },
    { category: 'food', label: 'Food', weight: 35 },
    { category: 'entertainment', label: 'Entertainment', weight: 15 },
    { category: 'decor', label: 'Decor', weight: 10 },
    { category: 'cake', label: 'Cake', weight: 8 },
    { category: 'misc', label: 'Miscellaneous', weight: 7 },
  ],
  community: [
    { category: 'venue', label: 'Venue', weight: 25 },
    { category: 'food', label: 'Food', weight: 30 },
    { category: 'av-equipment', label: 'AV and equipment', weight: 15 },
    { category: 'marketing', label: 'Marketing', weight: 10 },
    {
      category: 'permits-insurance',
      label: 'Permits and insurance',
      weight: 10,
    },
    { category: 'volunteers', label: 'Volunteer support', weight: 5 },
  ],
};

export const TIMELINE_TEMPLATES: Readonly<
  Record<EventType, readonly TimelineTemplateItem[]>
> = {
  wedding: [
    {
      key: 'book-venue',
      title: 'Book the venue',
      category: 'venue',
      offsetDays: 270,
      priority: 1,
    },
    {
      key: 'book-photographer',
      title: 'Book the photographer',
      category: 'photography',
      offsetDays: 240,
      priority: 2,
    },
    {
      key: 'book-catering',
      title: 'Book catering',
      category: 'catering',
      offsetDays: 180,
      priority: 1,
    },
    {
      key: 'send-invitations',
      title: 'Send invitations',
      category: 'guests',
      offsetDays: 60,
      priority: 2,
    },
    {
      key: 'confirm-decor',
      title: 'Confirm decor and rentals',
      category: 'decor',
      offsetDays: 45,
      priority: 3,
    },
    {
      key: 'final-headcount',
      title: 'Confirm final headcount',
      category: 'catering',
      offsetDays: 14,
      priority: 1,
    },
    {
      key: 'vendor-check-in',
      title: 'Check in with all vendors',
      category: 'coordination',
      offsetDays: 7,
      priority: 1,
    },
    {
      key: 'pack-essentials',
      title: 'Pack event-day essentials',
      category: 'coordination',
      offsetDays: 2,
      priority: 2,
    },
  ],
  birthday: [
    {
      key: 'choose-venue',
      title: 'Choose the venue',
      category: 'venue',
      offsetDays: 60,
      priority: 1,
    },
    {
      key: 'book-entertainment',
      title: 'Book entertainment',
      category: 'entertainment',
      offsetDays: 45,
      priority: 2,
    },
    {
      key: 'send-invitations',
      title: 'Send invitations',
      category: 'guests',
      offsetDays: 30,
      priority: 2,
    },
    {
      key: 'order-cake',
      title: 'Order the cake',
      category: 'cake',
      offsetDays: 14,
      priority: 2,
    },
    {
      key: 'confirm-headcount',
      title: 'Confirm guest count and food',
      category: 'food',
      offsetDays: 7,
      priority: 1,
    },
    {
      key: 'collect-supplies',
      title: 'Collect decorations and supplies',
      category: 'decor',
      offsetDays: 2,
      priority: 2,
    },
  ],
  community: [
    {
      key: 'secure-venue',
      title: 'Secure the venue',
      category: 'venue',
      offsetDays: 120,
      priority: 1,
    },
    {
      key: 'obtain-permits',
      title: 'Obtain permits and insurance',
      category: 'permits-insurance',
      offsetDays: 90,
      priority: 1,
    },
    {
      key: 'recruit-volunteers',
      title: 'Recruit volunteer leads',
      category: 'volunteers',
      offsetDays: 60,
      priority: 2,
    },
    {
      key: 'launch-marketing',
      title: 'Launch event promotion',
      category: 'marketing',
      offsetDays: 45,
      priority: 2,
    },
    {
      key: 'book-equipment',
      title: 'Book AV and equipment',
      category: 'av-equipment',
      offsetDays: 30,
      priority: 2,
    },
    {
      key: 'confirm-logistics',
      title: 'Confirm attendance and logistics',
      category: 'coordination',
      offsetDays: 14,
      priority: 1,
    },
    {
      key: 'volunteer-briefing',
      title: 'Brief volunteers',
      category: 'volunteers',
      offsetDays: 7,
      priority: 1,
    },
    {
      key: 'site-check',
      title: 'Complete the final site check',
      category: 'venue',
      offsetDays: 2,
      priority: 1,
    },
  ],
};

export const VENDOR_TEMPLATES: Readonly<
  Record<EventType, readonly VendorTemplateItem[]>
> = {
  wedding: [
    {
      key: 'venue',
      category: 'venue',
      budgetCategory: 'venue',
      name: 'Wedding venue',
      whyNeeded: 'Provides the ceremony and reception space.',
      leadTimeDays: 270,
      questions: [
        'What dates are available?',
        'What is included in the rental?',
      ],
    },
    {
      key: 'caterer',
      category: 'catering',
      budgetCategory: 'catering',
      name: 'Wedding caterer',
      whyNeeded: 'Provides the meal and guest service.',
      leadTimeDays: 180,
      budgetShare: 0.85,
      questions: [
        'Can you accommodate dietary needs?',
        'What are the service fees?',
      ],
    },
    {
      key: 'bar-service',
      category: 'catering',
      budgetCategory: 'catering',
      name: 'Bar service',
      whyNeeded: 'Provides licensed beverage service for adult guests.',
      leadTimeDays: 90,
      budgetShare: 0.15,
      questions: [
        'Are licenses and insurance included?',
        'Do you offer alcohol-free options?',
      ],
    },
    {
      key: 'photographer',
      category: 'photography',
      budgetCategory: 'photography',
      name: 'Wedding photographer',
      whyNeeded: 'Documents the event and key moments.',
      leadTimeDays: 240,
      questions: [
        'How many hours are included?',
        'When are edited images delivered?',
      ],
    },
    {
      key: 'music',
      category: 'music',
      budgetCategory: 'music',
      name: 'DJ or musicians',
      whyNeeded: 'Provides ceremony audio and reception entertainment.',
      leadTimeDays: 120,
      questions: [
        'Do you provide sound equipment?',
        'Can we provide a do-not-play list?',
      ],
    },
    {
      key: 'decor',
      category: 'decor',
      budgetCategory: 'decor',
      name: 'Decorator or florist',
      whyNeeded: 'Creates and installs the event design.',
      leadTimeDays: 120,
      questions: [
        'Can items be reused or rented?',
        'Are setup and teardown included?',
      ],
    },
  ],
  birthday: [
    {
      key: 'venue',
      category: 'venue',
      budgetCategory: 'venue',
      name: 'Party venue',
      whyNeeded: 'Provides an appropriately sized party space.',
      leadTimeDays: 60,
      questions: [
        'What is the guest capacity?',
        'What setup time is included?',
      ],
    },
    {
      key: 'food',
      category: 'food',
      budgetCategory: 'food',
      name: 'Party caterer',
      whyNeeded: 'Provides food suited to the guest count.',
      leadTimeDays: 30,
      budgetShare: 0.85,
      questions: [
        'What menu formats do you offer?',
        'Can you label allergens?',
      ],
    },
    {
      key: 'bar-service',
      category: 'food',
      budgetCategory: 'food',
      name: 'Bar service',
      whyNeeded: 'Provides beverage service for an adult celebration.',
      leadTimeDays: 30,
      budgetShare: 0.15,
      questions: [
        'Are bartenders licensed?',
        'What non-alcoholic drinks are included?',
      ],
    },
    {
      key: 'entertainment',
      category: 'entertainment',
      budgetCategory: 'entertainment',
      name: 'Party entertainment',
      whyNeeded: 'Keeps guests engaged during the celebration.',
      leadTimeDays: 45,
      questions: [
        'Is the program age appropriate?',
        'What space and power do you need?',
      ],
    },
    {
      key: 'cake',
      category: 'cake',
      budgetCategory: 'cake',
      name: 'Cake maker',
      whyNeeded: 'Provides a cake sized for the guest list.',
      leadTimeDays: 21,
      questions: ['Can you accommodate allergies?', 'Is delivery included?'],
    },
    {
      key: 'decor',
      category: 'decor',
      budgetCategory: 'decor',
      name: 'Party decorator',
      whyNeeded: 'Supplies and sets up the event theme.',
      leadTimeDays: 21,
      questions: [
        'Which items are reusable?',
        'Are setup and collection included?',
      ],
    },
  ],
  community: [
    {
      key: 'venue',
      category: 'venue',
      budgetCategory: 'venue',
      name: 'Community venue',
      whyNeeded: 'Provides an accessible space with adequate capacity.',
      leadTimeDays: 120,
      questions: [
        'Is the site accessible?',
        'What facilities and staffing are included?',
      ],
    },
    {
      key: 'food',
      category: 'food',
      budgetCategory: 'food',
      name: 'Community caterer',
      whyNeeded: 'Provides efficient service for a broad audience.',
      leadTimeDays: 60,
      questions: [
        'Can you serve the expected volume?',
        'How are dietary needs labeled?',
      ],
    },
    {
      key: 'av-equipment',
      category: 'av-equipment',
      budgetCategory: 'av-equipment',
      name: 'AV and equipment rental',
      whyNeeded: 'Provides sound, staging, and presentation equipment.',
      leadTimeDays: 45,
      questions: [
        'Is an on-site technician included?',
        'What backup equipment is available?',
      ],
    },
    {
      key: 'marketing',
      category: 'marketing',
      budgetCategory: 'marketing',
      name: 'Promotion and print supplier',
      whyNeeded: 'Supports outreach, signs, and attendee information.',
      leadTimeDays: 30,
      questions: [
        'What are print turnaround times?',
        'Can materials be recycled?',
      ],
    },
    {
      key: 'permits-insurance',
      category: 'permits-insurance',
      budgetCategory: 'permits-insurance',
      name: 'Permit and event insurance provider',
      whyNeeded:
        'Helps satisfy public event permissions and risk requirements.',
      leadTimeDays: 90,
      questions: ['Which permits apply?', 'What coverage limits are required?'],
    },
  ],
};

export const OUTDOOR_VENDOR_TEMPLATE: VendorTemplateItem = {
  key: 'tent-rentals',
  category: 'tent-rentals',
  budgetCategory: 'tent-rentals',
  name: 'Outdoor tent and equipment rental',
  whyNeeded: 'Provides weather cover and outdoor-site essentials.',
  leadTimeDays: 60,
  questions: [
    'What wind and rain ratings apply?',
    'Are setup and weighted anchors included?',
  ],
};

export const OUTDOOR_PERMIT_VENDOR_TEMPLATE: VendorTemplateItem = {
  key: 'outdoor-permits',
  category: 'permits-insurance',
  budgetCategory: 'permits-insurance',
  name: 'Outdoor permit coordinator',
  whyNeeded: 'Confirms site permissions, insurance, and local restrictions.',
  leadTimeDays: 60,
  questions: [
    'Which local approvals are needed?',
    'Are noise or occupancy permits required?',
  ],
};
