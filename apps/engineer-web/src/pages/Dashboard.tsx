import React, { useState, useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { 
  LogOut, FileText, Camera, FileDown, Plus, Eye, Search, Trash2, Edit, 
  Download, UploadCloud, CheckCircle, X, Calendar, Layers, MapPin, EyeOff,
  Scissors
} from 'lucide-react';
import { auth, db } from '../config/firebase';
import { 
  ReportEngineer, MaintenanceTemplate, MaintenanceStep, UserProfile,
  uploadFileToFirestore, downloadFileFromFirestore, FirestoreImage,
  ImageCropModal
} from '@shared/index';
import CameraModal from '@shared/components/CameraModal';
import jsPDF from 'jspdf';
import ExcelJS from 'exceljs';

interface DashboardProps {
  userProfile: { uid: string; email: string; name: string; role: string };
  onLogout: () => void;
}

interface CardData {
  id: string;
  photoUrl?: string; // Firestore attachment ID
  localUrl?: string; // Local Object URL or Data URL (for instant rendering)
  description: string;
}

interface UnitData {
  name: string;
  cards: CardData[];
}

const generateInitialCards = (): CardData[] => [
  { id: `card_init_1_${Math.random()}`, description: '' },
  { id: `card_init_2_${Math.random()}`, description: '' },
  { id: `card_init_3_${Math.random()}`, description: '' },
  { id: `card_init_4_${Math.random()}`, description: '' },
];

const getBase64ImageFromUrl = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5 seconds timeout

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
};

const compressImageFile = async (file: File): Promise<Blob> => {
  if (!file.type.startsWith('image/')) {
    return file;
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
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
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.75
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};

const cleanUndefined = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined);
  } else if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        newObj[key] = cleanUndefined(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
};

export const Dashboard: React.FC<DashboardProps> = ({ userProfile, onLogout }) => {
  // Main tabs: 'buat-laporan' (Buat Laporan) and 'arsip-dokumen' (Arsip Dokumen)
  const [activeTab, setActiveTab] = useState<'buat-laporan' | 'arsip-dokumen'>('buat-laporan');
  const [reports, setReports] = useState<ReportEngineer[]>([]);
  const [loading, setLoading] = useState(false);

  // Form / Report fields
  const [reportId, setReportId] = useState<string | null>(null); // holds doc ID if editing
  const [reportTitle, setReportTitle] = useState('');
  const [detailUnit, setDetailUnit] = useState('');
  const [waktuMaintenance, setWaktuMaintenance] = useState(new Date().toISOString().slice(0, 10));
  const [siteProyek, setSiteProyek] = useState('GAIA CGK1 DC');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('NEUTRA');
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [subWork, setSubWork] = useState('');
  const [spvEngineer, setSpvEngineer] = useState('');

  // Documentation cards state
  const [cards, setCards] = useState<CardData[]>(generateInitialCards());

  // Camera integration state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraTargetCard, setCameraTargetCard] = useState<{ cardId: string } | null>(null);

  // Image Crop State
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropCardId, setCropCardId] = useState<string | null>(null);

  // Photo Preview State
  const [previewPhotoSrc, setPreviewPhotoSrc] = useState<string | null>(null);

  // Search & Filter state for Archive
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [sortBy, setSortBy] = useState<'terbaru' | 'terlama'>('terbaru');
  const [filterType, setFilterType] = useState<'semua' | 'pdf' | 'excel'>('semua');

  // Preview Modal
  const [previewReport, setPreviewReport] = useState<ReportEngineer | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  const handleClosePreview = () => {
    setIsPreviewModalOpen(false);
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl(null);
    }
  };

  // File input ref for batch upload
  const batchFileRef = useRef<HTMLInputElement | null>(null);

  // Custom Alert/Confirm Modal Dialog State
  const [customDialog, setCustomDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isConfirm: boolean;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    isConfirm: false,
  });

  const showCustomAlert = (message: string, title: string = 'Pemberitahuan') => {
    setCustomDialog({
      isOpen: true,
      title,
      message,
      isConfirm: false,
    });
  };

  const showCustomConfirm = (
    message: string,
    onConfirm: () => void,
    title: string = 'Konfirmasi',
    confirmText: string = 'Ya, Hapus',
    cancelText: string = 'Batal'
  ) => {
    setCustomDialog({
      isOpen: true,
      title,
      message,
      isConfirm: true,
      confirmText,
      cancelText,
      onConfirm: () => {
        onConfirm();
        closeCustomDialog();
      },
      onCancel: () => {
        closeCustomDialog();
      }
    });
  };

  const closeCustomDialog = () => {
    setCustomDialog(prev => ({ ...prev, isOpen: false }));
  };

  // Fetch archives
  useEffect(() => {
    fetchArchives();
  }, [activeTab]);

  const fetchArchives = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'reports_engineer'),
        where('engineerId', '==', userProfile.uid)
      );
      const querySnapshot = await getDocs(q);
      const fetchedReports: ReportEngineer[] = [];
      querySnapshot.forEach((doc) => {
        fetchedReports.push({ id: doc.id, ...doc.data() } as ReportEngineer);
      });
      
      // Sort reports
      const sorted = fetchedReports.sort((a, b) => {
        return b.createdAt.localeCompare(a.createdAt);
      });
      
      setReports(sorted);
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    showCustomConfirm(
      'Apakah Anda yakin ingin keluar dari aplikasi?',
      async () => {
        await signOut(auth);
        onLogout();
      },
      'Konfirmasi Keluar',
      'Ya, Keluar',
      'Batal'
    );
  };

  // Manage Documentation Cards
  const handleAddCardManual = () => {
    setCards([
      ...cards,
      {
        id: Math.random().toString(),
        description: '',
      }
    ]);
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    try {
      const newCards = [...cards];
      let fileIndex = 0;

      // 1. Fill existing empty card slots first
      for (let j = 0; j < newCards.length && fileIndex < files.length; j++) {
        if (!newCards[j].photoUrl) {
          const file = files[fileIndex];
          const compressedBlob = await compressImageFile(file);
          const localUrl = URL.createObjectURL(compressedBlob);
          const attachmentId = await uploadFileToFirestore(db, compressedBlob, file.name);
          newCards[j] = {
            ...newCards[j],
            photoUrl: attachmentId,
            localUrl
          };
          fileIndex++;
        }
      }

      // 2. If there are remaining files, create new cards for them
      while (fileIndex < files.length) {
        const file = files[fileIndex];
        const compressedBlob = await compressImageFile(file);
        const localUrl = URL.createObjectURL(compressedBlob);
        const attachmentId = await uploadFileToFirestore(db, compressedBlob, file.name);
        newCards.push({
          id: Math.random().toString(),
          photoUrl: attachmentId,
          localUrl,
          description: '',
        });
        fileIndex++;
      }

      setCards(newCards);
    } catch (err) {
      console.error('Batch upload error:', err);
      showCustomAlert('Gagal mengunggah foto. Silakan coba lagi.', 'Unggah Gagal');
    } finally {
      setLoading(false);
      if (batchFileRef.current) batchFileRef.current.value = '';
    }
  };

  const handleCardPhotoUpload = async (cardId: string, file: File) => {
    setLoading(true);
    try {
      const compressedBlob = await compressImageFile(file);
      const localUrl = URL.createObjectURL(compressedBlob);
      
      // Set localUrl instantly to skip loading text
      setCards(prev => prev.map((c) => {
        if (c.id === cardId) {
          return { ...c, localUrl };
        }
        return c;
      }));

      const attachmentId = await uploadFileToFirestore(db, compressedBlob, file.name);
      setCards(prev => prev.map((c) => {
        if (c.id === cardId) {
          return { ...c, photoUrl: attachmentId, localUrl };
        }
        return c;
      }));
    } catch (err) {
      console.error('File upload error:', err);
      showCustomAlert('Gagal mengunggah file.', 'Unggah Gagal');
    } finally {
      setLoading(false);
    }
  };

  const triggerCameraForCard = (cardId: string) => {
    setCameraTargetCard({ cardId });
    setIsCameraOpen(true);
  };

  const handleCaptureResult = async (blob: Blob, dataUrl: string) => {
    if (cameraTargetCard) {
      setLoading(true);
      try {
        const { cardId } = cameraTargetCard;
        // Create an independent Object URL owned by the parent to prevent race conditions on modal close
        const localUrl = URL.createObjectURL(blob);
        
        // Set localUrl instantly to skip card-level loading text
        setCards(prev => prev.map((c) => {
          if (c.id === cardId) {
            return { ...c, localUrl };
          }
          return c;
        }));

        const attachmentId = await uploadFileToFirestore(db, blob, `captured_${Date.now()}.jpg`);
        setCards(prev => prev.map((c) => {
          if (c.id === cardId) {
            return { ...c, photoUrl: attachmentId, localUrl };
          }
          return c;
        }));
      } catch (err) {
        console.error('Camera upload error:', err);
        showCustomAlert('Gagal menyimpan foto hasil tangkapan.', 'Kamera Gagal');
      } finally {
        setLoading(false);
        setCameraTargetCard(null);
      }
    }
  };

  const handleDeleteCard = (cardId: string) => {
    // Clean up local URL if it exists
    const card = cards.find(c => c.id === cardId);
    if (card?.localUrl) {
      URL.revokeObjectURL(card.localUrl);
    }
    setCards(prev => prev.filter((c) => c.id !== cardId));
  };

  const handleRemovePhoto = (cardId: string) => {
    setCards(prev => prev.map((c) => {
      if (c.id === cardId) {
        if (c.localUrl) {
          URL.revokeObjectURL(c.localUrl);
        }
        return { ...c, photoUrl: undefined, localUrl: undefined };
      }
      return c;
    }));
  };

  const handleDownloadCardPhoto = async (card: CardData) => {
    setLoading(true);
    try {
      let url = card.localUrl;
      let isTempUrl = false;

      if (!url && card.photoUrl) {
        const result = await downloadFileFromFirestore(db, card.photoUrl);
        url = result.dataUrl;
        isTempUrl = true;
      }

      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `photo_${card.id}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        if (isTempUrl) {
          URL.revokeObjectURL(url);
        }
      } else {
        showCustomAlert('Tidak ada foto untuk diunduh.', 'Pemberitahuan');
      }
    } catch (err) {
      console.error('Download photo error:', err);
      showCustomAlert('Gagal mengunduh foto.', 'Kesalahan');
    } finally {
      setLoading(false);
    }
  };

  const handleCropCardPhoto = async (card: CardData) => {
    setLoading(true);
    try {
      let url = card.localUrl;
      let isTempUrl = false;

      if (!url && card.photoUrl) {
        const result = await downloadFileFromFirestore(db, card.photoUrl);
        url = result.dataUrl;
        isTempUrl = true;
      }

      if (url) {
        setCropCardId(card.id);
        setCropImageSrc(url);
        setIsCropModalOpen(true);
      } else {
        showCustomAlert('Tidak ada foto untuk dipotong.', 'Peringatan');
      }
    } catch (err) {
      console.error('Prepare crop error:', err);
      showCustomAlert('Gagal memproses foto untuk pemotongan.', 'Kesalahan');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseCropModal = () => {
    setIsCropModalOpen(false);
    if (cropImageSrc && !cards.some(c => c.localUrl === cropImageSrc)) {
      URL.revokeObjectURL(cropImageSrc);
    }
    setCropImageSrc(null);
    setCropCardId(null);
  };

  const handleSaveCrop = async (croppedBlob: Blob, croppedDataUrl: string) => {
    if (!cropCardId) return;

    setLoading(true);
    setIsCropModalOpen(false);

    try {
      const cardId = cropCardId;
      
      const oldCard = cards.find(c => c.id === cardId);
      if (oldCard?.localUrl) {
        URL.revokeObjectURL(oldCard.localUrl);
      }

      setCards(prev => prev.map((c) => {
        if (c.id === cardId) {
          return { ...c, localUrl: croppedDataUrl };
        }
        return c;
      }));

      if (cropImageSrc && !cards.some(c => c.localUrl === cropImageSrc) && cropImageSrc !== croppedDataUrl) {
        URL.revokeObjectURL(cropImageSrc);
      }
      setCropImageSrc(null);
      setCropCardId(null);

      const attachmentId = await uploadFileToFirestore(db, croppedBlob, `cropped_${Date.now()}.jpg`);
      
      setCards(prev => prev.map((c) => {
        if (c.id === cardId) {
          return { ...c, photoUrl: attachmentId, localUrl: croppedDataUrl };
        }
        return c;
      }));

    } catch (err) {
      console.error('Save cropped image error:', err);
      showCustomAlert('Gagal menyimpan foto hasil pemotongan.', 'Crop Gagal');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewCardPhoto = async (source: CardData | string | undefined | null) => {
    if (!source) return;
    let url: string | undefined = undefined;
    let photoUrl: string | undefined = undefined;

    if (typeof source === 'string') {
      if (source.startsWith('http://') || source.startsWith('https://')) {
        url = source;
      } else {
        photoUrl = source;
      }
    } else {
      url = source.localUrl;
      photoUrl = source.photoUrl;
    }

    if (!url && photoUrl) {
      setLoading(true);
      try {
        const result = await downloadFileFromFirestore(db, photoUrl);
        url = result.dataUrl;
      } catch (err) {
        console.error('Fetch preview error:', err);
        showCustomAlert('Gagal memuat preview foto.', 'Error');
      } finally {
        setLoading(false);
      }
    }
    if (url) {
      setPreviewPhotoSrc(url);
    }
  };


  const handleClosePhotoPreview = () => {
    if (previewPhotoSrc && !cards.some(c => c.localUrl === previewPhotoSrc)) {
      URL.revokeObjectURL(previewPhotoSrc);
    }
    setPreviewPhotoSrc(null);
  };

  const updateCardDescription = (cardId: string, value: string) => {
    setCards(prev => prev.map((c) => {
      if (c.id === cardId) {
        return { ...c, description: value };
      }
      return c;
    }));
  };

  // Helper to save report to Firestore and return the saved document
  const saveReportToFirestore = async (): Promise<ReportEngineer | null> => {
    const finalTitle = reportTitle.trim() || `${scopeOfWork}${subWork ? ' - ' + subWork : ''}` || 'Laporan Pemeliharaan';

    // Flatten cards structure into the standard Firestore steps array
    const steps: MaintenanceStep[] = [];
    let stepCounter = 1;

    cards.forEach((card) => {
      steps.push({
        stepNumber: stepCounter++,
        task: card.description || 'Dokumentasi Unit',
        status: card.photoUrl ? 'completed' : 'pending',
        photoUrl: card.photoUrl || '',
        unitName: detailUnit || '',
        notes: detailUnit || ''
      });
    });

    const reportData: Partial<ReportEngineer> = {
      title: finalTitle,
      templateType: selectedTemplate || 'NEUTRA',
      detailUnit: detailUnit,
      siteProject: siteProyek,
      scopeOfWork: scopeOfWork,
      subWork: subWork,
      spvEngineer: spvEngineer,
      maintenanceDate: waktuMaintenance,
      engineerId: userProfile.uid,
      engineerName: userProfile.name,
      updatedAt: new Date().toISOString(),
      status: 'submitted',
      steps: steps,
      isCorrective: false,
    };

    try {
      let savedDocId = reportId;
      if (reportId) {
        // Update existing
        await setDoc(doc(db, 'reports_engineer', reportId), cleanUndefined({
          ...reportData,
          createdAt: reports.find(r => r.id === reportId)?.createdAt || new Date().toISOString()
        }), { merge: true });
      } else {
        // Create new
        const docRef = await addDoc(collection(db, 'reports_engineer'), cleanUndefined({
          ...reportData,
          createdAt: new Date().toISOString(),
        }));
        savedDocId = docRef.id;
      }
      
      const fullReport: ReportEngineer = {
        id: savedDocId!,
        title: finalTitle,
        templateType: selectedTemplate || 'NEUTRA',
        detailUnit: detailUnit,
        siteProject: siteProyek,
        scopeOfWork: scopeOfWork,
        subWork: subWork,
        spvEngineer: spvEngineer,
        maintenanceDate: waktuMaintenance,
        engineerId: userProfile.uid,
        engineerName: userProfile.name,
        createdAt: reports.find(r => r.id === savedDocId)?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'submitted',
        steps: steps,
        isCorrective: false,
      };
      
      await fetchArchives();
      return fullReport;
    } catch (err) {
      console.error('Error saving report:', err);
      showCustomAlert('Terjadi kesalahan saat menyimpan laporan.', 'Gagal Menyimpan');
      return null;
    }
  };

  // Submit / Save to database
  const handleSaveToArchive = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    const result = await saveReportToFirestore();
    setLoading(false);
    if (result) {
      resetForm();
      setActiveTab('arsip-dokumen');
    }
  };

  const handleSaveAndExportPDF = async () => {
    setLoading(true);
    const result = await saveReportToFirestore();
    if (result) {
      await exportPDFDirect(result);
      resetForm();
      setActiveTab('arsip-dokumen');
    } else {
      setLoading(false);
    }
  };

  const resetForm = () => {
    // Revoke any localUrls to prevent memory leaks
    cards.forEach((c) => {
      if (c.localUrl) {
        URL.revokeObjectURL(c.localUrl);
      }
    });
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl(null);
    }
    setReportId(null);
    setReportTitle('');
    setDetailUnit('');
    setWaktuMaintenance(new Date().toISOString().slice(0, 10));
    setSiteProyek('GAIA CGK1 DC');
    setSelectedTemplate('NEUTRA');
    setScopeOfWork('');
    setSubWork('');
    setSpvEngineer('');
    setCards(generateInitialCards());
  };

  // Edit report
  const handleEditReport = (report: ReportEngineer) => {
    setReportId(report.id || null);
    setReportTitle(report.title);
    setDetailUnit(report.detailUnit || '');
    setWaktuMaintenance(report.maintenanceDate || report.createdAt.slice(0, 10));
    setSiteProyek(report.siteProject || 'GAIA CGK1 DC');
    setSelectedTemplate(report.templateType || 'NEUTRA');
    setScopeOfWork(report.scopeOfWork || '');
    setSubWork(report.subWork || '');
    setSpvEngineer(report.spvEngineer || '');

    // Map steps directly to cards
    if (report.steps && report.steps.length > 0) {
      const loadedCards = report.steps.map((step, idx) => ({
        id: `step_${idx}_${Math.random()}`,
        photoUrl: step.photoUrl || '',
        description: step.task || ''
      }));
      setCards(loadedCards);
    } else {
      setCards([]);
    }

    setActiveTab('buat-laporan');
  };

  // Delete report
  const handleDeleteReport = async (id: string) => {
    showCustomConfirm(
      'Apakah Anda yakin ingin menghapus laporan ini secara permanen dari arsip?',
      async () => {
        setLoading(true);
        try {
          await deleteDoc(doc(db, 'reports_engineer', id));
          showCustomAlert('Laporan berhasil dihapus.', 'Sukses');
          fetchArchives();
        } catch (err) {
          console.error('Delete error:', err);
          showCustomAlert('Gagal menghapus laporan.', 'Kesalahan');
        } finally {
          setLoading(false);
        }
      },
      'Hapus Laporan'
    );
  };

  const generatePDFDocument = async (report: ReportEngineer): Promise<jsPDF> => {
    const docPdf = new jsPDF('p', 'mm', 'a4');
    const pageHeight = docPdf.internal.pageSize.height;
    const pageWidth = docPdf.internal.pageSize.width;
    
    // We will draw a top accent colored line (Olive Gold)
    docPdf.setFillColor(130, 130, 0); // #828200
    docPdf.rect(0, 0, pageWidth, 3, 'F');
    
    const margin = 10;
    const contentW = pageWidth - (margin * 2); // 190mm
    
    // 1. Gather all unique photo URLs to download
    const photoUrlsToDownload: string[] = [];
    report.steps.forEach(step => {
      if (step.photoUrl && !photoUrlsToDownload.includes(step.photoUrl)) {
        photoUrlsToDownload.push(step.photoUrl);
      }
    });

    const downloadedImagesMap: Record<string, string> = {};
    const logoUrl = '/logo-pawa.png';
    const jointLogoUrl = '/logo-joint-operation.png';
    let logoBase64: string | null = null;
    let jointLogoBase64: string | null = null;

    // 2. Download logo and all report photos concurrently in parallel
    await Promise.all([
      // Download logo
      (async () => {
        try {
          logoBase64 = await getBase64ImageFromUrl(logoUrl);
        } catch (e) {
          console.error('Failed to load logo in PDF:', e);
        }
      })(),
      // Download joint logo
      (async () => {
        try {
          jointLogoBase64 = await getBase64ImageFromUrl(jointLogoUrl);
        } catch (e) {
          console.error('Failed to load joint operation logo in PDF:', e);
        }
      })(),
      // Download all step photos
      ...photoUrlsToDownload.map(async (url) => {
        try {
          const res = await downloadFileFromFirestore(db, url);
          downloadedImagesMap[url] = res.dataUrl;
        } catch (err) {
          console.error(`Failed to download image ${url}:`, err);
        }
      })
    ]);

    const drawLogoTextFallback = () => {
      docPdf.setFont('Helvetica', 'bold');
      docPdf.setFontSize(8);
      docPdf.setTextColor(130, 130, 0);
      docPdf.text('PT. PAWA', margin, 18);
      docPdf.text('ENGINEER', margin - 1, 23);
    };

    const drawPageHeader = () => {
      // We will draw a top accent colored line (Olive Gold)
      docPdf.setFillColor(130, 130, 0); // #828200
      docPdf.rect(0, 0, pageWidth, 3, 'F');

      // Draw PT PAWA logo (Left)
      if (logoBase64) {
        try {
          docPdf.addImage(logoBase64, 'PNG', margin, 10, 18, 18);
        } catch (e) {
          console.error('Failed to add logo image to PDF:', e);
          drawLogoTextFallback();
        }
      } else {
        drawLogoTextFallback();
      }

      // Draw DAILY ACTIVITY Title (Center)
      docPdf.setTextColor(0, 0, 0);
      docPdf.setFont('Helvetica', 'bold');
      docPdf.setFontSize(15);
      docPdf.text('DAILY ACTIVITY', pageWidth / 2, 20, { align: 'center' });

      // Draw TOTAL and ACCESSTECH joint logo (Right)
      if (jointLogoBase64) {
        try {
          docPdf.addImage(jointLogoBase64, 'PNG', pageWidth - margin - 45, 10, 45, 23);
        } catch (e) {
          console.error('Failed to add joint logo to PDF:', e);
        }
      }
      
      // Draw first horizontal line below logos
      docPdf.setDrawColor(0, 0, 0);
      docPdf.setLineWidth(0.4);
      docPdf.line(margin, 36, pageWidth - margin, 36);

      // Metadata coordinates
      const col1X = margin + 1;
      const col2X = pageWidth / 2 + 15;

      // Draw Metadata
      docPdf.setFont('Helvetica', 'bold');
      docPdf.setFontSize(8.5);
      docPdf.setTextColor(0, 0, 0);
      
      // Left side labels
      docPdf.text('Project Name', col1X, 41);
      docPdf.text('Scope Of Work', col1X, 46);
      docPdf.text('Sub Work', col1X, 51);
      
      docPdf.text(':', col1X + 26, 41);
      docPdf.text(':', col1X + 26, 46);
      docPdf.text(':', col1X + 26, 51);
      
      docPdf.setFont('Helvetica', 'normal');
      docPdf.text(report.siteProject || 'GAIA CGK1 DATA CENTER', col1X + 29, 41);
      docPdf.text(report.scopeOfWork || '-', col1X + 29, 46);
      docPdf.text(report.subWork || '-', col1X + 29, 51);

      // Right side labels
      docPdf.setFont('Helvetica', 'bold');
      docPdf.text('Date', col2X, 41);
      docPdf.text('SPV / Eng', col2X, 46);
      
      docPdf.text(':', col2X + 18, 41);
      docPdf.text(':', col2X + 18, 46);
      
      docPdf.setFont('Helvetica', 'normal');
      docPdf.text(report.maintenanceDate || report.createdAt.slice(0, 10), col2X + 21, 41);
      docPdf.text(report.spvEngineer || '-', col2X + 21, 46);

      // Draw second horizontal line below metadata
      docPdf.setDrawColor(0, 0, 0);
      docPdf.setLineWidth(0.4);
      docPdf.line(margin, 54, pageWidth - margin, 54);
    };

    // Draw first page header
    drawPageHeader();
    
    let currentY = 60; // start drawing cards below the metadata block

    // Let's draw the grid cards in 3 columns.
    let px = margin;
    const cardW = 58;
    const cardH = 76; // taller card to fit larger text and images nicely
    const gap = 8;
    
    for (const step of report.steps) {
      // Check if we need to move to the next page
      if (currentY + cardH > pageHeight - 15) {
        docPdf.addPage();
        drawPageHeader();
        currentY = 60;
        px = margin;
      }
      
      // Draw card container box in PT PAWA brand colors
      docPdf.setDrawColor(130, 130, 0); // Olive Gold border
      docPdf.setLineWidth(0.3);
      docPdf.setFillColor(255, 255, 255);
      docPdf.rect(px, currentY, cardW, cardH, 'F');
      docPdf.rect(px, currentY, cardW, cardH, 'S');
      
      // Draw image (centered, with 3mm margin)
      if (step.photoUrl && downloadedImagesMap[step.photoUrl]) {
        try {
          const dataUrl = downloadedImagesMap[step.photoUrl];
          docPdf.addImage(dataUrl, 'JPEG', px + 3, currentY + 3, cardW - 6, cardH - 17);
        } catch (err) {
          console.error('Error rendering image in PDF:', err);
          docPdf.setFillColor(240, 240, 240);
          docPdf.rect(px + 3, currentY + 3, cardW - 6, cardH - 17, 'F');
          docPdf.setTextColor(200, 50, 50);
          docPdf.setFontSize(8);
          docPdf.text('[Foto Gagal Dimuat]', px + cardW/2 - 13, currentY + (cardH - 17)/2 + 1);
        }
      } else {
        // Draw placeholder box
        docPdf.setFillColor(245, 245, 245);
        docPdf.rect(px + 3, currentY + 3, cardW - 6, cardH - 17, 'F');
        docPdf.setTextColor(150, 150, 150);
        docPdf.setFontSize(8);
        docPdf.setFont('Helvetica', 'normal');
        docPdf.text('TANPA FOTO', px + cardW/2 - 9, currentY + (cardH - 18)/2 + 1);
      }
      
      // Description details area below the image
      const descY = currentY + cardH - 11;
      
      // Description text
      docPdf.setTextColor(50, 50, 50);
      docPdf.setFont('Helvetica', 'normal');
      docPdf.setFontSize(8.5);
      const wrappedDesc = docPdf.splitTextToSize(step.task, cardW - 8);
      docPdf.text(wrappedDesc, px + 4, descY + 2.5); // line height adjust
      
      // Move to next column
      px += cardW + gap;
      if (px + cardW > pageWidth - margin + 1) {
        // Wrap to next row
        px = margin;
        currentY += cardH + gap;
      }
    }
    
    // If some elements were drawn on the last row, add spacing
    if (px !== margin) {
      currentY += cardH + 8;
    } else {
      currentY += 8;
    }
    
    // Page numbering footer and general footer on all pages
    const totalPages = docPdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      docPdf.setPage(i);
      
      // Add footer text at y = 288
      docPdf.setDrawColor(230, 230, 230);
      docPdf.setLineWidth(0.2);
      docPdf.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
      
      docPdf.setTextColor(120, 120, 120);
      docPdf.setFontSize(7.5);
      docPdf.setFont('Helvetica', 'normal');
      docPdf.text('PT PAWA INDONESIA ENGINEERING — Laporan Dokumentasi', margin, pageHeight - 6);
      
      docPdf.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin - 22, pageHeight - 6);
    }
    
    // Clean up Object URLs to prevent memory leak
    Object.values(downloadedImagesMap).forEach(url => {
      URL.revokeObjectURL(url);
    });

    return docPdf;
  };

  // Export dynamically to PDF
  const exportPDFDirect = async (report: ReportEngineer) => {
    setLoading(true);
    try {
      const docPdf = await generatePDFDocument(report);
      const cleanTitle = report.title.trim().replace(/\s+/g, '_');
      const cleanUnit = report.detailUnit ? report.detailUnit.trim().replace(/\s+/g, '_') : '';
      const filename = cleanUnit ? `${cleanTitle}_${cleanUnit}.pdf` : `${cleanTitle}.pdf`;
      docPdf.save(filename);
    } catch (err) {
      console.error('PDF export failed:', err);
      showCustomAlert('Gagal mengekspor laporan ke PDF.', 'Ekspor Gagal');
    } finally {
      setLoading(false);
    }
  };

  // Preview layout in modal
  const handleOpenPreview = async () => {
    setLoading(true);
    try {
      // Construct fake temporary report object to send to preview
      const steps: MaintenanceStep[] = [];
      let stepCounter = 1;
      cards.forEach((card) => {
        steps.push({
          stepNumber: stepCounter++,
          task: card.description || 'Dokumentasi Unit',
          status: card.photoUrl ? 'completed' : 'pending',
          photoUrl: card.photoUrl || '',
          unitName: detailUnit || '',
          notes: detailUnit || ''
        });
      });

      const tempReport: ReportEngineer = {
        title: reportTitle || `${scopeOfWork}${subWork ? ' - ' + subWork : ''}` || 'Inspeksi Pemeliharaan Tanpa Nama',
        templateType: selectedTemplate || 'NEUTRA',
        detailUnit: detailUnit,
        siteProject: siteProyek,
        scopeOfWork: scopeOfWork,
        subWork: subWork,
        spvEngineer: spvEngineer,
        maintenanceDate: waktuMaintenance,
        engineerId: userProfile.uid,
        engineerName: userProfile.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'submitted',
        steps: steps,
      };

      const docPdf = await generatePDFDocument(tempReport);
      const pdfBlob = docPdf.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      
      if (previewPdfUrl) {
        URL.revokeObjectURL(previewPdfUrl);
      }

      setPreviewPdfUrl(url);
      setPreviewReport(tempReport);
      setIsPreviewModalOpen(true);
    } catch (err) {
      console.error('PDF preview generation failed:', err);
      showCustomAlert('Gagal membuat preview laporan PDF.', 'Pratinjau Gagal');
    } finally {
      setLoading(false);
    }
  };

  // Filtered reports for archive
  const filteredReports = reports.filter((rep) => {
    const titleMatch = rep.title.toLowerCase().includes(searchQuery.toLowerCase());
    const dateMatch = filterDate ? (rep.maintenanceDate || rep.createdAt).includes(filterDate) : true;
    return titleMatch && dateMatch;
  });

  const photoCount = cards.filter(c => c.photoUrl).length;

  // Stats for archive
  const totalReportsCount = reports.length;
  const filteredCount = filteredReports.length;
  
  // Calculate simulated size in MB (average 775KB per photo chunked + metadata size)
  const totalPhotosAcrossAll = reports.reduce((acc, rep) => {
    return acc + (rep.steps?.filter(s => s.photoUrl).length || 0);
  }, 0);
  const calculatedTotalSize = (totalPhotosAcrossAll * 0.77 + totalReportsCount * 0.05).toFixed(2);
  const isFilterActive = searchQuery || filterDate ? 'Yes' : 'No';

  return (
    <div className="min-h-screen flex flex-col bg-[#070b13] text-slate-100 font-sans">
      {/* Header identity matching PT PAWA */}
      <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-6 py-4 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <img
            src="/logo-pawa.png"
            alt="Logo"
            className="w-10 h-10 drop-shadow-[0_2px_5px_rgba(130,130,0,0.4)]"
          />
          <div>
            <h1 className="text-md font-bold tracking-tight text-white flex items-center gap-1.5">
              PT PAWA INDONESIA
              <span className="text-xs bg-[#828200] text-white font-mono px-2 py-0.5 rounded">ENGINEERING</span>
            </h1>
          </div>
        </div>

        {/* Logged in User Profile */}
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">LOGGED AS</p>
            <p className="text-xs font-semibold text-white">{userProfile.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2.5 bg-slate-900 hover:bg-red-950/40 hover:text-red-400 text-slate-400 rounded-xl border border-slate-800/80 transition duration-200 cursor-pointer"
            title="Keluar / Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Horizontal Tabs bar below header matching style */}
      <div className="bg-slate-950/40 border-b border-slate-900 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Buat Laporan Tab */}
          <button
            onClick={() => setActiveTab('buat-laporan')}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border ${
              activeTab === 'buat-laporan'
                ? 'bg-[#828200] border-[#999900] text-white shadow-lg shadow-[#828200]/20'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <Plus size={14} />
            Buat Laporan
          </button>

          {/* Arsip Dokumen Tab */}
          <button
            onClick={() => setActiveTab('arsip-dokumen')}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border ${
              activeTab === 'arsip-dokumen'
                ? 'bg-[#828200] border-[#999900] text-white shadow-lg shadow-[#828200]/20'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <FileDown size={14} />
            Arsip Dokumen
          </button>
        </div>

        {/* Global form reset button when in Form view */}
        {activeTab === 'buat-laporan' && reportId && (
          <button
            onClick={resetForm}
            className="px-3.5 py-1.5 bg-slate-900 text-xs font-semibold rounded-lg text-slate-400 hover:text-white border border-slate-800 transition"
          >
            Batal Edit (Buat Baru)
          </button>
        )}
      </div>

      {/* Main Container Layout */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full overflow-y-auto">
        {loading && (
          <div className="fixed inset-0 bg-[#070b13]/60 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-slate-800 border-t-[#828200] rounded-full animate-spin"></div>
              <p className="text-xs font-mono tracking-widest text-slate-400">MEMPROSES DATA...</p>
            </div>
          </div>
        )}

        {/* ----------------- TAB 1: BUAT LAPORAN FORM ----------------- */}
        {activeTab === 'buat-laporan' && (
          <div className="space-y-6">
            {/* Top Form Header with Metrics */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                {/* Photo Limit Indicator */}
                <div className="px-4 py-2 bg-slate-900/60 border border-[#828200]/40 rounded-xl flex flex-col justify-center text-center min-w-24">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">FOTO</span>
                  <span className="text-base font-extrabold text-[#999900]">{photoCount} / {cards.length}</span>
                </div>

              </div>
            </div>

            {/* Inputs Metadata Container */}
            <form onSubmit={handleSaveToArchive} className="space-y-6">
              <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Waktu Pekerjaan */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Waktu Pekerjaan</label>
                    <input
                      type="date"
                      required
                      title="Waktu Pekerjaan"
                      value={waktuMaintenance}
                      onChange={(e) => setWaktuMaintenance(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
                    />
                  </div>

                  {/* Scope of Work */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Scope of Work</label>
                    <input
                      type="text"
                      required
                      value={scopeOfWork}
                      onChange={(e) => setScopeOfWork(e.target.value)}
                      title="Scope of Work"
                      className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
                    />
                  </div>

                  {/* Sub Work */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Sub Work</label>
                    <input
                      type="text"
                      required
                      value={subWork}
                      onChange={(e) => setSubWork(e.target.value)}
                      title="Sub Work"
                      className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
                    />
                  </div>

                  {/* SPV / Eng */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">SPV / Eng</label>
                    <input
                      type="text"
                      required
                      value={spvEngineer}
                      onChange={(e) => setSpvEngineer(e.target.value)}
                      title="SPV / Eng"
                      className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
                    />
                  </div>
                </div>
              </div>

              {/* Units Switcher & Header */}
              <div className="space-y-4">
                {/* Documentation Section */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                  <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-[#828200] rounded-sm"></span>
                    FOTO DOKUMENTASI
                  </h3>

                  {/* Image control buttons */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
                    {/* Batch upload */}
                    <input
                      ref={batchFileRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleBatchUpload}
                      className="hidden"
                      id="batch-upload-input"
                    />
                    <label
                      htmlFor="batch-upload-input"
                      className="px-4 py-2.5 bg-[#828200] hover:bg-[#999900] text-white text-xs font-bold rounded-xl border border-[#999900] flex items-center justify-center gap-2 transition cursor-pointer shadow-md active:scale-95 w-full sm:w-auto"
                    >
                      <UploadCloud size={14} />
                      Unggah Banyak Foto Sekaligus
                    </label>

                    {/* Manual add card */}
                    <button
                      type="button"
                      onClick={handleAddCardManual}
                      className="px-4 py-2.5 bg-[#828200]/10 hover:bg-[#828200]/25 text-[#999900] text-xs font-bold rounded-xl border border-[#828200]/30 flex items-center justify-center gap-2 transition cursor-pointer shadow-md active:scale-95 w-full sm:w-auto"
                    >
                      <Plus size={14} />
                      Tambah Kartu Manual
                    </button>
                  </div>
                </div>

                {/* Documentation Cards Grid */}
                {cards.length === 0 ? (
                  <div className="glass-panel p-12 text-center rounded-2xl border border-dashed border-slate-800/80 bg-slate-900/10">
                    <p className="text-slate-500 text-xs">Belum ada kartu dokumentasi pemeliharaan.</p>
                    <p className="text-slate-600 text-[10px] mt-1">Gunakan tombol di atas untuk menambah secara manual atau unggah foto sekaligus.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
                    {cards.map((card, idx) => (
                      <div
                        key={card.id}
                        className="glass-card bg-slate-950/60 border border-slate-900 rounded-xl overflow-hidden shadow-lg flex flex-col"
                      >
                        {/* Card Title & Close */}
                        <div className="px-3.5 py-2.5 bg-slate-900/60 border-b border-slate-900/80 flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-400 tracking-wider">DOC #{idx + 1}</span>
                          <button
                            type="button"
                            title="Hapus Kartu"
                            onClick={() => handleDeleteCard(card.id)}
                            className="text-slate-500 hover:text-red-400 transition cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Image Placeholder or Camera/Upload Trigger */}
                        <div className="w-full aspect-[4/3] bg-slate-950/80 flex items-center justify-center relative overflow-hidden group">
                          {card.localUrl || card.photoUrl ? (
                            <div className="w-full h-full relative">
                              {card.localUrl ? (
                                <img
                                  src={card.localUrl}
                                  alt={`Inspeksi #${idx + 1}`}
                                  className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                                />
                              ) : (
                                <FirestoreImage
                                  db={db}
                                  attachmentId={card.photoUrl!}
                                  alt={`Inspeksi #${idx + 1}`}
                                  className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                                />
                              )}
                              {/* Centered Actions Overlay (always visible) */}
                              <div 
                                onClick={() => handlePreviewCardPhoto(card)}
                                className="absolute inset-0 bg-black/35 flex items-center justify-center gap-3 transition-opacity duration-200 cursor-zoom-in"
                              >
                                {/* Download */}
                                <button
                                  type="button"
                                  title="Unduh Foto"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadCardPhoto(card);
                                  }}
                                  className="w-11 h-11 rounded-xl bg-[#828200] border border-[#999900]/25 text-white flex items-center justify-center hover:bg-[#999900] transition-all active:scale-90 cursor-pointer shadow-lg"
                                >
                                  <Download size={18} />
                                </button>

                                {/* Crop */}
                                <button
                                  type="button"
                                  title="Potong Foto"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCropCardPhoto(card);
                                  }}
                                  className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700/60 text-white flex items-center justify-center hover:bg-slate-750 transition-all active:scale-90 cursor-pointer shadow-lg"
                                >
                                  <Scissors size={18} />
                                </button>

                                {/* Remove Photo */}
                                <button
                                  type="button"
                                  title="Hapus Foto"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemovePhoto(card.id);
                                  }}
                                  className="w-11 h-11 rounded-xl bg-red-600 border border-red-500/60 text-white flex items-center justify-center hover:bg-red-500 transition-all active:scale-90 cursor-pointer shadow-lg"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="w-full h-full grid grid-cols-2 text-center text-slate-400 text-[9px] font-bold">
                              {/* Left camera trigger */}
                              <button
                                type="button"
                                onClick={() => triggerCameraForCard(card.id)}
                                className="border-r border-slate-900 hover:bg-slate-900/50 hover:text-[#999900] transition flex flex-col items-center justify-center gap-1.5 cursor-pointer py-2"
                              >
                                <Camera size={18} className="text-slate-500" />
                                <span>AMBIL FOTO</span>
                              </button>

                              {/* Right upload trigger */}
                              <label
                                className="hover:bg-slate-900/50 hover:text-[#999900] transition flex flex-col items-center justify-center gap-1.5 cursor-pointer py-2"
                              >
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleCardPhotoUpload(card.id, file);
                                    }
                                  }}
                                />
                                <UploadCloud size={18} className="text-slate-500" />
                                <span>UNGGAH FOTO</span>
                              </label>
                            </div>
                          )}
                        </div>

                        {/* Description field */}
                        <div className="p-3 bg-slate-950/40 border-t border-slate-900">
                          <textarea
                            value={card.description}
                            onChange={(e) => updateCardDescription(card.id, e.target.value)}
                            title="Deskripsi Kartu"
                            rows={2}
                            className="w-full bg-transparent border-none resize-none text-xs text-slate-300 placeholder-slate-700 focus:outline-none focus:ring-0 p-0"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Actions Control Bar */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-900 bg-slate-900/20 flex flex-col sm:flex-row justify-center items-center gap-4">
                {/* Save to Archive */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto px-6 py-3 bg-[#828200] hover:bg-[#999900] text-white text-xs font-extrabold rounded-xl border border-[#999900] shadow-lg shadow-[#828200]/15 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
                >
                  <CheckCircle size={14} />
                  SIMPAN KE ARSIP DOKUMEN!
                </button>

                {/* Print Preview */}
                <button
                  type="button"
                  onClick={handleOpenPreview}
                  className="w-full sm:w-auto px-6 py-3 bg-transparent hover:bg-[#828200]/10 text-[#999900] text-xs font-extrabold rounded-xl border border-[#828200]/40 flex items-center justify-center gap-2 cursor-pointer transition"
                >
                  <Eye size={14} />
                  PREVIEW REPORT
                </button>

                {/* Direct export PDF */}
                <button
                  type="button"
                  onClick={handleSaveAndExportPDF}
                  className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold rounded-xl border border-red-500 shadow-lg shadow-red-600/10 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
                >
                  <FileDown size={14} />
                  EXPORT PDF (SUB-REPORT)
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ----------------- TAB 2: ARSIP DOKUMEN LIST ----------------- */}
        {activeTab === 'arsip-dokumen' && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/30">
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="text-[#999900]" size={18} />
                  Document Archive
                </h2>
                <p className="text-xs text-slate-400">
                  Semua dokumen Excel & PDF pekerjaan yang telah diekspor atau tersimpan dalam database.
                </p>
              </div>

              {/* Filters list matching style */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-4">
                {/* Search query */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama pekerjaan..."
                    className="w-full pl-9 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
                  />
                </div>

                {/* Date picker */}
                <div className="relative">
                  <input
                    type="date"
                    title="Filter Tanggal"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-[#828200] transition duration-200"
                  />
                </div>

                {/* Sort selection */}
                <select
                  value={sortBy}
                  title="Urutkan Laporan"
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-[#828200] transition duration-200"
                >
                  <option value="terbaru">Terbaru</option>
                  <option value="terlama">Terlama</option>
                </select>

                {/* Group dropdown type */}
                <select
                  value={filterType}
                  title="Filter Tipe Dokumen"
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-[#828200] transition duration-200"
                >
                  <option value="semua">Semua</option>
                  <option value="pdf">PDF Only</option>
                  <option value="excel">Excel / XLSX Only</option>
                </select>
              </div>

              {/* Stats Widgets Grid */}
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* Total Dokumen */}
                <div className="bg-slate-950/50 border border-slate-900 p-4 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Total Dokumen</p>
                  <p className="text-xl font-bold text-white mt-1">{totalReportsCount}</p>
                </div>

                {/* Hasil Filter */}
                <div className="bg-slate-950/50 border border-slate-900 p-4 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Hasil Filter</p>
                  <p className="text-xl font-bold text-[#999900] mt-1">{filteredCount}</p>
                </div>

                {/* Total Size */}
                <div className="bg-slate-950/50 border border-slate-900 p-4 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Total Size</p>
                  <p className="text-xl font-bold text-[#999900] mt-1">{calculatedTotalSize} MB</p>
                </div>

                {/* Filter Aktif */}
                <div className="bg-slate-950/50 border border-slate-900 p-4 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Filter Aktif</p>
                  <p className="text-xl font-bold text-[#999900] mt-1">{isFilterActive}</p>
                </div>
              </div>
            </div>

            {/* Document Cards List */}
            <div className="space-y-4">
              {filteredReports.length === 0 ? (
                <div className="glass-panel p-16 text-center rounded-2xl border border-slate-800">
                  <FileText className="mx-auto text-slate-700 mb-3" size={32} />
                  <p className="text-slate-500 text-xs">Tidak ada laporan pekerjaan yang ditemukan.</p>
                  <p className="text-slate-600 text-[10px] mt-1">Coba sesuaikan kata kunci pencarian atau buat laporan baru.</p>
                </div>
              ) : (
                filteredReports.map((rep) => {
                  const repPhotos = rep.steps?.filter(s => s.photoUrl).length || 0;
                  const repSizeKB = (repPhotos * 777 + 50);
                  const displaySize = repSizeKB > 1000 
                    ? `${(repSizeKB / 1024).toFixed(2)} MB`
                    : `${repSizeKB} KB`;

                  return (
                    <div
                      key={rep.id}
                      className="glass-panel p-4.5 rounded-xl border border-slate-900 hover:border-slate-850 hover:bg-slate-950/40 transition duration-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      {/* Left: Document Icon with PDF overlay */}
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-12 bg-red-950/20 border border-red-900/40 rounded-lg flex flex-col items-center justify-center text-red-500 relative flex-shrink-0">
                          <FileText size={20} />
                          <span className="absolute bottom-1 right-1 bg-red-600 text-[6.5px] font-extrabold text-white px-0.5 rounded leading-none">PDF</span>
                        </div>

                        {/* Middle Details */}
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-white leading-snug">{rep.title}</h3>
                            <span className="text-[7.5px] bg-red-950/40 border border-red-900/50 text-red-400 font-extrabold px-1.5 py-0.5 rounded uppercase font-mono">
                              PDF
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500 font-mono">
                            <span className="flex items-center gap-1">
                              <Calendar size={11} />
                              {rep.maintenanceDate || rep.createdAt.slice(0, 10)}
                            </span>
                            <span>•</span>
                            <span>{rep.engineerName}</span>
                            <span>•</span>
                            <span>{displaySize}</span>
                            {rep.siteProject && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-0.5 text-[#999900] font-bold">
                                  <MapPin size={10} />
                                  {rep.siteProject}
                                </span>
                              </>
                            )}
                          </div>
                          
                          <p className="text-[9px] text-slate-600">
                            Dibuat: {new Date(rep.createdAt).toLocaleString('id-ID')}
                          </p>
                        </div>
                      </div>

                      {/* Right Action buttons */}
                      <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                        {/* Edit report */}
                        <button
                          onClick={() => handleEditReport(rep)}
                          className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-[#999900] hover:text-[#828200] hover:bg-slate-850 cursor-pointer transition"
                          title="Edit Laporan"
                        >
                          <Edit size={13} />
                        </button>

                        {/* Download PDF */}
                        <button
                          onClick={() => exportPDFDirect(rep)}
                          className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-[#999900] hover:text-[#828200] hover:bg-slate-850 cursor-pointer transition"
                          title="Unduh PDF"
                        >
                          <Download size={13} />
                        </button>

                        {/* Delete report */}
                        <button
                          onClick={() => handleDeleteReport(rep.id!)}
                          className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-red-500 hover:text-red-400 hover:bg-slate-850 cursor-pointer transition"
                          title="Hapus Laporan"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* Shared Smart Camera Modal Overlay */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCaptureResult}
        detailUnit={detailUnit}
        brandTitle="PT PAWA INDONESIA ENGINEERING"
      />

      {/* Image Crop Modal Overlay */}
      {isCropModalOpen && cropImageSrc && (
        <ImageCropModal
          isOpen={isCropModalOpen}
          imageSrc={cropImageSrc}
          onSave={handleSaveCrop}
          onCancel={handleCloseCropModal}
        />
      )}

      {/* Fullscreen Photo Preview Modal */}
      {previewPhotoSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          {/* Close Area */}
          <div className="absolute inset-0 cursor-zoom-out" onClick={handleClosePhotoPreview} />
          
          {/* Modal Content */}
          <div className="relative max-w-3xl max-h-[85vh] z-10 flex flex-col items-center gap-4 bg-[#0b0f19] border border-slate-800/60 p-4 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
            <img
              src={previewPhotoSrc}
              alt="Preview Dokumentasi"
              className="max-h-[70vh] max-w-full object-contain rounded-2xl shadow-xl"
            />
            
            {/* Controls */}
            <div className="flex gap-4">
              {/* Download */}
              <button
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = previewPhotoSrc;
                  a.download = `preview_${Date.now()}.jpg`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
                className="px-4 py-2 bg-[#828200] hover:bg-[#999900] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow"
              >
                <Download size={14} /> Unduh Foto
              </button>
              
              {/* Close */}
              <button
                onClick={handleClosePhotoPreview}
                className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:text-white text-slate-400 text-xs font-bold rounded-xl transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- PREVIEW MODAL ----------------- */}
      {isPreviewModalOpen && previewReport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#070b13] border border-slate-800 rounded-2xl w-full max-w-4xl h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-900 flex justify-between items-center">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Eye size={16} className="text-[#999900]" />
                PREVIEW REPORT LAYOUT
              </h3>
              <button
                onClick={handleClosePreview}
                title="Tutup Preview"
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-900 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 p-0 relative bg-slate-950">
              {previewPdfUrl ? (
                <iframe
                  src={`${previewPdfUrl}#view=FitH`}
                  title="PDF Preview"
                  className="w-full h-full border-none bg-slate-950"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs space-y-3">
                  <div className="w-8 h-8 border-2 border-[#828200] border-t-transparent rounded-full animate-spin"></div>
                  <p>Membuat preview PDF...</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-900 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={handleClosePreview}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 rounded-xl text-xs transition"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  handleClosePreview();
                  handleSaveAndExportPDF();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs flex items-center gap-1.5 transition"
              >
                <FileDown size={12} /> Export PDF Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert/Confirm Modal Dialog */}
      {customDialog.isOpen && (
        <div className="fixed inset-0 bg-[#070b13]/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
              <h3 className="text-xs font-bold tracking-tight text-white uppercase font-mono">{customDialog.title}</h3>
              <button 
                onClick={closeCustomDialog}
                type="button"
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>
            {/* Content */}
            <div className="p-6">
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{customDialog.message}</p>
            </div>
            {/* Actions */}
            <div className="px-6 py-4 bg-slate-950/40 border-t border-slate-800 flex justify-end gap-2.5">
              {customDialog.isConfirm ? (
                <>
                  <button
                    onClick={customDialog.onCancel}
                    type="button"
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    {customDialog.cancelText || 'Batal'}
                  </button>
                  <button
                    onClick={customDialog.onConfirm}
                    type="button"
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    {customDialog.confirmText || 'Ya, Hapus'}
                  </button>
                </>
              ) : (
                <button
                  onClick={closeCustomDialog}
                  type="button"
                  className="px-5 py-2 bg-[#828200] hover:bg-[#999900] text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer matching corporate identity */}
      <footer className="bg-slate-950 text-slate-600 border-t border-slate-950 py-8 mt-auto text-xs">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <img
                src="/logo-pawa.png"
                alt="Logo"
                className="w-8 h-8 drop-shadow-[0_2px_4px_rgba(130,130,0,0.3)]"
              />
              <span className="font-extrabold text-xs tracking-wider text-slate-300">PT. PAWA INDONESIA ENGINEERING</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              37th Floor, The East Tower, Jalan Dr. Ide Anak Agung Kav E3.2 No.1 RT.005 RW.002, Kuningan Barat, Mampang Prapatan, Jakarta Selatan, DKI Jakarta
            </p>
          </div>

          <div className="space-y-1.5">
            <h4 className="font-extrabold text-[10px] text-slate-500 uppercase tracking-widest">LOCATION</h4>
            <p className="text-[11px] leading-relaxed text-slate-400">Head Office</p>
            <p className="text-[10px] leading-relaxed">
              The East Tower, 37th Floor<br />
              Jl. Dr. Ide Anak Agung Kav E3.2 No.1<br />
              Jakarta Selatan - 12950, Indonesia
            </p>
          </div>

          <div className="space-y-1.5">
            <h4 className="font-extrabold text-[10px] text-slate-500 uppercase tracking-widest">CONTACT</h4>
            <p className="text-[10px]">
              <span className="text-slate-500">Support:</span> <span className="text-slate-400">sales@pawaengineering.co.id</span>
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 border-t border-slate-900 mt-6 pt-4 text-center text-[10px] text-slate-600">
          Copyright © 2026 <span className="text-slate-500 font-bold">PT. Pawa Indonesia Engineering</span>. All Rights Reserved.
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;
