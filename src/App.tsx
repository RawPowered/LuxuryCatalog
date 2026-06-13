import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Image as ImageIcon, Download, Trash2, Plus, Loader2, Settings2, Palette, Layers, Play, Pause, CheckCircle2, XCircle, Clock, Archive, RefreshCw, Paintbrush, FileText, ChevronUp, ChevronDown, Sparkles, ArrowDownAZ, GripVertical, ArrowUpToLine, ArrowDownToLine, Link, ShoppingCart, Droplets, Wrench, Wand2 } from 'lucide-react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { getDB } from './lib/db';
import { getBaseSku, normalizeFileName, detectColorFromFileName } from './lib/sku';
import { blobToBase64, base64ToBlob } from './lib/imageUtils';
import {
  getGeminiClient,
  GEMINI_TEXT_MODEL,
  imageModelForTier,
  doorImageConfig,
  extractInlineImage,
  wooContentSchema,
} from './lib/gemini';
import {
  createDoubleDoorDataUrl,
  autoCropWhiteBackground,
  resizeImageBlob,
} from './lib/pdfImageUtils';
import {
  COMPANY_NAME,
  CATALOG_TITLE,
  CATALOG_FILENAME,
  CONTACT_LINE,
  FOOTER_TEXT,
  sanitizeSkuForPublish,
} from './lib/catalogBranding';
import { unifyGlassColor } from './lib/glassModifier';
import { QueueItemCard, QueueItemUI } from './components/QueueItemCard';

// --- API Key Check Component ---
function ApiKeyCheck({ children }: { children: React.ReactNode }) {
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      if (window.aistudio && window.aistudio.hasSelectedApiKey) {
        // @ts-ignore
        const has = await window.aistudio.hasSelectedApiKey();
        setHasKey(has);
      } else {
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    // @ts-ignore
    if (window.aistudio && window.aistudio.openSelectKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setHasKey(true);
    }
  };

  if (!hasKey) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#f5f5f5] text-[#1a1a1a] p-6 font-sans">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-center border border-gray-100">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Settings2 className="w-8 h-8 text-gray-600" />
          </div>
          <h1 className="text-2xl font-semibold mb-3 tracking-tight">AI Rendering Services</h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            This app uses AI to generate luxury door renders and magazine content. 
            <strong> You can still use all other features (CSV, ZIP, standard PDF) without an API key.</strong>
          </p>
          <div className="space-y-3">
            <button 
              onClick={handleSelectKey}
              className="w-full px-4 py-3 bg-[#1a1a1a] text-white rounded-xl font-medium hover:bg-black transition-colors shadow-sm"
            >
              Select API Key for AI Features
            </button>
            <button 
              onClick={() => setHasKey(true)}
              className="w-full px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              Continue to App (Skip AI)
            </button>
          </div>
          <p className="mt-6 text-xs text-gray-400">
            You can always add an API key later from the settings menu.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

import { PdfExtractorModal } from './components/PdfExtractorModal';
import { ExtractedDoor } from './lib/pdfExtractor';
import { ColorSyncPlugin } from './components/ColorSyncPlugin';

// --- Main App Component ---
function DoorCatalogMaker() {
  const [queue, setQueue] = useState<QueueItemUI[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalColor, setGlobalColor] = useState<'white' | 'charcoal' | 'both'>('both');
  const [globalAiModel, setGlobalAiModel] = useState<'pro' | 'free'>('pro');
  const [applyColorUnification, setApplyColorUnification] = useState(true);
  const [polishFocusFooter, setPolishFocusFooter] = useState(true);
  const [isZipping, setIsZipping] = useState(false);
  const [isExportingWoo, setIsExportingWoo] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [renamingSku, setRenamingSku] = useState<{ oldSku: string, newSku: string } | null>(null);
  const [linkingSku, setLinkingSku] = useState<string | null>(null);
  const [unusedBlobs, setUnusedBlobs] = useState<QueueItemUI[]>([]);
  const [pdfModal, setPdfModal] = useState<{
    isOpen: boolean;
    skus: string[];
    skuGroups: Record<string, any[]>;
    progress: number;
    currentSku: string;
    isGenerating: boolean;
    isSorting: boolean;
    selectedSkus: string[];
    includeStandardSizes: boolean;
    autoCropDoors: boolean;
    frostedGlass: boolean;
    aiModel: 'pro' | 'free';
    includeAICovers: boolean;
    spreads: Record<number, { targetSku?: string; imageUrl?: string; isGenerating?: boolean }>;
    covers: {
      front?: { targetSku?: string; imageUrl?: string; isGenerating?: boolean; overlayImageUrl?: string; isGeneratingOverlay?: boolean; isDoubleDoor?: boolean };
      back?: { targetSku?: string; imageUrl?: string; isGenerating?: boolean; overlayImageUrl?: string; isGeneratingOverlay?: boolean; isDoubleDoor?: boolean };
    };
    doubleDoorConfigs: Record<string, {
      overlapRatio: number;
      flipLeft: boolean;
      flipRight: boolean;
    }>;
    expandedDoubleDoorSku: string | null;
  } | null>(null);
  
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    draggedSkus: string[];
    dragOverIndex: number | null;
  }>({ isDragging: false, draggedSkus: [], dragOverIndex: null });
  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{type: 'clear' | 'reset' | 'polish' | 'glassTune', message: string} | null>(null);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [guideModal, setGuideModal] = useState<{ isOpen: boolean; itemId: string; fileName: string; type: 'structuralFix' | 'reshape' } | null>(null);
  const [isExtractorModalOpen, setIsExtractorModalOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef(isProcessing);
  const queueRef = useRef(queue);
  const applyColorUnificationRef = useRef(applyColorUnification);
  const polishFocusFooterRef = useRef(polishFocusFooter);

  // Keep refs synced with state for the async processing loop
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    applyColorUnificationRef.current = applyColorUnification;
  }, [applyColorUnification]);

  useEffect(() => {
    polishFocusFooterRef.current = polishFocusFooter;
  }, [polishFocusFooter]);

  // Load initial state from IndexedDB
  useEffect(() => {
    const loadDB = async () => {
      const db = await getDB();
      const allItems = await db.getAll('queue');
      
      let needsUpdate = false;
      const tx = db.transaction('queue', 'readwrite');
      
      const uiItems: QueueItemUI[] = allItems.map(item => {
        const normalizedName = normalizeFileName(item.fileName);
        let sku = item.sku;
        if (!sku) {
          sku = getBaseSku(normalizedName);
          needsUpdate = true;
          tx.store.put({ ...item, fileName: normalizedName, sku });
        } else if (normalizedName !== item.fileName) {
          needsUpdate = true;
          tx.store.put({ ...item, fileName: normalizedName });
        }
        
        return {
          id: item.id,
          originalUrl: (item.fileBlob && item.fileBlob instanceof Blob) ? URL.createObjectURL(item.fileBlob) : '',
          fileName: normalizedName,
          sku,
          status: item.status === 'processing' ? 'pending' : item.status, // Reset stuck processing items
          resultUrl: (item.resultBlob && item.resultBlob instanceof Blob) ? URL.createObjectURL(item.resultBlob) : undefined,
          color: item.color,
          hideDoubleDoor: item.hideDoubleDoor || false,
          error: item.error,
          colorUnified: item.colorUnified || false,
          skipColorCheck: item.skipColorCheck || false,
          highContrastMode: item.highContrastMode || false,
          isRepaint: item.isRepaint || false,
          isPolish: item.isPolish || false,
          isGlassTune: item.isGlassTune || false
        };
      });
      
      if (needsUpdate) {
        await tx.done;
      }
      
      // Sort by fileName (numeric sort) to keep SKUs in order
      uiItems.sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' }));
      setQueue(uiItems);
    };
    loadDB();
  }, []);

  // Handle file uploads
  const processFiles = async (files: FileList | File[]) => {
    setIsAddingFiles(true);
    try {
      const db = await getDB();
      const newItems: QueueItemUI[] = [];
      
      const tx = db.transaction('queue', 'readwrite');
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        
        const detectedColor = detectColorFromFileName(file.name);
        const colorsToAdd = detectedColor 
          ? [detectedColor] 
          : (globalColor === 'both' ? ['white', 'charcoal'] as const : [globalColor]);
        
        const normalizedName = normalizeFileName(file.name);
        
        for (const color of colorsToAdd) {
          const id = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9) + '-' + i + '-' + color;
          
          // Automatically enable repaint if we are generating a color that wasn't explicitly detected in the filename.
          // This is crucial when generating 'both' from a single base image (which is usually white).
          const isRepaint = !detectedColor && color === 'charcoal';

          const sku = getBaseSku(normalizedName);

          tx.store.put({
            id,
            fileBlob: file,
            fileName: normalizedName,
            sku,
            status: 'pending',
            color: color,
            hideDoubleDoor: false,
            highContrastMode: false,
            isRepaint,
            isPolish: false,
            isGlassTune: false,
            isStructuralFix: false
          });
          
          newItems.push({
            id,
            originalUrl: (file && file instanceof Blob) ? URL.createObjectURL(file) : '',
            fileName: normalizedName,
            sku,
            status: 'pending',
            color: color,
            hideDoubleDoor: false,
            highContrastMode: false,
            isRepaint,
            isPolish: false,
            isGlassTune: false,
            isStructuralFix: false,
            colorUnified: false,
            skipColorCheck: false
          });
        }
      }
      
      await tx.done;
      setQueue(prev => [...prev, ...newItems].sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' })));
    } catch (err) {
      console.error("Error adding files:", err);
      setErrorAlert("There was an error adding your files. Please try again.");
    } finally {
      setIsAddingFiles(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const traverseFileTree = (item: any, files: File[]): Promise<void> => {
    return new Promise((resolve) => {
      if (item.isFile) {
        item.file((file: File) => {
          files.push(file);
          resolve();
        });
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const entries: any[] = [];
        const readEntries = () => {
          dirReader.readEntries((results: any[]) => {
            if (!results.length) {
              Promise.all(entries.map(e => traverseFileTree(e, files))).then(() => resolve());
            } else {
              entries.push(...results);
              readEntries();
            }
          }, () => resolve());
        };
        readEntries();
      } else {
        resolve();
      }
    });
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsAddingFiles(true);
    try {
      if (e.dataTransfer.items) {
        const files: File[] = [];
        const promises: Promise<void>[] = [];
        for (let i = 0; i < e.dataTransfer.items.length; i++) {
          const item = e.dataTransfer.items[i];
          if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry();
            if (entry) {
              promises.push(traverseFileTree(entry, files));
            }
          }
        }
        await Promise.all(promises);
        if (files.length > 0) {
          await processFiles(files);
        }
      } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await processFiles(e.dataTransfer.files);
      }
    } catch (err) {
      console.error("Error processing dropped files:", err);
    } finally {
      setIsAddingFiles(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Update a single item in state and IDB
  const updateQueueItem = async (id: string, updates: Partial<QueueItemUI>, dbUpdates?: any) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    
    if (dbUpdates) {
      const db = await getDB();
      const item = await db.get('queue', id);
      if (item) {
        await db.put('queue', { ...item, ...dbUpdates });
      }
    }
  };

  // Core Processing Loop
  const processNextInQueue = useCallback(async () => {
    if (!isProcessingRef.current) return;

    const currentQueue = queueRef.current;
    let targetItem = currentQueue.find(item => item.status === 'pending');
    let isRecheckingColor = false;
    
    if (!targetItem && applyColorUnificationRef.current) {
      targetItem = currentQueue.find(item => 
        item.status === 'completed' && 
        !item.colorUnified && 
        !item.skipColorCheck &&
        item.resultUrl // Ensure it has a result to process
      );
      if (targetItem) {
        isRecheckingColor = true;
      }
    }

    if (!targetItem) {
      setIsProcessing(false);
      return;
    }

    // Mark as processing
    await updateQueueItem(targetItem.id, { status: 'processing', error: undefined }, { status: 'processing', error: undefined });

    try {
      const db = await getDB();
      const dbItem = await db.get('queue', targetItem.id);
      if (!dbItem) throw new Error("Item not found in database");

      if (isRecheckingColor && dbItem.resultBlob) {
        // Just apply color unification to the existing result
        const unifiedBlob = await unifyGlassColor(dbItem.resultBlob);
        const resultUrl = (unifiedBlob && unifiedBlob instanceof Blob) ? URL.createObjectURL(unifiedBlob) : undefined;
        
        await updateQueueItem(
          targetItem.id, 
          { status: 'completed', resultUrl, colorUnified: true, isRepaint: false, isPolish: false, isGlassTune: false, isStructuralFix: false }, 
          { status: 'completed', resultBlob: unifiedBlob, colorUnified: true, isRepaint: false, isPolish: false, isGlassTune: false, isStructuralFix: false }
        );
      } else {
        // Normal AI generation
        const ai = getGeminiClient();
        
        // NEW LOGIC: Check for alternative color reference to ensure structural uniformity
        let referenceBlob: Blob | null = null;
        let isUsingReferenceForUniformity = false;
        const otherColor = targetItem.color === 'charcoal' ? 'white' : 'charcoal';
        
        if (!targetItem.isRepaint && !targetItem.isPolish && !targetItem.isGlassTune) {
          const targetSku = targetItem.sku ? targetItem.sku.trim() : getBaseSku(targetItem.fileName || 'image');
          const otherItemUI = currentQueue.find(item => {
            const itemSku = item.sku ? item.sku.trim() : getBaseSku(item.fileName || 'image');
            return itemSku === targetSku && item.color === otherColor;
          });
          if (otherItemUI && otherItemUI.status === 'completed') {
            const db = await getDB();
            const otherDbItem = await db.get('queue', otherItemUI.id);
            if (otherDbItem && otherDbItem.resultBlob) {
              referenceBlob = otherDbItem.resultBlob;
              isUsingReferenceForUniformity = true;
            }
          }
        }
        
        const sourceBlob = (targetItem.isRepaint || targetItem.isPolish || targetItem.isGlassTune || targetItem.isStructuralFix || targetItem.isReshape) && dbItem.resultBlob 
          ? dbItem.resultBlob 
          : (isUsingReferenceForUniformity && referenceBlob ? referenceBlob : dbItem.fileBlob);
          
        const base64DataUrl = await blobToBase64(sourceBlob);
        const base64Data = base64DataUrl.split(',')[1];
        const mimeType = base64DataUrl.split(';')[0].split(':')[1];

        let prompt = '';
        if (targetItem.isReshape) {
          const targetColorName = targetItem.color === 'charcoal' ? 'dark, premium matte CHARCOAL' : 'clean, bright pure WHITE';
          prompt = `You are an expert architectural photo retoucher and 3D renderer. Your task is to aggressively restructure and fix the design of the door in the provided image.
          
        CRITICAL INSTRUCTIONS:
        1. AGGRESSIVE RESTRUCTURE: The provided image contains a door with structural errors or incorrect design elements. You must fix these issues and create a structurally sound, perfectly aligned, and logically designed door.
        2. COLORS AND TEXTURES: The solid door frame and panels MUST be painted exactly ${targetColorName}. The glass panes MUST be frosted, translucent glass with a slight cyan/teal tint.
        3. PHOTOREALISM: Eliminate any 'illustrator', 'vector', or 'flat 3D render' look completely. The final image must be indistinguishable from a real photograph. Use real-world lighting, natural ambient occlusion, and physical material textures (premium powder-coated aluminum).
        4. NO HARDWARE: Do not include any door knobs, handles, locks, or hinges.
        5. BACKGROUND: Pure, solid white (#FFFFFF) background with a realistic grounding shadow.`;
        } else if (targetItem.isGlassTune) {
          prompt = `You are an expert photo retoucher. Your ONLY job is to change the color of the glass panes in the provided image.
        
        CRITICAL INSTRUCTIONS:
        1. DO NOT TOUCH THE DOOR FRAME: You are strictly forbidden from altering the door frame, especially if it is white. The white frame must remain pure white. Do not tint the frame.
        2. RECOLOR ONLY THE GLASS: Find all glass panes and carefully recolor them to a very light, bright, subtle teal/cyan color to simulate frosted glass. The glass should be very bright, almost white, but with a clear teal tint.
        3. PRESERVE THE FRAME TEXTURE: Do NOT change the texture or sharpness of the door frame. It must remain perfectly photorealistic and sharp. Do NOT apply any smoothing, blurring, or painting effects to the frame.
        4. PHOTOREALISM: The final image must look like a real photograph. Do not make the image look like a watercolor painting, an illustration, or a sketch. Maintain all original shadows and highlights on the door frame.
        5. REMOVE REFLECTIONS: The glass should look like flat, frosted glass. Remove any complex reflections of rooms or outdoors from the glass panes.`;
        } else if (targetItem.isRepaint || isUsingReferenceForUniformity) {
          const targetColorName = targetItem.color === 'charcoal' ? 'dark, premium matte CHARCOAL' : 'clean, bright pure WHITE';
          
          prompt = `You are an expert photo retoucher. Your ONLY job is to ensure the door frame and solid panels in the provided image are painted exactly ${targetColorName}.
        
        CRITICAL INSTRUCTIONS:
        1. DO NOT ADD OR REMOVE ANYTHING: You are strictly forbidden from adding any new shapes, changing the perspective, or altering the geometry. The structural design must remain EXACTLY as it is.
        2. RECOLOR TO ${targetItem.color.toUpperCase()}: Identify the door frame and any solid door panels. Regardless of their current color (whether they are white, silver, gray, black, or charcoal), you must carefully and perfectly paint them ${targetColorName}.
        3. SOLID SHAPES MUST REMAIN SOLID: If a shape is a solid block of color, the ENTIRE solid block must be recolored. Do NOT turn solid blocks into outlines, and do NOT fill them with glass.
        4. PRESERVE GLASS AND BACKGROUND: The frosted cyan/teal glass panes must remain exactly as they are. The white background and grounding shadow must remain exactly as they are.
        5. NO HALLUCINATIONS: This is a simple color replacement task. Do not hallucinate or create new designs. The output must be structurally identical to the input, just with a different frame color.`;
        } else {
          // Always run in "Polish" mode to preserve core assets while aggressively enforcing photorealism
          prompt = `You are an expert architectural photo retoucher. Your task is to take this image and aggressively maximize its photorealism, making it look exactly like a 4K Ultra HD photograph of a real physical door.

        CRITICAL INSTRUCTIONS:
        1. AGGRESSIVE REALISM: Eliminate any 'illustrator', 'vector', or 'flat 3D render' look completely. The final image must be indistinguishable from a real photograph. Use real-world lighting, natural ambient occlusion, and physical material textures.
        2. PRESERVE CORE ASSETS: Use the provided image STRICTLY as your geometric baseline. Preserve the exact structural design, grid patterns, and pane layouts perfectly. Do not lose or alter the core made assets.${dbItem.highContrastMode ? '\n        **ATTENTION**: The reference image may have low contrast. Analyze it carefully to capture every intricate detail and pane layout perfectly.' : ''}
        3. SOLID PANELS MUST REMAIN SOLID: If the door design includes solid metal panels or blocks (not glass), preserve them as solid metal panels in the specified color. Do NOT turn solid metal into glass, and do NOT turn solid blocks into outlines.
        4. UNIFORM CATALOG GLASS (CRITICAL): Treat the cyan/blue areas as frosted, translucent glass panels. To ensure a uniform catalog look, the glass MUST reflect a clean, empty, bright white studio environment. DO NOT reflect rooms, hallways, trees, outdoors, or any complex environments. The frosted texture must be 100% consistent and uniform across all panes. The glass should have a very faint, realistic cyan tint. DO NOT render completely clear glass, and DO NOT render the glass as flat, opaque colored panels.
        5. MATERIAL TEXTURE: Enhance the physical textures of the door frame and solid panels (premium powder-coated aluminum in ${dbItem.color}). Add natural ambient occlusion, micro-shadows, and realistic edge highlights to make it look manufactured and real.
        6. REMOVE HARDWARE: Seamlessly remove all door knobs, handles, locks, and hinges.
        ${polishFocusFooterRef.current ? '7. PRESERVE BOTTOM FOOTING: Ensure the door has a complete frame, including the bottom footing/threshold. Do not cut off the bottom of the door. Pay special attention to making the bottom frame structure consistent and complete.' : '7. PRESERVE BOTTOM FOOTING: Ensure the door has a complete frame, including the bottom footing/threshold. Do not cut off the bottom of the door.'}
        8. BACKGROUND: Pure, solid white (#FFFFFF) background with a realistic grounding shadow.
        9. STRICTLY PROHIBITED: NO reflections of rooms or outdoors, NO vector graphics, NO artificial gradients, NO teal foil, NO completely clear glass, NO illustrations.`;
        }

        const parts: any[] = [];

        if ((targetItem.isStructuralFix || targetItem.isReshape) && dbItem.structuralFixBlob) {
          const fixBase64DataUrl = await blobToBase64(dbItem.structuralFixBlob);
          const fixBase64Data = fixBase64DataUrl.split(',')[1];
          const fixMimeType = fixBase64DataUrl.split(';')[0].split(':')[1];
          parts.push({ inlineData: { data: fixBase64Data, mimeType: fixMimeType } });
          
          const targetColorName = targetItem.color === 'charcoal' ? 'dark, premium matte CHARCOAL' : 'clean, bright pure WHITE';
          
          if (targetItem.isReshape) {
            prompt = `You are an expert architectural photo retoucher and 3D renderer. I am providing you with a red/blue structural guide map for a door. Your task is to aggressively restructure and fix the design of the door based on this guide.
          
        CRITICAL INSTRUCTIONS:
        1. STRUCTURAL GUIDE: The provided image is a structural map. Red areas represent frosted glass panes. Blue areas represent the solid door material (frame and panels).
        2. AGGRESSIVE RESTRUCTURE: Transform this red/blue guide into a highly photorealistic, 4K Ultra HD photograph of a real physical door. Ensure the final design is structurally sound and logically designed.
        3. COLORS AND TEXTURES: The solid door frame and panels (blue areas) MUST be painted exactly ${targetColorName}. The glass panes (red areas) MUST be frosted, translucent glass with a slight cyan/teal tint.
        4. PHOTOREALISM: Eliminate any 'illustrator', 'vector', or 'flat 3D render' look completely. The final image must be indistinguishable from a real photograph. Use real-world lighting, natural ambient occlusion, and physical material textures (premium powder-coated aluminum).
        5. NO HARDWARE: Do not include any door knobs, handles, locks, or hinges.
        6. BACKGROUND: Pure, solid white (#FFFFFF) background with a realistic grounding shadow.`;
          } else {
            prompt = `You are an expert architectural photo retoucher and 3D renderer. I am providing you with a red/blue structural guide map for a door.
          
        CRITICAL INSTRUCTIONS:
        1. STRUCTURAL GUIDE: The provided image is a structural map. Red areas represent frosted glass panes. Blue areas represent the solid door material (frame and panels).
        2. GENERATE PHOTOREALISTIC DOOR: Transform this red/blue guide into a highly photorealistic, 4K Ultra HD photograph of a real physical door.
        3. COLORS AND TEXTURES: The solid door frame and panels (blue areas) MUST be painted exactly ${targetColorName}. The glass panes (red areas) MUST be frosted, translucent glass with a slight cyan/teal tint.
        4. PHOTOREALISM: Eliminate any 'illustrator', 'vector', or 'flat 3D render' look completely. The final image must be indistinguishable from a real photograph. Use real-world lighting, natural ambient occlusion, and physical material textures (premium powder-coated aluminum).
        5. NO HARDWARE: Do not include any door knobs, handles, locks, or hinges.
        6. BACKGROUND: Pure, solid white (#FFFFFF) background with a realistic grounding shadow.`;
          }
        } else {
          parts.push({ inlineData: { data: base64Data, mimeType: mimeType } });
        }
        
        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
          model: imageModelForTier(globalAiModel),
          contents: { parts },
          config: {
            // @ts-ignore
            imageConfig: doorImageConfig(globalAiModel),
          },
        });

        const inlineImage = extractInlineImage(response);
        if (!inlineImage) throw new Error('No image returned from API');
        const resultBase64 = inlineImage.data;
        const resultMimeType = inlineImage.mimeType;

        let resultBlob = await base64ToBlob(resultBase64, resultMimeType);
        let colorUnified = false;
        
        if (applyColorUnificationRef.current && !targetItem.skipColorCheck) {
          resultBlob = await unifyGlassColor(resultBlob);
          colorUnified = true;
        }
        
        const resultUrl = (resultBlob && resultBlob instanceof Blob) ? URL.createObjectURL(resultBlob) : undefined;

        await updateQueueItem(
          targetItem.id, 
          { status: 'completed', resultUrl, error: undefined, colorUnified, isRepaint: false, isPolish: false, isGlassTune: false, isStructuralFix: false }, 
          { status: 'completed', resultBlob, error: undefined, colorUnified, isRepaint: false, isPolish: false, isGlassTune: false, isStructuralFix: false }
        );
      }

    } catch (error: any) {
      console.error("Processing error for item", targetItem.id, error);
      await updateQueueItem(
        targetItem.id, 
        { status: 'failed', error: error.message || "Unknown error", isRepaint: false, isPolish: false, isGlassTune: false, isStructuralFix: false }, 
        { status: 'failed', error: error.message || "Unknown error", isRepaint: false, isPolish: false, isGlassTune: false, isStructuralFix: false }
      );
    }

    // Delay to respect rate limits (3 seconds between requests, or shorter if just local processing)
    await new Promise(resolve => setTimeout(resolve, isRecheckingColor ? 100 : 3000));
    
    // Continue loop if still processing
    if (isProcessingRef.current) {
      processNextInQueue();
    }
  }, []);

  // Start/Stop processing
  const toggleProcessing = () => {
    if (isProcessing) {
      setIsProcessing(false);
    } else {
      setIsProcessing(true);
      // Use setTimeout to allow state to update before starting loop
      setTimeout(() => processNextInQueue(), 0);
    }
  };

  // Actions
  const handleDownloadSingle = async (id: string, fileName: string, color: string) => {
    const db = await getDB();
    const item = await db.get('queue', id);
    if (item && item.resultBlob && item.resultBlob instanceof Blob) {
      const url = (item.resultBlob && item.resultBlob instanceof Blob) ? URL.createObjectURL(item.resultBlob) : '';
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      const displayColor = color === 'charcoal' ? 'bronze' : color;
      const baseName = item.sku ? item.sku.trim() : getBaseSku(fileName || 'image');
      a.download = `Render_${baseName}_${displayColor}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const handleDelete = async (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
    const db = await getDB();
    await db.delete('queue', id);
  };

  const handleRetry = async (id: string) => {
    await updateQueueItem(id, { status: 'pending', error: undefined }, { status: 'pending', error: undefined });
    if (isProcessing) {
      // If already processing, the loop will pick it up automatically
    }
  };

  const handleRerender = async (id: string) => {
    await updateQueueItem(id, { status: 'pending', error: undefined, resultUrl: undefined, colorUnified: false, isRepaint: false, isPolish: false, isGlassTune: false, isStructuralFix: false }, { status: 'pending', error: undefined, resultBlob: undefined, colorUnified: false, isRepaint: false, isPolish: false, isGlassTune: false, isStructuralFix: false });
    if (isProcessing) {
      // If already processing, the loop will pick it up automatically
    }
  };

  const handleResetGlassOnly = async (id: string) => {
    const db = await getDB();
    const dbItem = await db.get('queue', id);
    if (!dbItem || !dbItem.fileBlob) return;
    
    // Set to processing immediately
    await updateQueueItem(id, { status: 'processing', error: undefined }, { status: 'processing', error: undefined });
    
    try {
      // Apply glass modifier directly to original blob
      const unifiedBlob = await unifyGlassColor(dbItem.fileBlob);
      const resultUrl = (unifiedBlob && unifiedBlob instanceof Blob) ? URL.createObjectURL(unifiedBlob) : undefined;
      
      await updateQueueItem(
        id, 
        { status: 'completed', resultUrl, colorUnified: true, isRepaint: false, isPolish: false, isGlassTune: false, isStructuralFix: false, error: undefined }, 
        { status: 'completed', resultBlob: unifiedBlob, colorUnified: true, isRepaint: false, isPolish: false, isGlassTune: false, isStructuralFix: false, error: undefined }
      );
    } catch (error: any) {
      await updateQueueItem(id, { status: 'failed', error: error.message }, { status: 'failed', error: error.message });
    }
  };

  const handleRepaint = async (id: string) => {
    await updateQueueItem(id, { status: 'pending', error: undefined, colorUnified: false, isRepaint: true, isPolish: false, isGlassTune: false, isStructuralFix: false }, { status: 'pending', error: undefined, colorUnified: false, isRepaint: true, isPolish: false, isGlassTune: false, isStructuralFix: false });
    if (isProcessing) {
      // If already processing, the loop will pick it up automatically
    }
  };

  const handlePolish = async (id: string) => {
    await updateQueueItem(id, { status: 'pending', error: undefined, colorUnified: false, isRepaint: false, isPolish: true, isGlassTune: false, isStructuralFix: false }, { status: 'pending', error: undefined, colorUnified: false, isRepaint: false, isPolish: true, isGlassTune: false, isStructuralFix: false });
    if (isProcessing) {
      // If already processing, the loop will pick it up automatically
    }
  };

  const handleGlassTune = async (id: string) => {
    await updateQueueItem(id, { status: 'pending', error: undefined, colorUnified: false, isRepaint: false, isPolish: false, isGlassTune: true, isStructuralFix: false, isReshape: false }, { status: 'pending', error: undefined, colorUnified: false, isRepaint: false, isPolish: false, isGlassTune: true, isStructuralFix: false, isReshape: false });
    if (isProcessing) {
      // If already processing, the loop will pick it up automatically
    }
  };

  const handleReshape = (id: string, fileName: string) => {
    setGuideModal({ isOpen: true, itemId: id, fileName, type: 'reshape' });
  };

  const handleToggleColor = async (id: string) => {
    const db = await getDB();
    const item = await db.get('queue', id);
    if (item) {
      const newColor = item.color === 'white' ? 'charcoal' : 'white';
      await updateQueueItem(id, { color: newColor }, { color: newColor });
    }
  };

  const handleStructuralFixClick = (id: string, fileName: string) => {
    setGuideModal({ isOpen: true, itemId: id, fileName, type: 'structuralFix' });
  };

  const submitGuideImage = async (file: File | Blob) => {
    if (!guideModal) return;
    
    const isReshape = guideModal.type === 'reshape';
    const isStructuralFix = guideModal.type === 'structuralFix';

    await updateQueueItem(
      guideModal.itemId, 
      { status: 'pending', error: undefined, colorUnified: false, isRepaint: false, isPolish: false, isGlassTune: false, isStructuralFix, isReshape }, 
      { status: 'pending', error: undefined, colorUnified: false, isRepaint: false, isPolish: false, isGlassTune: false, isStructuralFix, isReshape, structuralFixBlob: file }
    );
    
    setGuideModal(null);
    
    if (!isProcessing) {
      setIsProcessing(true);
    }
  };

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (!guideModal) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) submitGuideImage(blob);
          break;
        }
      }
    };

    if (guideModal) {
      window.addEventListener('paste', handleGlobalPaste);
    }

    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [guideModal]);

  const handleRestoreFromPdf = async (doors: ExtractedDoor[]) => {
    setIsAddingFiles(true);
    try {
      const db = await getDB();
      const newItems: QueueItemUI[] = [];
      
      for (const door of doors) {
        const id = Date.now().toString() + Math.random().toString(36).substring(7);
        const fileName = `${door.sku}.png`;
        
        const newItem = {
          id,
          fileBlob: door.blob,
          fileName,
          sku: sanitizeSkuForPublish(door.sku),
          status: 'completed' as const,
          color: door.color === 'white' ? 'white' as const : 'charcoal' as const,
          resultBlob: door.blob,
          colorUnified: true,
          isRepaint: false,
          isPolish: false,
          isGlassTune: false,
          isStructuralFix: false,
          isReshape: false,
          hideDoubleDoor: !door.hasDoubleDoor,
          skipColorCheck: false,
          highContrastMode: false
        };
        
        await db.put('queue', newItem);
        
        newItems.push({
          id,
          originalUrl: URL.createObjectURL(door.blob),
          fileName,
          sku: sanitizeSkuForPublish(door.sku),
          status: 'completed',
          color: newItem.color,
          resultUrl: URL.createObjectURL(door.blob),
          colorUnified: true,
          isRepaint: false,
          isPolish: false,
          isGlassTune: false,
          isStructuralFix: false,
          isReshape: false,
          hideDoubleDoor: !door.hasDoubleDoor,
          skipColorCheck: false,
          highContrastMode: false
        });
      }
      
      setQueue(prev => [...prev, ...newItems]);
    } catch (error) {
      console.error("Error restoring from PDF:", error);
      setErrorAlert("Failed to restore items from PDF.");
    } finally {
      setIsAddingFiles(false);
    }
  };

  const handleClearProcessing = () => {
    setConfirmAction({
      type: 'clear',
      message: "Are you sure you want to clear the processing queue? This will remove all pending and failed items, but keep your completed catalog intact."
    });
  };

  const handleResetAll = () => {
    setConfirmAction({
      type: 'reset',
      message: "Are you sure you want to reset all completed and failed items? This will skip AI generation and only apply the new glass coloration to the original images."
    });
  };

  const handlePolishAll = () => {
    setConfirmAction({
      type: 'polish',
      message: "Are you sure you want to apply Phase 2 AI Polish to all completed items? This will remove hardware and enhance realism."
    });
  };

  const handleGlassTuneAll = () => {
    setConfirmAction({
      type: 'glassTune',
      message: "Are you sure you want to apply Glass Tuning to all completed items? This will specifically target and refine the glass texture and tint."
    });
  };

  const handleGenerateMissingBronze = async () => {
    setIsAddingFiles(true);
    try {
      const db = await getDB();
      const currentQueue = queueRef.current;
      const newItems: QueueItemUI[] = [];
      
      // Find all white items
      const whiteItems = currentQueue.filter(item => item.color === 'white');
      
      for (const whiteItem of whiteItems) {
        // Check if charcoal version exists for this file
        const whiteSku = whiteItem.sku ? whiteItem.sku.trim() : getBaseSku(whiteItem.fileName || '');
        const hasCharcoal = currentQueue.some(
          item => (item.sku ? item.sku.trim() : getBaseSku(item.fileName || '')) === whiteSku && item.color === 'charcoal'
        );
        
        if (!hasCharcoal) {
          // Get the original blob from DB
          const dbItem = await db.get('queue', whiteItem.id);
          if (!dbItem || !dbItem.fileBlob) continue;
          
          const newId = Date.now().toString() + Math.random().toString(36).substring(7);
          
          const newItem = {
            id: newId,
            fileBlob: dbItem.fileBlob,
            fileName: whiteItem.fileName,
            sku: whiteSku,
            status: 'pending' as const,
            color: 'charcoal' as const,
            hideDoubleDoor: whiteItem.hideDoubleDoor || false,
            colorUnified: false,
            skipColorCheck: whiteItem.skipColorCheck || false,
            highContrastMode: whiteItem.highContrastMode || false,
            isRepaint: true,
            isPolish: false,
            isGlassTune: false,
            isStructuralFix: false
          };
          
          await db.put('queue', newItem);
          
          newItems.push({
            id: newId,
            originalUrl: (dbItem.fileBlob && dbItem.fileBlob instanceof Blob) ? URL.createObjectURL(dbItem.fileBlob) : '',
            fileName: whiteItem.fileName,
            sku: whiteSku,
            status: 'pending',
            color: 'charcoal',
            hideDoubleDoor: whiteItem.hideDoubleDoor || false,
            colorUnified: false,
            skipColorCheck: whiteItem.skipColorCheck || false,
            highContrastMode: whiteItem.highContrastMode || false,
            isRepaint: false,
            isPolish: false,
            isGlassTune: false,
            isStructuralFix: false
          });
        }
      }
      
      if (newItems.length > 0) {
        setQueue(prev => [...prev, ...newItems].sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' })));
      }
    } catch (error) {
      console.error("Error generating missing charcoal versions:", error);
      setErrorAlert("Failed to generate missing charcoal versions.");
    } finally {
      setIsAddingFiles(false);
    }
  };

  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    
    if (confirmAction.type === 'clear') {
      setIsProcessing(false);
      const db = await getDB();
      const currentQueue = queueRef.current;
      
      const completedItems = currentQueue.filter(item => item.status === 'completed');
      const itemsToRemove = currentQueue.filter(item => item.status !== 'completed');
      
      setQueue(completedItems);
      
      for (const item of itemsToRemove) {
        await db.delete('queue', item.id);
      }
    } else if (confirmAction.type === 'reset') {
      setIsProcessing(false);
      const currentQueue = queueRef.current;
      for (const item of currentQueue) {
        if (item.status === 'completed' || item.status === 'failed') {
          await handleResetGlassOnly(item.id);
        }
      }
    } else if (confirmAction.type === 'polish') {
      const currentQueue = queueRef.current;
      for (const item of currentQueue) {
        if (item.status === 'completed') {
          await updateQueueItem(item.id, { status: 'pending', error: undefined, colorUnified: false, isRepaint: false, isPolish: true, isGlassTune: false, isStructuralFix: false }, { status: 'pending', error: undefined, colorUnified: false, isRepaint: false, isPolish: true, isGlassTune: false, isStructuralFix: false });
        }
      }
      if (!isProcessing) {
        setIsProcessing(true);
      }
    } else if (confirmAction.type === 'glassTune') {
      const currentQueue = queueRef.current;
      for (const item of currentQueue) {
        if (item.status === 'completed') {
          await updateQueueItem(item.id, { status: 'pending', error: undefined, colorUnified: false, isRepaint: false, isPolish: false, isGlassTune: true, isStructuralFix: false }, { status: 'pending', error: undefined, colorUnified: false, isRepaint: false, isPolish: false, isGlassTune: true, isStructuralFix: false });
        }
      }
      if (!isProcessing) {
        setIsProcessing(true);
      }
    }
    setConfirmAction(null);
  };

  const handleDownloadAll = async () => {
    const db = await getDB();
    const allItems = await db.getAll('queue');
    const completedItems = allItems.filter(item => item.status === 'completed');
    if (completedItems.length === 0) return;
    
    setIsZipping(true);
    try {
      const zip = new JSZip();
      
      for (let i = 0; i < completedItems.length; i++) {
        const item = completedItems[i];
        const dbItem = await db.get('queue', item.id);
        if (dbItem && dbItem.resultBlob) {
          // Ensure unique filenames if there are duplicates
          const baseName = item.sku ? item.sku.trim() : getBaseSku(item.fileName || 'image');
          const displayColor = item.color === 'charcoal' ? 'bronze' : item.color;
          const fileName = `Render_${String(i + 1).padStart(3, '0')}_${baseName}_${displayColor}.png`;
          zip.file(fileName, dbItem.resultBlob);
        }
      }
      
      const content = await zip.generateAsync({ type: 'blob' });
      const url = (content && content instanceof Blob) ? URL.createObjectURL(content) : '';
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Luxury_Door_Catalog_Assets.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) {
      console.error("Error creating zip:", error);
      setErrorAlert(`Failed to create zip file: ${error.message || 'Unknown error'}`);
    } finally {
      setIsZipping(false);
    }
  };

  const handleExportWooCommerce = async () => {
    const db = await getDB();
    const allItems = await db.getAll('queue');
    const completedItems = allItems.filter(item => item.status === 'completed');
    if (completedItems.length === 0) return;

    setIsExportingWoo(true);
    try {
      const ai = getGeminiClient();

      const zip = new JSZip();
      const imgFolder = zip.folder("images");

      // Group by SKU
      const skuGroups: Record<string, any[]> = {};

      for (const item of completedItems) {
        const baseName = item.sku ? item.sku.trim() : getBaseSku(item.fileName || 'image');
        if (!skuGroups[baseName]) skuGroups[baseName] = [];
        const dbItem = await db.get('queue', item.id);
        if (dbItem && dbItem.resultBlob) {
          skuGroups[baseName].push({ ...dbItem, color: item.color });
        }
      }

      const csvRows = [];
      // CSV Header
      csvRows.push([
        'Type', 'SKU', 'Name', 'Published', 'Short description', 'Description',
        'Images', 'Parent', 'Attribute 1 name', 'Attribute 1 value(s)',
        'Attribute 1 visible', 'Attribute 1 global'
      ].join(','));

      const escapeCsv = (str: string) => {
        if (str == null) return '';
        const stringified = String(str);
        if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
          return `"${stringified.replace(/"/g, '""')}"`;
        }
        return stringified;
      };

      for (const [sku, group] of Object.entries(skuGroups)) {
        const whiteItem = group.find((i: any) => i.color === 'white');
        const charcoalItem = group.find((i: any) => i.color === 'charcoal');
        const referenceItem = whiteItem || charcoalItem;
        if (!referenceItem) continue;

        // Generate AI content
        const base64DataUrl = await blobToBase64(referenceItem.resultBlob);
        const base64Data = base64DataUrl.split(',')[1];
        const mimeType = base64DataUrl.split(';')[0].split(':')[1];

        const prompt = `You are an expert copywriter for a luxury door manufacturer. Based on this image of a door, generate a WooCommerce product title, a short excerpt (1-2 sentences), and a detailed SEO-optimized product description (2-3 paragraphs). Return the result as a JSON object with keys: 'title', 'excerpt', 'description'. Do not use markdown formatting in the JSON values, just plain text or basic HTML for the description.`;

        let title = `${sku} Door`;
        let excerpt = `High-quality luxury door.`;
        let description = `Enhance your home with this premium door.`;

        try {
          const response = await ai.models.generateContent({
            model: GEMINI_TEXT_MODEL,
            contents: {
              parts: [
                { inlineData: { data: base64Data, mimeType: mimeType } },
                { text: prompt },
              ],
            },
            config: wooContentSchema,
          });

          const jsonStr = response.text?.trim();
          if (jsonStr) {
            const parsed = JSON.parse(jsonStr);
            title = parsed.title || title;
            excerpt = parsed.excerpt || excerpt;
            description = parsed.description || description;
          }
        } catch (err) {
          console.error(`Failed to generate AI content for ${sku}`, err);
        }

        // Parent Row
        const availableColors = [];
        if (whiteItem) availableColors.push('White');
        if (charcoalItem) availableColors.push('Bronze');

        csvRows.push([
          'variable',
          escapeCsv(sku),
          escapeCsv(title),
          '1',
          escapeCsv(excerpt),
          escapeCsv(description),
          '', // Images empty for parent
          '', // Parent empty
          'Color',
          escapeCsv(availableColors.join(', ')),
          '1',
          '1'
        ].join(','));

        // Variation Rows
        if (whiteItem) {
          const fileName = `${sku}_White.png`;
          imgFolder?.file(fileName, whiteItem.resultBlob);
          csvRows.push([
            'variation',
            escapeCsv(`${sku}-W`),
            '', // Name empty for variation
            '1',
            '', // Excerpt
            '', // Description
            escapeCsv(fileName), // Image filename
            escapeCsv(sku), // Parent
            'Color',
            'White',
            '',
            ''
          ].join(','));
        }

        if (charcoalItem) {
          const fileName = `${sku}_Bronze.png`;
          imgFolder?.file(fileName, charcoalItem.resultBlob);
          csvRows.push([
            'variation',
            escapeCsv(`${sku}-B`),
            '',
            '1',
            '',
            '',
            escapeCsv(fileName),
            escapeCsv(sku),
            'Color',
            'Bronze',
            '',
            ''
          ].join(','));
        }
      }

      zip.file("woocommerce_import.csv", csvRows.join('\n'));

      const content = await zip.generateAsync({ type: 'blob' });
      const url = (content && content instanceof Blob) ? URL.createObjectURL(content) : '';
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = 'WooCommerce_Export.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

    } catch (error: any) {
      console.error("Export failed:", error);
      setErrorAlert(`Failed to export WooCommerce CSV: ${error.message || 'Unknown error'}`);
    } finally {
      setIsExportingWoo(false);
    }
  };

  const openPdfModal = async () => {
    const db = await getDB();
    const allItems = await db.getAll('queue');
    const completedItems = allItems.filter(item => item.status === 'completed');
    if (completedItems.length === 0) return;
    
    const skuGroups: Record<string, any[]> = {};
    for (const item of completedItems) {
      const sku = item.sku ? item.sku.trim() : getBaseSku(item.fileName || 'image');
      if (!skuGroups[sku]) skuGroups[sku] = [];
      skuGroups[sku].push(item);
    }
    
    const skus = Object.keys(skuGroups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    if (skus.length === 0) return;

    const allSpreads = await db.getAll('spreads');
    const spreadsMap: Record<number, { targetSku?: string; imageUrl?: string; isGenerating?: boolean }> = {};
    const coversMap: { front?: any, back?: any } = {};
    const doubleDoorConfigsMap: Record<string, { overlapRatio: number; flipLeft: boolean; flipRight: boolean }> = {};
    
    allSpreads.forEach(spread => {
      if (spread.id.startsWith('spread_')) {
        const index = parseInt(spread.id.replace('spread_', ''), 10);
        if (!isNaN(index)) {
          spreadsMap[index] = {
            targetSku: spread.targetSku,
            imageUrl: spread.imageUrl,
            isGenerating: false
          };
        }
      } else if (spread.id === 'cover_front') {
        coversMap.front = coversMap.front || {};
        coversMap.front.targetSku = spread.targetSku;
        coversMap.front.imageUrl = spread.imageUrl;
        coversMap.front.isGenerating = false;
      } else if (spread.id === 'cover_back') {
        coversMap.back = coversMap.back || {};
        coversMap.back.targetSku = spread.targetSku;
        coversMap.back.imageUrl = spread.imageUrl;
        coversMap.back.isGenerating = false;
      } else if (spread.id === 'cover_front_overlay') {
        coversMap.front = coversMap.front || {};
        coversMap.front.overlayImageUrl = spread.imageUrl;
        coversMap.front.isGeneratingOverlay = false;
      } else if (spread.id === 'cover_back_overlay') {
        coversMap.back = coversMap.back || {};
        coversMap.back.overlayImageUrl = spread.imageUrl;
        coversMap.back.isGeneratingOverlay = false;
      } else if (spread.id.startsWith('doubleDoorConfig_')) {
        const sku = spread.id.replace('doubleDoorConfig_', '');
        try {
          doubleDoorConfigsMap[sku] = JSON.parse(spread.imageUrl);
        } catch (e) {
          console.error("Failed to parse double door config", e);
        }
      }
    });

    const savedAutoCrop = localStorage.getItem('autoCropDoors');
    const savedFrostedGlass = localStorage.getItem('frostedGlass');
    const savedIncludeStandardSizes = localStorage.getItem('includeStandardSizes');

    setPdfModal({
      isOpen: true,
      skus,
      skuGroups,
      progress: 0,
      currentSku: '',
      isGenerating: false,
      isSorting: false,
      selectedSkus: [],
      includeStandardSizes: savedIncludeStandardSizes ? savedIncludeStandardSizes === 'true' : true,
      autoCropDoors: savedAutoCrop ? savedAutoCrop === 'true' : true,
      frostedGlass: savedFrostedGlass ? savedFrostedGlass === 'true' : true,
      aiModel: 'pro',
      includeAICovers: true,
      spreads: spreadsMap,
      covers: coversMap,
      doubleDoorConfigs: doubleDoorConfigsMap,
      expandedDoubleDoorSku: null
    });
  };

  const moveSku = (index: number, direction: number) => {
    if (!pdfModal || pdfModal.isGenerating) return;
    const newSkus = [...pdfModal.skus];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newSkus.length) return;
    
    const temp = newSkus[index];
    newSkus[index] = newSkus[newIndex];
    newSkus[newIndex] = temp;
    
    setPdfModal({ ...pdfModal, skus: newSkus });
  };

  const handleAutoSort = () => {
    if (!pdfModal || pdfModal.isGenerating) return;
    const sorted = [...pdfModal.skus].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    setPdfModal({ ...pdfModal, skus: sorted });
  };

  const handleAISort = async () => {
    if (!pdfModal || pdfModal.isGenerating) return;
    
    setPdfModal(prev => prev ? { ...prev, isSorting: true } : null);
    try {
      const ai = getGeminiClient();
      const prompt = `Here is a list of product SKUs for doors:
      ${JSON.stringify(pdfModal.skus)}

      Sort them in the most logical order for a product catalog. Group similar prefixes together, and sort numerically within those groups.
      Return ONLY a valid JSON array of strings representing the sorted SKUs. Do not include markdown formatting like \`\`\`json.`;

      const response = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const sortedSkus = JSON.parse(response.text || "[]");
      if (Array.isArray(sortedSkus) && sortedSkus.length === pdfModal.skus.length) {
        setPdfModal(prev => prev ? { ...prev, skus: sortedSkus, isSorting: false } : null);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("AI Sort failed:", error);
      setErrorAlert("AI Sort failed. Please try again.");
      setPdfModal(prev => prev ? { ...prev, isSorting: false } : null);
    }
  };

  const handleOpenLinkResource = async (sku: string) => {
    if (!pdfModal) return;
    
    const db = await getDB();
    const allItems = await db.getAll('queue');
    const completedItems = allItems.filter(item => item.status === 'completed');
    
    const usedItemIds = new Set<string>();
    
    Object.values(pdfModal.skuGroups).forEach((group: any[]) => {
      group.forEach(item => usedItemIds.add(item.id));
    });
    
    const unused = completedItems.filter(item => !usedItemIds.has(item.id));
    setUnusedBlobs(unused);
    setLinkingSku(sku);
  };

  const handleLinkResource = async (item: QueueItemUI) => {
    if (!linkingSku || !pdfModal) return;
    
    try {
      const db = await getDB();
      const dbItem = await db.get('queue', item.id);
      if (!dbItem) throw new Error("Item not found in database");
      
      const oldExt = dbItem.fileName && dbItem.fileName.includes('.') ? dbItem.fileName.split('.').pop() : 'png';
      const newFileName = `${linkingSku}.${oldExt}`;
      const updatedDbItem = { ...dbItem, fileName: newFileName, sku: linkingSku };
      
      await db.put('queue', updatedDbItem);
      
      const updatedItemUI = { ...item, fileName: newFileName, sku: linkingSku };
      setQueue(prev => prev.map(q => q.id === item.id ? updatedItemUI : q));
      
      setPdfModal(prev => {
        if (!prev) return null;
        const newSkuGroups = { ...prev.skuGroups };
        if (!newSkuGroups[linkingSku]) newSkuGroups[linkingSku] = [];
        
        newSkuGroups[linkingSku].push(updatedItemUI);
        
        return { ...prev, skuGroups: newSkuGroups };
      });
      
      setLinkingSku(null);
    } catch (error) {
      console.error("Failed to link resource:", error);
      setErrorAlert("Failed to link resource.");
    }
  };

  const handleRenameSkuSubmit = async () => {
    if (!pdfModal || !renamingSku) return;
    const { oldSku, newSku } = renamingSku;
    const trimmedNewSku = newSku.trim();
    
    if (!trimmedNewSku || trimmedNewSku === oldSku) {
      setRenamingSku(null);
      return;
    }
    
    if (pdfModal.skus.includes(trimmedNewSku)) {
      setErrorAlert(`SKU "${trimmedNewSku}" already exists.`);
      setRenamingSku(null);
      return;
    }

    try {
      const db = await getDB();
      
      // 1. Update queue items
      const group = pdfModal.skuGroups[oldSku];
      const itemsToUpdate = group || [];
      
      for (const item of itemsToUpdate) {
        const dbItem = await db.get('queue', item.id);
        if (dbItem) {
          const oldExt = dbItem.fileName && dbItem.fileName.includes('.') ? dbItem.fileName.split('.').pop() : 'png';
          const newFileName = `${trimmedNewSku}.${oldExt}`;
          const updatedDbItem = { ...dbItem, fileName: newFileName, sku: trimmedNewSku };
          await db.put('queue', updatedDbItem);
          
          // Update main queue state
          setQueue(prev => prev.map(q => q.id === item.id ? { ...q, fileName: newFileName, sku: trimmedNewSku } : q));
        }
      }
      
      // 2. Update spreads (doubleDoorConfig and targetSkus)
      const allSpreads = await db.getAll('spreads');
      for (const spread of allSpreads) {
        let updated = false;
        let newSpread = { ...spread };
        
        if (spread.id === `doubleDoorConfig_${oldSku}`) {
          newSpread.id = `doubleDoorConfig_${trimmedNewSku}`;
          newSpread.targetSku = trimmedNewSku;
          await db.delete('spreads', spread.id); // delete old
          updated = true;
        } else if (spread.targetSku === oldSku) {
          newSpread.targetSku = trimmedNewSku;
          updated = true;
        }
        
        if (updated) {
          await db.put('spreads', newSpread);
        }
      }
      
      // 3. Update pdfModal state
      setPdfModal(prev => {
        if (!prev) return null;
        
        const newSkuGroups = { ...prev.skuGroups };
        newSkuGroups[trimmedNewSku] = newSkuGroups[oldSku];
        delete newSkuGroups[oldSku];
        
        const filteredSkus = prev.skus.filter(s => s !== oldSku);
        let insertIndex = 0;
        while (insertIndex < filteredSkus.length && filteredSkus[insertIndex].localeCompare(trimmedNewSku, undefined, { numeric: true, sensitivity: 'base' }) < 0) {
          insertIndex++;
        }
        filteredSkus.splice(insertIndex, 0, trimmedNewSku);
        const newSkus = filteredSkus;
          
        const newSelectedSkus = prev.selectedSkus.map(s => s === oldSku ? trimmedNewSku : s);
        
        const newDoubleDoorConfigs = { ...prev.doubleDoorConfigs };
        if (newDoubleDoorConfigs[oldSku]) {
          newDoubleDoorConfigs[trimmedNewSku] = newDoubleDoorConfigs[oldSku];
          delete newDoubleDoorConfigs[oldSku];
        }
        
        const newSpreads = { ...prev.spreads };
        Object.keys(newSpreads).forEach(k => {
          const idx = parseInt(k);
          if (newSpreads[idx].targetSku === oldSku) {
            newSpreads[idx] = { ...newSpreads[idx], targetSku: trimmedNewSku };
          }
        });
        
        const newCovers = { ...prev.covers };
        if (newCovers.front?.targetSku === oldSku) newCovers.front.targetSku = trimmedNewSku;
        if (newCovers.back?.targetSku === oldSku) newCovers.back.targetSku = trimmedNewSku;
        
        return {
          ...prev,
          skus: newSkus,
          skuGroups: newSkuGroups,
          selectedSkus: newSelectedSkus,
          doubleDoorConfigs: newDoubleDoorConfigs,
          spreads: newSpreads,
          covers: newCovers,
          expandedDoubleDoorSku: prev.expandedDoubleDoorSku === oldSku ? trimmedNewSku : prev.expandedDoubleDoorSku
        };
      });
      
    } catch (error) {
      console.error("Failed to rename SKU:", error);
      setErrorAlert("Failed to rename SKU.");
    }
    
    setRenamingSku(null);
  };

  const toggleSkuSelection = (sku: string) => {
    if (!pdfModal) return;
    const isSelected = pdfModal.selectedSkus.includes(sku);
    const newSelected = isSelected 
      ? pdfModal.selectedSkus.filter(s => s !== sku)
      : [...pdfModal.selectedSkus, sku];
    setPdfModal({ ...pdfModal, selectedSkus: newSelected });
  };

  const selectAllSkus = () => {
    if (!pdfModal) return;
    if (pdfModal.selectedSkus.length === pdfModal.skus.length) {
      setPdfModal({ ...pdfModal, selectedSkus: [] });
    } else {
      setPdfModal({ ...pdfModal, selectedSkus: [...pdfModal.skus] });
    }
  };

  const moveSelectedToTop = () => {
    if (!pdfModal || pdfModal.selectedSkus.length === 0) return;
    const unselected = pdfModal.skus.filter(sku => !pdfModal.selectedSkus.includes(sku));
    const selected = pdfModal.skus.filter(sku => pdfModal.selectedSkus.includes(sku));
    setPdfModal({ ...pdfModal, skus: [...selected, ...unselected] });
  };

  const moveSelectedToBottom = () => {
    if (!pdfModal || pdfModal.selectedSkus.length === 0) return;
    const unselected = pdfModal.skus.filter(sku => !pdfModal.selectedSkus.includes(sku));
    const selected = pdfModal.skus.filter(sku => pdfModal.selectedSkus.includes(sku));
    setPdfModal({ ...pdfModal, skus: [...unselected, ...selected] });
  };

  const handleDragStart = (e: React.DragEvent, sku: string) => {
    if (!pdfModal) return;
    const isSelected = pdfModal.selectedSkus.includes(sku);
    const draggedSkus = isSelected ? pdfModal.skus.filter(s => pdfModal.selectedSkus.includes(s)) : [sku];
    
    setDragState({
      isDragging: true,
      draggedSkus,
      dragOverIndex: null
    });
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sku);
  };

  const handlePdfDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragState.dragOverIndex !== index) {
      setDragState(prev => ({ ...prev, dragOverIndex: index }));
    }
  };

  const handlePdfDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!pdfModal || !dragState.isDragging) return;
    
    const { draggedSkus } = dragState;
    if (draggedSkus.length === 0) return;

    const remainingSkus = pdfModal.skus.filter(sku => !draggedSkus.includes(sku));
    
    let insertIndex = 0;
    for (let i = 0; i < targetIndex; i++) {
      if (!draggedSkus.includes(pdfModal.skus[i])) {
        insertIndex++;
      }
    }

    const newSkus = [
      ...remainingSkus.slice(0, insertIndex),
      ...draggedSkus,
      ...remainingSkus.slice(insertIndex)
    ];

    setPdfModal({ ...pdfModal, skus: newSkus });
    setDragState({ isDragging: false, draggedSkus: [], dragOverIndex: null });
  };

  const handleDragEnd = () => {
    setDragState({ isDragging: false, draggedSkus: [], dragOverIndex: null });
  };

  const handleGenerateSpread = async (spreadIndex: number, targetSku: string) => {
    if (!pdfModal) return;
    
    setPdfModal(prev => prev ? {
      ...prev,
      spreads: {
        ...prev.spreads,
        [spreadIndex]: { ...prev.spreads[spreadIndex], targetSku, isGenerating: true }
      }
    } : null);

    try {
      const ai = getGeminiClient();
      
      const group = pdfModal.skuGroups[targetSku] || [];
      const sourceItem = group.find((i: any) => i.color === 'charcoal') || group.find((i: any) => i.color === 'white') || group[0];
      if (!sourceItem) throw new Error("Source item not found");
      
      const db = await getDB();
      const dbItem = await db.get('queue', sourceItem.id);
      if (!dbItem || !dbItem.resultBlob) throw new Error("Source image not found in DB");
      
      const base64DataUrl = await blobToBase64(dbItem.resultBlob);
      const base64Data = base64DataUrl.split(',')[1];
      const mimeType = base64DataUrl.split(';')[0].split(':')[1];

      const prompt = `You are an expert architectural photographer. Create a magazine-quality, ultra-HD, photorealistic real estate interior or exterior shot featuring this exact door. 
      
      CRITICAL INSTRUCTIONS:
      1. The door must be prominently featured in a luxury home setting (e.g., a grand entryway, a modern living room, or a high-end exterior facade).
      2. PERFECTLY PRESERVE the door's structural design, grid pattern, and color from the reference image. Do not alter the door itself.
      3. FROSTED GLASS: The glass panels MUST be frosted/translucent with a slight cyan/teal tint, exactly like the reference image. Do NOT render completely clear glass.
      4. DOOR HARDWARE: You MUST include realistic, high-end door knobs or handles on the door. This is absolutely required.
      5. The image must be a 2-page spread format (landscape).
      6. Stunning, cinematic lighting, 8k resolution, photorealistic, 300dpi magazine quality.
      7. Do not add any text or logos.`;

      const response = await ai.models.generateContent({
        model: pdfModal.aiModel === 'free' ? 'gemini-2.5-flash-image' : 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: mimeType } },
            { text: prompt },
          ],
        },
        config: {
          // @ts-ignore
          imageConfig: pdfModal.aiModel === 'free' ? { aspectRatio: "16:9" } : { aspectRatio: "16:9", imageSize: "4K" }
        }
      });

      let generatedImageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          generatedImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!generatedImageUrl) throw new Error("No image generated");

      await db.put('spreads', {
        id: `spread_${spreadIndex}`,
        targetSku,
        imageUrl: generatedImageUrl
      });

      setPdfModal(prev => prev ? {
        ...prev,
        spreads: {
          ...prev.spreads,
          [spreadIndex]: { targetSku, imageUrl: generatedImageUrl, isGenerating: false }
        }
      } : null);

    } catch (error) {
      console.error("Error generating spread:", error);
      alert("Failed to generate spread. Please try again.");
      setPdfModal(prev => prev ? {
        ...prev,
        spreads: {
          ...prev.spreads,
          [spreadIndex]: { ...prev.spreads[spreadIndex], isGenerating: false }
        }
      } : null);
    }
  };

  const handleUploadSpread = async (spreadIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const imageUrl = event.target?.result as string;
      
      const db = await getDB();
      const currentSpread = pdfModal?.spreads[spreadIndex] || {};
      const targetSku = currentSpread.targetSku || (pdfModal?.skus[spreadIndex * 10] || '');
      
      await db.put('spreads', {
        id: `spread_${spreadIndex}`,
        targetSku,
        imageUrl
      });

      setPdfModal(prev => {
        if (!prev) return null;
        return {
          ...prev,
          spreads: {
            ...prev.spreads,
            [spreadIndex]: { ...prev.spreads[spreadIndex], targetSku, imageUrl }
          }
        };
      });
    };
    reader.readAsDataURL(file);
  };

  const handleTargetSkuChange = async (spreadIndex: number, targetSku: string) => {
    if (!pdfModal) return;
    
    const db = await getDB();
    const currentSpread = pdfModal.spreads[spreadIndex] || {};
    
    // Only save to DB if we already have an image, otherwise just update state
    if (currentSpread.imageUrl) {
      await db.put('spreads', {
        id: `spread_${spreadIndex}`,
        targetSku,
        imageUrl: currentSpread.imageUrl
      });
    }

    setPdfModal(prev => prev ? {
      ...prev,
      spreads: {
        ...prev.spreads,
        [spreadIndex]: { ...prev.spreads[spreadIndex], targetSku }
      }
    } : null);
  };

  const handleGenerateCover = async (type: 'front' | 'back', defaultSku: string) => {
    if (!pdfModal) return;
    const targetSku = pdfModal.covers[type]?.targetSku || defaultSku;
    
    setPdfModal(prev => prev ? {
      ...prev,
      covers: {
        ...prev.covers,
        [type]: { ...prev.covers[type], targetSku, isGenerating: true }
      }
    } : null);

    try {
      const ai = getGeminiClient();
      
      const group = pdfModal.skuGroups[targetSku] || [];
      const sourceItem = group.find((i: any) => i.color === 'charcoal') || group.find((i: any) => i.color === 'white') || group[0];
      if (!sourceItem) throw new Error("Source item not found");
      
      const db = await getDB();
      const dbItem = await db.get('queue', sourceItem.id);
      if (!dbItem || !dbItem.resultBlob) throw new Error("Source image not found in DB");
      
      let base64DataUrl = '';
      if (pdfModal.covers[type]?.isDoubleDoor) {
        const config = pdfModal.doubleDoorConfigs[targetSku];
        base64DataUrl = await createDoubleDoorDataUrl(dbItem.resultBlob, 2000, 2000, config);
      } else {
        base64DataUrl = await blobToBase64(dbItem.resultBlob);
      }
      
      const base64Data = base64DataUrl.split(',')[1];
      const mimeType = base64DataUrl.split(';')[0].split(':')[1];

      const isDouble = pdfModal.covers[type]?.isDoubleDoor;
      const prompt = `You are an expert architectural photographer and graphic designer. Create a magazine-quality, ultra-HD, photorealistic real estate interior or exterior shot featuring ${isDouble ? 'these exact double doors' : 'this exact door'}, designed specifically to be the ${type === 'front' ? 'front cover' : 'back cover'} of a high-end product catalog.
      
      CRITICAL INSTRUCTIONS:
      1. The door${isDouble ? 's' : ''} must be prominently featured in a luxury home setting.
      2. PERFECTLY PRESERVE the door's structural design, grid pattern, and color from the reference image. Do not alter the door${isDouble ? 's' : ''} itself.
      3. FROSTED GLASS: The glass panels MUST be frosted/translucent with a slight cyan/teal tint, exactly like the reference image. Do NOT render completely clear glass.
      4. DOOR HARDWARE: You MUST include realistic, high-end door knobs or handles on the door${isDouble ? 's' : ''}. This is absolutely required.
      5. The image must be portrait format (8.5x11 ratio).
      6. Stunning, cinematic lighting, 8k resolution, photorealistic, 300dpi magazine quality.
      7. ${type === 'front' ? 'Leave some negative space at the top or bottom for a catalog title.' : 'Leave some negative space for contact information.'}
      8. Do not add any text or logos yourself.`;

      const response = await ai.models.generateContent({
        model: pdfModal.aiModel === 'free' ? 'gemini-2.5-flash-image' : 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: mimeType } },
            { text: prompt },
          ],
        },
        config: {
          // @ts-ignore
          imageConfig: pdfModal.aiModel === 'free' ? { aspectRatio: "3:4" } : { aspectRatio: "3:4", imageSize: "4K" }
        }
      });

      let generatedImageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          generatedImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!generatedImageUrl) throw new Error("No image generated");

      await db.put('spreads', {
        id: `cover_${type}`,
        targetSku,
        imageUrl: generatedImageUrl
      });

      setPdfModal(prev => prev ? {
        ...prev,
        covers: {
          ...prev.covers,
          [type]: { targetSku, imageUrl: generatedImageUrl, isGenerating: false }
        }
      } : null);

    } catch (error) {
      console.error(`Error generating ${type} cover:`, error);
      alert(`Failed to generate ${type} cover. Please try again.`);
      setPdfModal(prev => prev ? {
        ...prev,
        covers: {
          ...prev.covers,
          [type]: { ...prev.covers[type], isGenerating: false }
        }
      } : null);
    }
  };

  const handleUploadCover = async (type: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const imageUrl = event.target?.result as string;
      
      const db = await getDB();
      const currentCover = pdfModal?.covers[type] || {};
      const targetSku = currentCover.targetSku || (pdfModal?.skus[0] || '');
      
      await db.put('spreads', {
        id: `cover_${type}`,
        targetSku,
        imageUrl
      });

      setPdfModal(prev => {
        if (!prev) return null;
        return {
          ...prev,
          covers: {
            ...prev.covers,
            [type]: { ...prev.covers[type], targetSku, imageUrl }
          }
        };
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDoubleDoorConfigChange = async (sku: string, config: { overlapRatio: number; flipLeft: boolean; flipRight: boolean }) => {
    if (!pdfModal) return;
    
    const db = await getDB();
    await db.put('spreads', {
      id: `doubleDoorConfig_${sku}`,
      targetSku: sku,
      imageUrl: JSON.stringify(config) // Store JSON as string in imageUrl field
    });

    setPdfModal(prev => {
      if (!prev) return null;
      return {
        ...prev,
        doubleDoorConfigs: {
          ...prev.doubleDoorConfigs,
          [sku]: config
        }
      };
    });
  };

  const handleTargetSkuChangeCover = async (type: 'front' | 'back', targetSku: string) => {
    if (!pdfModal) return;
    
    const db = await getDB();
    const currentCover = pdfModal.covers[type] || {};
    
    if (currentCover.imageUrl) {
      await db.put('spreads', {
        id: `cover_${type}`,
        targetSku,
        imageUrl: currentCover.imageUrl
      });
    }

    setPdfModal(prev => prev ? {
      ...prev,
      covers: {
        ...prev.covers,
        [type]: { ...prev.covers[type], targetSku }
      }
    } : null);
  };

  const handleGenerateOverlay = async (type: 'front' | 'back') => {
    if (!pdfModal) return;
    
    setPdfModal(prev => prev ? {
      ...prev,
      covers: {
        ...prev.covers,
        [type]: { ...prev.covers[type], isGeneratingOverlay: true }
      }
    } : null);

    try {
      const ai = getGeminiClient();
      
      const prompt = type === 'front' 
        ? `A luxurious, Behance-style graphic design banner for the bottom of a product catalog cover. Dark navy blue background with elegant gold foil accents, subtle geometric luxury patterns. The text '${COMPANY_NAME}' in large elegant serif font, and '${CATALOG_TITLE}' in clean sans-serif font. High-end architectural branding, 8k resolution, graphic design asset, perfectly flat and straight.`
        : `A luxurious, Behance-style graphic design banner for the bottom of a product catalog back cover. Dark navy blue background with elegant gold foil accents, subtle geometric luxury patterns. The text 'Contact Us' and '${CONTACT_LINE}' in clean elegant typography. High-end architectural branding, 8k resolution, graphic design asset, perfectly flat and straight.`;

      const response = await ai.models.generateContent({
        model: pdfModal.aiModel === 'free' ? 'gemini-2.5-flash-image' : 'gemini-3.1-flash-image-preview',
        contents: prompt,
        config: {
          // @ts-ignore
          imageConfig: pdfModal.aiModel === 'free' ? { aspectRatio: "4:1" } : { aspectRatio: "4:1", imageSize: "2K" }
        }
      });

      let generatedImageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          generatedImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!generatedImageUrl) throw new Error("No image generated");

      const db = await getDB();
      await db.put('spreads', {
        id: `cover_${type}_overlay`,
        targetSku: '',
        imageUrl: generatedImageUrl
      });

      setPdfModal(prev => prev ? {
        ...prev,
        covers: {
          ...prev.covers,
          [type]: { ...prev.covers[type], overlayImageUrl: generatedImageUrl, isGeneratingOverlay: false }
        }
      } : null);

    } catch (error) {
      console.error(`Error generating ${type} overlay:`, error);
      alert(`Failed to generate ${type} overlay. Please try again.`);
      setPdfModal(prev => prev ? {
        ...prev,
        covers: {
          ...prev.covers,
          [type]: { ...prev.covers[type], isGeneratingOverlay: false }
        }
      } : null);
    }
  };

  const handleUploadOverlay = async (type: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const imageUrl = event.target?.result as string;
      
      const db = await getDB();
      await db.put('spreads', {
        id: `cover_${type}_overlay`,
        targetSku: '',
        imageUrl
      });

      setPdfModal(prev => {
        if (!prev) return null;
        return {
          ...prev,
          covers: {
            ...prev.covers,
            [type]: { ...prev.covers[type], overlayImageUrl: imageUrl }
          }
        };
      });
    };
    reader.readAsDataURL(file);
  };

  const generatePDF = async () => {
    if (!pdfModal) return;
    
    setPdfModal(prev => prev ? { ...prev, isGenerating: true, progress: 0 } : null);
    setIsGeneratingPDF(true);
    
    try {
      const db = await getDB();
      
      // Re-read inventory directly from database to ensure absolute freshness
      const allItems = await db.getAll('queue');
      const completedItems = allItems.filter(item => item.status === 'completed');
      const freshSkuGroups: Record<string, any[]> = {};
      for (const item of completedItems) {
        const sku = item.sku ? item.sku.trim() : getBaseSku(item.fileName || 'image');
        if (!freshSkuGroups[sku]) freshSkuGroups[sku] = [];
        freshSkuGroups[sku].push(item);
      }
      
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter', compress: true });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      const { skus: modalSkus, includeStandardSizes, covers } = pdfModal;
      
      // Preserve custom sorting from modalSkus, but append any new SKUs found in the fresh DB read
      const freshSkusList = Object.keys(freshSkuGroups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      const skus = [...modalSkus];
      for (const freshSku of freshSkusList) {
        if (!skus.includes(freshSku)) {
          skus.push(freshSku);
        }
      }
      
      const spreadPageNumbers = new Set<number>();
      let currentContentPageNum = 1;

      // --- Front Cover ---
      if (pdfModal.includeAICovers && covers.front?.imageUrl) {
        doc.addImage(covers.front.imageUrl, 'JPEG', 0, 0, pageWidth, pageHeight);
        
        if (covers.front.overlayImageUrl) {
          const bannerHeight = pageWidth / 4; // 4:1 aspect ratio
          doc.addImage(covers.front.overlayImageUrl, 'JPEG', 0, pageHeight - bannerHeight, pageWidth, bannerHeight);
        } else {
          // Add title overlay
          doc.setFillColor(0, 0, 128); // Navy blue
          doc.rect(0, pageHeight - 60, pageWidth, 40, 'F');
          
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(32);
          doc.text(COMPANY_NAME, pageWidth / 2, pageHeight - 40, { align: 'center' });
          doc.setFontSize(20);
          doc.text(CATALOG_TITLE, pageWidth / 2, pageHeight - 28, { align: 'center' });
          doc.setTextColor(0, 0, 0);
        }
        
        spreadPageNumbers.add(1); // Don't add footer to cover
        doc.addPage();
        currentContentPageNum++;
      }
      
      // --- Index Page ---
      doc.setFontSize(24);
      doc.text(COMPANY_NAME, pageWidth / 2, 30, { align: 'center' });
      doc.setFontSize(16);
      doc.text(CATALOG_TITLE, pageWidth / 2, 40, { align: 'center' });
      
      doc.setFontSize(12);
      let indexY = 60;
      const skusPerPage = 2;
      
      // Calculate page offset for index if standard sizes page is included
      const pageOffset = currentContentPageNum + (includeStandardSizes ? 2 : 1);
      
      if (includeStandardSizes) {
        doc.text("Standard Exterior Door Sizes", 20, indexY);
        doc.text(`Page ${currentContentPageNum + 1}`, pageWidth - 20, indexY, { align: 'right' });
        indexY += 10;
      }
      
      let runningPageNum = pageOffset;
      const skuPageNumbers: number[] = [];
      
      for (let i = 0; i < skus.length; i++) {
        const skuIndexOnPage = i % skusPerPage;
        if (i > 0 && skuIndexOnPage === 0) {
          runningPageNum++;
          if (pdfModal.includeAICovers && i % 10 === 0) {
            const spreadIndex = (i / 10) - 1;
            const spread = pdfModal.spreads[spreadIndex];
            if (spread && spread.imageUrl) {
              runningPageNum += 2;
            }
          }
        }
        skuPageNumbers.push(runningPageNum);
        
        doc.text(skus[i], 20, indexY);
        doc.text(`Page ${runningPageNum}`, pageWidth - 20, indexY, { align: 'right' });
        indexY += 10;
        if (indexY > pageHeight - 30) {
          doc.addPage();
          currentContentPageNum++;
          indexY = 20;
        }
      }
      
      // --- Standard Sizes Page ---
      if (includeStandardSizes) {
        doc.addPage();
        currentContentPageNum++;
        doc.setFontSize(20);
        doc.text("Standard Exterior Door Sizes", pageWidth / 2, 30, { align: 'center' });
        
        doc.setFontSize(14);
        doc.text("Single Doors", 20, 50);
        doc.setFontSize(12);
        
        const singleSizes = [
          "30\" x 80\" (2'6\" x 6'8\")",
          "32\" x 80\" (2'8\" x 6'8\")",
          "36\" x 80\" (3'0\" x 6'8\")",
          "36\" x 84\" (3'0\" x 7'0\")",
          "36\" x 96\" (3'0\" x 8'0\")"
        ];
        
        let sizeY = 65;
        singleSizes.forEach(size => {
          doc.text(`• ${size}`, 25, sizeY);
          sizeY += 10;
        });
        
        doc.setFontSize(14);
        doc.text("Double Doors", 20, sizeY + 10);
        doc.setFontSize(12);
        
        const doubleSizes = [
          "60\" x 80\" (5'0\" x 6'8\")",
          "64\" x 80\" (5'4\" x 6'8\")",
          "72\" x 80\" (6'0\" x 6'8\")",
          "72\" x 84\" (6'0\" x 7'0\")",
          "72\" x 96\" (6'0\" x 8'0\")"
        ];
        
        sizeY += 25;
        doubleSizes.forEach(size => {
          doc.text(`• ${size}`, 25, sizeY);
          sizeY += 10;
        });
      }

      // --- Content Pages ---
      for (let i = 0; i < skus.length; i++) {
        const sku = skus[i];
        
        setPdfModal(prev => prev ? { 
          ...prev, 
          currentSku: sku, 
          progress: (i / skus.length) * 100 
        } : null);
        
        // Yield to browser to update UI
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const skuIndexOnPage = i % skusPerPage;
        if (skuIndexOnPage === 0) {
          doc.addPage();
        }
        
        const group = freshSkuGroups[sku] || [];
        const startY = skuIndexOnPage === 0 ? 20 : 140;
        
        doc.setFontSize(16);
        doc.text(`SKU: ${sku}`, 13, startY);
        
        let whiteDataUrl = null;
        let charcoalDataUrl = null;
        let doubleDataUrl = null;
        
        // Max dimensions for print (approx 300 DPI for the given mm sizes)
        // 45mm width ~ 531px, 90mm width ~ 1063px, 80mm height ~ 945px
        const maxSingleWidth = 600;
        const maxDoubleWidth = 1200;
        const maxHeight = 1000;
        
        const hideDoubleDoor = group.some((item: any) => item.hideDoubleDoor);
        
        const item1 = group.find((i: any) => i.color === 'white') || group[0];
        const item2 = group.find((i: any) => i.color !== 'white' && i.id !== item1.id) || (group.length > 1 && group[1].id !== item1.id ? group[1] : undefined);
        
        if (item2) {
          const dbItem = await db.get('queue', item2.id);
          if (dbItem && dbItem.resultBlob) {
            let processBlob = pdfModal.autoCropDoors ? await autoCropWhiteBackground(dbItem.resultBlob) : dbItem.resultBlob;
            if (pdfModal.frostedGlass) processBlob = await unifyGlassColor(processBlob);
            charcoalDataUrl = await resizeImageBlob(processBlob, maxSingleWidth, maxHeight);
            if (!hideDoubleDoor) {
               doubleDataUrl = await createDoubleDoorDataUrl(processBlob, maxDoubleWidth, maxHeight, pdfModal.doubleDoorConfigs[sku]);
            }
          }
        }
        
        if (item1) {
          const dbItem = await db.get('queue', item1.id);
          if (dbItem && dbItem.resultBlob) {
            let processBlob = pdfModal.autoCropDoors ? await autoCropWhiteBackground(dbItem.resultBlob) : dbItem.resultBlob;
            if (pdfModal.frostedGlass) processBlob = await unifyGlassColor(processBlob);
            whiteDataUrl = await resizeImageBlob(processBlob, maxSingleWidth, maxHeight);
            if (!doubleDataUrl && !hideDoubleDoor) {
              doubleDataUrl = await createDoubleDoorDataUrl(processBlob, maxDoubleWidth, maxHeight, pdfModal.doubleDoorConfigs[sku]);
            }
          }
        }
        
        const imgY = startY + 10;
        const imgHeight = 80;
        const singleWidth = 45;
        const config = pdfModal.doubleDoorConfigs[sku];
        const overlapRatio = config?.overlapRatio ?? 0.18;
        const doubleWidth = 45 * (2 - overlapRatio);
        
        if (whiteDataUrl) {
          doc.setFontSize(10);
          doc.text(item1.color === 'white' ? "White" : "Bronze", 13 + singleWidth/2, imgY - 2, { align: 'center' });
          doc.addImage(whiteDataUrl, 'PNG', 13, imgY, singleWidth, imgHeight);
        }
        
        if (charcoalDataUrl) {
          doc.setFontSize(10);
          doc.text(item2.color === 'white' ? "White" : "Bronze", 63 + singleWidth/2, imgY - 2, { align: 'center' });
          doc.addImage(charcoalDataUrl, 'PNG', 63, imgY, singleWidth, imgHeight);
        }
        
        if (doubleDataUrl) {
          doc.setFontSize(10);
          doc.text("Double Door Display", 117 + doubleWidth/2, imgY - 2, { align: 'center' });
          doc.addImage(doubleDataUrl, 'PNG', 117, imgY, doubleWidth, imgHeight);
        }

        // Add spread if needed
        if (pdfModal.includeAICovers && i % 10 === 9) {
          const spreadIndex = Math.floor(i / 10);
          const spread = pdfModal.spreads[spreadIndex];
          if (spread && spread.imageUrl) {
            // Page 1 of spread
            doc.addPage();
            spreadPageNumbers.add(doc.getNumberOfPages());
            doc.addImage(spread.imageUrl, 'JPEG', 0, 0, 431.8, 279.4);
            
            // Page 2 of spread
            doc.addPage();
            spreadPageNumbers.add(doc.getNumberOfPages());
            doc.addImage(spread.imageUrl, 'JPEG', -215.9, 0, 431.8, 279.4);
          }
        }
      }
      
      setPdfModal(prev => prev ? { ...prev, progress: 100, currentSku: 'Finalizing PDF...' } : null);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // --- Back Cover ---
      if (pdfModal.includeAICovers && covers.back?.imageUrl) {
        doc.addPage();
        spreadPageNumbers.add(doc.getNumberOfPages()); // Don't add footer to cover
        doc.addImage(covers.back.imageUrl, 'JPEG', 0, 0, pageWidth, pageHeight);
        
        if (covers.back.overlayImageUrl) {
          const bannerHeight = pageWidth / 4; // 4:1 aspect ratio
          doc.addImage(covers.back.overlayImageUrl, 'JPEG', 0, pageHeight - bannerHeight, pageWidth, bannerHeight);
        } else {
          // Add contact info overlay
          doc.setFillColor(0, 0, 128);
          doc.rect(0, pageHeight - 50, pageWidth, 30, 'F');
          
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(16);
          doc.text("Contact Us", pageWidth / 2, pageHeight - 38, { align: 'center' });
          doc.setFontSize(12);
          doc.text(CONTACT_LINE, pageWidth / 2, pageHeight - 28, { align: 'center' });
          doc.setTextColor(0, 0, 0);
        }
      }

      // --- Footers ---
      const totalPdfPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPdfPages; i++) {
        if (spreadPageNumbers.has(i)) continue;
        doc.setPage(i);
        doc.setFillColor(0, 0, 128); // Navy blue
        doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(FOOTER_TEXT, 20, pageHeight - 6);
        doc.text(`Page ${i} of ${totalPdfPages}`, pageWidth - 20, pageHeight - 6, { align: 'right' });
        doc.setTextColor(0, 0, 0); // Reset text color
      }
      
      doc.save(CATALOG_FILENAME);
      setPdfModal(null);
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      setErrorAlert(`Failed to generate PDF: ${error.message || 'Unknown error'}`);
      setPdfModal(prev => prev ? { ...prev, isGenerating: false } : null);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Stats
  const stats = {
    total: queue.length,
    pending: queue.filter(i => i.status === 'pending').length,
    processing: queue.filter(i => i.status === 'processing').length,
    completed: queue.filter(i => i.status === 'completed').length,
    failed: queue.filter(i => i.status === 'failed').length,
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] font-sans text-[#1a1a1a] flex flex-col md:flex-row">
      {/* Sidebar Controls */}
      <div className="w-full md:w-80 bg-white border-r border-gray-200 p-6 flex flex-col h-screen sticky top-0 overflow-y-auto shadow-[2px_0_8px_rgba(0,0,0,0.02)] z-10">
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight mb-1">Luxury Door Studio</h1>
          <p className="text-sm text-gray-500">Batch Catalog Asset Generator</p>
        </div>

        <div className="space-y-6 flex-grow">
          {/* Upload Section */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Add Designs (Batch)
            </label>
            <div 
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                isAddingFiles 
                  ? 'border-blue-400 bg-blue-50 cursor-wait' 
                  : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100 cursor-pointer'
              }`}
              onClick={() => !isAddingFiles && fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <div className="flex flex-col items-center justify-center py-2">
                {isAddingFiles ? (
                  <>
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                    <p className="text-sm font-medium text-blue-700">Processing files...</p>
                    <p className="text-xs text-blue-500 mt-1">This may take a moment</p>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm border border-gray-100">
                      <Plus className="w-5 h-5 text-gray-600" />
                    </div>
                    <p className="text-sm font-medium text-gray-700">Upload Multiple Designs</p>
                    <p className="text-xs text-gray-500 mt-1">Drag & drop files or folders</p>
                  </>
                )}
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                multiple
                className="hidden" 
              />
            </div>
          </div>

          {/* Global Settings */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Default Settings
            </label>
            <p className="text-xs text-gray-400 mb-3">Applies to newly uploaded images.</p>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <Palette className="w-4 h-4 mr-2 text-gray-400" />
                  Aluminum Color
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setGlobalColor('white')}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                      globalColor === 'white' 
                        ? 'border-gray-900 bg-gray-900 text-white shadow-sm' 
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    White
                  </button>
                  <button
                    onClick={() => setGlobalColor('charcoal')}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                      globalColor === 'charcoal' 
                        ? 'border-gray-900 bg-gray-900 text-white shadow-sm' 
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Bronze
                  </button>
                  <button
                    onClick={() => setGlobalColor('both')}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                      globalColor === 'both' 
                        ? 'border-gray-900 bg-gray-900 text-white shadow-sm' 
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Both
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Settings2 className="w-4 h-4 text-gray-500" />
                  <h3 className="text-sm font-medium text-gray-900">AI Model</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setGlobalAiModel('pro')}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                      globalAiModel === 'pro' 
                        ? 'border-gray-900 bg-gray-900 text-white shadow-sm' 
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Pro (4K)
                  </button>
                  <button
                    onClick={() => setGlobalAiModel('free')}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                      globalAiModel === 'free' 
                        ? 'border-gray-900 bg-gray-900 text-white shadow-sm' 
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Free (1K)
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <label className="flex items-start space-x-3 cursor-pointer group">
                  <div className="flex items-center h-5">
                    <input
                      type="checkbox"
                      checked={applyColorUnification}
                      onChange={(e) => setApplyColorUnification(e.target.checked)}
                      className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                      Unify Glass Color
                    </span>
                    <span className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      Applies a post-processing filter to force all glass to an absolute light teal shade.
                    </span>
                  </div>
                </label>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <label className="flex items-start space-x-3 cursor-pointer group">
                  <div className="flex items-center h-5">
                    <input
                      type="checkbox"
                      checked={polishFocusFooter}
                      onChange={(e) => setPolishFocusFooter(e.target.checked)}
                      className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                      Focus Polish on Footer
                    </span>
                    <span className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      Explicitly instructs the AI to fix and complete the bottom footing/threshold structure during polish.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Progress Summary */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Queue Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Items:</span>
                <span className="font-medium">{stats.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Completed:</span>
                <span className="font-medium text-green-600">{stats.completed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Pending:</span>
                <span className="font-medium text-blue-600">{stats.pending}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Failed:</span>
                <span className="font-medium text-red-600">{stats.failed}</span>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden flex">
              <div 
                className="bg-green-500 h-full transition-all duration-500" 
                style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
              />
              <div 
                className="bg-blue-500 h-full transition-all duration-500 animate-pulse" 
                style={{ width: `${stats.total > 0 ? (stats.processing / stats.total) * 100 : 0}%` }}
              />
              <div 
                className="bg-red-500 h-full transition-all duration-500" 
                style={{ width: `${stats.total > 0 ? (stats.failed / stats.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-6 mt-6 border-t border-gray-100 space-y-3">
          <button
            onClick={toggleProcessing}
            disabled={stats.pending === 0 && !isProcessing}
            className={`w-full py-3 rounded-xl font-medium flex items-center justify-center transition-all shadow-sm ${
              stats.pending === 0 && !isProcessing
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : isProcessing
                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200'
                  : 'bg-[#1a1a1a] text-white hover:bg-black hover:shadow-md'
            }`}
          >
            {isProcessing ? (
              <><Pause className="w-5 h-5 mr-2" /> Pause Queue</>
            ) : (
              <><Play className="w-5 h-5 mr-2" /> Start Processing</>
            )}
          </button>

          <button
            onClick={handleDownloadAll}
            disabled={stats.completed === 0 || isZipping || isGeneratingPDF || isExportingWoo}
            className={`w-full py-3 rounded-xl font-medium flex items-center justify-center transition-all border ${
              stats.completed === 0 || isZipping || isGeneratingPDF || isExportingWoo
                ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50 shadow-sm'
            }`}
          >
            {isZipping ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Zipping...</>
            ) : (
              <><Archive className="w-5 h-5 mr-2" /> Download All ({stats.completed})</>
            )}
          </button>

          <button
            onClick={handleExportWooCommerce}
            disabled={stats.completed === 0 || isExportingWoo || isZipping || isGeneratingPDF}
            className={`w-full py-3 rounded-xl font-medium flex items-center justify-center transition-all border ${
              stats.completed === 0 || isExportingWoo || isZipping || isGeneratingPDF
                ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                : 'bg-purple-600 text-white border-purple-700 hover:bg-purple-700 shadow-sm'
            }`}
          >
            {isExportingWoo ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Exporting WooCommerce...</>
            ) : (
              <><ShoppingCart className="w-5 h-5 mr-2" /> Export WooCommerce CSV</>
            )}
          </button>

          <button
            onClick={openPdfModal}
            disabled={stats.completed === 0 || isGeneratingPDF || isZipping}
            className={`w-full py-3 rounded-xl font-medium flex items-center justify-center transition-all border ${
              stats.completed === 0 || isGeneratingPDF || isZipping
                ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50 shadow-sm'
            }`}
          >
            {isGeneratingPDF ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Generating PDF...</>
            ) : (
              <><FileText className="w-5 h-5 mr-2" /> Generate PDF Catalog</>
            )}
          </button>

          <button
            onClick={() => setIsExtractorModalOpen(true)}
            className="w-full py-2 text-sm font-medium text-emerald-600 hover:text-emerald-800 transition-colors"
          >
            <Upload className="w-5 h-5 inline-block mr-2" />
            Restore from PDF
          </button>

          <button
            onClick={handleClearProcessing}
            disabled={stats.total === 0 || isAddingFiles}
            className="w-full py-2 text-sm font-medium text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear Processing Queue
          </button>
          
          <button
            onClick={handleResetAll}
            disabled={stats.total === 0 || isAddingFiles || (stats.completed === 0 && stats.failed === 0)}
            className="w-full py-2 text-sm font-medium text-amber-600 hover:text-amber-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset & Apply Glass Only
          </button>

          <button
            onClick={handleGenerateMissingBronze}
            disabled={stats.total === 0 || isAddingFiles || queue.filter(i => i.color === 'white').length === 0}
            className="w-full py-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate Missing Bronze
          </button>

          <button
            onClick={handlePolishAll}
            disabled={stats.completed === 0 || isAddingFiles}
            className="w-full py-2 text-sm font-medium text-emerald-600 hover:text-emerald-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            Polish All Completed
          </button>

          <button
            onClick={handleGlassTuneAll}
            disabled={stats.completed === 0 || isAddingFiles}
            className="w-full py-2 text-sm font-medium text-cyan-600 hover:text-cyan-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <Droplets className="w-4 h-4 mr-1.5" />
            Tune Glass All
          </button>
        </div>
      </div>

      {/* Main Content - Queue Grid */}
      <div className="flex-1 p-6 md:p-10 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">Batch Processing Queue</h2>
            <div className="text-sm text-gray-500 font-medium bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
              {stats.total} {stats.total === 1 ? 'Item' : 'Items'}
            </div>
          </div>

          {queue.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 border-dashed p-12 flex flex-col items-center justify-center text-center h-[60vh]">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <ImageIcon className="w-8 h-8 text-gray-300" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Queue is empty</h3>
              <p className="text-gray-500 max-w-sm">
                Upload up to 150 door designs to begin batch processing. Progress is automatically saved so you can resume anytime.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {queue.map((item) => (
                <QueueItemCard
                  key={item.id}
                  item={item as QueueItemUI}
                  onDelete={handleDelete}
                  onDownload={handleDownloadSingle}
                  onRerender={handleRerender}
                  onResetGlassOnly={handleResetGlassOnly}
                  onRepaint={handleRepaint}
                  onPolish={handlePolish}
                  onGlassTune={handleGlassTune}
                  onStructuralFix={handleStructuralFixClick}
                  onReshape={handleReshape}
                  onToggleHideDoubleDoor={(id, hide) => updateQueueItem(id, { hideDoubleDoor: hide }, { hideDoubleDoor: hide })}
                  onToggleSkipColorCheck={(id, skip) => updateQueueItem(id, { skipColorCheck: skip }, { skipColorCheck: skip })}
                  onToggleHighContrastMode={(id, high) => updateQueueItem(id, { highContrastMode: high }, { highContrastMode: high })}
                  onToggleColor={handleToggleColor}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {confirmAction.type === 'clear' ? 'Clear Processing Queue' : confirmAction.type === 'reset' ? 'Reset Queue' : 'Polish All Completed'}
            </h3>
            <p className="text-gray-600 mb-6">
              {confirmAction.message}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-xl font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeConfirmAction}
                className={`px-4 py-2 rounded-xl font-medium text-white transition-colors ${
                  confirmAction.type === 'clear' ? 'bg-red-600 hover:bg-red-700' : confirmAction.type === 'reset' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {confirmAction.type === 'clear' ? 'Clear Processing' : confirmAction.type === 'reset' ? 'Reset All' : 'Polish All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Generation Modal */}
      {pdfModal?.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-800">Generate PDF Catalog</h2>
              {!pdfModal.isGenerating && (
                <button onClick={() => setPdfModal(null)} className="text-gray-400 hover:text-gray-600">
                  <XCircle className="w-6 h-6" />
                </button>
              )}
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {pdfModal.isGenerating ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                  <h3 className="text-lg font-medium text-gray-800 mb-2">Generating PDF...</h3>
                  <p className="text-gray-500 mb-6">Processing {pdfModal.currentSku}</p>
                  
                  <div className="w-full max-w-md bg-gray-100 rounded-full h-3 mb-2">
                    <div 
                      className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${pdfModal.progress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-500">{Math.round(pdfModal.progress)}% Complete</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                    <div className="flex items-center space-x-3">
                      <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={pdfModal.selectedSkus.length === pdfModal.skus.length && pdfModal.skus.length > 0}
                          onChange={selectAllSkus}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Select All</span>
                      </label>
                      <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer border-l border-gray-200 pl-3">
                        <input 
                          type="checkbox" 
                          checked={pdfModal.includeStandardSizes}
                          onChange={(e) => {
                            setPdfModal({ ...pdfModal, includeStandardSizes: e.target.checked });
                            localStorage.setItem('includeStandardSizes', e.target.checked.toString());
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Include Standard Sizes Page</span>
                      </label>
                      <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer border-l border-gray-200 pl-3">
                        <input 
                          type="checkbox" 
                          checked={pdfModal.autoCropDoors}
                          onChange={(e) => {
                            setPdfModal({ ...pdfModal, autoCropDoors: e.target.checked });
                            localStorage.setItem('autoCropDoors', e.target.checked.toString());
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Auto-Crop Doors</span>
                      </label>
                      <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer border-l border-gray-200 pl-3">
                        <input 
                          type="checkbox" 
                          checked={pdfModal.frostedGlass}
                          onChange={(e) => {
                            setPdfModal({ ...pdfModal, frostedGlass: e.target.checked });
                            localStorage.setItem('frostedGlass', e.target.checked.toString());
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Frosted Glass</span>
                      </label>
                      <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer border-l border-gray-200 pl-3">
                        <input 
                          type="checkbox" 
                          checked={pdfModal.includeAICovers}
                          onChange={(e) => {
                            setPdfModal({ ...pdfModal, includeAICovers: e.target.checked });
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Include AI Covers & Spreads</span>
                      </label>
                      <div className="flex items-center space-x-2 text-sm text-gray-700 border-l border-gray-200 pl-3">
                        <span className="text-gray-500">AI Model:</span>
                        <select 
                          value={pdfModal.aiModel}
                          onChange={(e) => setPdfModal({ ...pdfModal, aiModel: e.target.value as 'pro' | 'free' })}
                          className="text-xs border-gray-300 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 py-1"
                        >
                          <option value="pro">Pro (gemini-3.1-flash-image-preview)</option>
                          <option value="free">Free (gemini-2.5-flash-image)</option>
                        </select>
                      </div>
                      {pdfModal.selectedSkus.length > 0 && (
                        <div className="flex items-center space-x-1 border-l border-gray-200 pl-3">
                          <button
                            onClick={moveSelectedToTop}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 rounded transition-colors"
                            title="Move Selected to Top"
                          >
                            <ArrowUpToLine className="w-4 h-4" />
                          </button>
                          <button
                            onClick={moveSelectedToBottom}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 rounded transition-colors"
                            title="Move Selected to Bottom"
                          >
                            <ArrowDownToLine className="w-4 h-4" />
                          </button>
                          <span className="text-xs text-gray-500 ml-2">{pdfModal.selectedSkus.length} selected</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 shrink-0">
                      <ColorSyncPlugin 
                        queue={queue} 
                        setQueue={setQueue} 
                        pdfModal={pdfModal} 
                        setPdfModal={setPdfModal} 
                        updateQueueItem={updateQueueItem} 
                      />
                      <button
                        onClick={handleAutoSort}
                        disabled={pdfModal.isSorting}
                        className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center disabled:opacity-50"
                        title="Sort Alphanumerically"
                      >
                        <ArrowDownAZ className="w-4 h-4 mr-1.5" />
                        Auto-Sort
                      </button>
                      <button
                        onClick={handleAISort}
                        disabled={pdfModal.isSorting}
                        className="px-3 py-1.5 text-sm bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg transition-colors flex items-center disabled:opacity-50"
                        title="Magic Sort with AI"
                      >
                        {pdfModal.isSorting ? (
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4 mr-1.5" />
                        )}
                        AI Sort
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {pdfModal.skus.map((sku, index) => {
                      const isSelected = pdfModal.selectedSkus.includes(sku);
                      const isDragged = dragState.isDragging && dragState.draggedSkus.includes(sku);
                      const isDragOver = dragState.dragOverIndex === index;
                      
                      return (
                        <div key={sku} className="relative">
                          {isDragOver && (
                            <div className="absolute -top-1 left-0 right-0 h-0.5 bg-blue-500 rounded-full z-10"></div>
                          )}
                          <div 
                            draggable
                            onDragStart={(e) => handleDragStart(e, sku)}
                            onDragOver={(e) => handlePdfDragOver(e, index)}
                            onDrop={(e) => handlePdfDrop(e, index)}
                            onDragEnd={handleDragEnd}
                            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                              isDragged ? 'opacity-50 bg-gray-100 border-dashed' : 
                              isSelected ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-center flex-1">
                              <div className="cursor-grab active:cursor-grabbing p-1 mr-1 text-gray-400 hover:text-gray-600">
                                <GripVertical className="w-5 h-5" />
                              </div>
                              <input 
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSkuSelection(sku)}
                                className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              {renamingSku?.oldSku === sku ? (
                                <input
                                  type="text"
                                  value={renamingSku.newSku}
                                  onChange={(e) => setRenamingSku({ ...renamingSku, newSku: e.target.value })}
                                  onBlur={() => handleRenameSkuSubmit()}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameSkuSubmit();
                                    if (e.key === 'Escape') setRenamingSku(null);
                                  }}
                                  autoFocus
                                  className="font-medium text-gray-800 border border-blue-500 rounded px-2 py-0.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              ) : (
                                <span 
                                  className="font-medium text-gray-800 cursor-pointer hover:text-blue-600 border-b border-transparent hover:border-blue-600 transition-colors"
                                  onClick={() => setRenamingSku({ oldSku: sku, newSku: sku })}
                                  title="Click to rename"
                                >
                                  {sku}
                                </span>
                              )}
                              <div className="ml-4 flex space-x-2 text-xs">
                                {pdfModal.skuGroups[sku].some((item: any) => item.color === 'white') && <span className="px-2 py-1 bg-white border border-gray-200 rounded text-gray-600">White</span>}
                                {pdfModal.skuGroups[sku].some((item: any) => item.color === 'charcoal') && <span className="px-2 py-1 bg-gray-800 text-white rounded">Bronze</span>}
                              </div>
                            </div>
                            <div className="flex space-x-1">
                              <button
                                onClick={() => handleOpenLinkResource(sku)}
                                className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Link Unused Resource"
                              >
                                <Link className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => setPdfModal(prev => prev ? { ...prev, expandedDoubleDoorSku: prev.expandedDoubleDoorSku === sku ? null : sku } : null)}
                                className={`p-1 rounded transition-colors ${pdfModal.expandedDoubleDoorSku === sku ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                                title="Double Door Settings"
                              >
                                <Settings2 className="w-5 h-5" />
                              </button>
                              <button 
                                onClick={() => moveSku(index, -1)}
                                disabled={index === 0}
                                className="p-1 text-gray-500 hover:bg-gray-200 rounded disabled:opacity-30"
                              >
                                <ChevronUp className="w-5 h-5" />
                              </button>
                              <button 
                                onClick={() => moveSku(index, 1)}
                                disabled={index === pdfModal.skus.length - 1}
                                className="p-1 text-gray-500 hover:bg-gray-200 rounded disabled:opacity-30"
                              >
                                <ChevronDown className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                          
                          {pdfModal.expandedDoubleDoorSku === sku && (
                            <div className="mt-2 p-4 bg-white border border-gray-200 rounded-lg shadow-sm animate-in slide-in-from-top-2 duration-200">
                              <h4 className="text-sm font-medium text-gray-900 mb-3">Double Door Configuration</h4>
                              <div className="space-y-4">
                                <DoorPreview 
                                  sku={sku} 
                                  config={pdfModal.doubleDoorConfigs[sku]} 
                                  item={pdfModal.skuGroups[sku].find((i: any) => i.color !== 'white') || pdfModal.skuGroups[sku][0]} 
                                  autoCropDoors={pdfModal.autoCropDoors}
                                  frostedGlass={pdfModal.frostedGlass}
                                  getDB={getDB}
                                  autoCropWhiteBackground={autoCropWhiteBackground}
                                  unifyGlassColor={unifyGlassColor}
                                  createDoubleDoorDataUrl={createDoubleDoorDataUrl}
                                />
                                <div>
                                  <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-medium text-gray-700">Overlap Ratio</label>
                                    <span className="text-xs text-gray-500">{Math.round((pdfModal.doubleDoorConfigs[sku]?.overlapRatio ?? 0.18) * 100)}%</span>
                                  </div>
                                  <input 
                                    type="range" 
                                    min="0" 
                                    max="0.5" 
                                    step="0.01" 
                                    value={pdfModal.doubleDoorConfigs[sku]?.overlapRatio ?? 0.18}
                                    onChange={(e) => handleDoubleDoorConfigChange(sku, {
                                      ...(pdfModal.doubleDoorConfigs[sku] || { flipLeft: false, flipRight: true }),
                                      overlapRatio: parseFloat(e.target.value)
                                    })}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                  />
                                </div>
                                <div className="flex gap-4">
                                  <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                                    <input 
                                      type="checkbox" 
                                      checked={pdfModal.doubleDoorConfigs[sku]?.flipLeft ?? false}
                                      onChange={(e) => handleDoubleDoorConfigChange(sku, {
                                        ...(pdfModal.doubleDoorConfigs[sku] || { overlapRatio: 0.18, flipRight: true }),
                                        flipLeft: e.target.checked
                                      })}
                                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>Flip Left Door</span>
                                  </label>
                                  <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                                    <input 
                                      type="checkbox" 
                                      checked={pdfModal.doubleDoorConfigs[sku]?.flipRight ?? true}
                                      onChange={(e) => handleDoubleDoorConfigChange(sku, {
                                        ...(pdfModal.doubleDoorConfigs[sku] || { overlapRatio: 0.18, flipLeft: false }),
                                        flipRight: e.target.checked
                                      })}
                                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>Flip Right Door</span>
                                  </label>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Add a drop zone at the very end to allow dropping at the bottom */}
                    {dragState.isDragging && (
                      <div 
                        onDragOver={(e) => handlePdfDragOver(e, pdfModal.skus.length)}
                        onDrop={(e) => handlePdfDrop(e, pdfModal.skus.length)}
                        className="h-8 rounded-lg border-2 border-dashed border-transparent hover:border-blue-300 transition-colors"
                      >
                        {dragState.dragOverIndex === pdfModal.skus.length && (
                          <div className="h-0.5 bg-blue-500 rounded-full mt-3"></div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Covers UI */}
                  <div className="mt-6 border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">Catalog Covers</h3>
                    <div className="space-y-4">
                      {/* Front Cover */}
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">Front Cover</span>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center text-xs text-gray-600 cursor-pointer">
                              <input 
                                type="checkbox"
                                checked={pdfModal.covers.front?.isDoubleDoor || false}
                                onChange={(e) => setPdfModal(prev => prev ? {
                                  ...prev,
                                  covers: {
                                    ...prev.covers,
                                    front: { ...prev.covers.front, isDoubleDoor: e.target.checked }
                                  }
                                } : null)}
                                className="mr-1.5 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                              />
                              Double Door
                            </label>
                            <select 
                              value={pdfModal.covers.front?.targetSku || pdfModal.skus[0]}
                              onChange={(e) => handleTargetSkuChangeCover('front', e.target.value)}
                              className="text-sm border-gray-300 rounded-md shadow-sm focus:ring-gray-900 focus:border-gray-900"
                            >
                              {pdfModal.skus.map(sku => (
                                <option key={sku} value={sku}>{sku}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        
                        {pdfModal.covers.front?.imageUrl ? (
                          <div className="relative aspect-[3/4] w-full bg-gray-200 rounded overflow-hidden group">
                            <img src={pdfModal.covers.front.imageUrl || undefined} alt="Front Cover" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button 
                                onClick={() => handleGenerateCover('front', pdfModal.covers.front?.targetSku || pdfModal.skus[0])}
                                className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 flex items-center"
                                disabled={pdfModal.covers.front.isGenerating}
                              >
                                {pdfModal.covers.front.isGenerating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                                Regenerate
                              </button>
                              <button 
                                onClick={() => {
                                  const a = document.createElement('a');
                                  a.href = pdfModal.covers.front!.imageUrl!;
                                  a.download = `Front_Cover.png`;
                                  a.click();
                                }}
                                className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 flex items-center"
                              >
                                <Download className="w-3 h-3 mr-1" />
                                Download
                              </button>
                              <label className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 cursor-pointer flex items-center">
                                <Upload className="w-3 h-3 mr-1" />
                                Upload
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => handleUploadCover('front', e)}
                                />
                              </label>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleGenerateCover('front', pdfModal.covers.front?.targetSku || pdfModal.skus[0])}
                              disabled={pdfModal.covers.front?.isGenerating}
                              className="flex-1 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center"
                            >
                              {pdfModal.covers.front?.isGenerating ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                              ) : (
                                <><ImageIcon className="w-4 h-4 mr-2" /> Generate AI Cover</>
                              )}
                            </button>
                            <label className="flex-1 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 cursor-pointer flex items-center justify-center">
                              <Upload className="w-4 h-4 mr-2" />
                              Upload Custom
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={(e) => handleUploadCover('front', e)}
                              />
                            </label>
                          </div>
                        )}

                        {/* Overlay Section */}
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">Luxury Overlay Banner</span>
                          {pdfModal.covers.front?.overlayImageUrl ? (
                            <div className="relative w-full aspect-[4/1] bg-gray-200 rounded overflow-hidden group">
                              <img src={pdfModal.covers.front.overlayImageUrl || undefined} alt="Front Cover Overlay" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button 
                                  onClick={() => handleGenerateOverlay('front')}
                                  className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 flex items-center"
                                  disabled={pdfModal.covers.front.isGeneratingOverlay}
                                >
                                  {pdfModal.covers.front.isGeneratingOverlay ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                                  Regenerate
                                </button>
                                <button 
                                  onClick={() => {
                                    const a = document.createElement('a');
                                    a.href = pdfModal.covers.front!.overlayImageUrl!;
                                    a.download = `Front_Cover_Overlay.png`;
                                    a.click();
                                  }}
                                  className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 flex items-center"
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  Download
                                </button>
                                <label className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 cursor-pointer flex items-center">
                                  <Upload className="w-3 h-3 mr-1" />
                                  Upload
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={(e) => handleUploadOverlay('front', e)}
                                  />
                                </label>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleGenerateOverlay('front')}
                                disabled={pdfModal.covers.front?.isGeneratingOverlay}
                                className="flex-1 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-medium rounded-lg hover:bg-indigo-100 disabled:opacity-50 flex items-center justify-center"
                              >
                                {pdfModal.covers.front?.isGeneratingOverlay ? (
                                  <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Generating...</>
                                ) : (
                                  <><Sparkles className="w-3 h-3 mr-2" /> Generate Luxury Overlay</>
                                )}
                              </button>
                              <label className="flex-1 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 cursor-pointer flex items-center justify-center">
                                <Upload className="w-3 h-3 mr-2" />
                                Upload Custom
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => handleUploadOverlay('front', e)}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Back Cover */}
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">Back Cover</span>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center text-xs text-gray-600 cursor-pointer">
                              <input 
                                type="checkbox"
                                checked={pdfModal.covers.back?.isDoubleDoor || false}
                                onChange={(e) => setPdfModal(prev => prev ? {
                                  ...prev,
                                  covers: {
                                    ...prev.covers,
                                    back: { ...prev.covers.back, isDoubleDoor: e.target.checked }
                                  }
                                } : null)}
                                className="mr-1.5 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                              />
                              Double Door
                            </label>
                            <select 
                              value={pdfModal.covers.back?.targetSku || pdfModal.skus[0]}
                              onChange={(e) => handleTargetSkuChangeCover('back', e.target.value)}
                              className="text-sm border-gray-300 rounded-md shadow-sm focus:ring-gray-900 focus:border-gray-900"
                            >
                              {pdfModal.skus.map(sku => (
                                <option key={sku} value={sku}>{sku}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        
                        {pdfModal.covers.back?.imageUrl ? (
                          <div className="relative aspect-[3/4] w-full bg-gray-200 rounded overflow-hidden group">
                            <img src={pdfModal.covers.back.imageUrl || undefined} alt="Back Cover" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button 
                                onClick={() => handleGenerateCover('back', pdfModal.covers.back?.targetSku || pdfModal.skus[0])}
                                className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 flex items-center"
                                disabled={pdfModal.covers.back.isGenerating}
                              >
                                {pdfModal.covers.back.isGenerating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                                Regenerate
                              </button>
                              <button 
                                onClick={() => {
                                  const a = document.createElement('a');
                                  a.href = pdfModal.covers.back!.imageUrl!;
                                  a.download = `Back_Cover.png`;
                                  a.click();
                                }}
                                className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 flex items-center"
                              >
                                <Download className="w-3 h-3 mr-1" />
                                Download
                              </button>
                              <label className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 cursor-pointer flex items-center">
                                <Upload className="w-3 h-3 mr-1" />
                                Upload
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => handleUploadCover('back', e)}
                                />
                              </label>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleGenerateCover('back', pdfModal.covers.back?.targetSku || pdfModal.skus[0])}
                              disabled={pdfModal.covers.back?.isGenerating}
                              className="flex-1 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center"
                            >
                              {pdfModal.covers.back?.isGenerating ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                              ) : (
                                <><ImageIcon className="w-4 h-4 mr-2" /> Generate AI Cover</>
                              )}
                            </button>
                            <label className="flex-1 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 cursor-pointer flex items-center justify-center">
                              <Upload className="w-4 h-4 mr-2" />
                              Upload Custom
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={(e) => handleUploadCover('back', e)}
                              />
                            </label>
                          </div>
                        )}

                        {/* Overlay Section */}
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">Luxury Overlay Banner</span>
                          {pdfModal.covers.back?.overlayImageUrl ? (
                            <div className="relative w-full aspect-[4/1] bg-gray-200 rounded overflow-hidden group">
                              <img src={pdfModal.covers.back.overlayImageUrl || undefined} alt="Back Cover Overlay" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button 
                                  onClick={() => handleGenerateOverlay('back')}
                                  className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 flex items-center"
                                  disabled={pdfModal.covers.back.isGeneratingOverlay}
                                >
                                  {pdfModal.covers.back.isGeneratingOverlay ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                                  Regenerate
                                </button>
                                <button 
                                  onClick={() => {
                                    const a = document.createElement('a');
                                    a.href = pdfModal.covers.back!.overlayImageUrl!;
                                    a.download = `Back_Cover_Overlay.png`;
                                    a.click();
                                  }}
                                  className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 flex items-center"
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  Download
                                </button>
                                <label className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 cursor-pointer flex items-center">
                                  <Upload className="w-3 h-3 mr-1" />
                                  Upload
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={(e) => handleUploadOverlay('back', e)}
                                  />
                                </label>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleGenerateOverlay('back')}
                                disabled={pdfModal.covers.back?.isGeneratingOverlay}
                                className="flex-1 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-medium rounded-lg hover:bg-indigo-100 disabled:opacity-50 flex items-center justify-center"
                              >
                                {pdfModal.covers.back?.isGeneratingOverlay ? (
                                  <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Generating...</>
                                ) : (
                                  <><Sparkles className="w-3 h-3 mr-2" /> Generate Luxury Overlay</>
                                )}
                              </button>
                              <label className="flex-1 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 cursor-pointer flex items-center justify-center">
                                <Upload className="w-3 h-3 mr-2" />
                                Upload Custom
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => handleUploadOverlay('back', e)}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Spreads UI */}
                  {Math.floor(pdfModal.skus.length / 10) > 0 && (
                    <div className="mt-6 border-t border-gray-200 pt-4">
                      <h3 className="text-sm font-medium text-gray-900 mb-3">Magazine Spreads (1 per 10 doors)</h3>
                      <div className="space-y-4">
                        {Array.from({ length: Math.floor(pdfModal.skus.length / 10) }).map((_, i) => {
                          const chunk = pdfModal.skus.slice(i * 10, (i + 1) * 10);
                          const spread = pdfModal.spreads[i] || {};
                          const targetSku = spread.targetSku && chunk.includes(spread.targetSku) ? spread.targetSku : chunk[0];
                          
                          return (
                            <div key={i} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-700">Spread {i + 1} (After Door { (i + 1) * 10 })</span>
                                <select 
                                  value={targetSku}
                                  onChange={(e) => handleTargetSkuChange(i, e.target.value)}
                                  className="text-sm border-gray-300 rounded-md shadow-sm focus:ring-gray-900 focus:border-gray-900"
                                >
                                  {chunk.map(sku => (
                                    <option key={sku} value={sku}>{sku}</option>
                                  ))}
                                </select>
                              </div>
                              
                              {spread.imageUrl ? (
                                <div className="relative aspect-video w-full bg-gray-200 rounded overflow-hidden group">
                                  <img src={spread.imageUrl || undefined} alt={`Spread ${i + 1}`} className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <button 
                                      onClick={() => handleGenerateSpread(i, targetSku)}
                                      className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 flex items-center"
                                      disabled={spread.isGenerating}
                                    >
                                      {spread.isGenerating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                                      Regenerate
                                    </button>
                                    <button 
                                      onClick={() => {
                                        const a = document.createElement('a');
                                        a.href = spread.imageUrl!;
                                        a.download = `Spread_${i + 1}.png`;
                                        a.click();
                                      }}
                                      className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 flex items-center"
                                    >
                                      <Download className="w-3 h-3 mr-1" />
                                      Download
                                    </button>
                                    <label className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded shadow hover:bg-gray-50 cursor-pointer flex items-center">
                                      <Upload className="w-3 h-3 mr-1" />
                                      Upload
                                      <input 
                                        type="file" 
                                        accept="image/*" 
                                        className="hidden" 
                                        onChange={(e) => handleUploadSpread(i, e)}
                                      />
                                    </label>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleGenerateSpread(i, targetSku)}
                                    disabled={spread.isGenerating}
                                    className="flex-1 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center"
                                  >
                                    {spread.isGenerating ? (
                                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                                    ) : (
                                      <><ImageIcon className="w-4 h-4 mr-2" /> Generate AI Spread</>
                                    )}
                                  </button>
                                  <label className="flex-1 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 cursor-pointer flex items-center justify-center">
                                    <Upload className="w-4 h-4 mr-2" />
                                    Upload Custom
                                    <input 
                                      type="file" 
                                      accept="image/*" 
                                      className="hidden" 
                                      onChange={(e) => handleUploadSpread(i, e)}
                                    />
                                  </label>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            
            {linkingSku && (
              <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-10 flex flex-col rounded-2xl animate-in fade-in duration-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-gray-800">Link Unused Resource to {linkingSku}</h3>
                  <button onClick={() => setLinkingSku(null)} className="text-gray-400 hover:text-gray-600">
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                  {unusedBlobs.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Archive className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>No unused resources found.</p>
                      <p className="text-sm mt-2">All completed images are currently linked to SKUs.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {unusedBlobs.map(item => (
                        <div 
                          key={item.id} 
                          className="border border-gray-200 rounded-lg p-3 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group"
                          onClick={() => handleLinkResource(item)}
                        >
                          <div className="aspect-square bg-gray-100 rounded mb-2 overflow-hidden relative">
                            {item.resultUrl ? (
                              <img src={item.resultUrl || undefined} alt={item.fileName} className="w-full h-full object-contain" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400">No Image</div>
                            )}
                            <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/10 transition-colors flex items-center justify-center">
                              <Link className="w-8 h-8 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
                            </div>
                          </div>
                          <div className="text-xs font-medium text-gray-800 truncate" title={item.fileName}>{item.fileName}</div>
                          <div className="text-xs text-gray-500 capitalize mt-1">{item.color}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {!pdfModal.isGenerating && (
              <div className="p-6 border-t border-gray-100 flex justify-end space-x-3">
                <button 
                  onClick={() => setPdfModal(null)}
                  disabled={pdfModal.isSorting}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={generatePDF}
                  disabled={pdfModal.isSorting}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center disabled:opacity-50"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Create PDF
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Guide Image Modal (Structural Fix / Reshape) */}
      {guideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {guideModal.type === 'reshape' ? 'Reshape (Full Restructure): ' : 'Structural Fix: '} 
              {guideModal.fileName}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Upload or paste a red/blue structural guide image to correct the shape of this door. Red represents glass, blue represents material.
            </p>
            
            <div 
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors cursor-pointer mb-4"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (e: any) => {
                  const file = e.target.files?.[0];
                  if (file) submitGuideImage(file);
                };
                input.click();
              }}
            >
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                  {guideModal.type === 'reshape' ? <Wand2 className="w-6 h-6" /> : <Wrench className="w-6 h-6" />}
                </div>
                <div className="text-sm font-medium text-gray-700">
                  Click to upload or <span className="text-indigo-600 font-semibold">Ctrl+V</span> to paste
                </div>
                <div className="text-xs text-gray-500">
                  Supports PNG, JPG, WEBP
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setGuideModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert Modal */}
      {errorAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Error</h3>
            <p className="text-gray-600 mb-6">{errorAlert}</p>
            <button
              onClick={() => setErrorAlert(null)}
              className="w-full px-4 py-2 rounded-xl font-medium text-white bg-gray-900 hover:bg-black transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PdfExtractorModal 
        isOpen={isExtractorModalOpen} 
        onClose={() => setIsExtractorModalOpen(false)} 
        onRestore={handleRestoreFromPdf} 
      />
    </div>
  );
}

const DoorPreview = ({ 
  sku, 
  config, 
  item, 
  autoCropDoors,
  frostedGlass,
  getDB,
  autoCropWhiteBackground,
  unifyGlassColor,
  createDoubleDoorDataUrl
}: { 
  sku: string, 
  config: any, 
  item: any,
  autoCropDoors: boolean,
  frostedGlass: boolean,
  getDB: () => Promise<any>,
  autoCropWhiteBackground: (blob: Blob) => Promise<Blob>,
  unifyGlassColor: (blob: Blob) => Promise<Blob>,
  createDoubleDoorDataUrl: (blob: Blob, w: number, h: number, config: any) => Promise<string>
}) => {
  const [singleDataUrl, setSingleDataUrl] = useState<string | null>(null);
  const [doubleDataUrl, setDoubleDataUrl] = useState<string | null>(null);
  
  useEffect(() => {
    let active = true;
    const load = async () => {
      const db = await getDB();
      const dbItem = await db.get('queue', item.id);
      if (dbItem && dbItem.resultBlob && active) {
        let processBlob = autoCropDoors ? await autoCropWhiteBackground(dbItem.resultBlob) : dbItem.resultBlob;
        if (frostedGlass && processBlob) processBlob = await unifyGlassColor(processBlob);
        
        if (processBlob && processBlob instanceof Blob) {
          const singleUrl = URL.createObjectURL(processBlob);
          if (active) setSingleDataUrl(singleUrl);
          
          const doubleUrl = await createDoubleDoorDataUrl(processBlob, 400, 400, config);
          if (active) setDoubleDataUrl(doubleUrl);
        }
      }
    };
    load();
    return () => { 
      active = false; 
      if (singleDataUrl) URL.revokeObjectURL(singleDataUrl);
    };
  }, [item.id, config, autoCropDoors, frostedGlass]);
  
  if (!singleDataUrl || !doubleDataUrl) return <div className="h-48 bg-gray-100 animate-pulse rounded flex items-center justify-center text-gray-400 text-sm">Loading preview...</div>;
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-gray-50 rounded p-4 flex flex-col items-center border border-gray-200 relative group overflow-hidden">
        <span className="text-xs text-gray-500 mb-2 font-medium">Single Door</span>
        <img src={singleDataUrl || undefined} className="max-h-40 object-contain drop-shadow-md" alt={`Single door preview for ${sku}`} />
        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button 
            onClick={() => {
              const a = document.createElement('a');
              a.href = singleDataUrl;
              a.download = `${sku}_Single.png`;
              a.click();
            }}
            className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md text-gray-700 hover:text-black hover:scale-105 transition-all"
            title="Download Single Door"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="bg-gray-50 rounded p-4 flex flex-col items-center border border-gray-200 relative group overflow-hidden">
        <span className="text-xs text-gray-500 mb-2 font-medium">Double Door</span>
        <img src={doubleDataUrl || undefined} className="max-h-40 object-contain drop-shadow-md" alt={`Double door preview for ${sku}`} />
        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button 
            onClick={() => {
              const a = document.createElement('a');
              a.href = doubleDataUrl;
              a.download = `${sku}_Double.png`;
              a.click();
            }}
            className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md text-gray-700 hover:text-black hover:scale-105 transition-all"
            title="Download Double Door"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ApiKeyCheck>
      <DoorCatalogMaker />
    </ApiKeyCheck>
  );
}

