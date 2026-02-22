import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useFullAccess } from '@/hooks/use-full-access';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Send, Heart, MessageCircle, AlertTriangle, Check, Image, Camera, X, Lock, Loader2, Trash2 } from 'lucide-react';
import { getUserAdminRole } from '@/lib/adminService';
import { toast } from 'sonner';

interface PostRow {
  id: string;
  user_id: string;
  content: string;
  media_url: string | null;
  created_at: string;
  user_profiles: {
    display_name: string | null;
    avatar_url: string | null;
  }[] | null;
}

export default function SocialPage() {
  const user = useAuthStore(s => s.user);
  const displayName = useAuthStore(s => s.displayName);
  const navigate = useNavigate();
  const [newPost, setNewPost] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [showWarning, setShowWarning] = useState(true);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const { hasAccess: canPost } = useFullAccess();
  const [isOwnerOrAdmin, setIsOwnerOrAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    getUserAdminRole(user.id).then(role => {
      setIsOwnerOrAdmin(role === 'owner' || role === 'admin');
    });
  }, [user]);

  async function deletePost(postId: string) {
    if (!user) return;
    await supabase.from('posts').delete().eq('id', postId);
    toast.success('Публикация удалена');
    fetchPosts();
  }

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('posts')
        .select('id, user_id, content, media_url, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((p: any) => p.user_id))];
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', userIds);
        const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
        const enriched = data.map((p: any) => ({
          ...p,
          media_url: p.media_url ?? null,
          user_profiles: profileMap.has(p.user_id) ? [profileMap.get(p.user_id)] : null,
        }));
        setPosts(enriched as PostRow[]);
      } else {
        setPosts([]);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (newPost.length > 600 || !canPost || !user) return;
    setPosting(true);
    try {
      let mediaUrl: string | null = null;

      // Upload image if selected
      if (imagePreview && fileRef.current?.files?.[0]) {
        const file = fileRef.current.files[0];
        const ext = file.name.split('.').pop() ?? 'jpg';
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('posts')
          .upload(path, file, { upsert: false });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path);
          mediaUrl = urlData.publicUrl;
        }
      } else if (imagePreview && cameraRef.current?.files?.[0]) {
        const file = cameraRef.current.files[0];
        const ext = file.name.split('.').pop() ?? 'jpg';
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('posts')
          .upload(path, file, { upsert: false });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path);
          mediaUrl = urlData.publicUrl;
        }
      }

      await supabase.from('posts').insert({
        user_id: user.id,
        content: newPost.trim(),
        media_url: mediaUrl,
      });
      setNewPost('');
      setImagePreview(null);
      fetchPosts();
    } catch {
      // silent
    } finally {
      setPosting(false);
    }
  }

  async function toggleLike(postId: string) {
    if (!user) return;
    const { data: existing } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing) {
      await supabase.from('post_likes').delete().eq('id', existing.id);
    } else {
      await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
    }
    fetchPosts();
  }

  if (showWarning && !agreed) {
    return (
      <div className="flex flex-col min-h-screen pb-20">
        <div className="section-header">
          <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
          <h1 className="text-lg font-bold">Лента</h1>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="glass-card p-6 text-center space-y-4 max-w-sm">
            <AlertTriangle size={40} className="mx-auto text-[hsl(var(--accent-secondary))]" />
            <h2 className="text-lg font-bold">Правила ленты</h2>
            <p className="text-sm text-muted-foreground">Лента предназначена для обмена достижениями и мотивации. Реклама строго запрещена.</p>
            <div className="text-left text-xs text-muted-foreground space-y-1">
              <p>⚠️ За нарушение — бан на 7 дней</p>
              <p>⛔ За повторное нарушение — бан навсегда</p>
            </div>
            <button onClick={() => { setAgreed(true); setShowWarning(false); }} className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium flex items-center justify-center gap-2">
              <Check size={16} /> Согласен, не нарушать
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="section-header">
        <button onClick={() => navigate(-1)} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold">Лента</h1>
      </div>
      <div className="flex-1 px-4 py-4 max-w-lg mx-auto w-full space-y-4 fade-in">
        {canPost ? (
          <div className="glass-card p-3">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                {displayName.charAt(0)}
              </div>
              <textarea value={newPost} onChange={e => setNewPost(e.target.value)} placeholder="Поделитесь достижением..." rows={2} maxLength={600}
                className="flex-1 bg-transparent text-sm outline-none resize-none" />
            </div>
            {imagePreview && (
              <div className="relative mt-2 rounded-lg overflow-hidden">
                <img src={imagePreview} alt="preview" className="w-full max-h-48 object-cover rounded-lg" />
                <button onClick={() => setImagePreview(null)} className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center">
                  <X size={12} className="text-white" />
                </button>
              </div>
            )}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
                <button onClick={() => fileRef.current?.click()} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground"><Image size={16} /></button>
                <button onClick={() => cameraRef.current?.click()} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground"><Camera size={16} /></button>
                <span className="text-[10px] text-muted-foreground ml-1">{newPost.length}/600</span>
              </div>
              <button onClick={createPost} disabled={posting || (!newPost.trim() && !imagePreview)} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50">
                {posting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Опубликовать
              </button>
            </div>
          </div>
        ) : canPost === false ? (
          <div className="glass-card p-4 flex items-center gap-3 border border-border/50">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0"><Lock size={18} className="text-muted-foreground" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Публикации только для PRO</p>
              <p className="text-xs text-muted-foreground">Читать ленту может каждый, а делиться — только PRO-участники</p>
            </div>
            <button onClick={() => navigate('/pro')} className="shrink-0 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold">Upgrade</button>
          </div>
        ) : null}

        {loading && (
          <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary" /></div>
        )}

        {!loading && posts.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Пока нет публикаций. Будьте первым!</p>}

        {posts.map(post => {
          const profile = Array.isArray(post.user_profiles) ? post.user_profiles[0] : post.user_profiles;
          const authorName = profile?.display_name ?? 'Пользователь';
          return (
            <div key={post.id} className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold">
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" />
                    : authorName.charAt(0)
                  }
                </div>
                <div>
                  <p className="text-sm font-medium">{authorName}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(post.created_at).toLocaleDateString('ru-RU')}</p>
                </div>
              </div>
              {post.content && <p className="text-sm mb-3">{post.content}</p>}
              {post.media_url && <img src={post.media_url} alt="post" className="w-full rounded-lg mb-3 max-h-80 object-cover" />}
              <div className="flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-4">
                  <button onClick={() => toggleLike(post.id)} className="flex items-center gap-1 text-xs hover:text-[hsl(var(--sphere-relationships))] transition-colors">
                    <Heart size={14} /> 
                  </button>
                  <span className="flex items-center gap-1 text-xs"><MessageCircle size={14} /></span>
                </div>
                {(post.user_id === user?.id || isOwnerOrAdmin) && (
                  <button onClick={() => deletePost(post.id)} className="text-xs text-destructive/60 hover:text-destructive transition-colors p-1">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
