import React, { useState } from 'react';
import { RefreshCw, Palette } from 'lucide-react';
import { QueueItemUI } from './QueueItemCard';

export interface ColorSyncPluginProps {
  queue: QueueItemUI[];
  setQueue: React.Dispatch<React.SetStateAction<QueueItemUI[]>>;
  pdfModal: any;
  setPdfModal: React.Dispatch<React.SetStateAction<any>>;
  updateQueueItem: (id: string, updates: Partial<QueueItemUI>, dbUpdates?: any) => Promise<void>;
}

// Quick color detector that analyzes image pixels to determine if it's White or Bronze
const detectColorFromImage = async (url: string): Promise<'white' | 'charcoal'> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('white');
        return;
      }
      
      // Scale down, but keep enough resolution to detect thin frames
      canvas.width = 100;
      canvas.height = 100;
      ctx.drawImage(img, 0, 0, 100, 100);
      
      try {
        const imageData = ctx.getImageData(0, 0, 100, 100);
        const data = imageData.data;
        
        let darkPixelCount = 0;
        let pixelCount = 0;
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          const a = data[i+3];
          
          // Ignore transparent or near-transparent pixels
          if (a > 50) {
            pixelCount++;
            // Calculate perceived brightness
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            // Bronze doors will have very dark pixels (black/dark brown).
            // We use a strict threshold (< 80) to avoid counting light gray shadows on white doors.
            if (brightness < 80) {
              darkPixelCount++;
            }
          }
        }
        
        if (pixelCount === 0) {
          resolve('white');
          return;
        }
        
        // Even a thin bronze frame will have > 1.5% dark pixels.
        // White doors will mostly have white/light gray pixels.
        const darkRatio = darkPixelCount / pixelCount;
        if (darkRatio > 0.015) {
          resolve('charcoal'); // Internally 'charcoal' represents 'Bronze'
        } else {
          resolve('white');
        }
      } catch (e) {
        console.error("Canvas error:", e);
        resolve('white');
      }
    };
    img.onerror = () => {
      resolve('white');
    };
    img.src = url;
  });
};

export const ColorSyncPlugin: React.FC<ColorSyncPluginProps> = ({ 
  queue, 
  setQueue, 
  pdfModal, 
  setPdfModal,
  updateQueueItem 
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  const handleSync = async () => {
    if (!pdfModal) return;
    setIsSyncing(true);
    
    try {
      let updatedCount = 0;
      const newSkuGroups = { ...pdfModal.skuGroups };
      
      const completedItems = queue.filter(item => item.status === 'completed');

      // Phased analysis process
      for (let i = 0; i < completedItems.length; i++) {
        const item = completedItems[i];
        setSyncStatus(`Analyzing ${i + 1} of ${completedItems.length}...`);
        
        // Use resultUrl if available, otherwise originalUrl
        const urlToAnalyze = item.resultUrl || item.originalUrl;
        if (!urlToAnalyze) continue;
        
        const detectedColor = await detectColorFromImage(urlToAnalyze);
        
        // If we detected a color and it doesn't match the current color
        if (detectedColor !== item.color) {
          // Update the item in the database and queue
          await updateQueueItem(item.id, { color: detectedColor }, { color: detectedColor });
          updatedCount++;
          
          // Update the pdfModal.skuGroups if this item is in it
          const sku = item.sku || item.fileName;
          if (sku && newSkuGroups[sku]) {
             const group = newSkuGroups[sku];
             
             // Find the item in the array and update its color
             const index = group.findIndex((gItem: any) => gItem.id === item.id);
             if (index !== -1) {
               group[index] = { ...group[index], color: detectedColor };
             }
          }
        }
        
        // Small delay to allow UI to update and show the phased analysis
        await new Promise(r => setTimeout(r, 20));
      }

      if (updatedCount > 0) {
        setPdfModal({ ...pdfModal, skuGroups: newSkuGroups });
        alert(`Sync complete! Updated ${updatedCount} items to their correct colors (White/Bronze) based on image analysis.`);
      } else {
        alert("Sync complete! All items already have the correct color tag (White/Bronze).");
      }

    } catch (error) {
      console.error("Failed to sync colors", error);
      alert("Failed to sync colors. Check console for details.");
    } finally {
      setIsSyncing(false);
      setSyncStatus('');
    }
  };

  return (
    <div className="flex items-center">
      <button
        onClick={handleSync}
        disabled={isSyncing}
        className="flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
        title="Analyze images and assign proper White/Bronze tags"
      >
        {isSyncing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Palette className="w-4 h-4 mr-2" />}
        {isSyncing ? 'Syncing...' : 'Sync Colors'}
      </button>
      {isSyncing && syncStatus && (
        <span className="ml-2 text-xs text-indigo-600 font-medium animate-pulse">{syncStatus}</span>
      )}
    </div>
  );
};
