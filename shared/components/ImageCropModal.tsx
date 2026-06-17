import React, { useRef, useState, useEffect } from 'react';
import { Scissors, X, RefreshCw, ZoomIn, ZoomOut, Download, Check } from 'lucide-react';
import './ImageCropModal.css';

export interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string; // Object URL or base64 data URL
  onSave: (croppedBlob: Blob, croppedDataUrl: string) => void;
  onCancel: () => void;
}

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  imageSrc,
  onSave,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const maskRef = useRef<HTMLDivElement | null>(null);
  const cropFrameRef = useRef<HTMLDivElement | null>(null);

  // Zoom & Rotation States
  const [zoom, setZoom] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);

  // Container & Image Layout States
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [imageLayout, setImageLayout] = useState({ dispW: 0, dispH: 0, naturalW: 0, naturalH: 0 });

  // Crop Box state (in container coordinates)
  const [crop, setCrop] = useState<CropBox>({ x: 50, y: 50, width: 200, height: 150 });

  // Interaction State
  const [dragAction, setDragAction] = useState<string | null>(null);
  const dragStartRef = useRef<{
    cursorX: number;
    cursorY: number;
    cropX: number;
    cropY: number;
    cropW: number;
    cropH: number;
  }>({ cursorX: 0, cursorY: 0, cropX: 0, cropY: 0, cropW: 0, cropH: 0 });

  // Reset controls
  const handleReset = () => {
    setZoom(1.0);
    setRotation(0);
    initializeCropBox(containerSize.width, containerSize.height);
  };

  // Set default crop box centered with 4:3 aspect ratio
  const initializeCropBox = (contW: number, contH: number) => {
    if (contW <= 0 || contH <= 0) return;
    
    // Default size is 75% of container width or height (keeping 4:3 aspect ratio)
    let w = contW * 0.75;
    let h = w * (3 / 4);

    if (h > contH * 0.75) {
      h = contH * 0.75;
      w = h * (4 / 3);
    }

    const x = (contW - w) / 2;
    const y = (contH - h) / 2;

    setCrop({ x, y, width: w, height: h });
  };

  // Handle container resizing or initial load
  useEffect(() => {
    if (!isOpen) return;

    const updateContainerSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
        initializeCropBox(rect.width, rect.height);
      }
    };

    // Delay slightly to ensure layout is complete
    const timer = setTimeout(updateContainerSize, 100);

    window.addEventListener('resize', updateContainerSize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateContainerSize);
    };
  }, [isOpen, imageSrc]);

  // Handle Image load
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;

    if (containerSize.width > 0 && containerSize.height > 0) {
      // Calculate fit dimensions
      const scaleX = containerSize.width / naturalW;
      const scaleY = containerSize.height / naturalH;
      const scale = Math.min(scaleX, scaleY);

      const dispW = naturalW * scale;
      const dispH = naturalH * scale;

      setImageLayout({ dispW, dispH, naturalW, naturalH });
    }
  };

  // Recalculate image layout when container size changes
  useEffect(() => {
    if (imageRef.current && containerSize.width > 0 && containerSize.height > 0) {
      const img = imageRef.current;
      const naturalW = img.naturalWidth || 1280;
      const naturalH = img.naturalHeight || 720;

      const scaleX = containerSize.width / naturalW;
      const scaleY = containerSize.height / naturalH;
      const scale = Math.min(scaleX, scaleY);

      const dispW = naturalW * scale;
      const dispH = naturalH * scale;

      setImageLayout({ dispW, dispH, naturalW, naturalH });
    }
  }, [containerSize]);

  // Dynamic ref-based style application to clear CSS inline style warnings
  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;
    img.style.width = imageLayout.dispW > 0 ? `${imageLayout.dispW}px` : 'auto';
    img.style.height = imageLayout.dispH > 0 ? `${imageLayout.dispH}px` : 'auto';
    img.style.transform = `scale(${zoom}) rotate(${rotation}deg)`;
    img.style.transformOrigin = 'center';
    img.style.transition = dragAction ? 'none' : 'transform 0.1s ease-out';
  }, [imageLayout, zoom, rotation, dragAction]);

  useEffect(() => {
    const mask = maskRef.current;
    if (mask) {
      mask.style.boxShadow = '0 0 0 9999px rgba(0, 0, 0, 0.65)';
      mask.style.left = `${crop.x}px`;
      mask.style.top = `${crop.y}px`;
      mask.style.width = `${crop.width}px`;
      mask.style.height = `${crop.height}px`;
    }

    const frame = cropFrameRef.current;
    if (frame) {
      frame.style.left = `${crop.x}px`;
      frame.style.top = `${crop.y}px`;
      frame.style.width = `${crop.width}px`;
      frame.style.height = `${crop.height}px`;
    }
  }, [crop]);

  // Handle Drag/Resize Interaction MouseDown / TouchStart
  const handleStartDrag = (e: React.MouseEvent | React.TouchEvent, action: string) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    setDragAction(action);
    dragStartRef.current = {
      cursorX: clientX,
      cursorY: clientY,
      cropX: crop.x,
      cropY: crop.y,
      cropW: crop.width,
      cropH: crop.height,
    };
  };

  // Handle MouseMove / TouchMove on Window
  useEffect(() => {
    const handleMoveDrag = (clientX: number, clientY: number) => {
      if (!dragAction) return;

      const deltaX = clientX - dragStartRef.current.cursorX;
      const deltaY = clientY - dragStartRef.current.cursorY;
      const start = dragStartRef.current;

      const contW = containerSize.width;
      const contH = containerSize.height;

      let newCrop = { ...crop };

      if (dragAction === 'move') {
        newCrop.x = Math.max(0, Math.min(contW - start.cropW, start.cropX + deltaX));
        newCrop.y = Math.max(0, Math.min(contH - start.cropH, start.cropY + deltaY));
      } else {
        const minSize = 40;

        if (dragAction === 'resize-br') {
          // Bottom-Right
          const newW = Math.max(minSize, Math.min(contW - start.cropX, start.cropW + deltaX));
          const newH = Math.max(minSize, Math.min(contH - start.cropY, start.cropH + deltaY));
          newCrop.width = newW;
          newCrop.height = newH;
        } else if (dragAction === 'resize-bl') {
          // Bottom-Left
          let newW = start.cropW - deltaX;
          if (newW < minSize) {
            newW = minSize;
          }
          let newX = start.cropX + (start.cropW - newW);
          if (newX < 0) {
            newX = 0;
            newW = start.cropX + start.cropW;
          }
          const newH = Math.max(minSize, Math.min(contH - start.cropY, start.cropH + deltaY));

          newCrop.x = newX;
          newCrop.width = newW;
          newCrop.height = newH;
        } else if (dragAction === 'resize-tr') {
          // Top-Right
          const newW = Math.max(minSize, Math.min(contW - start.cropX, start.cropW + deltaX));
          let newH = start.cropH - deltaY;
          if (newH < minSize) {
            newH = minSize;
          }
          let newY = start.cropY + (start.cropH - newH);
          if (newY < 0) {
            newY = 0;
            newH = start.cropY + start.cropH;
          }

          newCrop.y = newY;
          newCrop.width = newW;
          newCrop.height = newH;
        } else if (dragAction === 'resize-tl') {
          // Top-Left
          let newW = start.cropW - deltaX;
          if (newW < minSize) {
            newW = minSize;
          }
          let newX = start.cropX + (start.cropW - newW);
          if (newX < 0) {
            newX = 0;
            newW = start.cropX + start.cropW;
          }

          let newH = start.cropH - deltaY;
          if (newH < minSize) {
            newH = minSize;
          }
          let newY = start.cropY + (start.cropH - newH);
          if (newY < 0) {
            newY = 0;
            newH = start.cropY + start.cropH;
          }

          newCrop.x = newX;
          newCrop.y = newY;
          newCrop.width = newW;
          newCrop.height = newH;
        }
      }

      setCrop(newCrop);
    };

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (dragAction) handleMoveDrag(e.clientX, e.clientY);
    };

    const handleWindowTouchMove = (e: TouchEvent) => {
      if (dragAction && e.touches.length > 0) {
        handleMoveDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleWindowMouseUp = () => {
      setDragAction(null);
    };

    if (dragAction) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('touchmove', handleWindowTouchMove, { passive: true });
      window.addEventListener('mouseup', handleWindowMouseUp);
      window.addEventListener('touchend', handleWindowMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('touchmove', handleWindowTouchMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('touchend', handleWindowMouseUp);
    };
  }, [dragAction, crop, containerSize]);

  // Execute high resolution crop on canvas
  const handleApplyCrop = () => {
    if (!imageRef.current || imageLayout.dispW <= 0) return;

    const img = imageRef.current;
    const { dispW, dispH, naturalW, naturalH } = imageLayout;

    // Calculate layout display scale factor (natural to display fit)
    const scale = dispW / naturalW;

    // Container coordinates calculations
    const centerX = containerSize.width / 2;
    const centerY = containerSize.height / 2;

    const cropCenterX = crop.x + crop.width / 2;
    const cropCenterY = crop.y + crop.height / 2;

    // Bounding crop box center offset from container center
    const dx = cropCenterX - centerX;
    const dy = cropCenterY - centerY;

    // High resolution output scale
    const outputScale = naturalW / dispW;
    const outW = crop.width * outputScale;
    const outH = crop.height * outputScale;

    // Create high-resolution crop canvas
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Translate context to center of output canvas
    ctx.translate(outW / 2, outH / 2);

    // 2. Shift to negative coordinates of crop box offset (compensating displacement in output pixels)
    ctx.translate(-dx * outputScale, -dy * outputScale);

    // 3. Apply rotation (in radians)
    ctx.rotate((rotation * Math.PI) / 180);

    // 4. Apply scale (combine zoom with output high-res multiplier scale)
    ctx.scale(zoom * outputScale, zoom * outputScale);

    // 5. Draw the image centered
    ctx.drawImage(img, -dispW / 2, -dispH / 2, dispW, dispH);

    // Convert canvas content to blob
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          onSave(blob, url);
        }
      },
      'image/jpeg',
      0.88
    );
  };

  // Instant photo download of crop preview content
  const handleDownloadCrop = () => {
    if (!imageRef.current || imageLayout.dispW <= 0) return;
    const img = imageRef.current;
    const { dispW, dispH, naturalW } = imageLayout;

    const scale = dispW / naturalW;
    const centerX = containerSize.width / 2;
    const centerY = containerSize.height / 2;
    const cropCenterX = crop.x + crop.width / 2;
    const cropCenterY = crop.y + crop.height / 2;
    const dx = cropCenterX - centerX;
    const dy = cropCenterY - centerY;

    const outputScale = naturalW / dispW;
    const outW = crop.width * outputScale;
    const outH = crop.height * outputScale;

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.translate(outW / 2, outH / 2);
    ctx.translate(-dx * outputScale, -dy * outputScale);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom * outputScale, zoom * outputScale);
    ctx.drawImage(img, -dispW / 2, -dispH / 2, dispW, dispH);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `crop_doc_${Date.now()}.jpg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      },
      'image/jpeg',
      0.90
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 select-none">
      <div className="relative w-full max-w-md md:max-w-2xl bg-[#0b0f19] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800/80 flex justify-between items-center bg-[#0d1322]/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#828200]/15 text-[#999900] rounded-xl flex items-center justify-center">
              <Scissors size={18} className="stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">
                Sesuaikan & Potong Foto (Crop)
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                Atur area potongan dengan menyeret kotak atau geser parameter zoom dan putaran
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            title="Batal"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Viewport Area */}
        <div className="relative flex-1 min-h-[300px] max-h-[50vh] bg-black flex items-center justify-center overflow-hidden">
          
          {/* Main Crop Work Container */}
          <div
            ref={containerRef}
            className="relative w-full h-full flex items-center justify-center overflow-hidden"
          >
            {/* Image to be cropped */}
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Source Crop"
              onLoad={handleImageLoad}
              className="object-contain max-w-full max-h-full pointer-events-none"
            />

            {/* Dark Mask Backdrop (darkens areas outside the crop selection box) */}
            <div
              ref={maskRef}
              className="absolute inset-0 pointer-events-none"
            />

            {/* Interactive Crop Frame Overlay */}
            <div
              ref={cropFrameRef}
              className="absolute border border-dashed border-[#999900] cursor-move flex items-center justify-center"
              onMouseDown={(e) => handleStartDrag(e, 'move')}
              onTouchStart={(e) => handleStartDrag(e, 'move')}
            >
              {/* Corner brackets with larger touch targets */}
              <div
                onMouseDown={(e) => handleStartDrag(e, 'resize-tl')}
                onTouchStart={(e) => handleStartDrag(e, 'resize-tl')}
                className="absolute -top-2 -left-2 w-8 h-8 flex items-start justify-start cursor-nwse-resize select-none"
              >
                <div className="w-4 h-4 border-t-3 border-l-3 border-[#999900]" />
              </div>
              <div
                onMouseDown={(e) => handleStartDrag(e, 'resize-tr')}
                onTouchStart={(e) => handleStartDrag(e, 'resize-tr')}
                className="absolute -top-2 -right-2 w-8 h-8 flex items-start justify-end cursor-nesw-resize select-none"
              >
                <div className="w-4 h-4 border-t-3 border-r-3 border-[#999900]" />
              </div>
              <div
                onMouseDown={(e) => handleStartDrag(e, 'resize-bl')}
                onTouchStart={(e) => handleStartDrag(e, 'resize-bl')}
                className="absolute -bottom-2 -left-2 w-8 h-8 flex items-end justify-start cursor-nesw-resize select-none"
              >
                <div className="w-4 h-4 border-b-3 border-l-3 border-[#999900]" />
              </div>
              <div
                onMouseDown={(e) => handleStartDrag(e, 'resize-br')}
                onTouchStart={(e) => handleStartDrag(e, 'resize-br')}
                className="absolute -bottom-2 -right-2 w-8 h-8 flex items-end justify-end cursor-nwse-resize select-none"
              >
                <div className="w-4 h-4 border-b-3 border-r-3 border-[#999900]" />
              </div>
            </div>
          </div>

          {/* Reset button inside viewport (Top-Right) */}
          <button
            type="button"
            onClick={handleReset}
            title="Reset Papan Edit"
            className="absolute top-4 right-4 p-2 bg-black/60 backdrop-blur-md border border-slate-800 text-slate-300 hover:text-white rounded-full hover:bg-black/90 active:scale-90 transition cursor-pointer"
          >
            <RefreshCw size={15} />
          </button>
        </div>

        {/* Sliders Container (Zoom & Rotation) */}
        <div className="p-5 bg-[#0d1322]/40 border-t border-slate-900 flex flex-col gap-4">
          
          {/* Zoom Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs font-bold text-slate-400">
              <span className="flex items-center gap-1">
                <ZoomIn size={14} className="text-[#999900]" /> Perbesaran Gambar (Zoom)
              </span>
              <span className="px-2 py-0.5 bg-[#828200]/15 text-[#999900] text-[10px] font-mono rounded font-extrabold">
                {zoom.toFixed(1)}x
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setZoom(prev => Math.max(1.0, prev - 0.2))}
                title="Perkecil Zoom"
                className="text-slate-500 hover:text-[#999900] cursor-pointer"
              >
                <ZoomOut size={16} />
              </button>
              <input
                type="range"
                min="1.0"
                max="4.0"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                title="Zoom Slider"
                className="flex-1 accent-[#828200] bg-slate-950 h-1 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setZoom(prev => Math.min(4.0, prev + 0.2))}
                title="Perbesar Zoom"
                className="text-slate-500 hover:text-[#999900] cursor-pointer"
              >
                <ZoomIn size={16} />
              </button>
            </div>
          </div>

          {/* Rotation Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs font-bold text-slate-400">
              <span className="flex items-center gap-1">
                <RefreshCw size={14} className="text-[#999900] animate-spin-slow" /> Rotasi Gambar
              </span>
              <span className="px-2 py-0.5 bg-[#828200]/15 text-[#999900] text-[10px] font-mono rounded font-extrabold">
                {rotation}°
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRotation(prev => (prev - 90 < 0 ? 270 : prev - 90))}
                title="Putar Kiri 90 Derajat"
                className="text-[10px] text-[#999900] font-bold border border-[#828200]/40 px-2 py-0.5 rounded bg-[#828200]/5 hover:bg-[#828200]/15 transition cursor-pointer"
              >
                -90°
              </button>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={rotation}
                onChange={(e) => setRotation(parseInt(e.target.value))}
                title="Rotation Slider"
                className="flex-1 accent-[#828200] bg-slate-950 h-1 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setRotation(prev => (prev + 90 > 360 ? 90 : prev + 90))}
                title="Putar Kanan 90 Derajat"
                className="text-[10px] text-[#999900] font-bold border border-[#828200]/40 px-2 py-0.5 rounded bg-[#828200]/5 hover:bg-[#828200]/15 transition cursor-pointer"
              >
                +90°
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800/80 bg-[#0d1322]/90 flex justify-between items-center">
          {/* Bottom Left: Download */}
          <button
            type="button"
            onClick={handleDownloadCrop}
            className="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border border-[#828200]/40 hover:bg-[#828200]/10 text-[#999900] cursor-pointer shadow-md"
          >
            <Download size={14} />
            Unduh Crop
          </button>

          {/* Bottom Right: Cancel / Apply */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:text-white text-slate-400 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleApplyCrop}
              className="px-4 py-2 bg-[#828200] hover:bg-[#999900] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-lg active:scale-95 border border-[#999900]/25"
            >
              <Check size={14} />
              Terapkan Potongan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageCropModal;
