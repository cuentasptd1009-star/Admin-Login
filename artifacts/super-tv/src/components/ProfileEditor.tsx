import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Check, UserCircle2, Save, Loader2 } from 'lucide-react';
import { useTvKeyboard } from '@/hooks/use-tv-keyboard';

interface Avatar {
  id: number;
  imageUrl: string;
  name?: string | null;
}

interface SessionInfo {
  displayName?: string | null;
  codeName?: string | null;
  avatarId?: number | null;
  avatarUrl?: string | null;
}

interface ProfileEditorProps {
  session: SessionInfo | null;
  avatars: Avatar[];
  onClose: () => void;
  onSave: (name: string, avatarId: number | null) => Promise<void>;
}

type ProfileZone = 'name' | 'avatars' | 'actions';
const COLS = 4;

export function ProfileEditor({ session, avatars, onClose, onSave }: ProfileEditorProps) {
  const [name, setName] = useState(session?.displayName ?? '');
  const [selectedAvatarId, setSelectedAvatarId] = useState<number | null>(session?.avatarId ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState<ProfileZone>('name');
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [actionIndex, setActionIndex] = useState(1);
  const nameRef = useRef<HTMLInputElement>(null);
  const { openKeyboard } = useTvKeyboard();

  const allAvatars = [null, ...avatars];

  useEffect(() => {
    const idx = allAvatars.findIndex(av => (av?.id ?? null) === selectedAvatarId);
    if (idx >= 0) setAvatarIndex(idx);
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name, selectedAvatarId);
    } catch {
      setError('No se pudo guardar el perfil. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }, [saving, onSave, name, selectedAvatarId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (zone === 'name') {
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            openKeyboard(nameRef.current, {
              value: name,
              onChange: (v) => setName(v),
              label: 'Nombre para mostrar',
            });
            break;
          case 'ArrowDown':
            e.preventDefault();
            setZone('avatars');
            break;
          case 'ArrowUp':
            e.preventDefault();
            setZone('actions');
            break;
        }
      } else if (zone === 'avatars') {
        switch (e.key) {
          case 'ArrowRight':
            e.preventDefault();
            setAvatarIndex(p => Math.min(p + 1, allAvatars.length - 1));
            break;
          case 'ArrowLeft':
            e.preventDefault();
            setAvatarIndex(p => Math.max(p - 1, 0));
            break;
          case 'ArrowDown':
            e.preventDefault();
            if (avatarIndex + COLS < allAvatars.length) {
              setAvatarIndex(p => p + COLS);
            } else {
              setZone('actions');
              setActionIndex(1);
            }
            break;
          case 'ArrowUp':
            e.preventDefault();
            if (avatarIndex - COLS >= 0) {
              setAvatarIndex(p => p - COLS);
            } else {
              setZone('name');
            }
            break;
          case 'Enter': {
            e.preventDefault();
            const av = allAvatars[avatarIndex];
            setSelectedAvatarId(av?.id ?? null);
            break;
          }
        }
      } else if (zone === 'actions') {
        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault();
            setActionIndex(0);
            break;
          case 'ArrowRight':
            e.preventDefault();
            setActionIndex(1);
            break;
          case 'ArrowUp':
            e.preventDefault();
            setZone('avatars');
            break;
          case 'ArrowDown':
            e.preventDefault();
            setZone('name');
            break;
          case 'Enter':
            e.preventDefault();
            if (actionIndex === 0) onClose();
            else handleSave();
            break;
          case 'Backspace':
            e.preventDefault();
            onClose();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zone, avatarIndex, actionIndex, name, onClose, allAvatars, handleSave, openKeyboard]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Mi Perfil</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block font-medium">
            Nombre para mostrar
          </label>
          <div
            className={`relative rounded-md transition-all ${zone === 'name' ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
          >
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={session?.codeName ?? 'Tu nombre'}
              readOnly
              onClick={() => {
                setZone('name');
                openKeyboard(nameRef.current, {
                  value: name,
                  onChange: (v) => setName(v),
                  label: 'Nombre para mostrar',
                });
              }}
              className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm cursor-pointer focus:outline-none"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
              {zone === 'name' ? '↵ Editar' : ''}
            </span>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-2 block font-medium">
            Foto de perfil
          </label>
          {avatars.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No hay avatares disponibles aún.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto pr-1 p-2 rounded-xl bg-muted/10 border border-border/40">
              {allAvatars.map((av, idx) => {
                const isSelected = selectedAvatarId === (av?.id ?? null);
                const isFocused = zone === 'avatars' && avatarIndex === idx;
                return (
                  <button
                    key={av?.id ?? 'default'}
                    type="button"
                    onClick={() => { setZone('avatars'); setAvatarIndex(idx); setSelectedAvatarId(av?.id ?? null); }}
                    title={av?.name ?? 'Sin avatar'}
                    className={`aspect-square rounded-full flex items-center justify-center border-2 transition-all duration-200 relative overflow-hidden hover:scale-105 focus:outline-none ${
                      isFocused
                        ? 'ring-4 ring-primary ring-offset-1 ring-offset-background scale-110 border-primary'
                        : isSelected
                          ? 'border-primary ring-2 ring-primary/40 scale-105'
                          : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {av ? (
                      <>
                        <img
                          src={av.imageUrl}
                          alt={av.name ?? 'Avatar'}
                          className="w-full h-full object-cover pointer-events-none"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-primary/30 flex items-center justify-center rounded-full">
                            <Check className="w-4 h-4 text-white drop-shadow" />
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <UserCircle2 className="w-8 h-8 text-muted-foreground" />
                        {isSelected && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center rounded-full">
                            <Check className="w-4 h-4 text-white drop-shadow" />
                          </div>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-destructive text-center">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
              zone === 'actions' && actionIndex === 0
                ? 'border-primary ring-2 ring-primary text-foreground bg-muted'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-60 flex items-center justify-center gap-2 ${
              zone === 'actions' && actionIndex === 1
                ? 'ring-4 ring-white scale-105'
                : ''
            }`}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
            ) : (
              <><Save className="w-4 h-4" /> Guardar</>
            )}
          </button>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/50">
          ▲▼◄► Navegar · Enter Seleccionar · Esc Cerrar
        </p>
      </div>
    </div>
  );
}
