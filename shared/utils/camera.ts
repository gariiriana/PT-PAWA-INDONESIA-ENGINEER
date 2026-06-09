// Technical Smart Camera and Image Compression Helpers

export interface WatermarkData {
  latitude?: number;
  longitude?: number;
  address?: string;
  timestamp: string;
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

      // Watermark container layout at the bottom
      const overlayHeight = Math.max(80, Math.round(height * 0.15));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, height - overlayHeight, width, overlayHeight);

      // Draw vertical green accent line (Brand Color)
      ctx.fillStyle = '#828200'; // PT PAWA Olive Gold
      ctx.fillRect(10, height - overlayHeight + 10, 5, overlayHeight - 20);

      // Draw text metadata
      ctx.fillStyle = '#FFFFFF';
      const baseFontSize = Math.max(12, Math.round(width * 0.018));
      ctx.font = `bold ${baseFontSize}px Roboto, sans-serif`;

      // Line 1: Title
      ctx.fillText(
        'PT. PAWA INDONESIA ENGINEERING',
        25,
        height - overlayHeight + baseFontSize + 10
      );

      // Line 2: Timestamp
      ctx.font = `${baseFontSize - 2}px Roboto, sans-serif`;
      ctx.fillText(
        `WAKTU: ${meta.timestamp}`,
        25,
        height - overlayHeight + (baseFontSize * 2) + 14
      );

      // Line 3: Coordinates
      const latLonStr = meta.latitude && meta.longitude 
        ? `GPS: ${meta.latitude.toFixed(6)}, ${meta.longitude.toFixed(6)}` 
        : 'GPS: Lokasi tidak tersedia';
      ctx.fillText(
        latLonStr,
        25,
        height - overlayHeight + (baseFontSize * 3) + 18
      );

      // Line 4: Address
      if (meta.address) {
        ctx.font = `italic ${baseFontSize - 3}px Roboto, sans-serif`;
        const addressLines = wrapText(ctx, meta.address, width - 40);
        let currentY = height - overlayHeight + (baseFontSize * 4) + 20;
        addressLines.forEach((line) => {
          ctx.fillText(line, 25, currentY);
          currentY += baseFontSize - 1;
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
