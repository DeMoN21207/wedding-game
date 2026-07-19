import { describe, expect, it, vi } from "vitest";
import { PartialUploadError, uploadFailureMessage, uploadSequentially } from "./uploadBatch";

describe("uploadSequentially", () => {
  it("загружает элементы строго по порядку", async () => {
    const uploadOne = vi.fn(async (_item: string, _index: number, _total: number) => undefined);

    await expect(uploadSequentially(["a", "b", "c"], uploadOne)).resolves.toEqual(["a", "b", "c"]);

    expect(uploadOne.mock.calls.map(([item]) => item)).toEqual(["a", "b", "c"]);
  });

  it("возвращает уже принятые элементы и повторяет только остаток", async () => {
    const uploadOne = vi.fn(async (item: string) => {
      if (item === "b") {
        throw new Error("Связь оборвалась");
      }
    });

    const error = await uploadSequentially(["a", "b", "c"], uploadOne).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PartialUploadError);
    expect(error).toMatchObject({
      completedItems: ["a"],
      remainingItems: ["b", "c"],
      message: "Связь оборвалась"
    });
    expect(uploadOne).toHaveBeenCalledTimes(2);
  });

  it("показывает гостю сообщение заполненного альбома без технического текста", () => {
    const error = new Error("Спасибо за ваши фото! Альбом заполнен, новые файлы больше не принимаются.");

    expect(uploadFailureMessage(error)).toBe(
      "Спасибо за ваши фото! Альбом заполнен, новые файлы больше не принимаются."
    );
  });
});
