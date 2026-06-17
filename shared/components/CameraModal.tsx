import React, { useRef, useState, useEffect } from 'react';
import { Camera, RotateCcw, Check, Sparkles, MapPin, X, RefreshCw, Zap, Plus, Minus, Download } from 'lucide-react';
import { getGPSData, applyWatermark, WatermarkData, drawWatermarkOnCanvas } from '../utils/camera';
import './CameraModal.css';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageBlob: Blob, dataUrl: string) => void;
  detailUnit?: string;
  brandTitle?: string;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  detailUnit,
  brandTitle,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsData, setGpsData] = useState<WatermarkData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Preview state hooks
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  // Camera switching & device management state
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState<number>(0);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Flashlight & Zoom state
  const [torchOn, setTorchOn] = useState(false);
  const [zoomVal, setZoomVal] = useState<number>(1.0);

  // Callback ref to dynamically set scale style on mount/update and avoid JSX inline style warning
  const videoRefCallback = React.useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node) {
        node.style.transform = `scale(${zoomVal})`;
        node.style.transformOrigin = 'center';
      }
    },
    [zoomVal]
  );

  // Initialize camera stream and search devices
  useEffect(() => {
    if (isOpen) {
      startCamera();
      fetchGPS();
    } else {
      stopCamera();
      // Clean up preview Object URLs to prevent memory leak
      if (previewDataUrl) {
        URL.revokeObjectURL(previewDataUrl);
      }
      setPreviewDataUrl(null);
      setPreviewBlob(null);
      setZoomVal(1.0);
      setTorchOn(false);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async (deviceId?: string) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      stopCamera();

      // Enumerate available video inputs first
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setVideoDevices(videoInputs);

      // Select proper deviceId if requested, else match state
      const targetDeviceId = deviceId || activeDeviceId;
      
      const constraints: MediaStreamConstraints = {
        video: targetDeviceId
          ? { deviceId: { exact: targetDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr) {
        console.warn('Initial camera access failed, trying ideal video fallback:', firstErr);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        } catch (secondErr) {
          console.warn('Ideal video fallback failed, trying basic video constraint:', secondErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Reset torch/flashlight local state
      setTorchOn(false);
    } catch (err: any) {
      console.error('Error accessing camera:', err);
      setErrorMsg('Gagal mengakses kamera. Pastikan izin kamera diaktifkan.');
    } finally {
      setLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const fetchGPS = async () => {
    setGpsLoading(true);
    try {
      const data = await getGPSData();
      setGpsData(data);
    } catch (err) {
      console.error('GPS fetch error', err);
    } finally {
      setGpsLoading(false);
    }
  };

  // Toggle Front / Back Camera or cycle through all input devices
  const handleSwitchCamera = async () => {
    if (videoDevices.length > 1) {
      const nextIndex = (currentDeviceIndex + 1) % videoDevices.length;
      setCurrentDeviceIndex(nextIndex);
      const nextDevice = videoDevices[nextIndex];
      setActiveDeviceId(nextDevice.deviceId);
      await startCamera(nextDevice.deviceId);
    } else {
      const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
      setFacingMode(nextFacing);
      
      setErrorMsg(null);
      setLoading(true);
      try {
        stopCamera();
        const constraints = {
          video: { facingMode: nextFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Error switching facing mode:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  // Toggle Flashlight/Torch (Only works on mobile Chrome/Android with flash capability)
  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() as any : null;
      if (capabilities && capabilities.torch) {
        const nextState = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState }]
        } as any);
        setTorchOn(nextState);
      } else {
        console.warn('Flashlight/Torch constraint is not supported on this track/browser.');
        // Visually toggle anyway so user sees active state
        setTorchOn(!torchOn);
      }
    } catch (err) {
      console.error('Failed to apply torch constraint:', err);
      setTorchOn(!torchOn);
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || !streamRef.current) return;

    setLoading(true);
    try {
      const video = videoRef.current;
      if (!video) throw new Error('Video element not found');

      // Crucial fallbacks for video stream dimensions on mobile devices/webviews
      const sourceWidth = video.videoWidth || video.clientWidth || 1280;
      const sourceHeight = video.videoHeight || video.clientHeight || 720;

      // Calculate target scaled dimensions (limit max dimension to 1280px to compress memory and keep watermark size consistent)
      const maxDim = 1280;
      let targetWidth = sourceWidth;
      let targetHeight = sourceHeight;
      
      if (targetWidth > maxDim || targetHeight > maxDim) {
        if (targetWidth > targetHeight) {
          targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
          targetWidth = maxDim;
        } else {
          targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
          targetHeight = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Context not available');

      // If simulated zoom is applied, crop the center of the video frame
      if (zoomVal > 1.0) {
        const cropWidth = sourceWidth / zoomVal;
        const cropHeight = sourceHeight / zoomVal;
        const startX = (sourceWidth - cropWidth) / 2;
        const startY = (sourceHeight - cropHeight) / 2;
        ctx.drawImage(video, startX, startY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);
      } else {
        ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
      }

      // Do NOT block camera shutter capture waiting for GPS fetch. Use background-loaded gpsData or fallback.
      const activeGps = gpsData || {
        timestamp: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB',
        address: 'Mengambil alamat lokasi...'
      };

      // Apply Burn-on-Apply Watermark directly onto the captured canvas!
      drawWatermarkOnCanvas(canvas, {
        ...activeGps,
        detailUnit,
        brandTitle,
      });

      // Output compressed blob
      const watermarkedBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas conversion failed'));
            }
          },
          'image/jpeg',
          0.75 // 75% quality compression
        );
      });
      const watermarkedDataUrl = URL.createObjectURL(watermarkedBlob);

      // Stop camera stream but don't call onCapture yet. We show the preview!
      stopCamera();
      setPreviewBlob(watermarkedBlob);
      setPreviewDataUrl(watermarkedDataUrl);
    } catch (err: any) {
      console.error('Error capturing image:', err);
      setErrorMsg('Gagal mengambil gambar atau menambahkan watermark.');
    } finally {
      setLoading(false);
    }
  };

  const handleUsePhoto = () => {
    if (previewBlob && previewDataUrl) {
      onCapture(previewBlob, previewDataUrl);
      onClose();
    }
  };

  const handleDownload = () => {
    if (!previewDataUrl) return;
    const a = document.createElement('a');
    a.href = previewDataUrl;
    a.download = `photo_${detailUnit ? detailUnit.toLowerCase().replace(/\s+/g, '_') : 'unit'}_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRetake = () => {
    if (previewDataUrl) {
      URL.revokeObjectURL(previewDataUrl);
    }
    setPreviewDataUrl(null);
    setPreviewBlob(null);
    setZoomVal(1.0);
    setTorchOn(false);
    startCamera();
  };

  const handleZoomChange = (val: number) => {
    const clamped = Math.max(1.0, Math.min(4.0, val));
    setZoomVal(clamped);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      {/* Card container with Premium Dark Palette */}
      <div className="relative w-full max-w-md md:max-w-2xl bg-[#0b0f19] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh]">
        
        {/* Header (Top Bar matching user's mock exactly) */}
        <div className="p-4 border-b border-slate-800/80 flex justify-between items-center bg-[#0d1322]/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/15 text-amber-500 rounded-xl flex items-center justify-center">
              <Camera size={18} className="stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">
                Ambil Foto Dokumentasi
              </h3>
              <p className="text-[10.5px] text-amber-500/90 font-mono mt-0.5 flex items-center gap-1">
                <MapPin size={11} className="text-amber-500 animate-pulse" />
                {gpsData?.latitude && gpsData?.longitude ? (
                  `${gpsData.latitude.toFixed(6)}, ${gpsData.longitude.toFixed(6)} (±${gpsData.accuracy ? Math.round(gpsData.accuracy) : 37}m)`
                ) : (
                  'Mendapatkan data GPS...'
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup Kamera"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Viewfinder / Video Feed Area with exact overlay guides */}
        <div className="relative flex-1 min-h-[320px] max-h-[55vh] bg-black flex items-center justify-center overflow-hidden">
          
          {/* Active View: Live Video or Captured Image Preview */}
          {previewDataUrl ? (
            <img
              src={previewDataUrl}
              alt="Hasil Tangkapan Kamera"
              className="w-full h-full object-contain"
            />
          ) : errorMsg ? (
            <div className="text-center p-6 z-20">
              <p className="text-red-400 font-semibold mb-3 text-sm">{errorMsg}</p>
              <button
                onClick={() => startCamera()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs transition"
              >
                Coba Lagi
              </button>
            </div>
          ) : (
            <video
              ref={videoRefCallback}
              autoPlay
              playsInline
              className="w-full h-full object-cover transition-transform duration-200 ease-out"
            />
          )}

          {/* Loading Overlays */}
          {!previewDataUrl && (loading || gpsLoading) && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-3 text-white z-30">
              <div className="w-10 h-10 border-4 border-slate-800 border-t-amber-500 rounded-full animate-spin"></div>
              <p className="text-xs font-mono tracking-wider text-slate-400">
                {gpsLoading ? 'Menyinkronkan GPS & Alamat...' : 'Menyiapkan Kamera...'}
              </p>
            </div>
          )}

          {/* OVERLAYS ON CAMERA STREAM (Only when stream is active) */}
          {!previewDataUrl && !errorMsg && (
            <>
              {/* Top-Right Label: ✓ TERVERIFIKASI */}
              <div className="camera-verified-badge bg-emerald-950/70 backdrop-blur-md border border-emerald-500/35 px-3 py-1 rounded-full text-emerald-400 font-extrabold text-[10px] tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block mr-1"></span>
                ✓ TERVERIFIKASI
              </div>

              {/* Focus L-Brackets Corners */}
              <div className="camera-focus-corners">
                <div className="camera-corner-tl w-6 h-6 border-t-2 border-l-2 border-white/50 rounded-tl-sm"></div>
                <div className="camera-corner-tr w-6 h-6 border-t-2 border-r-2 border-white/50 rounded-tr-sm"></div>
                <div className="camera-corner-bl w-6 h-6 border-b-2 border-l-2 border-white/50 rounded-bl-sm"></div>
                <div className="camera-corner-br w-6 h-6 border-b-2 border-r-2 border-white/50 rounded-br-sm"></div>
              </div>

              {/* Left Column Controls: Camera Switch and Torch */}
              <div className="camera-left-controls">
                {/* Switch Camera */}
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  title="Ganti Kamera"
                  className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-black/85 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <RefreshCw size={20} className="stroke-[2]" />
                </button>

                {/* Torch/Flashlight */}
                <button
                  type="button"
                  onClick={handleToggleTorch}
                  title="Senter"
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    torchOn
                      ? 'bg-amber-500 text-[#0b0f19] hover:bg-amber-400 shadow-lg shadow-amber-500/35'
                      : 'bg-black/60 backdrop-blur-md border border-white/10 text-amber-500 hover:bg-black/85 hover:scale-105 active:scale-95'
                  }`}
                >
                  <Zap size={20} className={torchOn ? 'fill-current stroke-[2]' : 'stroke-[2]'} />
                </button>
              </div>

              {/* Right Column Controls: Zoom Slider */}
              <div className="camera-zoom-controls">
                <div className="bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-2xl flex flex-col items-center gap-3">
                  {/* Zoom-In button */}
                  <button
                    type="button"
                    onClick={() => handleZoomChange(zoomVal + 0.5)}
                    className="text-white hover:text-amber-500 transition active:scale-90 cursor-pointer"
                    title="Perbesar"
                  >
                    <Plus size={16} className="stroke-[2.5]" />
                  </button>

                  {/* Vertical Slider input */}
                  <div className="h-28 flex items-center justify-center">
                    <input
                      type="range"
                      min="1.0"
                      max="4.0"
                      step="0.1"
                      value={zoomVal}
                      onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                      className="zoom-slider"
                      title="Zoom Slider"
                    />
                  </div>

                  {/* Zoom-Out button */}
                  <button
                    type="button"
                    onClick={() => handleZoomChange(zoomVal - 0.5)}
                    className="text-white hover:text-amber-500 transition active:scale-90 cursor-pointer"
                    title="Perkecil"
                  >
                    <Minus size={16} className="stroke-[2.5]" />
                  </button>
                </div>

                {/* Scale factor text display */}
                <div className="px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-sm border border-white/10 text-[10px] font-extrabold text-white font-mono shadow-md">
                  {zoomVal.toFixed(1)}x
                </div>
              </div>

              {/* Bottom Left Corner Overlay: Watermark Preview */}
              {gpsData && (
                <div className="camera-watermark-preview bg-black/60 backdrop-blur-md border border-white/10 p-3.5 rounded-xl text-left shadow-xl">
                  {/* Vertical yellow line */}
                  <div className="w-1.5 bg-amber-500 rounded-full self-stretch flex-shrink-0"></div>
                  
                  {/* Text content block */}
                  <div className="camera-watermark-text-block">
                    <p className="camera-watermark-item text-amber-500 text-xs font-bold font-sans uppercase tracking-wide">
                      PT PAWA INDONESIA ENGINEER
                    </p>
                    <p className="camera-watermark-item text-white text-[10px] font-bold font-sans uppercase tracking-wide">
                      {detailUnit ? `UNIT: ${detailUnit.toUpperCase()}` : 'KEGIATAN: DOKUMENTASI ENGINEER'}
                    </p>
                    <p className="camera-watermark-item text-slate-300 text-[9px] font-medium font-mono">
                      {gpsData.timestamp}
                    </p>
                    <p className="camera-watermark-item text-amber-500 text-[9px] font-bold font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block mr-0.5 flex-shrink-0 border border-white/20"></span>
                      {gpsData.latitude?.toFixed(6) ?? '-'}, {gpsData.longitude?.toFixed(6) ?? '-'} (±{gpsData.accuracy ? Math.round(gpsData.accuracy) : 37}m)
                    </p>
                    <p className="camera-watermark-address text-slate-400 text-[8px] font-medium leading-relaxed font-sans line-clamp-2 mt-0.5">
                      {gpsData.address ?? 'Mengambil alamat lokasi...'}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions (Premium Native-Like Circular Layout) */}
        <div className="p-4 border-t border-slate-800/80 flex justify-center items-center bg-[#0d1322]/90">
          {previewDataUrl ? (
            <div className="flex items-center justify-center gap-6 w-full max-w-sm">
              {/* Left: Retake */}
              <button
                onClick={handleRetake}
                title="Ambil Ulang"
                className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center shadow transition-all duration-200 active:scale-90 flex-shrink-0 cursor-pointer"
              >
                <RotateCcw size={18} className="stroke-[2]" />
              </button>

              {/* Center: Use Photo */}
              <button
                onClick={handleUsePhoto}
                title="Gunakan Foto"
                className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 text-[#070b13] flex items-center justify-center shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/45 transition-all duration-200 active:scale-90 flex-shrink-0 cursor-pointer"
              >
                <Check size={28} className="stroke-[3]" />
              </button>

              {/* Right: Download */}
              <button
                onClick={handleDownload}
                title="Download Foto"
                className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center shadow transition-all duration-200 active:scale-90 flex-shrink-0 cursor-pointer"
              >
                <Download size={18} className="stroke-[2]" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-6 w-full max-w-xs">
              {/* Left: Refresh GPS */}
              <button
                onClick={fetchGPS}
                disabled={gpsLoading || loading}
                title="Perbarui GPS"
                className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center shadow transition-all duration-200 active:scale-90 disabled:opacity-40 flex-shrink-0 cursor-pointer"
              >
                <RotateCcw size={18} className={`stroke-[2] ${gpsLoading ? 'animate-spin' : ''}`} />
              </button>

              {/* Center: Shutter button (Premium concentric design matching reference) */}
              <button
                onClick={handleCapture}
                disabled={loading || errorMsg !== null}
                title="Ambil Foto"
                className="w-20 h-20 rounded-full bg-slate-800/60 border-4 border-slate-700/50 flex items-center justify-center hover:bg-slate-800/90 active:scale-95 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xl"
              >
                <div className="w-12 h-12 rounded-full bg-slate-100 shadow-inner hover:bg-white transition-all"></div>
              </button>

              {/* Right: Batal */}
              <button
                onClick={onClose}
                title="Batal"
                className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center shadow transition-all duration-200 active:scale-90 flex-shrink-0 cursor-pointer"
              >
                <X size={18} className="stroke-[2]" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CameraModal;
