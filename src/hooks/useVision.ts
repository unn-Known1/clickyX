import { useState, useCallback } from "react";

interface AttachedImage {
  data: string;
  mediaType: string;
  previewUrl: string;
}

export function useVision() {
  const [images, setImages] = useState<AttachedImage[]>([]);

  const addImage = useCallback(
    (base64Data: string, mediaType: string = "image/png") => {
      const dataUrl = `data:${mediaType};base64,${base64Data}`;
      setImages((prev) => [
        ...prev,
        {
          data: dataUrl,
          mediaType,
          previewUrl: dataUrl,
        },
      ]);
    },
    [],
  );

  const addImageFromDataUrl = useCallback((dataUrl: string) => {
    const mediaType =
      dataUrl.match(/^data:(image\/\w+);/)?.[1] || "image/png";
    setImages((prev) => [
      ...prev,
      { data: dataUrl, mediaType, previewUrl: dataUrl },
    ]);
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearImages = useCallback(() => {
    setImages([]);
  }, []);

  const getImageDataUrls = useCallback((): string[] => {
    return images.map((img) => img.data);
  }, [images]);

  return {
    images,
    addImage,
    addImageFromDataUrl,
    removeImage,
    clearImages,
    getImageDataUrls,
  };
}
