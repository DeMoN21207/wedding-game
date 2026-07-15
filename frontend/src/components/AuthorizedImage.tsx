import { memo, useEffect, useState } from "react";
import { fetchAuthorizedBlob } from "../api/client";

type Props = {
  src: string | null;
  alt: string;
  className?: string;
};

export const AuthorizedImage = memo(function AuthorizedImage({ src, alt, className }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let currentUrl: string | null = null;
    setObjectUrl(null);
    setFailed(false);

    if (!src) {
      setFailed(true);
      return;
    }

    fetchAuthorizedBlob(src)
      .then((url) => {
        currentUrl = url;
        if (isMounted) {
          setObjectUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      })
      .catch(() => {
        if (isMounted) {
          setFailed(true);
        }
      });

    return () => {
      isMounted = false;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [src]);

  if (failed) {
    return <div className={`image-placeholder ${className ?? ""}`}>Фото</div>;
  }

  if (!objectUrl) {
    return <div className={`image-placeholder ${className ?? ""}`}>...</div>;
  }

  return <img className={className} src={objectUrl} alt={alt} loading="lazy" decoding="async" />;
});
