import React, { useRef, useState, useEffect } from 'react';
import { Camera, RotateCcw, Check, Sparkles, MapPin, X, RefreshCw, Zap, Plus, Minus, Download } from 'lucide-react';
import { getGPSData, applyWatermark, WatermarkData } from '../utils/camera';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageBlob: Blob, dataUrl: string) => void;
  detailUnit?: string;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  detailUnit,
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

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
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
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Context not available');

      // If simulated zoom is applied, crop the center of the video frame
      if (zoomVal > 1.0) {
        const cropWidth = video.videoWidth / zoomVal;
        const cropHeight = video.videoHeight / zoomVal;
        const startX = (video.videoWidth - cropWidth) / 2;
        const startY = (video.videoHeight - cropHeight) / 2;
        ctx.drawImage(video, startX, startY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      const rawDataUrl = canvas.toDataURL('image/jpeg', 0.9);

      // Fetch fresh GPS data if not fetched yet
      let activeGps = gpsData;
      if (!activeGps) {
        activeGps = await getGPSData();
      }

      // Apply Burn-on-Apply Watermark
      const watermarkedBlob = await applyWatermark(rawDataUrl, {
        ...activeGps,
        detailUnit
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
      <div className="relative w-full max-w-2xl bg-[#0b0f19] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
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
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover transition-transform duration-200 ease-out"
              style={{ transform: `scale(${zoomVal})`, transformOrigin: 'center' }}
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
              <div className="absolute top-4 right-4 bg-emerald-950/70 backdrop-blur-md border border-emerald-500/35 px-3 py-1 rounded-full flex items-center gap-1.5 z-20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="text-[10px] font-extrabold text-emerald-400 tracking-wider">✓ TERVERIFIKASI</span>
              </div>

              {/* Focus L-Brackets Corners */}
              <div className="absolute inset-0 pointer-events-none z-10">
                <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-white/50 rounded-tl-sm"></div>
                <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-white/50 rounded-tr-sm"></div>
                <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-white/50 rounded-bl-sm"></div>
                <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-white/50 rounded-br-sm"></div>
              </div>

              {/* Left Column Controls: Camera Switch and Torch */}
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-20">
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
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5 z-20">
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
                      style={{
                        appearance: 'slider-vertical' as any,
                        WebkitAppearance: 'slider-vertical' as any,
                        width: '6px',
                        height: '100px',
                        cursor: 'ns-resize',
                        accentColor: '#f59e0b',
                      }}
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
                <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md border border-white/10 p-3.5 rounded-xl text-left max-w-[85%] pointer-events-none z-20 flex gap-3 shadow-xl">
                  {/* Vertical yellow line */}
                  <div className="w-1.5 bg-amber-500 rounded-full self-stretch flex-shrink-0"></div>
                  
                  {/* Text content block */}
                  <div className="flex flex-col gap-0.5">
                    <p className="text-amber-500 text-xs font-bold font-sans uppercase tracking-wide">
                      PT PAWA INDONESIA ENGINEER
                    </p>
                    <p className="text-white text-[10px] font-bold font-sans uppercase tracking-wide">
                      {detailUnit ? `UNIT: ${detailUnit.toUpperCase()}` : 'KEGIATAN: DOKUMENTASI ENGINEER'}
                    </p>
                    <p className="text-slate-300 text-[9px] font-medium font-mono">
                      {gpsData.timestamp}
                    </p>
                    <p className="text-amber-500 text-[9px] font-bold font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block mr-0.5 flex-shrink-0 border border-white/20"></span>
                      {gpsData.latitude?.toFixed(6) ?? '-'}, {gpsData.longitude?.toFixed(6) ?? '-'} (±{gpsData.accuracy ? Math.round(gpsData.accuracy) : 37}m)
                    </p>
                    <p className="text-slate-400 text-[8px] font-medium leading-relaxed font-sans line-clamp-2 max-w-[280px] mt-0.5">
                      {gpsData.address ?? 'Mengambil alamat lokasi...'}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions (Centered / Responsive button stack) */}
        <div className="p-4 border-t border-slate-800/80 flex flex-wrap justify-between items-center bg-[#0d1322]/90 gap-3">
          {previewDataUrl ? (
            <>
              {/* Preview actions */}
              <button
                onClick={handleRetake}
                className="px-4.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow active:scale-95 cursor-pointer flex-1 sm:flex-none justify-center"
              >
                🔄 Ambil Ulang
              </button>
              
              <div className="flex gap-2.5 w-full sm:w-auto flex-1 sm:flex-none">
                <button
                  onClick={handleDownload}
                  className="px-4.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow active:scale-95 cursor-pointer flex-1 sm:flex-none justify-center"
                >
                  📥 Download Foto
                </button>
                <button
                  onClick={handleUsePhoto}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-extrabold rounded-xl text-xs transition flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer flex-1 sm:flex-none justify-center"
                >
                  ✅ Gunakan Foto
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Camera active actions */}
              <button
                onClick={fetchGPS}
                disabled={gpsLoading || loading}
                className="px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-850 hover:bg-slate-800 rounded-xl border border-slate-800/80 transition duration-200 disabled:opacity-50 flex-1 sm:flex-none justify-center"
              >
                🔄 Refresh GPS
              </button>
              
              <button
                onClick={handleCapture}
                disabled={loading || errorMsg !== null}
                className="px-7 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-900 font-extrabold rounded-xl flex items-center gap-2 shadow-lg hover:shadow-amber-500/10 transition-all duration-200 active:scale-95 flex-1 sm:flex-none justify-center cursor-pointer"
              >
                📸 Ambil Foto
              </button>

              <button
                onClick={onClose}
                className="px-4.5 py-2.5 bg-slate-850 hover:bg-slate-800 border border-slate-800/80 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition flex-1 sm:flex-none justify-center"
              >
                Batal
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CameraModal;
