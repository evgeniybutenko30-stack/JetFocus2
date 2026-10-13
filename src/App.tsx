import { useEffect } from 'react';
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
import AuthPage from "./pages/Auth";
import TodayPage from "./pages/Today";
import TopFocusPage from "./pages/TopFocus";
import HabitsPage from "./pages/Habits";
import HabitEditPage from "./pages/HabitEdit";
import TasksPage from "./pages/Tasks";
import TaskNewPage from "./pages/TaskNew";
import TaskEditPage from "./pages/TaskEdit";
import FinancePage from "./pages/Finance";
import FinanceNewPage from "./pages/FinanceNew";
import FinanceEditPage from "./pages/FinanceEdit";
import BalancePage from "./pages/Balance";
import SectionsPage from "./pages/Sections";
import GoalsPage from "./pages/Goals";
import GoalNewPage from "./pages/GoalNew";
import GoalEditPage from "./pages/GoalEdit";
import GoalDetailPage from "./pages/GoalDetail";
import ProfilePage from "./pages/Profile";
import AchievementsPage from "./pages/Achievements";
import SocialPage from "./pages/Social";
import ArchivePage from "./pages/Archive";
import SettingsPage from "./pages/Settings";
import NotificationsPage from "./pages/Notifications";
import ProPage from "./pages/Pro";
import CreatePage from "./pages/CreatePage";
import NewsPage from "./pages/News";
import CatalogPage from "./pages/Catalog";
import PartnerPage from "./pages/Partner";
import StatisticsPage from "./pages/Statistics";
import ProfileSettingsPage from "./pages/ProfileSettings";
import RatingPage from "./pages/Rating";
import AdminPage from "./pages/admin/AdminPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminStarsPage from "./pages/admin/AdminStarsPage";
import AdminPromosPage from "./pages/admin/AdminPromosPage";
import AdminAuditPage from "./pages/admin/AdminAuditPage";
import AdminRolesPage from "./pages/admin/AdminRolesPage";
import AdminSubscriptionsPage from "./pages/admin/AdminSubscriptionsPage";
import AdminAnalyticsPage from "./pages/admin/AdminAnalyticsPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";

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
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/" element={<Navigate to="/today" replace />} />
              <Route path="/today" element={<TodayPage />} />
              <Route path="/topfocus" element={<TopFocusPage />} />
              <Route path="/create" element={<CreatePage />} />
              <Route path="/sections" element={<SectionsPage />} />
              <Route path="/habits" element={<HabitsPage />} />
              <Route path="/habits/new" element={<Navigate to="/habits" replace />} />
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
          </AppLayout>
        } />
      </Routes>
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
