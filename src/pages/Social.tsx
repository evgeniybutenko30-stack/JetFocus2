import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useFullAccess } from '@/hooks/use-full-access';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Send, Heart, MessageCircle, AlertTriangle, Check, Image, Camera, X, Lock, Loader2, Trash2, RefreshCw } from 'lucide-react';
import { getUserAdminRole } from '@/lib/adminService';
import {
  IMAGE_ACCEPT, MAX_POST_IMAGE_BYTES, PROFILE_LIMITS,
  imageExtension, normalizeDisplayName, safeImageSrc, validateImageFile,
} from '@/lib/profile-utils';
import { emptyLikeState, setMyLike, summarizeLikes, UNIQUE_VIOLATION, type LikeState } from '@/lib/socialUtils';
import { toast } from 'sonner';

interface PostAuthor {
  display_name: string | null;
  avatar_url: string | null;
}

interface PostRow {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
  author: PostAuthor | null;
}

type RawPost = Omit<PostRow, 'author'>;
type RawProfile = PostAuthor & { user_id: string };

const FEED_LIMIT = 50;

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return 'ошибка сети';
}

export default function SocialPage() {
  const user = useAuthStore(s => s.user);
  const userId = user?.id ?? null;
  const displayName = useAuthStore(s => s.displayName);
  const navigate = useNavigate();
  const [newPost, setNewPost] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [showWarning, setShowWarning] = useState(true);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [likes, setLikes] = useState<LikeState>(emptyLikeState);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingLikes, setPendingLikes] = useState<Set<string>>(() => new Set());
  const pendingLikesRef = useRef<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fetchSeq = useRef(0);

  const { hasAccess: canPost } = useFullAccess();
  const [isOwnerOrAdmin, setIsOwnerOrAdmin] = useState(false);

  useEffect(() => {
    setIsOwnerOrAdmin(false);
    if (!userId) return;
    let cancelled = false;
    getUserAdminRole(userId)
      .then(role => { if (!cancelled) setIsOwnerOrAdmin(role === 'owner' || role === 'admin'); })
      .catch(e => console.warn('[social] role check failed:', e));
    return () => { cancelled = true; };
  }, [userId]);

  const fetchPosts = useCallback(async () => {
    // Only the latest request may update state (a refetch after a post/delete can overtake).
    const requestId = ++fetchSeq.current;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('id, user_id, content, media_url, created_at')
        .order('created_at', { ascending: false })
        .limit(FEED_LIMIT);
      if (error) throw error;
      const rows = (data ?? []) as RawPost[];

      const userIds = [...new Set(rows.map(p => p.user_id))];
      const postIds = rows.map(p => p.id);
      const [profilesRes, likesRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from('user_profiles').select('user_id, display_name, avatar_url').in('user_id', userIds)
          : Promise.resolve({ data: [] as RawProfile[], error: null }),
        postIds.length > 0
          ? supabase.from('post_likes').select('post_id, user_id').in('post_id', postIds)
          : Promise.resolve({ data: [] as { post_id: string; user_id: string }[], error: null }),
      ]);
      if (requestId !== fetchSeq.current) return;
      // Names / likes are secondary: show the posts even if these lookups fail.
      if (profilesRes.error) console.warn('[social] profiles:', profilesRes.error.message);
      if (likesRes.error) console.warn('[social] likes:', likesRes.error.message);

      const profileMap = new Map(((profilesRes.data ?? []) as RawProfile[]).map(p => [p.user_id, p]));
      setPosts(rows.map(p => ({ ...p, media_url: p.media_url ?? null, author: profileMap.get(p.user_id) ?? null })));
      setLikes(summarizeLikes(likesRes.data as { post_id: string; user_id: string }[] | null, userId));
      setLoadError(false);
    } catch (e) {
      if (requestId !== fetchSeq.current) return;
      console.error('[social] feed load error:', e);
      setLoadError(true);
    } finally {
      if (requestId === fetchSeq.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  async function deletePost(postId: string) {
    if (!userId || deletingId) return;
    if (!window.confirm('Удалить публикацию?')) return;
    setDeletingId(postId);
    try {
      // RLS lets the author (and owner/admin) delete; 0 affected rows means "not allowed".
      const { data, error } = await supabase.from('posts').delete().eq('id', postId).select('id');
      if (error) { toast.error('Не удалось удалить: ' + error.message); return; }
      if (!data || data.length === 0) { toast.error('Не удалось удалить: нет прав или публикация уже удалена'); return; }
      setPosts(prev => prev.filter(p => p.id !== postId));
      toast.success('Публикация удалена');
    } catch (e) {
      toast.error('Не удалось удалить: ' + errorMessage(e));
    } finally {
      setDeletingId(null);
    }
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = '';
    if (!file) return;
    const validationError = validateImageFile(file, MAX_POST_IMAGE_BYTES);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    // Keep the exact File the preview shows (gallery vs camera inputs used to get mixed up).
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => {
      toast.error('Не удалось прочитать файл');
      clearImage();
    };
    reader.readAsDataURL(file);
  }

  async function createPost() {
    const content = newPost.trim().slice(0, PROFILE_LIMITS.post);
    if (!content && !imageFile) return;
    if (!canPost || !userId || posting) return;
    setPosting(true);
    try {
      let mediaUrl: string | null = null;
      if (imageFile) {
        const path = `${userId}/${Date.now()}.${imageExtension(imageFile.type)}`;
        const { error: upErr } = await supabase.storage.from('posts').upload(path, imageFile, { contentType: imageFile.type, upsert: false });
        if (upErr) {
          // Don't silently publish the post without the image the user attached.
          toast.error('Не удалось загрузить изображение: ' + upErr.message);
          return;
        }
        mediaUrl = supabase.storage.from('posts').getPublicUrl(path).data.publicUrl;
      }
      const { error: insertErr } = await supabase.from('posts').insert({ user_id: userId, content, media_url: mediaUrl });
      if (insertErr) {
        // Keep the draft so the user doesn't lose the text.
        toast.error('Не удалось опубликовать: ' + insertErr.message);
        return;
      }
      setNewPost('');
      clearImage();
      toast.success('Опубликовано');
      fetchPosts();
    } catch (e) {
      toast.error('Не удалось опубликовать: ' + errorMessage(e));
    } finally {
      setPosting(false);
    }
  }

  function markLikePending(postId: string, pending: boolean) {
    if (pending) pendingLikesRef.current.add(postId);
    else pendingLikesRef.current.delete(postId);
    setPendingLikes(new Set(pendingLikesRef.current));
  }

  async function toggleLike(postId: string) {
    if (!userId) { toast.error('Войдите, чтобы ставить лайки'); return; }
    // One request per post at a time: rapid clicks can't race insert vs delete.
    if (pendingLikesRef.current.has(postId)) return;
    const wasLiked = likes.likedByMe.has(postId);
    markLikePending(postId, true);
    setLikes(prev => setMyLike(prev, postId, !wasLiked)); // optimistic
    try {
      const { error } = wasLiked
        ? await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId)
        : await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
      // A duplicate insert means the like already exists — the desired end state.
      if (error && error.code !== UNIQUE_VIOLATION) {
        setLikes(prev => setMyLike(prev, postId, wasLiked)); // rollback
        toast.error('Не удалось обновить лайк');
      }
    } catch (e) {
      setLikes(prev => setMyLike(prev, postId, wasLiked));
      toast.error('Не удалось обновить лайк: ' + errorMessage(e));
    } finally {
      markLikePending(postId, false);
    }
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
                {(displayName || '?').charAt(0)}
              </div>
              <textarea value={newPost} onChange={e => setNewPost(e.target.value)} placeholder="Поделитесь достижением..." rows={2} maxLength={PROFILE_LIMITS.post}
                className="flex-1 bg-transparent text-sm outline-none resize-none" />
            </div>
            {imagePreview && (
              <div className="relative mt-2 rounded-lg overflow-hidden">
                <img src={imagePreview} alt="preview" className="w-full max-h-48 object-cover rounded-lg" />
                <button onClick={clearImage} className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center">
                  <X size={12} className="text-white" />
                </button>
              </div>
            )}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1">
                <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={handleFile} />
                <input ref={cameraRef} type="file" accept={IMAGE_ACCEPT} capture="environment" className="hidden" onChange={handleFile} />
                <button onClick={() => fileRef.current?.click()} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground"><Image size={16} /></button>
                <button onClick={() => cameraRef.current?.click()} className="p-1.5 rounded-lg hover:bg-accent/50 text-muted-foreground"><Camera size={16} /></button>
                <span className="text-[10px] text-muted-foreground ml-1">{newPost.length}/{PROFILE_LIMITS.post}</span>
              </div>
              <button onClick={createPost} disabled={posting || (!newPost.trim() && !imageFile)} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50">
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

        {!loading && loadError && (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-center text-sm text-muted-foreground">Не удалось загрузить ленту</p>
            <button onClick={fetchPosts} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
              <RefreshCw size={14} /> Повторить
            </button>
          </div>
        )}
        {!loading && !loadError && posts.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Пока нет публикаций. Будьте первым!</p>}

        {posts.map(post => {
          const authorName = normalizeDisplayName(post.author?.display_name);
          const avatarSrc = safeImageSrc(post.author?.avatar_url);
          const mediaSrc = safeImageSrc(post.media_url);
          const liked = likes.likedByMe.has(post.id);
          const likeCount = likes.counts[post.id] ?? 0;
          const likePending = pendingLikes.has(post.id);
          return (
            <div key={post.id} className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden">
                  {avatarSrc
                    ? <img src={avatarSrc} alt="" className="w-full h-full rounded-full object-cover" />
                    : authorName.charAt(0)
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{authorName}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(post.created_at).toLocaleDateString('ru-RU')}</p>
                </div>
              </div>
              {post.content && <p className="text-sm mb-3 whitespace-pre-line break-words">{post.content}</p>}
              {mediaSrc && <img src={mediaSrc} alt="" loading="lazy" className="w-full rounded-lg mb-3 max-h-80 object-cover" />}
              <div className="flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-4">
                  <button onClick={() => toggleLike(post.id)} disabled={likePending} aria-pressed={liked} aria-label={liked ? 'Убрать лайк' : 'Нравится'}
                    className={`flex items-center gap-1 text-xs transition-colors hover:text-[hsl(var(--sphere-relationships))] ${liked ? 'text-[hsl(var(--sphere-relationships))]' : ''}`}>
                    <Heart size={14} className={liked ? 'fill-current' : ''} />
                    {likeCount > 0 && <span>{likeCount}</span>}
                  </button>
                  <span className="flex items-center gap-1 text-xs"><MessageCircle size={14} /></span>
                </div>
                {(post.user_id === userId || isOwnerOrAdmin) && (
                  <button onClick={() => deletePost(post.id)} disabled={deletingId === post.id} className="text-xs text-destructive/60 hover:text-destructive transition-colors p-1 disabled:opacity-40" aria-label="Удалить публикацию">
                    {deletingId === post.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
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
