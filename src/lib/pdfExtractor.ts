import { sanitizeSkuForPublish } from './catalogBranding';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ExtractedDoor {
  sku: string;
  color: string;
  blob: Blob;
  hasDoubleDoor: boolean;
}

const MAX_IMAGE_DIMENSION = 1200;
const MAX_IMAGE_SIZE_BYTES = 1_000_000;
const ROW_Y_TOLERANCE = 150;
const PAGE_PROCESS_TIMEOUT_MS = 45_000;
const IMAGE_FETCH_TIMEOUT_MS = 2_500;

const stripColorSuffix = (value: string) =>
  value
    .replace(/_white$/i, '')
    .replace(/_charcoal$/i, '')
    .replace(/_bronze$/i, '')
    .replace(/-white$/i, '')
    .replace(/-charcoal$/i, '')
    .replace(/-bronze$/i, '')
    .replace(/ white$/i, '')
    .replace(/ charcoal$/i, '')
    .replace(/ bronze$/i, '')
    .replace(/_w$/i, '')
    .replace(/_b$/i, '')
    .replace(/-w$/i, '')
    .replace(/-b$/i, '')
    .replace(/ w$/i, '')
    .replace(/ b$/i, '');

const pauseForUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

type ExtractedImage = { blob: Blob; x: number; y: number; width: number; height: number };

async function imageToBlob(img: any): Promise<Blob | null> {
  if (!img || !img.width || !img.height) return null;
  if (img.width > MAX_IMAGE_DIMENSION || img.height > MAX_IMAGE_DIMENSION) return null;

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
  } else if (img.data) {
    const imgData = ctx.createImageData(img.width, img.height);
    if (img.data.length === img.width * img.height * 4) {
      imgData.data.set(img.data);
    } else if (img.data.length === img.width * img.height * 3) {
      for (let j = 0, k = 0; j < img.data.length; j += 3, k += 4) {
        imgData.data[k] = img.data[j];
        imgData.data[k + 1] = img.data[j + 1];
        imgData.data[k + 2] = img.data[j + 2];
        imgData.data[k + 3] = 255;
      }
    } else {
      for (let j = 0, k = 0; j < img.data.length; j += 1, k += 4) {
        imgData.data[k] = img.data[j];
        imgData.data[k + 1] = img.data[j];
        imgData.data[k + 2] = img.data[j];
        imgData.data[k + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else {
    return null;
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob || blob.size > MAX_IMAGE_SIZE_BYTES) return null;
  return blob;
}

async function processPage(page: any): Promise<ExtractedDoor[]> {
  const [textContent, ops] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
  const textItems = textContent.items.map((item: any) => ({
    str: String(item.str || ''),
    x: item.transform?.[4] ?? 0,
    y: item.transform?.[5] ?? 0,
  }));

  const skus = textItems
    .filter((item) => item.str.startsWith('SKU: '))
    .map((item) => ({
      sku: stripColorSuffix(item.str.replace('SKU: ', '').trim()).replace(/[^a-zA-Z0-9-]/g, '').trim(),
      y: item.y,
    }));

  const colors = textItems
    .filter((item) => {
      const str = item.str.trim().toLowerCase();
      if (str.startsWith('sku:')) return false;
      return str.includes('white') || str.includes('bronze') || str.includes('charcoal') || str.includes('double door');
    })
    .map((item) => {
      const str = item.str.trim().toLowerCase();
      let colorName = 'unknown';
      if (str.includes('white')) colorName = 'White';
      else if (str.includes('bronze') || str.includes('charcoal')) colorName = 'Bronze';
      else if (str.includes('double door')) colorName = 'Double Door Display';
      return { color: colorName, x: item.x, y: item.y };
    });

  const images: ExtractedImage[] = [];
  let currentTransform = [1, 0, 0, 1, 0, 0];

  for (let i = 0; i < ops.fnArray.length; i++) {
    if (i % 500 === 0) await pauseForUi();
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];

    if (fn === pdfjsLib.OPS.transform) {
      currentTransform = args;
      continue;
    }

    if (fn !== pdfjsLib.OPS.paintImageXObject) continue;
    const imgName = args[0];

    try {
      const img = await withTimeout(
        new Promise<any>((resolve) => {
          try {
            page.objs.get(imgName, (data: any) => resolve(data));
          } catch {
            resolve(null);
          }
        }),
        IMAGE_FETCH_TIMEOUT_MS,
        null,
      );
      const blob = await imageToBlob(img);
      if (!blob) continue;
      images.push({
        blob,
        x: currentTransform[4] ?? 0,
        y: currentTransform[5] ?? 0,
        width: img.width,
        height: img.height,
      });
    } catch {
      // Ignore individual image failures to keep extraction moving.
    }
  }

  const pageDoors: ExtractedDoor[] = [];

  for (const img of images) {
    const skuObj = skus.filter((s) => s.y > img.y).sort((a, b) => a.y - b.y)[0];

    let color = 'unknown';
    const closestColor = colors
      .filter((c) => Math.abs(c.y - img.y) < ROW_Y_TOLERANCE)
      .sort((a, b) => Math.abs(a.x - img.x) - Math.abs(b.x - img.x))[0];

    if (closestColor) {
      color = closestColor.color;
    } else {
      const rowImages = images.filter((i) => Math.abs(i.y - img.y) < ROW_Y_TOLERANCE).sort((a, b) => a.x - b.x);
      const idx = rowImages.indexOf(img);
      if (idx === 0) color = 'White';
      else if (idx === 1) color = 'Bronze';
      else if (idx === 2) color = 'Double Door Display';
    }

    const rowImages = images.filter((i) => Math.abs(i.y - img.y) < ROW_Y_TOLERANCE);
    const hasDoubleDoor =
      rowImages.length >= 3 || colors.some((c) => c.color === 'Double Door Display' && Math.abs(c.y - img.y) < ROW_Y_TOLERANCE);

    if (color === 'Double Door Display' || color === 'unknown') continue;

    pageDoors.push({
      sku: sanitizeSkuForPublish(skuObj?.sku || `Unknown-${Date.now()}`),
      color: color.toLowerCase() === 'bronze' ? 'charcoal' : color.toLowerCase(),
      blob: img.blob,
      hasDoubleDoor,
    });
  }

  return pageDoors;
}

export async function extractDoorsFromPdf(file: File, onProgress: (progress: number, status: string) => void): Promise<ExtractedDoor[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    disableAutoFetch: true,
    disableStream: true,
  }).promise;

  const numPages = pdf.numPages;
  const extractedDoors: ExtractedDoor[] = [];
  let completed = 0;
  let nextPage = 1;

  const hardwareThreads = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const concurrency = Math.max(1, Math.min(4, Math.floor(hardwareThreads / 2)));

  const worker = async () => {
    while (true) {
      const pageNum = nextPage++;
      if (pageNum > numPages) return;

      try {
        onProgress((completed / numPages) * 100, `Processing page ${pageNum} of ${numPages}...`);
        const page = await pdf.getPage(pageNum);
        const pageDoors = await withTimeout(processPage(page), PAGE_PROCESS_TIMEOUT_MS, []);
        extractedDoors.push(...pageDoors);
        completed += 1;
        onProgress((completed / numPages) * 100, `Processed page ${pageNum} of ${numPages}`);
        await pauseForUi();
      } catch {
        completed += 1;
        onProgress((completed / numPages) * 100, `Skipped stuck page ${pageNum}, continuing...`);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return extractedDoors;
}
