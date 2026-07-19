import { Heart } from "lucide-react";
import { memo, type FormEvent } from "react";

type WelcomeDialogProps = {
  nickname: string;
  saving: boolean;
  error?: string | null;
  onNicknameChange: (nickname: string) => void;
  onSubmit: (event: FormEvent) => void;
};

/**
 * Первый вход гостя: собирает ник и привязывает его к локальной сессии.
 */
export const WelcomeDialog = memo(function WelcomeDialog({ nickname, saving, error = null, onNicknameChange, onSubmit }: WelcomeDialogProps) {
  return (
    <div className="welcome-backdrop">
      <form className="welcome-dialog wedding-card" role="dialog" aria-modal="true" onSubmit={onSubmit}>
        <div>
          <p className="eyebrow">Первый вход</p>
          <h2>Давай поздороваемся</h2>
          <p>Придумайте ник, и все ваши фото будут подписаны им в общем альбоме.</p>
        </div>
        <label htmlFor="guest-nickname">Ник</label>
        <input
          id="guest-nickname"
          autoComplete="nickname"
          autoFocus
          value={nickname}
          maxLength={30}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "guest-nickname-error" : undefined}
          onChange={(event) => onNicknameChange(event.target.value)}
          placeholder="Например, Маша"
        />
        {error && (
          <p className="welcome-nickname-error" id="guest-nickname-error" aria-live="polite">
            {error}
          </p>
        )}
        <button className="primary-action wedding-primary" disabled={saving || nickname.trim().length === 0}>
          <Heart size={18} />
          <span>{saving ? "Входим..." : "Войти в альбом"}</span>
        </button>
      </form>
    </div>
  );
});
