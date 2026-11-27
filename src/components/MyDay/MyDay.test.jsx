import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, it, expect, vi } from 'vitest';
import MyDay from './MyDay';
const mocks = vi.hoisted(() => ({
  query: {},
  navigate: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock('../../hooks/useMyDay', () => ({ useMyDay: () => mocks.query }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, args) => (args?.name ? `${key} ${args.name}` : key),
    i18n: { language: 'pt-BR' },
  }),
}));
vi.mock('./DoseAction', () => ({
  default: ({ item }) => <button>{`dose ${item.title}`}</button>,
}));
const data = {
  day: '2026-11-27',
  generated_at: '2026-11-27T10:00:00Z',
  sections: {
    doses: {
      rows: [
        {
          id: 'dose',
          medication_id: 'm',
          title: 'Medicine',
          scheduled_at: '2026-11-27T06:00:00Z',
          dose: '1 capsule',
          status: 'taken',
        },
      ],
    },
    appointments: {
      rows: [
        {
          id: 'appointment',
          title: 'Cardiologist',
          scheduled_at: '2026-11-27T16:00:00Z',
          professional: 'Synthetic doctor',
          address: 'Rua A & B, 20',
        },
      ],
    },
    payments: {
      rows: [
        {
          id: 'payment',
          title: 'Internet',
          day: '2026-11-27',
          amount: 129.9,
          currency: 'BRL',
          account_id: 'account',
        },
      ],
    },
    invoices: {
      rows: [
        {
          id: 'invoice',
          title: 'Card',
          day: '2026-11-26',
          amount: 480,
          currency: 'BRL',
          account_id: 'card',
        },
      ],
    },
    exams: {
      rows: [
        {
          id: 'exam',
          title: 'Blood exam',
          scheduled_at: '2026-11-28T10:00:00Z',
          laboratory: 'Synthetic lab',
        },
      ],
    },
    itinerary: {
      rows: [
        {
          id: 'itinerary',
          title: 'Hotel check-in',
          day: '2026-11-27',
          time: '19:00',
          location: 'Hotel A',
          trip_id: 'trip',
          trip_title: 'Recife',
        },
      ],
    },
    trips: { rows: [{ id: 'trip', title: 'Recife', day: '2026-11-30' }] },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = {
    data,
    timezone: 'UTC',
    now: new Date('2026-11-27T12:00:00Z'),
    isLoading: false,
    isError: false,
    isFetching: false,
    hasModules: true,
    refetch: mocks.refetch,
  };
});
const show = (props) =>
  render(<MyDay user={{ id: 'owner' }} navigate={mocks.navigate} {...props} />);
it('shows today, overdue and upcoming items, formats currency and opens the right modules', () => {
  show();
  expect(screen.getByText('Medicine')).toBeVisible();
  expect(screen.getByText('Cardiologist')).toBeVisible();
  expect(screen.getByText('Blood exam')).toBeVisible();
  expect(screen.getByText('myDay.taken')).toBeVisible();
  expect(screen.getByText(/129,90/)).toBeVisible();
  fireEvent.click(screen.getByText('myDay.open_appointments'));
  expect(mocks.navigate).toHaveBeenCalledWith(
    'health/appointments/appointment'
  );
  fireEvent.click(screen.getByText('myDay.open_invoices'));
  expect(mocks.navigate).toHaveBeenCalledWith('minhasfinancas/cards/card');
  expect(
    screen.getByRole('link', { name: 'myDay.open_address' })
  ).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=Rua%20A%20%26%20B%2C%2020'
  );
  fireEvent.click(screen.getByText('myDay.refresh'));
  expect(mocks.refetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('myDay.module_trips'));
  expect(mocks.navigate).toHaveBeenCalledWith('trips/itinerary');
});
it('hides financial values and only renders enabled module links', () => {
  show({ showValues: false, visibleModules: ['health'] });
  expect(screen.queryByText(/129,90/)).not.toBeInTheDocument();
  expect(screen.getAllByText('•••')).toHaveLength(2);
  expect(screen.queryByText('myDay.module_trips')).not.toBeInTheDocument();
});
it('does not render personal data without a user', () => {
  show({ user: null });
  expect(screen.queryByTestId('my-day')).not.toBeInTheDocument();
});
it('handles loading, failure, retry and no enabled sources', () => {
  mocks.query.isLoading = true;
  const view = show();
  expect(screen.getByRole('status')).toHaveTextContent('myDay.loading');
  mocks.query = { ...mocks.query, isLoading: false, isError: true };
  view.rerender(<MyDay user={{ id: 'owner' }} navigate={mocks.navigate} />);
  expect(screen.getByRole('alert')).toHaveTextContent('myDay.load_error');
  fireEvent.click(screen.getByText('myDay.retry'));
  expect(mocks.refetch).toHaveBeenCalled();
  mocks.query = { ...mocks.query, hasModules: false };
  view.rerender(<MyDay user={{ id: 'owner' }} navigate={mocks.navigate} />);
  expect(screen.getByText('myDay.no_modules')).toBeVisible();
  expect(screen.queryByText('myDay.refresh')).not.toBeInTheDocument();
});
it('shows empty sections and bounded preview notices without claiming missing rows are zero', () => {
  mocks.query.data = { sections: { doses: { rows: [], has_more: true } } };
  show();
  expect(screen.getByText('myDay.more')).toBeVisible();
  for (const key of ['empty_today', 'empty_attention', 'empty_upcoming'])
    expect(screen.getByText(`myDay.${key}`)).toBeVisible();
});
it('shows pending and future dose states with their source times', () => {
  mocks.query.data = {
    day: '2026-11-27',
    sections: {
      doses: {
        rows: [
          {
            id: 'a',
            title: 'Overdue',
            scheduled_at: '2026-11-27T06:00:00Z',
            status: 'missed',
          },
          {
            id: 'b',
            title: 'Future',
            scheduled_at: '2026-11-27T22:00:00Z',
            status: 'scheduled',
          },
        ],
      },
    },
  };
  show();
  expect(screen.getByText('myDay.overdue_dose')).toBeVisible();
  expect(screen.getByText('myDay.scheduled')).toBeVisible();
});

it('shows a skipped dose without labeling it as overdue', () => {
  mocks.query.data={day:'2026-11-27',sections:{doses:{rows:[{id:'skipped',title:'Skipped medicine',status:'skipped',scheduled_at:'2026-11-27T06:00:00Z'}]}}};
  show();expect(screen.getByText('myDay.skipped')).toBeVisible();expect(screen.queryByText('myDay.overdue_dose')).not.toBeInTheDocument();
});
