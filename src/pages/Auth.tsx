import { useState, type FormEvent } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, Mail } from 'lucide-react';

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefilledEmail = (location.state as { email?: unknown } | null)?.email;
  const signUp = useAuthStore(s => s.signUp);
  const signIn = useAuthStore(s => s.signIn);
  const session = useAuthStore(s => s.session);

  const [email, setEmail] = useState(typeof prefilledEmail === 'string' ? prefilledEmail : '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const trimmedEmail = email.trim();
  const canSignIn = !!trimmedEmail && !!password;
  const canSignUp = !!trimmedEmail && password.length >= 6;

  const handleSignUp = async (e?: FormEvent) => {
    e?.preventDefault();
    // Enter key / double click must not fire a second request while one is in flight.
    if (loading || !canSignUp) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signUp(trimmedEmail, password);
      if (result.error) {
        setError(result.error);
      } else if (result.needsConfirmation) {
        setNeedsConfirmation(true);
      } else {
        navigate('/today', { replace: true });
      }
    } catch {
      setError('Нет соединения с сервером. Попробуйте ещё раз');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e?: FormEvent) => {
    e?.preventDefault();
    if (loading || !canSignIn) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signIn(trimmedEmail, password);
      if (result.error) {
        setError(result.error);
      } else {
        navigate('/today', { replace: true });
      }
    } catch {
      setError('Нет соединения с сервером. Попробуйте ещё раз');
    } finally {
      setLoading(false);
    }
  };

  // Already signed in (e.g. opened /auth from history): nothing to do here.
  if (session && !loading) {
    return <Navigate to="/today" replace />;
  }

  if (needsConfirmation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Подтвердите email</h2>
          <p className="text-muted-foreground">
            Мы отправили письмо на <strong className="break-all">{trimmedEmail}</strong>. Перейдите по ссылке для активации аккаунта.
          </p>
          <Button variant="outline" className="w-full" onClick={() => setNeedsConfirmation(false)}>
            Назад
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/60 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <span className="text-3xl">⚡</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">JetFocus</h1>
          <p className="text-muted-foreground text-sm">Система жизни нового поколения</p>
        </div>

        <Tabs defaultValue="signin" className="w-full" onValueChange={() => setError(null)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Войти</TabsTrigger>
            <TabsTrigger value="signup">Регистрация</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-4">
            <form className="space-y-4" onSubmit={handleSignIn} noValidate>
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-3">
                <Input
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                  inputMode="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="Пароль"
                  autoComplete="current-password"
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !canSignIn}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Войти
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="mt-4">
            <form className="space-y-4" onSubmit={handleSignUp} noValidate>
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-3">
                <Input
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                  inputMode="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="Пароль (минимум 6 символов)"
                  autoComplete="new-password"
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !canSignUp}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Создать аккаунт
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Регистрируясь, вы соглашаетесь с условиями использования
              </p>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
