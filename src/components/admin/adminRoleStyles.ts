import type { AdminRole } from '@/lib/adminService';

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  support: 'Поддержка',
  content: 'Контент',
  analyst: 'Аналитик',
};

export const ADMIN_ROLE_COLOR: Record<AdminRole, string> = {
  owner: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  admin: 'text-primary bg-primary/10 border-primary/20',
  support: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  content: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  analyst: 'text-muted-foreground bg-muted/30 border-border/40',
};

/** Label for any role value coming from the database (unknown values are shown as-is). */
export function adminRoleLabel(role: string): string {
  return (ADMIN_ROLE_LABEL as Record<string, string | undefined>)[role] ?? role;
}

export function adminRoleColor(role: string): string {
  return (ADMIN_ROLE_COLOR as Record<string, string | undefined>)[role] ?? ADMIN_ROLE_COLOR.analyst;
}
