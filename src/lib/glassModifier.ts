export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r, g, b;
  h /= 360;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export const unifyGlassColor = async (imageBlob: Blob, targetHue = 195, targetSat = 0.15): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    if (!imageBlob || !(imageBlob instanceof Blob)) return resolve(imageBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageBlob);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        const [h, s, l] = rgbToHsl(r, g, b);
        
        // Detect glass: Hue between 130 (greenish) and 260 (bluish)
        // To prevent affecting white doors, we need to be stricter.
        // White doors might have shadows that are slightly blue, but they are usually very light or very desaturated.
        // Let's increase the saturation threshold and maybe check lightness.
        // Glass is usually not extremely bright white (l > 0.95) or extremely dark (l < 0.1).
        if (s > 0.10 && h > 130 && h < 260 && l > 0.2 && l < 0.95) {
          // Keep original lightness to preserve photorealistic shadows/highlights
          // Just gently tint it to the target hue and saturation
          const [newR, newG, newB] = hslToRgb(targetHue, targetSat, l);
          
          // Blend factor based on saturation to avoid hard edges
          const blendFactor = Math.min(0.85, (s - 0.10) / 0.1);
          
          data[i] = Math.max(0, Math.min(255, Math.round(r * (1 - blendFactor) + newR * blendFactor)));
          data[i + 1] = Math.max(0, Math.min(255, Math.round(g * (1 - blendFactor) + newG * blendFactor)));
          data[i + 2] = Math.max(0, Math.min(255, Math.round(b * (1 - blendFactor) + newB * blendFactor)));
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else resolve(imageBlob);
      }, imageBlob.type || 'image/png');
    };
    img.onerror = () => resolve(imageBlob);
    img.src = (imageBlob && imageBlob instanceof Blob) ? URL.createObjectURL(imageBlob) : '';
  });
};
