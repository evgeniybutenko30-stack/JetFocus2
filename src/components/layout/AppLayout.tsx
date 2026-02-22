import { DockNav } from '@/components/layout/DockNav';
import { AppHeader } from '@/components/layout/AppHeader';
import React from 'react';

interface Props { children: React.ReactNode; }

export function AppLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      {children}
      <DockNav />
    </div>
  );
}

