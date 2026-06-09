import React, { useEffect, useState } from 'react';
import { Firestore } from 'firebase/firestore';
import { downloadFileFromFirestore } from '../utils/firestoreFiles';

interface FirestoreImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  db: Firestore;
  attachmentId: string;
}

export const FirestoreImage: React.FC<FirestoreImageProps> = ({ db, attachmentId, ...props }) => {
  const [src, setSrc] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (!attachmentId) {
      setSrc('');
      setLoading(false);
      return;
    }

    // Fallback: If it's a legacy Firebase Storage HTTP URL, render it directly.
    if (attachmentId.startsWith('http://') || attachmentId.startsWith('https://')) {
      setSrc(attachmentId);
      setLoading(false);
      return;
    }

    let isMounted = true;
    let url = '';

    const load = async () => {
      try {
        setLoading(true);
        setError(false);
        const res = await downloadFileFromFirestore(db, attachmentId);
        if (isMounted) {
          setSrc(res.dataUrl);
          url = res.dataUrl;
        }
      } catch (err) {
        console.error('Failed to load image from Firestore:', err);
        if (isMounted) {
          setError(true);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [db, attachmentId]);

  if (loading) {
    return (
      <div 
        className={`flex items-center justify-center bg-slate-800 animate-pulse text-[10px] text-slate-400 min-w-10 min-h-10 ${props.className || ''}`} 
      >
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className={`flex items-center justify-center bg-slate-800 text-[10px] text-red-400 min-w-10 min-h-10 ${props.className || ''}`} 
      >
        Error
      </div>
    );
  }

  return <img src={src} {...props} />;
};

export default FirestoreImage;
