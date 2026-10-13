import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error('kaboom');
  return <p>всё хорошо</p>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><Boom explode={false} /></ErrorBoundary>);
    expect(screen.getByText('всё хорошо')).toBeInTheDocument();
  });

  it('shows a Russian fallback with a reload button instead of a white screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary variant="fullscreen"><Boom explode /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Обновить страницу/ })).toBeInTheDocument();
    // Fullscreen variant offers only reload (the router may be broken)
    expect(screen.queryByRole('button', { name: /Попробовать снова/ })).toBeNull();
  });

  it('recovers when the reset key (route) changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary resetKey="/a"><Boom explode /></ErrorBoundary>,
    );
    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();

    rerender(<ErrorBoundary resetKey="/b"><Boom explode={false} /></ErrorBoundary>);
    expect(screen.getByText('всё хорошо')).toBeInTheDocument();
  });

  it('"Попробовать снова" re-renders the page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let explode = true;
    function Flaky() {
      if (explode) throw new Error('once');
      return <p>восстановлено</p>;
    }
    render(<ErrorBoundary variant="page"><Flaky /></ErrorBoundary>);
    explode = false;
    fireEvent.click(screen.getByRole('button', { name: /Попробовать снова/ }));
    expect(screen.getByText('восстановлено')).toBeInTheDocument();
  });
});
