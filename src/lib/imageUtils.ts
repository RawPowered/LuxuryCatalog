export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export const base64ToBlob = async (base64Data: string, mimeType: string) => {
  const res = await fetch(`data:${mimeType};base64,${base64Data}`);
  return res.blob();
};
