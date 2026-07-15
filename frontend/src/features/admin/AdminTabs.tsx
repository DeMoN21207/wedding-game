import { Images, LayoutDashboard, Trash2, Users } from "lucide-react";
import { memo, type ReactNode } from "react";

export type AdminTab = "qr" | "guests" | "active" | "trashed";

type AdminTabsProps = {
  tab: AdminTab;
  onChange: (tab: AdminTab) => void;
};

/**
 * Переключатель основных разделов админки.
 */
export const AdminTabs = memo(function AdminTabs({ tab, onChange }: AdminTabsProps) {
  return (
    <nav className="admin-tabs" aria-label="Админ-разделы">
      <TabButton active={tab === "qr"} onClick={() => onChange("qr")} icon={<LayoutDashboard size={18} />} label="Обзор" />
      <TabButton active={tab === "guests"} onClick={() => onChange("guests")} icon={<Users size={18} />} label="Гости" />
      <TabButton active={tab === "active"} onClick={() => onChange("active")} icon={<Images size={18} />} label="Медиа" />
      <TabButton active={tab === "trashed"} onClick={() => onChange("trashed")} icon={<Trash2 size={18} />} label="Корзина" />
    </nav>
  );
});

const TabButton = memo(function TabButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "tab active" : "tab"} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
});
