import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { ConfirmModal } from './ConfirmModal';
import { AdminServiceError } from '@/lib/adminService';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('ConfirmModal', () => {
  it('requires a reason and passes it trimmed', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmModal title="T" requireReason onConfirm={onConfirm} onCancel={vi.fn()} />);
    const confirm = screen.getByText('Подтвердить');
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Укажите причину действия…'), { target: { value: '  bonus  ' } });
    await act(async () => { fireEvent.click(confirm); });
    expect(onConfirm).toHaveBeenCalledWith('bonus');
  });

  it('ignores repeated clicks while the action runs (no double grant)', async () => {
    const d = deferred();
    const onConfirm = vi.fn(() => d.promise);
    render(<ConfirmModal title="T" onConfirm={onConfirm} onCancel={vi.fn()} />);
    const button = screen.getByText('Подтвердить');
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(screen.getByText('Сохранение…'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Сохранение…')).toBeDisabled();
    expect(screen.getByText('Отмена')).toBeDisabled();
    await act(async () => { d.resolve(); });
  });

  it('keeps the dialog open and shows the error when the action fails', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn(() => Promise.reject(new AdminServiceError('Пользователь не найден')));
    render(<ConfirmModal title="T" onConfirm={onConfirm} onCancel={onCancel} />);
    await act(async () => { fireEvent.click(screen.getByText('Подтвердить')); });
    expect(screen.getByRole('alert')).toHaveTextContent('Пользователь не найден');
    // Buttons are usable again so the admin can retry or cancel.
    expect(screen.getByText('Подтвердить')).not.toBeDisabled();
    fireEvent.click(screen.getByText('Отмена'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('blocks confirming while extra fields are invalid and shows the hint', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal title="T" confirmDisabled validationMessage="Введите корректный User ID (UUID)" onConfirm={onConfirm} onCancel={vi.fn()}>
        <input aria-label="extra" />
      </ConfirmModal>,
    );
    expect(screen.getByLabelText('extra')).toBeInTheDocument();
    expect(screen.getByText('Введите корректный User ID (UUID)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Подтвердить'));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
