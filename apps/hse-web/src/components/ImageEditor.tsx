import React, { useRef, useState, useEffect } from 'react';
import { Camera, RotateCcw, Check, Sparkles } from 'lucide-react';

interface ImageEditorProps {
  imageSrc: string; // Base64 or Object URL of raw captured image
  onSave: (editedBlob: Blob, editedDataUrl: string) => void;
  onCancel: () => void;
}

export const ImageEditor: React.FC<ImageEditorProps> = ({
  imageSrc,
  onSave,
  onCancel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [hasDrawn, setHasDrawn] = useState(false);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = () => {
      setImageObj(img);
    };
  }, [imageSrc]);

  // Render original image on canvas when image loads
  useEffect(() => {
    if (imageObj && canvasRef.current) {
      drawCanvas();
    }
  }, [imageObj]);

  const drawCanvas = () => {
    if (!imageObj || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Limit layout size for drawing
    const maxDim = 800;
    let width = imageObj.width;
    let height = imageObj.height;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(imageObj, 0, 0, width, height);
    setHasDrawn(false);
  };

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Calculate scale factor in case css dimensions differ from canvas dimensions
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);
    setIsDrawing(true);
    setStartPos(pos);
    setCurrentPos(pos);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current || !imageObj) return;
    const pos = getMousePos(e);
    setCurrentPos(pos);

    // Redraw image first to avoid trails
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageObj, 0, 0, canvas.width, canvas.height);

    // Draw preview circle
    ctx.beginPath();
    const radius = Math.sqrt(
      Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2)
    );
    ctx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#EF4444'; // Red highlight
    ctx.stroke();

    // Draw simple danger alert text above circle
    ctx.fillStyle = '#EF4444';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('AREA BAHAYA K3', startPos.x - 50, startPos.y - radius - 8);
  };

  const handleMouseUp = () => {
    if (isDrawing) {
      setIsDrawing(false);
      setHasDrawn(true);
    }
  };

  const handleReset = () => {
    drawCanvas();
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        onSave(blob, url);
      }
    }, 'image/jpeg', 0.9);
  };

  return (
    <div className="flex flex-col items-center gap-4 bg-slate-950 p-6 rounded-2xl border border-slate-800 w-full max-w-3xl">
      <div className="text-center">
        <h3 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
          <Sparkles size={16} className="text-[#828200]" />
          Editor Sorotan Bahaya K3
        </h3>
        <p className="text-[11px] text-slate-400 mt-1">
          Klik dan tarik (drag) kursor di atas gambar untuk menggambar lingkaran merah sorotan area berbahaya.
        </p>
      </div>

      {/* Editor Canvas view */}
      <div className="relative border border-slate-800 rounded-xl overflow-hidden bg-black max-w-full">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="max-w-full block cursor-crosshair"
        />
      </div>

      {/* Toolbar controls */}
      <div className="flex gap-3 w-full justify-between items-center px-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white rounded-xl text-xs transition"
        >
          Batal
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded-xl text-xs flex items-center gap-1.5 transition"
          >
            <RotateCcw size={13} /> Reset Gambar
          </button>
          
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-[#828200] hover:bg-[#999900] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Check size={14} /> Terapkan Sorotan
          </button>
        </div>
      </div>
    </div>
  );
};
export default ImageEditor;
