import { Firestore, collection, doc, setDoc, addDoc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';

export interface AttachmentMetadata {
  id?: string;
  fileName: string;
  mimeType: string;
  totalChunks: number;
  totalSize: number;
  createdAt: string;
}

const CHUNK_SIZE = 800 * 1024; // 800KB chunks (keeps size well under 1MB Firestore document limit)

/**
 * Converts a Blob or File to a Base64 string (data contents only, no data URI prefix).
 */
export const blobToBase64 = (blob: Blob): Promise<{ base64Data: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const split = result.split(',');
      const mimeType = split[0].match(/data:(.*?);/)?.[1] || 'application/octet-stream';
      const base64Data = split[1] || '';
      resolve({ base64Data, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Converts a Base64 string back to a Blob.
 */
export const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

/**
 * Splits a Base64 string and uploads it to Firestore in chunks.
 * Returns the attachment document ID.
 */
export const uploadFileToFirestore = async (
  db: Firestore,
  file: File | Blob,
  fileName: string
): Promise<string> => {
  const { base64Data, mimeType } = await blobToBase64(file);
  const totalSize = base64Data.length;
  
  // Split Base64 into chunks
  const chunks: string[] = [];
  let offset = 0;
  while (offset < totalSize) {
    chunks.push(base64Data.substring(offset, offset + CHUNK_SIZE));
    offset += CHUNK_SIZE;
  }

  // Create attachment meta document
  const metaRef = await addDoc(collection(db, 'attachments'), {
    fileName,
    mimeType,
    totalChunks: chunks.length,
    totalSize,
    createdAt: new Date().toISOString(),
  });

  const attachmentId = metaRef.id;

  // Upload chunks to subcollection
  for (let i = 0; i < chunks.length; i++) {
    const chunkDocRef = doc(db, 'attachments', attachmentId, 'chunks', String(i));
    await setDoc(chunkDocRef, {
      chunkIndex: i,
      data: chunks[i],
    });
  }

  return attachmentId;
};

/**
 * Downloads and reassembles a chunked file from Firestore.
 * Returns the Blob, a local object URL, and metadata.
 */
export const downloadFileFromFirestore = async (
  db: Firestore,
  attachmentId: string
): Promise<{
  blob: Blob;
  dataUrl: string;
  fileName: string;
  mimeType: string;
}> => {
  // Fetch metadata
  const metaSnap = await getDoc(doc(db, 'attachments', attachmentId));
  if (!metaSnap.exists()) {
    throw new Error('Attachment metadata not found.');
  }
  
  const meta = metaSnap.data() as AttachmentMetadata;

  // Query chunks subcollection sorted by index
  const chunksRef = collection(db, 'attachments', attachmentId, 'chunks');
  const q = query(chunksRef, orderBy('chunkIndex', 'asc'));
  const querySnapshot = await getDocs(q);

  let reassembledBase64 = '';
  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    reassembledBase64 += data.data || '';
  });

  const blob = base64ToBlob(reassembledBase64, meta.mimeType);
  const dataUrl = URL.createObjectURL(blob);

  return {
    blob,
    dataUrl,
    fileName: meta.fileName,
    mimeType: meta.mimeType,
  };
};
