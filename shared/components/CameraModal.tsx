import React, { useRef, useState, useEffect } from 'react';
import { getGPSData, applyWatermark, WatermarkData } from '../utils/camera';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageBlob: Blob, dataUrl: string) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsData, setGpsData] = useState<WatermarkData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize camera stream
  useEffect(() => {
    if (isOpen) {
      startCamera();
      fetchGPS();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const constraints = {
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
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

      // Draw the video frame to the canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const rawDataUrl = canvas.toDataURL('image/jpeg', 0.9);

      // Fetch fresh GPS data if not fetched yet
      let activeGps = gpsData;
      if (!activeGps) {
        activeGps = await getGPSData();
      }

      // Apply Burn-on-Apply Watermark
      const watermarkedBlob = await applyWatermark(rawDataUrl, activeGps);
      const watermarkedDataUrl = URL.createObjectURL(watermarkedBlob);

      // Stop camera and return results
      stopCamera();
      onCapture(watermarkedBlob, watermarkedDataUrl);
      onClose();
    } catch (err: any) {
      console.error('Error capturing image:', err);
      setErrorMsg('Gagal mengambil gambar atau menambahkan watermark.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      {/* Card container with Glassmorphism */}
      <div className="relative w-full max-w-2xl bg-slate-900/90 border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-700/50 flex justify-between items-center bg-slate-950/40">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#828200] animate-pulse"></span>
            Modul Kamera Pintar PT PAWA
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors duration-200"
          >
            ✕
          </button>
        </div>

        {/* Camera View Area */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {errorMsg ? (
            <div className="text-center p-6">
              <p className="text-red-400 font-medium mb-3">{errorMsg}</p>
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition"
              >
                Coba Lagi
              </button>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          )}

          {/* Loading Indicator */}
          {(loading || gpsLoading) && (
            <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center gap-3 text-white">
              <div className="w-10 h-10 border-4 border-slate-600 border-t-[#828200] rounded-full animate-spin"></div>
              <p className="text-sm font-light">
                {gpsLoading ? 'Menyinkronkan GPS & Alamat...' : 'Menyiapkan Kamera...'}
              </p>
            </div>
          )}

          {/* GPS Info Overlay (Preview) */}
          {gpsData && (
            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md border border-white/10 p-2.5 rounded-lg text-[10px] text-white font-mono space-y-0.5 max-w-[80%] pointer-events-none">
              <p className="font-bold text-[#828200]">PREVIEW WATERMARK</p>
              <p>Lat: {gpsData.latitude?.toFixed(6) ?? '-'}</p>
              <p>Lon: {gpsData.longitude?.toFixed(6) ?? '-'}</p>
              <p className="truncate">Addr: {gpsData.address ?? 'Mengambil alamat...'}</p>
              <p>Time: {gpsData.timestamp}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-700/50 flex justify-between items-center bg-slate-950/40">
          <button
            onClick={fetchGPS}
            disabled={gpsLoading}
            className="px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition duration-200"
          >
            🔄 Refresh GPS
          </button>
          
          <button
            onClick={handleCapture}
            disabled={loading || errorMsg !== null}
            className="px-6 py-2.5 bg-[#828200] hover:bg-[#999900] disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center gap-2 shadow-lg transition-all duration-200 active:scale-95"
          >
            📸 Ambil Foto
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-sm transition"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
};
export default CameraModal;
