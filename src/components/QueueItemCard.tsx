import React, { useRef } from 'react';
import { CheckCircle2, Loader2, XCircle, Clock, Trash2, Download, RefreshCw, Paintbrush, Sparkles, Droplets, Wrench, Wand2 } from 'lucide-react';

export interface QueueItemUI {
  id: string;
  originalUrl: string;
  fileName: string;
  sku?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultUrl?: string;
  color: 'white' | 'charcoal';
  hideDoubleDoor: boolean;
  error?: string;
  colorUnified: boolean;
  skipColorCheck: boolean;
  highContrastMode: boolean;
  isRepaint: boolean;
  isPolish: boolean;
  isGlassTune: boolean;
  isStructuralFix?: boolean;
  isReshape?: boolean;
}

interface QueueItemCardProps {
  item: QueueItemUI;
  onDelete: (id: string) => void;
  onDownload: (id: string, fileName: string, color: string) => void;
  onRerender: (id: string) => void;
  onResetGlassOnly: (id: string) => void;
  onRepaint: (id: string) => void;
  onPolish: (id: string) => void;
  onGlassTune: (id: string) => void;
  onStructuralFix: (id: string, fileName: string) => void;
  onReshape: (id: string, fileName: string) => void;
  onToggleHideDoubleDoor: (id: string, hide: boolean) => void;
  onToggleSkipColorCheck: (id: string, skip: boolean) => void;
  onToggleHighContrastMode: (id: string, highContrast: boolean) => void;
  onToggleColor: (id: string) => void;
}

export const QueueItemCard: React.FC<QueueItemCardProps> = ({
  item,
  onDelete,
  onDownload,
  onRerender,
  onResetGlassOnly,
  onRepaint,
  onPolish,
  onGlassTune,
  onStructuralFix,
  onReshape,
  onToggleHideDoubleDoor,
  onToggleSkipColorCheck,
  onToggleHighContrastMode,
  onToggleColor
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col">
      {/* Status Banner */}
      <div className={`px-3 py-2 text-xs font-medium flex items-center justify-between border-b ${
        item.status === 'completed' ? 'bg-green-50 text-green-700 border-green-100' :
        item.status === 'processing' ? 'bg-blue-50 text-blue-700 border-blue-100' :
        item.status === 'failed' ? 'bg-red-50 text-red-700 border-red-100' :
        'bg-gray-50 text-gray-600 border-gray-100'
      }`}>
        <div className="flex items-center capitalize">
          {item.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
          {item.status === 'processing' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          {item.status === 'failed' && <XCircle className="w-3.5 h-3.5 mr-1.5" />}
          {item.status === 'pending' && <Clock className="w-3.5 h-3.5 mr-1.5" />}
          {item.status}
        </div>
        <button 
          onClick={() => onDelete(item.id)}
          className="text-gray-400 hover:text-red-500 transition-colors"
          title="Remove from queue"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Image Container */}
      <div className="relative aspect-[9/16] bg-gray-100 p-4 flex items-center justify-center group">
        {((item.status === 'completed' || ((item.isRepaint || item.isPolish || item.isGlassTune || item.isStructuralFix || item.isReshape) && item.status === 'processing')) && item.resultUrl) ? (
          <>
            <img 
              src={item.resultUrl || undefined} 
              alt={`Rendered ${item.fileName}`} 
              className={`max-w-full max-h-full object-contain drop-shadow-md transition-opacity ${item.status === 'processing' ? 'opacity-30' : 'opacity-100'}`}
              referrerPolicy="no-referrer"
            />
            {item.status === 'processing' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
                <span className="text-xs font-medium text-blue-700 bg-white/80 px-2 py-1 rounded-md">{item.isReshape ? 'Reshaping...' : item.isStructuralFix ? 'Fixing Structure...' : item.isPolish ? 'Polishing 4K...' : item.isGlassTune ? 'Tuning Glass...' : 'Repainting...'}</span>
              </div>
            )}
            {item.status === 'completed' && (
              <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 flex-wrap p-2">
                <button 
                  onClick={() => onDownload(item.id, item.fileName, item.color)}
                  className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md text-gray-700 hover:text-black hover:scale-105 transition-all"
                  title="Download 4K Render"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => onRerender(item.id)}
                  className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md text-gray-700 hover:text-blue-600 hover:scale-105 transition-all"
                  title="Re-render (Full AI)"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => onResetGlassOnly(item.id)}
                  className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md text-gray-700 hover:text-amber-600 hover:scale-105 transition-all"
                  title="Reset & Apply Glass Only (Skip AI)"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => onRepaint(item.id)}
                  className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md text-gray-700 hover:text-purple-600 hover:scale-105 transition-all"
                  title={`Repaint to ${item.color === 'charcoal' ? 'Bronze' : 'White'}`}
                >
                  <Paintbrush className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => onPolish(item.id)}
                  className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md text-gray-700 hover:text-emerald-600 hover:scale-105 transition-all"
                  title="Phase 2 Polish (Remove Hardware)"
                >
                  <Sparkles className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => onGlassTune(item.id)}
                  className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md text-gray-700 hover:text-cyan-600 hover:scale-105 transition-all"
                  title="Tune Glass"
                >
                  <Droplets className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => onStructuralFix(item.id, item.fileName)}
                  className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md text-gray-700 hover:text-indigo-600 hover:scale-105 transition-all"
                  title="Structural Fix (Upload Red/Blue Reference)"
                >
                  <Wrench className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => onReshape(item.id, item.fileName)}
                  className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md text-gray-700 hover:text-purple-600 hover:scale-105 transition-all"
                  title="Reshape (Aggressive Restructure)"
                >
                  <Wand2 className="w-5 h-5" />
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <img 
              src={item.originalUrl || undefined} 
              alt={item.fileName} 
              className={`max-w-full max-h-full object-contain opacity-50 ${item.status === 'processing' ? 'animate-pulse' : ''}`}
              referrerPolicy="no-referrer"
            />
            {item.status === 'processing' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
                <span className="text-xs font-medium text-blue-700 bg-white/80 px-2 py-1 rounded-md">Generating 4K...</span>
              </div>
            )}
            {item.status === 'failed' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 p-4 text-center">
                <XCircle className="w-8 h-8 text-red-500 mb-2" />
                <span className="text-xs font-medium text-red-700 mb-2">{item.error || 'Generation failed'}</span>
                <button 
                  onClick={() => onRerender(item.id)}
                  className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Info Section */}
      <div className="p-3 bg-white border-t border-gray-100 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="truncate pr-2">
            <div className="text-xs font-medium text-gray-800 truncate" title={item.fileName}>
              {item.sku || item.fileName}
            </div>
            <div className="text-[10px] text-gray-500 capitalize mt-0.5 flex items-center gap-1">
              <button 
                onClick={() => onToggleColor(item.id)}
                className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors capitalize"
                title="Toggle Color"
              >
                {item.color === 'charcoal' ? 'Bronze' : item.color}
              </button> 
              <span>• {item.hideDoubleDoor ? 'Single Only' : 'Single & Double'}</span>
            </div>
          </div>
        </div>
        
        {/* Item-specific settings */}
        <div className="pt-2 border-t border-gray-50 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-2 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={item.hideDoubleDoor}
                onChange={(e) => onToggleHideDoubleDoor(item.id, e.target.checked)}
                className="w-3 h-3 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
              />
              <span className="text-[10px] font-medium text-gray-500 group-hover:text-gray-700 transition-colors">Hide Double Door</span>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-2 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={item.skipColorCheck}
                onChange={(e) => onToggleSkipColorCheck(item.id, e.target.checked)}
                className="w-3 h-3 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
              />
              <span className="text-[10px] font-medium text-gray-500 group-hover:text-gray-700 transition-colors">Skip Color Check</span>
            </label>
            {item.status === 'completed' && item.colorUnified && (
              <span className="text-[9px] font-semibold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">
                Unified
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-2 cursor-pointer group" title="Use this if the image has white-on-glass or low contrast details">
              <input 
                type="checkbox" 
                checked={item.highContrastMode}
                onChange={(e) => onToggleHighContrastMode(item.id, e.target.checked)}
                className="w-3 h-3 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
              />
              <span className="text-[10px] font-medium text-gray-500 group-hover:text-gray-700 transition-colors">High Contrast Mode</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
