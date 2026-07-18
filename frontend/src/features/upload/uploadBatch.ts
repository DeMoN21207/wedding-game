export class PartialUploadError<T> extends Error {
  completedItems: T[];
  remainingItems: T[];
  originalError: unknown;

  constructor(originalError: unknown, completedItems: T[], remainingItems: T[]) {
    super(originalError instanceof Error ? originalError.message : "Не удалось загрузить файл.");
    this.name = "PartialUploadError";
    this.completedItems = completedItems;
    this.remainingItems = remainingItems;
    this.originalError = originalError;
  }
}

/**
 * Загружает файлы последовательно и сохраняет точную границу частичного успеха для безопасного повтора.
 */
export async function uploadSequentially<T>(
  items: T[],
  uploadOne: (item: T, index: number, total: number) => Promise<void>
): Promise<T[]> {
  const completedItems: T[] = [];
  for (const [index, item] of items.entries()) {
    try {
      await uploadOne(item, index, items.length);
      completedItems.push(item);
    } catch (error) {
      throw new PartialUploadError(error, completedItems, items.slice(index));
    }
  }
  return completedItems;
}
