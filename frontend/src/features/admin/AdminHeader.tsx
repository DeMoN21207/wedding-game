import { Camera, LogOut } from "lucide-react";
import { memo } from "react";

type AdminHeaderProps = {
  onLogout: () => void;
};

/**
 * Верхняя панель админки с выходом из режима управления.
 */
export const AdminHeader = memo(function AdminHeader({ onLogout }: AdminHeaderProps) {
  return (
    <header className="admin-header">
      <div className="admin-title-block">
        <span className="admin-title-mark" aria-hidden="true">
          <Camera size={20} />
        </span>
        <div>
          <p className="eyebrow">Wedding ops</p>
          <h1>Медиатека</h1>
        </div>
      </div>
      <button className="icon-button" title="Выйти" onClick={onLogout}>
        <LogOut size={18} />
      </button>
    </header>
  );
});
