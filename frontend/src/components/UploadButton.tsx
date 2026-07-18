import { Camera, CloudUpload, Download, ImagePlus, RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { RequestError, uploadPhoto } from "../api/client";
import { appConfig } from "../config/appConfig";
import { PartialUploadError, uploadSequentially } from "../features/upload/uploadBatch";

type Props = {
  onUploaded: () => void;
  autoOpenCamera?: boolean;
  label?: string;
  variant?: "compact" | "hero";
};

type LocalCopy = {
  file: File;
  objectUrl: string;
};

export const UploadButton = memo(function UploadButton({ onUploaded, autoOpenCamera = false, label = "Открыть камеру", variant = "compact" }: Props) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const autoOpenAttemptedRef = useRef(false);
  const uploadingRef = useRef(false);
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const [localCopy, setLocalCopy] = useState<LocalCopy | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localCopy) {
        URL.revokeObjectURL(localCopy.objectUrl);
      }
    };
  }, [localCopy]);

  const resetInputs = useCallback(() => {
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
    if (libraryInputRef.current) {
      libraryInputRef.current.value = "";
    }
  }, []);

  const rememberLocalCopy = useCallback((file: File) => {
    setLocalCopy((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous.objectUrl);
      }
      return {
        file,
        objectUrl: URL.createObjectURL(file)
      };
    });
  }, []);

  const startUpload = useCallback(async (nextInput: File | File[]) => {
    if (uploadingRef.current) {
      return;
    }

    const files = Array.isArray(nextInput) ? nextInput : [nextInput];
    const selectedFiles = files.filter(Boolean);
    if (selectedFiles.length === 0) {
      return;
    }

    const oversizedFile = selectedFiles.find((selectedFile) => selectedFile.size > appConfig.uploadLimitBytes);
    if (oversizedFile) {
      setError(`"${oversizedFile.name || "Файл"}" больше ${appConfig.uploadLimitMb} МБ.`);
      setRetryFiles([]);
      resetInputs();
      return;
    }

    setRetryFiles(selectedFiles);
    setSuccessMessage(null);
    setError(null);
    setProgress(0);
    uploadingRef.current = true;
    setIsUploading(true);
    try {
      const completedFiles = await uploadSequentially(selectedFiles, async (nextFile, index, total) => {
        setUploadStatus(total > 1 ? `Загружаем ${index + 1} из ${total}` : "Загружаем файл");
        await uploadPhoto(nextFile, (nextProgress) => {
          const totalProgress = Math.round(((index + nextProgress / 100) / total) * 100);
          setProgress(totalProgress);
        });
      });

      rememberLocalCopy(completedFiles[completedFiles.length - 1]);
      setProgress(null);
      setUploadStatus(null);
      setSuccessMessage(selectedFiles.length > 1 ? `Загружено ${selectedFiles.length} файлов` : "Загружено");
      setRetryFiles([]);
      resetInputs();
      onUploaded();
    } catch (err) {
      setProgress(null);
      setUploadStatus(null);
      if (err instanceof PartialUploadError) {
        const completedFiles = err.completedItems as File[];
        const remainingFiles = err.remainingItems as File[];
        setRetryFiles(remainingFiles);
        if (completedFiles.length > 0) {
          rememberLocalCopy(completedFiles[completedFiles.length - 1]);
          setSuccessMessage(`Загружено ${completedFiles.length} из ${selectedFiles.length}`);
          resetInputs();
          onUploaded();
        }
      }
      setError(err instanceof RequestError || err instanceof Error ? err.message : "Не удалось загрузить файл.");
    } finally {
      uploadingRef.current = false;
      setIsUploading(false);
    }
  }, [onUploaded, rememberLocalCopy, resetInputs]);

  const saveLocalCopy = useCallback(async () => {
    if (!localCopy) {
      return;
    }

    setError(null);
    const shareData = {
      files: [localCopy.file],
      title: appConfig.shareTitle
    };

    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
    }

    const link = document.createElement("a");
    link.href = localCopy.objectUrl;
    link.download = localCopy.file.name || "wedding-media";
    document.body.append(link);
    link.click();
    link.remove();
  }, [localCopy]);

  const openCameraInput = useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  useEffect(() => {
    if (!autoOpenCamera || autoOpenAttemptedRef.current || isUploading) {
      return;
    }

    autoOpenAttemptedRef.current = true;
    const timer = window.setTimeout(() => {
      openCameraInput();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [autoOpenCamera, isUploading, openCameraInput]);

  const openLibraryInput = useCallback(() => {
    libraryInputRef.current?.click();
  }, []);

  const handleCameraChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) {
      void startUpload(selected);
    }
  }, [startUpload]);

  const handleLibraryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length > 0) {
      void startUpload(selected);
    }
  }, [startUpload]);

  const retryUpload = useCallback(() => {
    void startUpload(retryFiles);
  }, [retryFiles, startUpload]);

  const saveCopy = useCallback(() => {
    void saveLocalCopy();
  }, [saveLocalCopy]);

  const inputs = (
    <>
      <input
        ref={cameraInputRef}
        className="hidden-file-input"
        type="file"
        accept="image/*,video/*"
        capture="environment"
        disabled={isUploading}
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleCameraChange}
      />
      <input
        ref={libraryInputRef}
        className="hidden-file-input"
        type="file"
        accept="image/*,video/*"
        multiple
        disabled={isUploading}
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleLibraryChange}
      />
    </>
  );

  const feedback = (
    <>
      {progress !== null && (
        <>
          {uploadStatus && <div className="upload-status">{uploadStatus}</div>}
          <div className="progress-wrap" aria-label={`Загрузка ${progress}%`}>
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </>
      )}
      {localCopy && progress === null && (
        <div className="upload-saved-row" role="status">
          <span>{successMessage ?? "Загружено"}</span>
          <button className="icon-text-button" title="Сохранить себе" onClick={saveCopy}>
            <Download size={16} />
            <span>Сохранить себе</span>
          </button>
        </div>
      )}
      {error && (
        <div className="inline-error">
          <span>{error}</span>
          {retryFiles.length > 0 && (
            <button className="icon-text-button" title="Повторить" onClick={retryUpload}>
              <RefreshCw size={16} />
              <span>Повторить</span>
            </button>
          )}
        </div>
      )}
    </>
  );

  if (variant === "hero") {
    return (
      <section className="upload-panel upload-panel-hero">
        {inputs}
        <div className="hero-upload-grid">
          <div className="hero-upload-side hero-upload-camera">
            <div className="hero-action-icon hero-action-icon-gold" aria-hidden="true">
              <Camera size={74} strokeWidth={2.15} />
            </div>
            <h2>Сделать фото/видео</h2>
            <p>Снять момент и сразу добавить в альбом</p>
            <button className="hero-action-button hero-action-button-gold" title="Открыть камеру" disabled={isUploading} onClick={openCameraInput}>
              <span>Открыть камеру</span>
            </button>
            <small>Можно снять прямо сейчас</small>
          </div>
          <div className="hero-upload-side hero-upload-library">
            <div className="hero-action-icon hero-action-icon-red" aria-hidden="true">
              <CloudUpload size={74} strokeWidth={2.15} />
            </div>
            <h2>Загрузить фото/видео</h2>
            <p>Быстро добавить файлы в альбом</p>
            <button className="hero-action-button hero-action-button-red" title="Выбрать фото или видео" disabled={isUploading} onClick={openLibraryInput}>
              <span>Выбрать с устройства</span>
            </button>
            <small>Можно выбрать сразу несколько файлов</small>
          </div>
        </div>
        <div className="hero-upload-feedback">{feedback}</div>
      </section>
    );
  }

  return (
    <section className="upload-panel">
      {inputs}
      <div className="upload-choice-row">
        <button className="primary-action" title="Открыть камеру" disabled={isUploading} onClick={openCameraInput}>
          <Camera size={28} strokeWidth={2.25} />
          <span className="upload-label-full">{label}</span>
          <span className="upload-label-short">Камера</span>
        </button>
        <button className="icon-text-button upload-library-button" title="Загрузить фото или видео" disabled={isUploading} onClick={openLibraryInput}>
          <ImagePlus size={26} strokeWidth={2.25} />
          <span className="upload-label-full">Загрузить фото/видео</span>
          <span className="upload-label-short">Загрузить</span>
        </button>
      </div>
      {feedback}
    </section>
  );
});
