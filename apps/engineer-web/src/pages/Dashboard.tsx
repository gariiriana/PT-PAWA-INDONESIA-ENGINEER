import React, { useState, useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { 
  LogOut, FileText, Camera, FileDown, Plus, Eye, Search, Trash2, Edit, 
  Download, UploadCloud, CheckCircle, X, Calendar, Layers, MapPin, EyeOff
} from 'lucide-react';
import { auth, db } from '../config/firebase';
import { 
  ReportEngineer, MaintenanceTemplate, MaintenanceStep, UserProfile,
  uploadFileToFirestore, downloadFileFromFirestore, FirestoreImage
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
  const [siteProyek, setSiteProyek] = useState('NeutraDC');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('NEUTRA');

  // Documentation cards state
  const [cards, setCards] = useState<CardData[]>(generateInitialCards());

  // Camera integration state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraTargetCard, setCameraTargetCard] = useState<{ cardId: string } | null>(null);

  // Search & Filter state for Archive
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [sortBy, setSortBy] = useState<'terbaru' | 'terlama'>('terbaru');
  const [filterType, setFilterType] = useState<'semua' | 'pdf' | 'excel'>('semua');

  // Preview Modal
  const [previewReport, setPreviewReport] = useState<ReportEngineer | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // File input ref for batch upload
  const batchFileRef = useRef<HTMLInputElement | null>(null);

  // Custom Alert/Confirm Modal Dialog State
  const [customDialog, setCustomDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isConfirm: boolean;
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

  const showCustomConfirm = (message: string, onConfirm: () => void, title: string = 'Konfirmasi') => {
    setCustomDialog({
      isOpen: true,
      title,
      message,
      isConfirm: true,
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

  const handleLogout = async () => {
    await signOut(auth);
    onLogout();
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
        // Set localUrl instantly to skip card-level loading text
        setCards(prev => prev.map((c) => {
          if (c.id === cardId) {
            return { ...c, localUrl: dataUrl };
          }
          return c;
        }));

        const attachmentId = await uploadFileToFirestore(db, blob, `captured_${Date.now()}.jpg`);
        setCards(prev => prev.map((c) => {
          if (c.id === cardId) {
            return { ...c, photoUrl: attachmentId, localUrl: dataUrl };
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
    if (!reportTitle) {
      showCustomAlert('Nama Maintenance tidak boleh kosong.', 'Peringatan');
      return null;
    }

    // Flatten cards structure into the standard Firestore steps array
    const steps: MaintenanceStep[] = [];
    let stepCounter = 1;

    cards.forEach((card) => {
      steps.push({
        stepNumber: stepCounter++,
        task: card.description || 'Dokumentasi Unit',
        status: card.photoUrl ? 'completed' : 'pending',
        photoUrl: card.photoUrl || '',
        unitName: detailUnit || 'UNIT 1',
        notes: detailUnit || 'UNIT 1'
      });
    });

    const reportData: Partial<ReportEngineer> = {
      title: reportTitle,
      templateType: selectedTemplate || 'NEUTRA',
      detailUnit: detailUnit,
      siteProject: siteProyek,
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
        await setDoc(doc(db, 'reports_engineer', reportId), {
          ...reportData,
          createdAt: reports.find(r => r.id === reportId)?.createdAt || new Date().toISOString()
        }, { merge: true });
      } else {
        // Create new
        const docRef = await addDoc(collection(db, 'reports_engineer'), {
          ...reportData,
          createdAt: new Date().toISOString(),
        });
        savedDocId = docRef.id;
      }
      
      const fullReport: ReportEngineer = {
        id: savedDocId!,
        title: reportTitle,
        templateType: selectedTemplate || 'NEUTRA',
        detailUnit: detailUnit,
        siteProject: siteProyek,
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
    setReportId(null);
    setReportTitle('');
    setDetailUnit('');
    setWaktuMaintenance(new Date().toISOString().slice(0, 10));
    setSiteProyek('NeutraDC');
    setSelectedTemplate('NEUTRA');
    setCards(generateInitialCards());
  };

  // Edit report
  const handleEditReport = (report: ReportEngineer) => {
    setReportId(report.id || null);
    setReportTitle(report.title);
    setDetailUnit(report.detailUnit || '');
    setWaktuMaintenance(report.maintenanceDate || report.createdAt.slice(0, 10));
    setSiteProyek(report.siteProject || 'NeutraDC');
    setSelectedTemplate(report.templateType || 'NEUTRA');

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

  // Export dynamically to PDF
  const exportPDFDirect = async (report: ReportEngineer) => {
    setLoading(true);
    try {
      const docPdf = new jsPDF('p', 'mm', 'a4');
      const pageHeight = docPdf.internal.pageSize.height;
      const pageWidth = docPdf.internal.pageSize.width;
      
      // We will draw a top accent colored line (Olive Gold)
      docPdf.setFillColor(130, 130, 0); // #828200
      docPdf.rect(0, 0, pageWidth, 3, 'F');
      
      // Let's create the styled header block starting at y = 8mm, height = 30mm
      const headerY = 8;
      const headerH = 30;
      const margin = 10;
      const contentW = pageWidth - (margin * 2); // 190mm
      
      // Draw outer box border for the header
      docPdf.setDrawColor(200, 200, 200);
      docPdf.setLineWidth(0.3);
      docPdf.rect(margin, headerY, contentW, headerH, 'S');
      
      // Column 1 (Left): PT PAWA logo. Logo width is 22mm, centered in a 35mm space.
      // We draw a vertical line inside the header box separating column 1 and 2
      const logoColW = 35;
      docPdf.line(margin + logoColW, headerY, margin + logoColW, headerY + headerH);
      
      // 1. Gather all unique photo URLs to download
      const photoUrlsToDownload: string[] = [];
      report.steps.forEach(step => {
        if (step.photoUrl && !photoUrlsToDownload.includes(step.photoUrl)) {
          photoUrlsToDownload.push(step.photoUrl);
        }
      });

      const downloadedImagesMap: Record<string, string> = {};
      const logoUrl = '/logo-pawa.png';
      let logoBase64: string | null = null;

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
        docPdf.text('PT. PAWA', margin + 8, headerY + 12);
        docPdf.text('ENGINEER', margin + 7, headerY + 17);
      };

      // Draw PT PAWA logo
      if (logoBase64) {
        try {
          docPdf.addImage(logoBase64, 'PNG', margin + 6, headerY + 4, 22, 22);
        } catch (e) {
          console.error('Failed to add logo image to PDF:', e);
          drawLogoTextFallback();
        }
      } else {
        drawLogoTextFallback();
      }
      
      // Column 2 (Right/Center-right): Text metadata.
      const textX = margin + logoColW + 6;
      docPdf.setTextColor(0, 0, 0);
      docPdf.setFont('Helvetica', 'bold');
      docPdf.setFontSize(16);
      docPdf.text('LAPORAN MAINTENANCE', textX, headerY + 8);
      
      docPdf.setFont('Helvetica', 'bold');
      docPdf.setFontSize(11);
      docPdf.text(`DOKUMENTASI PM: ${report.title.toUpperCase()}`, textX, headerY + 14);
      
      docPdf.setFont('Helvetica', 'normal');
      docPdf.setFontSize(10);
      docPdf.setTextColor(100, 100, 100);
      docPdf.text(`Unit: ${report.detailUnit || '-'}`, textX, headerY + 20);
      docPdf.text(`Tanggal Maintenance: ${report.maintenanceDate || report.createdAt.slice(0, 10)}`, textX, headerY + 25);
      
      let currentY = headerY + headerH + 8; // start drawing below the header block

      docPdf.setFont('Helvetica', 'bold');
      docPdf.setFontSize(12);
      docPdf.setTextColor(130, 130, 0); // Olive Gold Color
      const displayUnitName = report.detailUnit ? report.detailUnit.toUpperCase() : 'DOKUMENTASI';
      docPdf.text(`DOKUMENTASI: ${displayUnitName}`, margin, currentY);
      
      // Draw horizontal line below title
      docPdf.setDrawColor(130, 130, 0);
      docPdf.setLineWidth(0.4);
      docPdf.line(margin, currentY + 1.5, pageWidth - margin, currentY + 1.5);
      
      currentY += 6;
      
      // Let's draw the grid cards.
      let px = margin;
      const cardW = 43.5;
      const cardH = 55; // slightly taller card to fit larger text nicely
      const gap = 5;
      
      for (const step of report.steps) {
        // Check if we need to move to the next page
        if (currentY + cardH > pageHeight - 15) {
          docPdf.addPage();
          // Top accent line on new pages
          docPdf.setFillColor(130, 130, 0);
          docPdf.rect(0, 0, pageWidth, 3, 'F');
          
          // Re-draw title on new page for continuation
          currentY = 15;
          docPdf.setFont('Helvetica', 'bold');
          docPdf.setFontSize(12);
          docPdf.setTextColor(130, 130, 0);
          docPdf.text(`DOKUMENTASI: ${displayUnitName} (Lanjutan)`, margin, currentY);
          docPdf.setDrawColor(130, 130, 0);
          docPdf.setLineWidth(0.4);
          docPdf.line(margin, currentY + 1.5, pageWidth - margin, currentY + 1.5);
          currentY += 6;
          px = margin;
        }
        
        // Draw card container box
        docPdf.setDrawColor(220, 220, 220);
        docPdf.setLineWidth(0.2);
        docPdf.setFillColor(255, 255, 255);
        docPdf.rect(px, currentY, cardW, cardH, 'F');
        docPdf.rect(px, currentY, cardW, cardH, 'S');
        
        // Draw image
        if (step.photoUrl && downloadedImagesMap[step.photoUrl]) {
          try {
            const dataUrl = downloadedImagesMap[step.photoUrl];
            docPdf.addImage(dataUrl, 'JPEG', px + 1.5, currentY + 1.5, cardW - 3, cardH - 17);
          } catch (err) {
            console.error('Error rendering image in PDF:', err);
            docPdf.setFillColor(240, 240, 240);
            docPdf.rect(px + 1.5, currentY + 1.5, cardW - 3, cardH - 17, 'F');
            docPdf.setTextColor(200, 50, 50);
            docPdf.setFontSize(8);
            docPdf.text('[Foto Gagal Dimuat]', px + cardW/2 - 13, currentY + (cardH - 17)/2 + 1);
          }
        } else {
          // Draw placeholder box
          docPdf.setFillColor(245, 245, 245);
          docPdf.rect(px + 1.5, currentY + 1.5, cardW - 3, cardH - 17, 'F');
          docPdf.setTextColor(150, 150, 150);
          docPdf.setFontSize(8);
          docPdf.setFont('Helvetica', 'normal');
          docPdf.text('TANPA FOTO', px + cardW/2 - 9, currentY + (cardH - 17)/2 + 1);
        }
        
        // Description details area below the image
        const descY = currentY + cardH - 12;
        
        // Left accent vertical bar (Olive Gold)
        docPdf.setFillColor(130, 130, 0); // #828200
        docPdf.rect(px + 2, descY, 0.7, 9, 'F');
        
        // Description text
        docPdf.setTextColor(50, 50, 50);
        docPdf.setFont('Helvetica', 'normal');
        docPdf.setFontSize(8.5);
        const wrappedDesc = docPdf.splitTextToSize(step.task, cardW - 5.5);
        docPdf.text(wrappedDesc, px + 3.7, descY + 3); // line height adjust
        
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
        docPdf.text('PT PAWA INDONESIA ENGINEER — Laporan Maintenance', margin, pageHeight - 6);
        
        docPdf.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin - 22, pageHeight - 6);
      }
      
      // Clean up Object URLs to prevent memory leak
      Object.values(downloadedImagesMap).forEach(url => {
        URL.revokeObjectURL(url);
      });
      
      docPdf.save(`Report_Maintenance_${report.title.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      showCustomAlert('Gagal mengekspor laporan ke PDF.', 'Ekspor Gagal');
    } finally {
      setLoading(false);
    }
  };

  // Preview layout in modal
  const handleOpenPreview = () => {
    // Construct fake temporary report object to send to preview
    const steps: MaintenanceStep[] = [];
    let stepCounter = 1;
    cards.forEach((card) => {
      steps.push({
        stepNumber: stepCounter++,
        task: card.description || 'Dokumentasi Unit',
        status: card.photoUrl ? 'completed' : 'pending',
        photoUrl: card.photoUrl || '',
        unitName: detailUnit || 'UNIT 1',
        notes: detailUnit || 'UNIT 1'
      });
    });

    const tempReport: ReportEngineer = {
      title: reportTitle || 'Inspeksi Pemeliharaan Tanpa Nama',
      templateType: selectedTemplate || 'NEUTRA',
      detailUnit: detailUnit,
      siteProject: siteProyek,
      maintenanceDate: waktuMaintenance,
      engineerId: userProfile.uid,
      engineerName: userProfile.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'submitted',
      steps: steps,
    };

    setPreviewReport(tempReport);
    setIsPreviewModalOpen(true);
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
              <span className="text-xs bg-[#828200] text-white font-mono px-2 py-0.5 rounded">ENGINEER</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">FACILITY MANAGEMENT & MAINTENANCE</p>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Nama Maintenance */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Nama Maintenance</label>
                    <input
                      type="text"
                      required
                      value={reportTitle}
                      onChange={(e) => setReportTitle(e.target.value)}
                      placeholder="cth. Maintenance Bulanan"
                      className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
                    />
                  </div>

                  {/* Detail Unit Maintenance */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Detail Unit Maintenance</label>
                    <input
                      type="text"
                      required
                      value={detailUnit}
                      onChange={(e) => setDetailUnit(e.target.value)}
                      placeholder="cth. FCU-01 / VRV-02"
                      className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
                    />
                  </div>

                  {/* Waktu Maintenance */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Waktu Maintenance</label>
                    <input
                      type="date"
                      required
                      title="Waktu Maintenance"
                      value={waktuMaintenance}
                      onChange={(e) => setWaktuMaintenance(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
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
                    DOKUMENTASI: {detailUnit ? `(${detailUnit})` : '(Tanpa Nama Unit)'}
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
                              <button
                                type="button"
                                title="Hapus Foto"
                                onClick={() => handleRemovePhoto(card.id)}
                                className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-md text-white p-1 hover:text-red-400 rounded-full border border-slate-800 text-[10px] transition"
                              >
                                <X size={12} />
                              </button>
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
                            placeholder="cth. Name Plate atau deskripsi..."
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
                  Semua dokumen Excel & PDF maintenance yang telah diekspor atau tersimpan dalam database.
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
                    placeholder="Cari nama maintenance..."
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
                  <p className="text-slate-500 text-xs">Tidak ada laporan maintenance yang ditemukan.</p>
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
        brandTitle="PT PAWA INDONESIA ENGINEER"
      />

      {/* ----------------- PREVIEW MODAL ----------------- */}
      {isPreviewModalOpen && previewReport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#070b13] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-900 flex justify-between items-center">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Eye size={16} className="text-[#999900]" />
                PREVIEW REPORT LAYOUT
              </h3>
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                title="Tutup Preview"
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-900 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Document Header in PDF layout */}
              <div className="bg-slate-900 border border-slate-850 p-6 rounded-xl space-y-4 text-slate-300">
                <div className="border-b border-slate-800 pb-4 flex flex-col md:flex-row md:justify-between gap-4">
                  <div>
                    <h2 className="text-base font-extrabold text-white">PT. PAWA INDONESIA ENGINEERING</h2>
                    <p className="text-[10px] text-slate-500">Laporan Pemeliharaan Teknis / Engineering Report</p>
                  </div>
                  <div className="text-right text-[10px] text-slate-500">
                    <p>ENGINEER REPORT PREVIEW</p>
                  </div>
                </div>

                {/* Metadata Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">NAMA MAINTENANCE</p>
                    <p className="text-white font-sans mt-0.5">{previewReport.title}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">SITUS / LOKASI</p>
                    <p className="text-white font-sans mt-0.5">{previewReport.siteProject || 'NeutraDC'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">WAKTU MAINTENANCE</p>
                    <p className="text-white font-sans mt-0.5">{previewReport.maintenanceDate || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">DETAIL UNIT</p>
                    <p className="text-white font-sans mt-0.5">{previewReport.detailUnit || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Steps/Tasks List */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Langkah Pekerjaan & Dokumentasi</h4>
                
                {/* Re-group steps into units */}
                {(() => {
                  const groupedPreview: Record<string, MaintenanceStep[]> = {};
                  previewReport.steps.forEach(step => {
                    const uName = step.unitName || 'UNIT 1';
                    if (!groupedPreview[uName]) groupedPreview[uName] = [];
                    groupedPreview[uName].push(step);
                  });

                  return Object.entries(groupedPreview).map(([uName, stepList]) => (
                    <div key={uName} className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-900">
                      <h5 className="text-xs font-extrabold text-[#999900] border-b border-slate-900 pb-2">{uName}</h5>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {stepList.map((step, idx) => (
                          <div key={idx} className="bg-slate-900/40 border border-slate-900 p-3 rounded-lg flex gap-3 items-center">
                            {step.photoUrl ? (
                              <FirestoreImage
                                db={db}
                                attachmentId={step.photoUrl}
                                className="w-14 h-14 object-cover rounded-lg border border-slate-800 flex-shrink-0"
                              />
                            ) : (
                              <div className="w-14 h-14 bg-slate-950 border border-slate-900 rounded-lg flex items-center justify-center text-[8px] text-slate-700 flex-shrink-0 font-bold">
                                NO FOTO
                              </div>
                            )}
                            <div className="space-y-1 overflow-hidden">
                              <p className="text-[9px] font-bold text-slate-500">DOC #{idx + 1}</p>
                              <p className="text-xs text-slate-200 truncate">{step.task || 'Tanpa deskripsi'}</p>
                              <span className="text-[8px] bg-[#828200]/10 text-[#999900] border border-[#828200]/25 font-bold px-1 rounded uppercase">
                                {step.status === 'completed' ? 'TERPASANG' : 'PENDING'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-900 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 rounded-xl text-xs transition"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPreviewModalOpen(false);
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
                    Batal
                  </button>
                  <button
                    onClick={customDialog.onConfirm}
                    type="button"
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Ya, Hapus
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
