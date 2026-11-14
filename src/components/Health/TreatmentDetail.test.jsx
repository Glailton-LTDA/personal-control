import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TreatmentDetail from './TreatmentDetail';
import * as hooks from '../../hooks/useTreatments';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key, args) => key === 'health.calendar_day_summary' ? `${key}:${args.date}` : key, i18n: { language: 'en' } }) }));
vi.mock('../../hooks/useTreatments', () => ({ useTreatmentDetail: vi.fn(), useTreatmentCalendar: vi.fn(), useTreatmentHistory: vi.fn(), useTreatmentState: vi.fn(), useRecordDose: vi.fn(), useUndoDose: vi.fn() }));
vi.mock('./HealthDocuments', () => ({ default: ({ parent }) => <div data-testid="private-documents">{JSON.stringify(parent)}</div> }));
const at = '2026-11-12T17:00:00Z';
const slots = [{ scheduled_at: at, status: 'missed', record_version: 0 }, { scheduled_at: '2026-11-12T09:00:00Z', status: 'taken', taken_at: '2026-11-12T09:04:00Z', amount: '1 tablet', record_version: 1 }, { scheduled_at: '2026-11-13T01:00:00Z', status: 'scheduled', record_version: 0 }];
const data = () => ({ medication: { id: 'm1', name: 'Synthetic', status: 'active', dose: '1 tablet', row_version: 4, timezone: 'America/Fortaleza', notes: 'Private note' }, schedule: { mode: 'interval', interval_minutes: 480, duration_kind: 'finite', duration_days: 7, timezone: 'America/Fortaleza', anchor_at: '2026-11-06T09:00:00Z', last_slot: '2026-11-13T01:00:00Z' }, stats: { total_predicted: 21, taken_total: 17, skipped_total: 1, overdue: 2, due_recent: 20, taken_due: 17 }, today: slots, next: [{ scheduled_at: '2026-11-13T01:00:00Z' }] });
const query = value => ({ data: value, isSuccess: true, isLoading: false, isError: false, refetch: vi.fn() });
let state, record, undo;
const setup = () => { const navigate = vi.fn(), onForm = vi.fn(); render(<TreatmentDetail userId="owner" medicationId="m1" navigate={navigate} onForm={onForm} />); return { navigate, onForm }; };
beforeEach(() => {
 vi.clearAllMocks(); vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 12, 17, 20)); vi.stubGlobal('confirm', vi.fn(() => true));
 state = vi.fn().mockResolvedValue({ status: 'paused' }); record = vi.fn().mockResolvedValue({ row_version: 1 }); undo = vi.fn().mockResolvedValue({ undone: true });
 hooks.useTreatmentDetail.mockReturnValue(query(data()));
 hooks.useTreatmentCalendar.mockReturnValue(query({ days: [{ date: '2026-11-12', slots }, { date: '2026-11-11', slots: [{ ...slots[0], status: 'skipped' }] }] }));
 hooks.useTreatmentHistory.mockReturnValue(query({ rows: slots, has_more: true, next_cursor_at: at }));
 hooks.useTreatmentState.mockReturnValue({ mutateAsync: state }); hooks.useRecordDose.mockReturnValue({ mutateAsync: record }); hooks.useUndoDose.mockReturnValue({ mutateAsync: undo });
});
describe('treatment detail actions and views', () => {
 it('opens a past unrecorded occurrence with immutable scheduled time and records local actual time', async () => {
  setup(); expect(screen.getByText('Synthetic')).toBeVisible();
  fireEvent.click(screen.getAllByRole('button', { name: 'health.treatment_record_dose' })[0]);
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).queryByLabelText('health.scheduled_at')).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('health.taken_at'), { target: { value: '2026-11-12T14:20' } });
  fireEvent.change(within(dialog).getByLabelText('health.amount'), { target: { value: '2 tablets' } });
  fireEvent.change(within(dialog).getByLabelText('health.dose_reason'), { target: { value: 'Synthetic reason' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'health.save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ scheduledAt: at, options: { takenAt: '2026-11-12T17:20:00.000Z', amount: '2 tablets', reason: 'Synthetic reason', expectedVersion: 0 } }));
 });
 it('keeps a failed dose modal open and can explicitly register skipped', async () => {
  record.mockRejectedValueOnce(new Error('version_conflict')); setup();
  fireEvent.click(screen.getAllByRole('button', { name: 'health.treatment_record_dose' })[1]);
  fireEvent.change(screen.getByLabelText('health.status'), { target: { value: 'skipped' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'health.save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('health.version_conflict');
  expect(record.mock.calls[0][0].options.takenAt).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'health.cancel' })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 });
 it('undoes taken or skipped with the server version and reports an error', async () => {
  undo.mockRejectedValueOnce(new Error('version_conflict')); setup();
  fireEvent.click(screen.getByRole('button', { name: 'health.treatment_undo_dose' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('health.version_conflict');
  expect(undo).toHaveBeenCalledWith({ medicationId: 'm1', scheduledAt: slots[1].scheduled_at, expectedVersion: 1 });
 });
 it('passes the full immutable schedule and owner links to edit', () => {
  const { navigate, onForm } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'health.edit_treatment' })); expect(onForm.mock.calls[0][0].record.schedule.interval_minutes).toBe(480);
  fireEvent.click(screen.getByRole('button', { name: 'health.back' })); expect(navigate).toHaveBeenCalledWith('health/medications');
 });
 it.each(['pause', 'finish'])('confirms %s, preserves history notice and uses optimistic version', async action => {
  setup(); fireEvent.click(screen.getByRole('button', { name: `health.treatment_${action}` }));
  expect(screen.getByText('health.finish_impact')).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: 'health.confirm' }));
  await waitFor(() => expect(state).toHaveBeenCalledWith(expect.objectContaining({ action, options: { expectedVersion: 4 } })));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 });
 it('resumes a paused treatment, keeps errors visible and permits cancel', async () => {
  const value=data(); value.medication.status='paused'; hooks.useTreatmentDetail.mockReturnValue(query(value)); state.mockRejectedValue(new Error('resume_expired'));
  setup(); fireEvent.click(screen.getByRole('button', { name: 'health.treatment_resume' })); expect(screen.getByText('health.resume_impact')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'health.confirm' })); expect(await screen.findByRole('alert')).toHaveTextContent('health.resume_expired');
  fireEvent.click(screen.getByRole('button', { name: 'health.cancel' })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 });
 it('renders a monthly calendar, selects a day and navigates months', () => {
  setup(); fireEvent.click(screen.getByRole('button', { name: 'health.treatment_calendar' }));
  expect(screen.getByText('November 2026')).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: 'health.calendar_day_summary:Nov 12, 2026' }));
  expect(screen.getAllByText('health.treatment_overdue').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'health.next_month' })); expect(screen.getByText('December 2026')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'health.previous_month' })); expect(screen.getByText('November 2026')).toBeVisible();
 });
 it('paginates the history on the server and resets cursor on filter changes', () => {
  setup(); fireEvent.click(screen.getByRole('button', { name: 'health.treatment_history' }));
  fireEvent.click(screen.getByRole('button', { name: 'health.next' })); expect(hooks.useTreatmentHistory).toHaveBeenLastCalledWith('owner','m1', { filter:'all', cursorAt:at },true);
  fireEvent.click(screen.getByRole('button', { name:'health.previous' }));
  fireEvent.change(screen.getByLabelText('health.status'), { target:{ value:'skipped' } }); expect(hooks.useTreatmentHistory).toHaveBeenLastCalledWith('owner','m1',{ filter:'skipped',cursorAt:undefined },true);
 });
 it('restores private contextual attachments and the documents shortcut', () => {
  setup(); fireEvent.click(screen.getAllByRole('button', { name:'health.documents' })[1]); expect(screen.getByTestId('private-documents')).toHaveTextContent('"field":"medication_id"');
 });
 it('has no finite progress or active actions on an ended continuous treatment', () => {
  const value=data(); value.medication.status='finished'; value.schedule.duration_kind='continuous'; value.schedule.mode='daily_times'; value.schedule.local_times=['08:00']; value.schedule.anchor_at=null; value.schedule.last_slot=null; value.today=[];value.next=[];value.stats={}; hooks.useTreatmentDetail.mockReturnValue(query(value));
  setup(); expect(screen.queryByRole('progressbar')).not.toBeInTheDocument(); expect(screen.queryByRole('button',{name:'health.treatment_finish'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'health.treatment_record_dose'})).toBeDisabled(); expect(screen.getByText('health.no_elapsed_doses')).toBeVisible();
 });
 it.each(['loading','error','empty'])('handles %s detail without exposing stale data', mode => {
  hooks.useTreatmentDetail.mockReturnValue({data:mode==='empty'?null:data(),isLoading:mode==='loading',isError:mode==='error',refetch:vi.fn()});setup();
  expect(screen.queryByText('Synthetic')).not.toBeInTheDocument();
 });
 it('shows calendar and history errors/empty states without removing navigation', () => {
  hooks.useTreatmentCalendar.mockReturnValue({isError:true,refetch:vi.fn()}); hooks.useTreatmentHistory.mockReturnValue({isError:true,refetch:vi.fn()}); setup();
  fireEvent.click(screen.getByRole('button',{name:'health.treatment_calendar'})); expect(screen.getByRole('alert')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'health.treatment_history'})); expect(screen.getByRole('alert')).toBeVisible();
 });
 it('selects a week day and cancels recording by Escape', () => {
  setup();fireEvent.click(screen.getByRole('button',{name:'Nov 12, 2026'})); expect(screen.getByText('November 2026')).toBeVisible();
  fireEvent.click(screen.getAllByRole('button',{name:'health.treatment_record_dose',exact:true})[0]);fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 });
});

it('defaults a historical dose to its planned snapshot rather than the current prescription', () => {
  const value = data(); value.medication.dose = '2 tablets';
  value.today = [{ ...slots[0], planned_amount: '1 tablet' }];
  hooks.useTreatmentDetail.mockReturnValue(query(value));
  setup(); fireEvent.click(screen.getAllByRole('button', { name: 'health.treatment_record_dose' })[0]);
  expect(within(screen.getByRole('dialog')).getByLabelText('health.amount')).toHaveValue('1 tablet');
});

it('identifies retrospective doses and translates the reason when correcting one', () => {
  const value = data();
  value.today = [{ ...slots[1], reason: 'retroactive_at_creation' }];
  hooks.useTreatmentDetail.mockReturnValue(query(value));
  setup();
  expect(screen.getByText('health.retroactive_dose_reason')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'health.edit' }));
  expect(screen.getByLabelText('health.dose_reason')).toHaveValue('health.retroactive_dose_reason');
});
