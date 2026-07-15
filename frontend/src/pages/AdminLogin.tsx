import { Lock } from "lucide-react";
import { memo, useCallback, useState, type ChangeEvent, type FormEvent } from "react";
import { loginAdmin, RequestError } from "../api/client";

type Props = {
  onLoggedIn: () => void;
};

export const AdminLogin = memo(function AdminLogin({ onLoggedIn }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await loginAdmin(password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof RequestError || err instanceof Error ? err.message : "Не удалось войти.");
    } finally {
      setLoading(false);
    }
  }, [onLoggedIn, password]);

  const handlePasswordChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
  }, []);

  return (
    <main className="admin-login">
      <form className="entry-form" onSubmit={submit}>
        <div className="entry-mark compact">
          <Lock size={28} />
          <h1>Админка</h1>
        </div>
        <label htmlFor="admin-password">Пароль</label>
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={handlePasswordChange}
        />
        {error && <p className="form-error">{error}</p>}
        <button className="primary-action" disabled={loading || password.length === 0}>
          {loading ? "..." : "Войти"}
        </button>
      </form>
    </main>
  );
});
