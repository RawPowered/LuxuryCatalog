export type DoubleDoorConfig = { overlapRatio: number; flipLeft: boolean; flipRight: boolean };

export const createDoubleDoorDataUrl = async (
  blob: Blob,
  maxWidth: number,
  maxHeight: number,
  config?: DoubleDoorConfig,
): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!blob || !(blob instanceof Blob)) return resolve('');
    const img = new Image();
    img.onload = () => {
      let singleWidth = img.width;
      let height = img.height;

      const overlapRatio = config?.overlapRatio ?? 0.18;
      const flipLeft = config?.flipLeft ?? false;
      const flipRight = config?.flipRight ?? true;

      const overlapX = singleWidth * overlapRatio;
      const totalWidth = singleWidth * 2 - overlapX;

      if (totalWidth > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / totalWidth, maxHeight / height);
        singleWidth *= ratio;
        height *= ratio;
      }

      const finalOverlapX = singleWidth * overlapRatio;
      const finalTotalWidth = singleWidth * 2 - finalOverlapX;

      const canvas = document.createElement('canvas');
      canvas.width = finalTotalWidth;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('No context');

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      if (flipLeft) {
        ctx.translate(singleWidth, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(img, 0, 0, singleWidth, height);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      if (flipRight) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, singleWidth, height);
      } else {
        ctx.translate(singleWidth - finalOverlapX, 0);
        ctx.drawImage(img, 0, 0, singleWidth, height);
      }
      ctx.restore();

      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });

export const autoCropWhiteBackground = async (blob: Blob): Promise<Blob> =>
  new Promise((resolve) => {
    if (!blob || !(blob instanceof Blob)) return resolve(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(blob);
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = 0;
      let maxY = 0;
      const threshold = 250;

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a > 0 && (r < threshold || g < threshold || b < threshold)) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      const padding = 10;
      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(canvas.width - 1, maxX + padding);
      maxY = Math.min(canvas.height - 1, maxY + padding);

      const cropWidth = maxX - minX + 1;
      const cropHeight = maxY - minY + 1;

      if (cropWidth <= 0 || cropHeight <= 0 || (cropWidth === canvas.width && cropHeight === canvas.height)) {
        return resolve(blob);
      }

      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = cropWidth;
      croppedCanvas.height = cropHeight;
      const croppedCtx = croppedCanvas.getContext('2d');
      if (!croppedCtx) return resolve(blob);

      croppedCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      croppedCanvas.toBlob((newBlob) => resolve(newBlob || blob), blob.type || 'image/png');
    };
    img.onerror = () => resolve(blob);
    img.src = URL.createObjectURL(blob);
  });

export const resizeImageBlob = async (blob: Blob, maxWidth: number, maxHeight: number): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!blob || !(blob instanceof Blob)) return resolve('');
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('No context');

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
