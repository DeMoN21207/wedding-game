import { memo } from "react";
import type { AdminGuest } from "../../api/client";

type AdminGuestsTableProps = {
  guests: AdminGuest[];
};

/**
 * Таблица гостей и количества их активных/удаленных фотографий.
 */
export const AdminGuestsTable = memo(function AdminGuestsTable({ guests }: AdminGuestsTableProps) {
  return (
    <section className="admin-panel table-panel">
      <table>
        <thead>
          <tr>
            <th>Гость</th>
            <th>Фото</th>
            <th>Корзина</th>
          </tr>
        </thead>
        <tbody>
          {guests.map((guest) => (
            <tr key={guest.id}>
              <td>{guest.nickname}</td>
              <td>{guest.active_photo_count}</td>
              <td>{guest.trashed_photo_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {guests.length === 0 && <div className="empty-state">Пока нет гостей.</div>}
    </section>
  );
});
