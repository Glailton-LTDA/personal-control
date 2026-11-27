import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, it, expect, vi } from 'vitest';
import DoseAction from './DoseAction';
const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  undo: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('../../hooks/useTreatments', () => ({
  useRecordDose: () => ({ mutateAsync: mocks.record }),
  useUndoDose: () => ({ mutateAsync: mocks.undo }),
}));
vi.mock('../../lib/myDay', () => ({ requireMyDaySession: mocks.auth }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));
const item = {
  key: 'dose:m:today',
  id: 'dose',
  medication_id: 'm',
  title: 'Medicine',
  dose: '1 capsule',
  scheduled_at: '2026-11-27T06:00:00Z',
  status: 'missed',
  record_version: 0,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue();
  mocks.record.mockResolvedValue();
  mocks.undo.mockResolvedValue();
});
const show = (overrides = {}, userId = 'owner') =>
  render(
    <DoseAction
      item={{ ...item, ...overrides }}
      userId={userId}
      now={new Date('2026-11-27T12:00:00Z')}
    />
  );
it('records with one click, expected version and authenticated identity', async () => {
  show();
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(1));
  expect(mocks.auth).toHaveBeenCalledWith('owner');
  expect(mocks.record).toHaveBeenCalledWith(
    expect.objectContaining({
      medicationId: 'm',
      status: 'taken',
      options: expect.objectContaining({
        amount: '1 capsule',
        expectedVersion: 0,
      }),
    })
  );
});
it.each(['taken', 'skipped'])('undoes a %s dose with its recorded version', async (status) => {
  show({ status, record_version: 4 });
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() =>
    expect(mocks.undo).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 4 })
    )
  );
  expect(mocks.record).not.toHaveBeenCalled();
});
it.each([{ scheduled_at: '2026-11-27T18:00:00Z' }, { status: 'canceled' }])(
  'blocks future or canceled occurrences (%j)',
  (overrides) => {
    show(overrides);
    expect(screen.getByRole('button')).toBeDisabled();
    fireEvent.click(screen.getByRole('button'));
    expect(mocks.auth).not.toHaveBeenCalled();
  }
);
it('never sends a dose command without a valid session', async () => {
  mocks.auth.mockRejectedValue(new Error('AUTH_REQUIRED'));
  show();
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('myDay.action_error')
  );
  expect(mocks.record).not.toHaveBeenCalled();
});
it('reuses the same command after failure and starts a new command after success', async () => {
  mocks.record.mockRejectedValueOnce(new Error('network'));
  show();
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
  const id = mocks.record.mock.calls[0][0].requestId;
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(2));
  expect(mocks.record.mock.calls[1][0].requestId).toBe(id);
  await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(3));
  expect(mocks.record.mock.calls[2][0].requestId).not.toBe(id);
});
it('prevents duplicate clicks while the authenticated command is in flight', async () => {
  let release;
  mocks.auth.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  show();
  fireEvent.click(screen.getByRole('button'));
  fireEvent.click(screen.getByRole('button'));
  expect(mocks.auth).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button')).toBeDisabled();
  release();
  await waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(1));
});
it('does nothing without a user', () => {
  show({}, null);
  fireEvent.click(screen.getByRole('button'));
  expect(mocks.auth).not.toHaveBeenCalled();
});
