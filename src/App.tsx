import { Suspense, useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAuthStore } from "@/stores/auth-store";
import { useThemeStore } from "@/stores/theme-store";
import { supabase } from "@/lib/supabase";
import { lazyWithReload } from "@/lib/lazyWithReload";
// Today is the landing page, so it stays in the main bundle; every other page loads on demand.
import TodayPage from "./pages/Today";

const AuthPage = lazyWithReload(() => import("./pages/Auth"));
const TopFocusPage = lazyWithReload(() => import("./pages/TopFocus"));
const HabitsPage = lazyWithReload(() => import("./pages/Habits"));
const HabitEditPage = lazyWithReload(() => import("./pages/HabitEdit"));
const TasksPage = lazyWithReload(() => import("./pages/Tasks"));
const TaskNewPage = lazyWithReload(() => import("./pages/TaskNew"));
const TaskEditPage = lazyWithReload(() => import("./pages/TaskEdit"));
const FinancePage = lazyWithReload(() => import("./pages/Finance"));
const FinanceNewPage = lazyWithReload(() => import("./pages/FinanceNew"));
const FinanceEditPage = lazyWithReload(() => import("./pages/FinanceEdit"));
const BalancePage = lazyWithReload(() => import("./pages/Balance"));
const SectionsPage = lazyWithReload(() => import("./pages/Sections"));
const GoalsPage = lazyWithReload(() => import("./pages/Goals"));
const GoalNewPage = lazyWithReload(() => import("./pages/GoalNew"));
const GoalEditPage = lazyWithReload(() => import("./pages/GoalEdit"));
const GoalDetailPage = lazyWithReload(() => import("./pages/GoalDetail"));
const ProfilePage = lazyWithReload(() => import("./pages/Profile"));
const AchievementsPage = lazyWithReload(() => import("./pages/Achievements"));
const SocialPage = lazyWithReload(() => import("./pages/Social"));
const ArchivePage = lazyWithReload(() => import("./pages/Archive"));
const SettingsPage = lazyWithReload(() => import("./pages/Settings"));
const NotificationsPage = lazyWithReload(() => import("./pages/Notifications"));
const ProPage = lazyWithReload(() => import("./pages/Pro"));
const CreatePage = lazyWithReload(() => import("./pages/CreatePage"));
const NewsPage = lazyWithReload(() => import("./pages/News"));
const CatalogPage = lazyWithReload(() => import("./pages/Catalog"));
const PartnerPage = lazyWithReload(() => import("./pages/Partner"));
const StatisticsPage = lazyWithReload(() => import("./pages/Statistics"));
const ProfileSettingsPage = lazyWithReload(() => import("./pages/ProfileSettings"));
const RatingPage = lazyWithReload(() => import("./pages/Rating"));
const AdminPage = lazyWithReload(() => import("./pages/admin/AdminPage"));
const AdminUsersPage = lazyWithReload(() => import("./pages/admin/AdminUsersPage"));
const AdminStarsPage = lazyWithReload(() => import("./pages/admin/AdminStarsPage"));
const AdminPromosPage = lazyWithReload(() => import("./pages/admin/AdminPromosPage"));
const AdminAuditPage = lazyWithReload(() => import("./pages/admin/AdminAuditPage"));
const AdminRolesPage = lazyWithReload(() => import("./pages/admin/AdminRolesPage"));
const AdminSubscriptionsPage = lazyWithReload(() => import("./pages/admin/AdminSubscriptionsPage"));
const AdminAnalyticsPage = lazyWithReload(() => import("./pages/admin/AdminAnalyticsPage"));
const AdminSettingsPage = lazyWithReload(() => import("./pages/admin/AdminSettingsPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // One retry is enough for flaky mobile networks; 3 retries with backoff made
      // error states take ~7s to appear.
      retry: 1,
      // Avoid surprise refetch/flicker whenever the tab regains focus.
      refetchOnWindowFocus: false,
    },
  },
});

function PageFallback({ fullscreen = false }: { fullscreen?: boolean }) {
  return (
    <div className={`${fullscreen ? 'min-h-screen' : 'min-h-[60vh]'} bg-background flex items-center justify-center`}>
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** If Supabase never reports the initial session (e.g. stuck storage lock), stop blocking the UI. */
const AUTH_INIT_TIMEOUT_MS = 8000;

function AppRoutes() {
  const isLoading = useAuthStore(s => s.isLoading);
  const setSession = useAuthStore(s => s.setSession);
  const finishLoading = useAuthStore(s => s.finishLoading);

  useEffect(() => {
    // onAuthStateChange is the source of truth: it emits INITIAL_SESSION on subscribe,
    // then SIGNED_IN / TOKEN_REFRESHED / SIGNED_OUT.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      const prevUserId = useAuthStore.getState().user?.id ?? null;
      setSession(sess);
      const nextUserId = sess?.user?.id ?? null;
      if (prevUserId && prevUserId !== nextUserId) {
        // Signed out or switched account: drop cached data of the previous user.
        queryClient.clear();
      }
    });

    // Fallback only — used if INITIAL_SESSION hasn't arrived yet. Never leave the
    // app stuck on the spinner if this rejects.
    supabase.auth.getSession()
      .then(({ data }) => {
        if (useAuthStore.getState().isLoading) setSession(data.session);
      })
      .catch((err: unknown) => {
        console.error('[auth] getSession failed:', err);
        finishLoading();
      });

    const timer = window.setTimeout(finishLoading, AUTH_INIT_TIMEOUT_MS);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [setSession, finishLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Suspense fallback={<PageFallback fullscreen />}>
      <Routes>
        {/* Admin routes — outside AppLayout */}
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/stars" element={<AdminStarsPage />} />
        <Route path="/admin/promos" element={<AdminPromosPage />} />
        <Route path="/admin/subscriptions" element={<AdminSubscriptionsPage />} />
        <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
        <Route path="/admin/roles" element={<AdminRolesPage />} />
        <Route path="/admin/audit" element={<AdminAuditPage />} />
        <Route path="/admin/settings" element={<AdminSettingsPage />} />

        {/* App routes — inside AppLayout */}
        <Route path="/*" element={
          <AppLayout>
            <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/" element={<Navigate to="/today" replace />} />
              <Route path="/today" element={<TodayPage />} />
              <Route path="/topfocus" element={<TopFocusPage />} />
              <Route path="/create" element={<CreatePage />} />
              <Route path="/sections" element={<SectionsPage />} />
              <Route path="/habits" element={<HabitsPage />} />
              <Route path="/habits/new" element={<Navigate to="/habits?new=1" replace />} />
              <Route path="/habits/:id/edit" element={<HabitEditPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/tasks/new" element={<TaskNewPage />} />
              <Route path="/tasks/:id/edit" element={<TaskEditPage />} />
              <Route path="/goals" element={<GoalsPage />} />
              <Route path="/goals/new" element={<GoalNewPage />} />
              <Route path="/goals/:id" element={<GoalDetailPage />} />
              <Route path="/goals/:id/edit" element={<GoalEditPage />} />
              <Route path="/finance" element={<FinancePage />} />
              <Route path="/finance/new" element={<FinanceNewPage />} />
              <Route path="/finance/:id/edit" element={<FinanceEditPage />} />
              <Route path="/balance" element={<BalancePage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/:userId" element={<ProfilePage />} />
              <Route path="/achievements" element={<AchievementsPage />} />
              <Route path="/social" element={<SocialPage />} />
              <Route path="/archive" element={<ArchivePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/pro" element={<ProPage />} />
              <Route path="/news" element={<NewsPage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/partner" element={<PartnerPage />} />
              <Route path="/statistics" element={<StatisticsPage />} />
              <Route path="/profile-settings" element={<ProfileSettingsPage />} />
              <Route path="/rating" element={<RatingPage />} />
              <Route path="*" element={<Navigate to="/today" replace />} />
            </Routes>
            </Suspense>
          </AppLayout>
        } />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

/** Keeps sonner toasts in sync with the app theme (there is no next-themes provider). */
function ThemedSonner() {
  const theme = useThemeStore(s => s.theme);
  return <Sonner theme={theme} />;
}

const App = () => (
  <ErrorBoundary variant="fullscreen">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ThemedSonner />
        <AppRoutes />
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
