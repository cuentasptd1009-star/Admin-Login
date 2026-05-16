import { useCallback } from 'react';
import { tvKeyboardStore } from '@/lib/tv-keyboard-store';

interface OpenKeyboardOptions {
  value: string;
  onChange: (v: string) => void;
  onConfirm?: () => void;
  label?: string;
  maxLength?: number;
}

export function useTvKeyboard() {
  const openKeyboard = useCallback((
    el: HTMLInputElement | null,
    opts?: OpenKeyboardOptions
  ) => {
    if (opts) {
      tvKeyboardStore.open({
        value: opts.value,
        onChange: opts.onChange,
        onConfirm: opts.onConfirm ?? (() => {}),
        label: opts.label,
        maxLength: opts.maxLength,
      });
      return;
    }
    if (!el) return;
    el.blur();
    setTimeout(() => {
      el.removeAttribute('readonly');
      el.focus({ preventScroll: false });
      try { el.click(); } catch {}
    }, 50);
  }, []);

  const closeKeyboard = useCallback(() => {
    tvKeyboardStore.close();
  }, []);

  return { openKeyboard, closeKeyboard };
}
