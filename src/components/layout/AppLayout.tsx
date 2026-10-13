import { useLocation } from 'react-router-dom';
import { DockNav } from '@/components/layout/DockNav';
import { AppHeader } from '@/components/layout/AppHeader';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import React from 'react';

interface Props { children: React.ReactNode; }

export function AppLayout({ children }: Props) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      {/* A crash inside a page keeps header/dock usable; navigating elsewhere clears the error. */}
      <ErrorBoundary variant="page" resetKey={pathname}>
        {children}
      </ErrorBoundary>
      <DockNav />
    </div>
  );
}
