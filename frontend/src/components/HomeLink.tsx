import { House } from "lucide-react";
import { memo } from "react";
import { Link } from "react-router-dom";

type HomeLinkProps = {
  className?: string;
};

/** Возвращает пользователя на главную страницу альбома из любого внутреннего раздела. */
export const HomeLink = memo(function HomeLink({ className = "" }: HomeLinkProps) {
  return (
    <Link
      className={`home-link ${className}`.trim()}
      to="/"
      title="Вернуться на главную"
      aria-label="Вернуться на главную"
    >
      <House size={18} aria-hidden="true" />
      <span className="home-link-label">На главную</span>
    </Link>
  );
});
