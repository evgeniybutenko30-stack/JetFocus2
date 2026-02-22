import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { useFullAccess } from '@/hooks/use-full-access';
import { ArrowLeft, Edit2, BarChart3, Star, Heart, Users, RefreshCw, CheckCircle, Target, Eye, X, Trophy, Shield, Camera, Loader2, Send, Image, Trash2 } from 'lucide-react';
import { getLevelName, xpForLevel } from '@/lib/constants';
import { getUserAdminRole } from '@/lib/adminService';
import { toast } from 'sonner';

const INTEREST_OPTIONS = ['Продуктивность','Здоровье','Спорт','Финансы','Бизнес','Программирование','Дизайн','Маркетинг','Саморазвитие','Медитация','Чтение','Путешествия','Музыка','Кино','Игры','Кулинария','Языки','Наука','Искусство','Фотография'];
const STATUS_OPTIONS = ['Предприниматель','Студент','Фрилансер','Менеджер','Разработчик','Дизайнер','Другое'];

export default function ProfilePage() {
  const { userId: paramUserId } = useParams<{ userId?: string }>();
  const user = useAuthStore(s => s.user);
  const myDisplayName = useAuthStore(s => s.displayName);
  const myAvatarUrl = useAuthStore(s => s.avatarUrl);
  const level = useAuthStore(s => s.level);
  const myStars = useAuthStore(s => s.stars);
  const updateProfile = useAuthStore(s => s.updateProfile);
  const loadProfile = useAuthStore(s => s.loadProfile);
  const navigate = useNavigate();

  const isOwnProfile = !paramUserId || paramUserId === user?.id;
  const profileUserId = isOwnProfile ? user?.id : paramUserId;

  const [activeTab, setActiveTab] = useState<'profile' | 'posts'>('profile');
  const [showEdit, setShowEdit] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [editTab, setEditTab] = useState<'personal' | 'profession' | 'contacts'>('personal');
  const [statsPeriod, setStatsPeriod] = useState('month');
  const [uploading, setUploading] = useState(false);

  // Public profile data (for other users)
  const [publicProfile, setPublicProfile] = useState<any>(null);
  const [loadingPublic, setLoadingPublic] = useState(false);

  // Hidden admin entry
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout>>();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [tapProgress, setTapProgress] = useState(0);

  const handleVersionTap = useCallback(async () => {
    clearTimeout(tapTimer.current);
    tapCount.current += 1;
    setTapProgress(tapCount.current);
    tapTimer.current = setTimeout(() => { tapCount.current = 0; setTapProgress(0); }, 2000);
    if (tapCount.current >= 7) {
      tapCount.current = 0;
      setTapProgress(0);
      if (!user) return;
      const role = await getUserAdminRole(user.id);
      if (role) setShowAdminModal(true);
      else navigate('/admin');
    }
  }, [user, navigate]);

  const [name, setName] = useState(myDisplayName);
  const [birthDate, setBirthDate] = useState('1998-08-18');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const [habitsCount, setHabitsCount] = useState(0);
  const [tasksCount, setTasksCount] = useState(0);
  const [goalsCount, setGoalsCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [referralsCount, setReferralsCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);

  // Profession & contacts state
  const [expertise, setExpertise] = useState('');
  const [canHelp, setCanHelp] = useState('');
  const [telegram, setTelegram] = useState('');

  // Load public profile for other users
  useEffect(() => {
    if (isOwnProfile || !profileUserId) return;
    setLoadingPublic(true);
    supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', profileUserId)
      .single()
      .then(({ data }) => {
        setPublicProfile(data);
        setLoadingPublic(false);
      });
  }, [isOwnProfile, profileUserId]);

  // Load own profile fields from DB
  useEffect(() => {
    if (!isOwnProfile || !user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setName(data.display_name ?? myDisplayName);
        setBio(data.bio ?? '');
        setLocation(data.city ?? '');
        setStatus(data.status ?? '');
        setInterests(data.interests ?? []);
      }

      // Load profession data from user_data_sanity (isolated key)
      const { data: profData } = await supabase
        .from('user_data_sanity')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'profile_profession')
        .maybeSingle();
      if (profData?.value) {
        const v = profData.value as any;
        setExpertise(v.expertise ?? '');
        setCanHelp(v.can_help ?? '');
      }

      // Load contacts data from user_data_sanity (isolated key)
      const { data: contData } = await supabase
        .from('user_data_sanity')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'profile_contacts')
        .maybeSingle();
      if (contData?.value) {
        const v = contData.value as any;
        setTelegram(v.telegram ?? '');
      }

      // Legacy fallback: try old 'profile_extra' key, migrate if found
      if (!profData && !contData) {
        const { data: legacyExtra } = await supabase
          .from('user_data_sanity')
          .select('value')
          .eq('user_id', user.id)
          .eq('key', 'profile_extra')
          .maybeSingle();
        if (legacyExtra?.value) {
          const v = legacyExtra.value as any;
          setExpertise(v.expertise ?? '');
          setCanHelp(v.can_help ?? '');
          setTelegram(v.telegram ?? '');
        }
      }
    })();
  }, [isOwnProfile, user?.id, myDisplayName]);

  // Load stats
  useEffect(() => {
    if (!profileUserId) return;
    const uid = profileUserId;
    const queries = [
      supabase.from('habits').select('id', { count: 'exact', head: true }).eq('user_id', uid).then(r => r),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', uid).then(r => r),
      supabase.from('goals').select('id', { count: 'exact', head: true }).eq('user_id', uid).then(r => r),
      supabase.from('referrals').select('id', { count: 'exact', head: true }).eq('inviter_id', uid).then(r => r),
      supabase.from('post_likes').select('id, posts!inner(user_id)', { count: 'exact', head: true }).eq('posts.user_id', uid).then(r => r),
    ];
    Promise.all(queries).then(([h, t, g, r, l]) => {
      setHabitsCount(h.count ?? 0);
      setTasksCount(t.count ?? 0);
      setGoalsCount(g.count ?? 0);
      setReferralsCount(r.count ?? 0);
      setLikesCount(l.count ?? 0);
    });
  }, [profileUserId]);

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl + '?t=' + Date.now();
      await updateProfile({ avatar_url: publicUrl });
      await loadProfile();
      toast.success('Аватар обновлён');
    } catch (err: any) {
      toast.error('Ошибка загрузки: ' + (err.message ?? ''));
    } finally {
      setUploading(false);
    }
  }

  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!user) {
      toast.error('Войдите в аккаунт, чтобы сохранить профиль');
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      // 1) Save core fields to user_profiles (bio is ONLY "О себе", never mixed with other data)
      const { error: err1 } = await supabase.from('user_profiles').update({
        display_name: name.trim() || 'Гость',
        bio: bio.trim(),
        city: location,
        status,
        interests,
      }).eq('user_id', user.id);

      if (err1) {
        console.error('Profile save error:', err1);
        toast.error('Ошибка сохранения профиля');
        return;
      }

      // 2) Save profession & contacts SEPARATELY via user_data_sanity
      //    Each field group has its own key to prevent cross-contamination
      const professionPayload = {
        expertise: expertise.trim(),
        can_help: canHelp.trim(),
      };
      const contactsPayload = {
        telegram: telegram.trim(),
      };

      // Save profession data
      const profSaved = await saveDataSanity(user.id, 'profile_profession', professionPayload);
      // Save contacts data  
      const contSaved = await saveDataSanity(user.id, 'profile_contacts', contactsPayload);

      // Also migrate legacy 'profile_extra' key if it exists (one-time cleanup)
      await supabase.from('user_data_sanity').delete().eq('user_id', user.id).eq('key', 'profile_extra');

      if (!profSaved || !contSaved) {
        toast.error('Ошибка сохранения профессии/контактов');
        return;
      }

      updateProfile({ display_name: name.trim() || 'Гость' });
      setShowEdit(false);
      toast.success('Профиль сохранён');
    } finally {
      setSaving(false);
    }
  }

  /** Upsert a single key in user_data_sanity. Returns true on success. */
  async function saveDataSanity(userId: string, key: string, value: Record<string, string>): Promise<boolean> {
    // Strategy 1: Try update existing row
    const { data: existing } = await supabase
      .from('user_data_sanity')
      .select('id')
      .eq('user_id', userId)
      .eq('key', key)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('user_data_sanity')
        .update({ value })
        .eq('id', existing.id);
      if (!error) return true;
      console.error(`saveDataSanity update(${key}):`, JSON.stringify(error));
    }

    // Strategy 2: Insert new row (handles first-time save)
    const { error: insertErr } = await supabase
      .from('user_data_sanity')
      .insert({ user_id: userId, key, value });
    if (!insertErr) return true;

    // Strategy 3: If insert failed (maybe duplicate), try delete + insert
    console.error(`saveDataSanity insert(${key}):`, JSON.stringify(insertErr));
    await supabase.from('user_data_sanity').delete().eq('user_id', userId).eq('key', key);
    const { error: retryErr } = await supabase
      .from('user_data_sanity')
      .insert({ user_id: userId, key, value });
    if (!retryErr) return true;

    console.error(`saveDataSanity retry(${key}):`, JSON.stringify(retryErr));
    return false;
  }

  // Determine display values
  const displayName = isOwnProfile ? myDisplayName : (publicProfile?.display_name ?? 'Пользователь');
  const avatarUrl = isOwnProfile ? myAvatarUrl : (publicProfile?.avatar_url ?? null);
  const stars = isOwnProfile ? myStars : (publicProfile?.stars_balance ?? 0);
  const profileBio = isOwnProfile ? bio : (publicProfile?.bio ?? '');
  const profileStatus = isOwnProfile ? status : (publicProfile?.status ?? '');
  const profileCity = isOwnProfile ? location : (publicProfile?.city ?? '');
  const profileInterests: string[] = isOwnProfile ? interests : (publicProfile?.interests ?? []);

  const xpNeeded = xpForLevel(level);

  if (loadingPublic) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleAvatarUpload} />

      <div className="flex-1 max-w-lg mx-auto w-full fade-in">
        {/* Tabs */}
        <div className="flex items-center px-4 gap-2 py-2">
          <button onClick={() => navigate(-1)} className="p-1 text-muted-foreground"><ArrowLeft size={20} /></button>
          <div className="flex flex-1 bg-secondary rounded-lg p-0.5">
            <button onClick={() => setActiveTab('profile')} className={`flex-1 py-2 text-sm font-medium rounded-md flex items-center justify-center gap-1.5 ${activeTab === 'profile' ? 'bg-card text-foreground' : 'text-muted-foreground'}`}>
              <Users size={14} /> Профиль
            </button>
            <button onClick={() => setActiveTab('posts')} className={`flex-1 py-2 text-sm font-medium rounded-md flex items-center justify-center gap-1.5 ${activeTab === 'posts' ? 'bg-card text-foreground' : 'text-muted-foreground'}`}>
              📝 Публикации
            </button>
          </div>
        </div>

        {activeTab === 'profile' && (
          <div className="px-4 space-y-4">
            {/* Avatar section */}
            <div className="flex gap-4">
              <div className="relative w-28 h-28 rounded-2xl bg-gradient-to-br from-primary/30 to-accent flex items-center justify-center text-4xl font-bold text-primary flex-shrink-0 overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  displayName.charAt(0).toUpperCase()
                )}
                {isOwnProfile && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 size={20} className="text-white animate-spin" /> : <Camera size={20} className="text-white" />}
                  </button>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex gap-3 text-xs">
                  <div className="text-center"><Star size={14} className="mx-auto text-[hsl(var(--accent-secondary))] mb-0.5" /><span className="font-bold">{stars}</span><p className="text-muted-foreground">Звёзды</p></div>
                  <div className="text-center"><Heart size={14} className="mx-auto text-pink-400 mb-0.5" /><span className="font-bold">{likesCount}</span><p className="text-muted-foreground">Лайки</p></div>
                  <div className="text-center"><Users size={14} className="mx-auto text-primary mb-0.5" /><span className="font-bold">{referralsCount}</span><p className="text-muted-foreground">Рефералы</p></div>
                </div>
                {isOwnProfile && (
                  <>
                    <button onClick={() => setShowEdit(true)} className="w-full py-2 border border-border rounded-xl text-sm flex items-center justify-center gap-1.5"><Edit2 size={13} /> Редактировать</button>
                    <button onClick={() => setShowStats(true)} className="w-full py-2 border border-border rounded-xl text-sm flex items-center justify-center gap-1.5"><BarChart3 size={13} /> Статистика</button>
                    <button
                      onClick={handleVersionTap}
                      className="text-[11px] text-muted-foreground text-center select-none w-full py-1 rounded-lg active:bg-muted/40 transition-colors"
                    >
                      Ур. {level} — {getLevelName(level)} · v1.0.0
                      {tapProgress > 0 && tapProgress < 7 && (
                        <span className="ml-1 opacity-60">{'·'.repeat(tapProgress)}</span>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Name */}
            <div>
              <h2 className="text-xl font-bold">{displayName}</h2>
              {profileCity && <p className="text-sm text-muted-foreground text-right">{profileCity}</p>}
              {profileStatus && <p className="text-sm text-primary">{profileStatus}</p>}
            </div>

            {/* Bio */}
            {profileBio && (
              <div className="glass-card p-3">
                <p className="text-[10px] text-muted-foreground mb-0.5">О себе</p>
                <p className="text-sm">{profileBio}</p>
              </div>
            )}

            {/* Interests */}
            {profileInterests.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {profileInterests.map(i => (
                  <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] rounded-full">{i}</span>
                ))}
              </div>
            )}

            {/* Productivity (own profile only) */}
            {isOwnProfile && (
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Trophy size={14} className="text-primary" /> Продуктивность</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="glass-card p-3 text-center"><RefreshCw size={16} className="mx-auto text-primary mb-1" /><p className="text-lg font-bold">{habitsCount}</p><p className="text-[10px] text-muted-foreground">Привычек</p></div>
                  <div className="glass-card p-3 text-center"><CheckCircle size={16} className="mx-auto text-blue-400 mb-1" /><p className="text-lg font-bold">{tasksCount}</p><p className="text-[10px] text-muted-foreground">Задач</p></div>
                  <div className="glass-card p-3 text-center"><Target size={16} className="mx-auto text-purple-400 mb-1" /><p className="text-lg font-bold">{goalsCount}</p><p className="text-[10px] text-muted-foreground">Целей</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'posts' && (
          <ProfilePostsTab userId={profileUserId!} isOwn={isOwnProfile} />
        )}
      </div>

      {/* Stats modal */}
      {showStats && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowStats(false)}>
          <div className="bg-card w-full max-w-lg rounded-3xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Статистика профиля</h3>
              <button onClick={() => setShowStats(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="flex bg-secondary rounded-lg p-0.5 mb-4">
              {['Неделя','Месяц','Год','Всё'].map(p => (
                <button key={p} onClick={() => setStatsPeriod(p.toLowerCase())} className={`flex-1 py-2 text-xs font-medium rounded-md ${statsPeriod === p.toLowerCase() ? 'bg-card text-foreground' : 'text-muted-foreground'}`}>{p}</button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-card p-4 text-center"><Eye size={18} className="mx-auto text-blue-400 mb-1" /><p className="text-2xl font-bold">0</p><p className="text-xs text-muted-foreground">Просмотры</p></div>
              <div className="glass-card p-4 text-center"><Users size={18} className="mx-auto text-green-400 mb-1" /><p className="text-2xl font-bold">{followersCount}</p><p className="text-xs text-muted-foreground">Подписки</p></div>
              <div className="glass-card p-4 text-center"><Heart size={18} className="mx-auto text-pink-400 mb-1" /><p className="text-2xl font-bold">{likesCount}</p><p className="text-xs text-muted-foreground">Лайки</p></div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 bg-background overflow-auto">
          <div className="max-w-lg mx-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Редактировать публичный профиль</h3>
              <button onClick={() => setShowEdit(false)}><X size={20} /></button>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-xs text-red-400">⚠ Реклама запрещена. За нарушение — режим "только чтение" на 7 дней, повторно — бан на 30 дней.</div>
            
            {/* Avatar upload */}
            <div className="flex justify-center mb-4">
              <button onClick={() => fileInputRef.current?.click()} className="relative w-24 h-24 rounded-full overflow-hidden group" disabled={uploading}>
                {myAvatarUrl ? (
                  <img src={myAvatarUrl} alt={myDisplayName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-primary/20 flex items-center justify-center text-3xl font-bold text-primary">{myDisplayName.charAt(0)}</div>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploading ? <Loader2 size={20} className="text-white animate-spin" /> : <Camera size={20} className="text-white" />}
                </div>
              </button>
            </div>

            {/* Edit tabs */}
            <div className="flex bg-secondary rounded-lg p-0.5 mb-4">
              {[{k:'personal',l:'Личное'},{k:'profession',l:'Профессия'},{k:'contacts',l:'Контакты'}].map(t => (
                <button key={t.k} onClick={() => setEditTab(t.k as any)} className={`flex-1 py-2 text-xs font-medium rounded-md ${editTab === t.k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{t.l}</button>
              ))}
            </div>

            {editTab === 'personal' && (
              <div className="space-y-4">
                <div><label className="text-sm font-medium mb-1 block">Имя *</label><input value={name} onChange={e => setName(e.target.value)} className="form-input" /></div>
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-xs text-green-400">ℹ Публичный профиль виден всем пользователям в рейтинге и по ссылке</div>
                <div><label className="text-sm font-medium mb-1 block">О себе</label><textarea value={bio} onChange={e => setBio(e.target.value)} className="form-input" rows={3} maxLength={300} placeholder="Расскажите о себе..." /></div>
                <div><label className="text-sm font-medium mb-1 block">Местоположение</label><div className="form-input flex items-center gap-2">📍 <input value={location} onChange={e => setLocation(e.target.value)} className="bg-transparent outline-none flex-1" /></div></div>
                <div className="relative">
                  <label className="text-sm font-medium mb-1 block">Статус</label>
                  <button onClick={() => setShowStatusDropdown(!showStatusDropdown)} className="form-input w-full text-left flex items-center justify-between border-primary/50">{status || 'Выберите'} <span>▾</span></button>
                  {showStatusDropdown && (
                    <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-xl overflow-hidden shadow-xl">
                      {STATUS_OPTIONS.map(s => <button key={s} onClick={() => { setStatus(s); setShowStatusDropdown(false); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors">{s}</button>)}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Интересы (до 6)</label>
                  <div className="flex flex-wrap gap-2">{INTEREST_OPTIONS.map(i => (
                    <button key={i} onClick={() => interests.includes(i) ? setInterests(interests.filter(x => x !== i)) : interests.length < 6 ? setInterests([...interests, i]) : null}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${interests.includes(i) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>{i}</button>
                  ))}</div>
                </div>
              </div>
            )}

            {editTab === 'profession' && (
              <div className="space-y-4">
                <div><label className="text-sm font-medium mb-1 block">Экспертиза</label><input value={expertise} onChange={e => setExpertise(e.target.value)} className="form-input" placeholder="Ваша экспертиза" /></div>
                <div><label className="text-sm font-medium mb-1 block">Чем могу помочь</label><input value={canHelp} onChange={e => setCanHelp(e.target.value)} className="form-input" placeholder="Чем можете помочь" /></div>
              </div>
            )}

            {editTab === 'contacts' && (
              <div className="space-y-4">
                <div><label className="text-sm font-medium mb-1 block">Email</label><input defaultValue={user?.email ?? ''} className="form-input" readOnly /></div>
                <div><label className="text-sm font-medium mb-1 block">Telegram</label><input value={telegram} onChange={e => setTelegram(e.target.value)} className="form-input" placeholder="@username" /></div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowEdit(false)} className="flex-1 py-3 border border-border rounded-xl text-sm font-medium">Отмена</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50">{saving ? 'Сохранение…' : 'Сохранить'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Console modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xs bg-card border border-border/50 rounded-2xl shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <Shield size={22} className="text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Admin Console</h3>
              <p className="text-xs text-muted-foreground mt-1">Доступ к панели администратора</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowAdminModal(false)} className="flex-1 py-2.5 rounded-xl border border-border/50 text-sm text-muted-foreground">Закрыть</button>
              <button onClick={() => { setShowAdminModal(false); window.location.href = '/admin'; }} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Войти</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfilePostsTab({ userId, isOwn }: { userId: string; isOwn: boolean }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const user = useAuthStore(s => s.user);
  const { hasAccess: canPost } = useFullAccess();

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('posts')
      .select('id, user_id, content, media_url, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    setPosts(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function createPost() {
    if (!newPost.trim() && !imagePreview) return;
    if (!canPost || !user) return;
    setPosting(true);
    try {
      let mediaUrl: string | null = null;
      if (imagePreview && fileRef.current?.files?.[0]) {
        const file = fileRef.current.files[0];
        const ext = file.name.split('.').pop() ?? 'jpg';
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('posts').upload(path, file);
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path);
          mediaUrl = urlData.publicUrl;
        }
      }
      await supabase.from('posts').insert({ user_id: user.id, content: newPost.trim(), media_url: mediaUrl });
      setNewPost('');
      setImagePreview(null);
      fetchPosts();
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="px-4 space-y-3">
      {isOwn && canPost && (
        <div className="glass-card p-3 space-y-2">
          <textarea value={newPost} onChange={e => setNewPost(e.target.value)} placeholder="Поделитесь достижением..." rows={2} maxLength={600} className="w-full bg-transparent text-sm outline-none resize-none" />
          {imagePreview && (
            <div className="relative rounded-lg overflow-hidden">
              <img src={imagePreview} alt="" className="w-full max-h-40 object-cover rounded-lg" />
              <button onClick={() => { setImagePreview(null); if (fileRef.current) fileRef.current.value = ''; }} className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"><X size={12} className="text-white" /></button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              <button onClick={() => fileRef.current?.click()} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground"><Image size={16} /></button>
              <span className="text-[10px] text-muted-foreground">{newPost.length}/600</span>
            </div>
            <button onClick={createPost} disabled={posting || (!newPost.trim() && !imagePreview)} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50">
              {posting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Опубликовать
            </button>
          </div>
        </div>
      )}
      {loading && <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary" /></div>}
      {!loading && posts.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Пока нет публикаций</p>}
      {posts.map(post => (
        <div key={post.id} className="glass-card p-3">
          {post.content && <p className="text-sm mb-2">{post.content}</p>}
          {post.media_url && <img src={post.media_url} alt="" className="w-full rounded-lg mb-2 max-h-60 object-cover" />}
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">{new Date(post.created_at).toLocaleDateString('ru-RU')}</p>
            {isOwn && (
              <button onClick={async () => { await supabase.from('posts').delete().eq('id', post.id); fetchPosts(); toast.success('Удалено'); }} className="text-destructive/60 hover:text-destructive p-1">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
