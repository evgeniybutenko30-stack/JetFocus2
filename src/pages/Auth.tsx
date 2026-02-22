import { useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, Mail } from 'lucide-react';

export default function AuthPage() {
  const navigate = useNavigate();
  const { signUp, signIn } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const handleSignUp = async () => {
    setLoading(true);
    setError(null);
    const result = await signUp(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else if (result.needsConfirmation) {
      setNeedsConfirmation(true);
    } else {
      navigate('/today');
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      navigate('/today');
    }
  };

  if (needsConfirmation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Подтвердите email</h2>
          <p className="text-muted-foreground">
            Мы отправили письмо на <strong>{email}</strong>. Перейдите по ссылке для активации аккаунта.
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

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Войти</TabsTrigger>
            <TabsTrigger value="signup">Регистрация</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="space-y-4 mt-4">
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              />
              <Input
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              />
            </div>
            <Button className="w-full" onClick={handleSignIn} disabled={loading || !email || !password}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Войти
            </Button>
          </TabsContent>

          <TabsContent value="signup" className="space-y-4 mt-4">
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Пароль (минимум 6 символов)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={handleSignUp} disabled={loading || !email || password.length < 6}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Создать аккаунт
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Регистрируясь, вы соглашаетесь с условиями использования
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
