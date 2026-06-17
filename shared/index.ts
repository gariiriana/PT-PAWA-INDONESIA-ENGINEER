// Barrel export for shared workspace
export * from './types';
export { getGPSData, applyWatermark } from './utils/camera';
export type { WatermarkData } from './utils/camera';
export { CameraModal } from './components/CameraModal';
export { ImageCropModal } from './components/ImageCropModal';
export type { ImageCropModalProps } from './components/ImageCropModal';
export { FirestoreImage } from './components/FirestoreImage';
export { uploadFileToFirestore, downloadFileFromFirestore, base64ToBlob, blobToBase64 } from './utils/firestoreFiles';
export type { AttachmentMetadata } from './utils/firestoreFiles';
