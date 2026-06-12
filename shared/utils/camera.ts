// Technical Smart Camera and Image Compression Helpers

export interface WatermarkData {
  latitude?: number;
  longitude?: number;
  accuracy?: number; // Geolocation accuracy in meters
  address?: string;
  timestamp: string;
  detailUnit?: string; // Add detail unit parameter for live remarking
}

/**
 * Get current GPS coordinates and reverse geocode them.
 */
export async function getGPSData(): Promise<WatermarkData> {
  const result: WatermarkData = {
    timestamp: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB',
  };

  if (!navigator.geolocation) {
    result.address = 'Geolocation is not supported by this browser.';
    return result;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        result.latitude = position.coords.latitude;
        result.longitude = position.coords.longitude;
        result.accuracy = position.coords.accuracy;
        
        try {
          // Free Nominatim OSM Reverse Geocoding API
          const url = `https://nominatim.openstreetmap.org/reverse?lat=${result.latitude}&lon=${result.longitude}&format=json`;
          const res = await fetch(url, {
            headers: {
              'User-Agent': 'PT-Pawa-Report-App/1.0',
            },
          });
          if (res.ok) {
            const data = await res.json();
            result.address = data.display_name || `${result.latitude}, ${result.longitude}`;
          } else {
            result.address = `Koordinat: ${result.latitude}, ${result.longitude}`;
          }
        } catch {
          result.address = `Koordinat: ${result.latitude}, ${result.longitude}`;
        }
        resolve(result);
      },
      (error) => {
        result.address = `GPS Error: ${error.message}`;
        resolve(result);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });
}

/**
 * Embed metadata directly onto the image canvas.
 */
export async function applyWatermark(
  imageSrc: string,
  meta: WatermarkData
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      // Configure dimensions (limit size to max 1280px width to compress memory)
      const maxDim = 1280;
      let width = img.width;
      let height = img.height;

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

      // Draw original image
      ctx.drawImage(img, 0, 0, width, height);

      // Watermark container layout - bottom left aligned floating box
      const margin = Math.max(15, Math.round(width * 0.02));
      const boxWidth = Math.min(500, Math.round(width * 0.6), width - (margin * 2));
      const baseFontSize = Math.max(11, Math.round(width * 0.015));

      const padding = Math.max(10, Math.round(width * 0.012));
      const gap = Math.max(4, Math.round(width * 0.005));

      // Calculate address text wrap
      ctx.font = `${baseFontSize - 3}px Roboto, sans-serif`;
      const addressLines = meta.address ? wrapText(ctx, meta.address, boxWidth - (padding * 2 + 16)) : [];

      // Calculate dynamic box height
      let boxHeight = padding * 2;
      boxHeight += baseFontSize + gap; // Brand Title line
      boxHeight += (baseFontSize - 1) + gap; // Subtitle / Activity line
      boxHeight += (baseFontSize - 2) + gap; // Timestamp line
      boxHeight += (baseFontSize - 2) + gap; // Coordinates line
      if (addressLines.length > 0) {
        boxHeight += addressLines.length * (baseFontSize - 3 + gap);
      }

      const x = margin;
      const y = height - margin - boxHeight;

      // Draw background box with rounded corners
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.beginPath();
      if ((ctx as any).roundRect) {
        (ctx as any).roundRect(x, y, boxWidth, boxHeight, 10);
      } else {
        ctx.rect(x, y, boxWidth, boxHeight);
      }
      ctx.fill();

      // Draw vertical amber/gold accent line on the left
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x + padding, y + padding, 4, boxHeight - (padding * 2));

      // Draw text metadata
      let currentY = y + padding + baseFontSize - 2;
      const textLeft = x + padding + 12;

      // Line 1: Brand Title (Gold, bold)
      ctx.fillStyle = '#f59e0b';
      ctx.font = `bold ${baseFontSize}px Roboto, sans-serif`;
      ctx.fillText('PT PAWA INDONESIA ENGINEER', textLeft, currentY);
      currentY += baseFontSize + gap;

      // Line 2: Activity / Unit (White, bold)
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${baseFontSize - 1}px Roboto, sans-serif`;
      const activityText = meta.detailUnit ? `UNIT: ${meta.detailUnit.toUpperCase()}` : 'KEGIATAN: DOKUMENTASI ENGINEER';
      ctx.fillText(activityText, textLeft, currentY);
      currentY += (baseFontSize - 1) + gap;

      // Line 3: Timestamp (Slate light)
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `${baseFontSize - 2}px Roboto, sans-serif`;
      ctx.fillText(meta.timestamp, textLeft, currentY);
      currentY += (baseFontSize - 2) + gap;

      // Line 4: Pin + Coordinates (Gold, bold)
      // Draw red pin circle
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      const pinX = textLeft + 2.5;
      const pinY = currentY - 3;
      ctx.arc(pinX, pinY, 2.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(pinX - 2.5, pinY);
      ctx.lineTo(pinX + 2.5, pinY);
      ctx.lineTo(pinX, pinY + 4);
      ctx.closePath();
      ctx.fill();

      // Coordinates text with accuracy
      ctx.fillStyle = '#f59e0b';
      ctx.font = `bold ${baseFontSize - 2}px Roboto, sans-serif`;
      const accuracyStr = meta.accuracy ? ` (±${Math.round(meta.accuracy)}m)` : ' (±37m)';
      const coordText = meta.latitude && meta.longitude 
        ? `${meta.latitude.toFixed(6)}, ${meta.longitude.toFixed(6)}${accuracyStr}` 
        : 'GPS: Lokasi tidak tersedia';
      ctx.fillText(coordText, textLeft + 9, currentY);
      currentY += (baseFontSize - 2) + gap;

      // Line 5: Address
      if (addressLines.length > 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = `${baseFontSize - 3}px Roboto, sans-serif`;
        addressLines.forEach((line) => {
          ctx.fillText(line, textLeft, currentY);
          currentY += (baseFontSize - 3) + gap;
        });
      }

      // Output compressed blob
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
    };

    img.onerror = (err) => {
      reject(err);
    };
  });
}

/**
 * Text wrapper to split address if it is too long for the canvas width.
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.slice(0, 2); // Limit to max 2 lines for address watermark
}
