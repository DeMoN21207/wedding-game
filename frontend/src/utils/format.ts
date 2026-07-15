/**
 * Возвращает короткие инициалы для аватарки гостя.
 */
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "Г"
  );
}

/**
 * Форматирует дату для компактных подписей в интерфейсе.
 */
export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

/**
 * Форматирует процентный вклад гостя в общий альбом.
 */
export function formatPercent(value: number): string {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

/**
 * Форматирует размер файла для админских счетчиков и карточек.
 */
export function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} Б`;
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} КБ`;
  }
  return `${(value / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}
