import { Camera, LogOut } from "lucide-react";
import { memo } from "react";
import { HomeLink } from "../../components/HomeLink";

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
      <div className="admin-header-actions">
        <HomeLink />
        <button className="icon-button" title="Выйти" aria-label="Выйти" onClick={onLogout}>
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
});
