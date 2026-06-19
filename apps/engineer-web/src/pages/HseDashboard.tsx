import React, { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { 
  LogOut, ShieldAlert, CheckCircle2, AlertTriangle, Camera, FileDown, 
  Settings, User, Plus, Search, Calendar, ChevronRight, CheckSquare, Eye,
  HardHat, FileText, FolderOpen, UploadCloud, Trash2, Edit, X, MapPin, Users, UserCheck
} from 'lucide-react';
import { auth, db } from '../config/firebase';
import { 
  ReportHSE, SafetyInspection, SafetyCheckItem, GPSCoords,
  uploadFileToFirestore, downloadFileFromFirestore, FirestoreImage
} from '@shared/index';
import CameraModal from '@shared/components/CameraModal';
import ImageEditor from '../components/ImageEditor';
import jsPDF from 'jspdf';
import ExcelJS from 'exceljs';

interface DashboardProps {
  userProfile: { uid: string; email: string; name: string; role: string };
  onLogout: () => void;
}

// Preset Safety inspection questions
const SAFETY_CHECKLIST_TEMPLATE: Omit<SafetyCheckItem, 'checked' | 'notes'>[] = [
  { id: 'apd', category: 'APD', question: 'Semua pekerja menggunakan APD lengkap (helm, sepatu safety, sarung tangan)?' },
  { id: 'aparr', category: 'Kebakaran', question: 'Tabung APAR tersedia di area kerja, terisi penuh, dan tidak kadaluwarsa?' },
  { id: 'evac', category: 'Evakuasi', question: 'Jalur evakuasi bersih dari hambatan dan terpasang rambu darurat?' },
  { id: 'electric', category: 'Kelistrikan', question: 'Koneksi kabel kelistrikan aman, rapi, dan tidak ada kabel terkelupas?' },
  { id: 'housekeep', category: 'Housekeeping', question: 'Area kerja bersih, rapi, dan tidak ada ceceran oli/cairan berbahaya?' },
  { id: 'hotwork', category: 'High Risk', question: 'Pekerjaan panas (welding/grinding) dilengkapi dengan fire blanket?' },
];

interface CardData {
  id: string;
  photoUrl?: string; // Firestore attachment ID
  localUrl?: string; // Local Object URL or Data URL (for instant rendering)
  description: string;
}

const generateInitialCards = (): CardData[] => [
  { id: `card_init_1_${Math.random()}`, description: '' },
  { id: `card_init_2_${Math.random()}`, description: '' },
  { id: `card_init_3_${Math.random()}`, description: '' },
  { id: `card_init_4_${Math.random()}`, description: '' },
];

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

export const HseDashboard: React.FC<DashboardProps> = ({ userProfile, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'buat-inspeksi' | 'arsip-laporan'>('buat-inspeksi');
  const [hazards, setHazards] = useState<ReportHSE[]>([]);
  const [inspections, setInspections] = useState<SafetyInspection[]>([]);
  const [loading, setLoading] = useState(false);

  // Smart Camera integration state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  // Paten 4 Cards documentation state
  const [cards, setCards] = useState<CardData[]>(generateInitialCards());

  // Hazard Report Form state
  const [hazardTitle, setHazardTitle] = useState('');
  const [category, setCategory] = useState<'Unsafe Action' | 'Unsafe Condition' | 'Incident' | 'Near Miss'>('Unsafe Condition');
  const [description, setDescription] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [gpsCoords, setGpsCoords] = useState<GPSCoords | null>(null);
  const [watermarkedPhotoUrl, setWatermarkedPhotoUrl] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);

  // Safety Inspection Checklist state
  const [inspectionTitle, setInspectionTitle] = useState('');
  const [checklist, setChecklist] = useState<SafetyCheckItem[]>([]);
  const [overallStatus, setOverallStatus] = useState<'Safe' | 'Attention Required' | 'Unsafe'>('Safe');
  const [comments, setComments] = useState('');

  // K3 Metadata fields for Safety Inspection
  const [inspectorK3, setInspectorK3] = useState(userProfile?.name && userProfile.name.toLowerCase() !== 'hse' ? userProfile.name : '');
  const [aktivitas, setAktivitas] = useState('');
  const [lokasi, setLokasi] = useState('');
  const [personil, setPersonil] = useState('');
  const [pic, setPic] = useState('');
  const [anggota, setAnggota] = useState('');

  // Preview Modal state
  const [previewInspection, setPreviewInspection] = useState<SafetyInspection | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  // Archive Search states
  const [searchYear, setSearchYear] = useState('2026');
  const [searchMonth, setSearchMonth] = useState('All');

  // Editing states for safety inspection reports
  const [editingInspectionId, setEditingInspectionId] = useState<string | null>(null);
  const [originalCreatedAt, setOriginalCreatedAt] = useState<string | null>(null);

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

  // Load safety checklist on init
  useEffect(() => {
    const initialChecklist = SAFETY_CHECKLIST_TEMPLATE.map(item => ({
      ...item,
      checked: true,
    }));
    setChecklist(initialChecklist);
  }, []);

  // Fetch archives on tab change
  useEffect(() => {
    fetchArchives();
  }, [activeTab]);

  const fetchArchives = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'reports_hse'));
      const querySnapshot = await getDocs(q);
      const fetchedHazards: ReportHSE[] = [];
      querySnapshot.forEach((doc) => {
        fetchedHazards.push({ id: doc.id, ...doc.data() } as ReportHSE);
      });
      setHazards(fetchedHazards.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

      const insQ = query(collection(db, 'safety_inspections'));
      const insSnapshot = await getDocs(insQ);
      const fetchedIns: SafetyInspection[] = [];
      insSnapshot.forEach((doc) => {
        fetchedIns.push({ id: doc.id, ...doc.data() } as SafetyInspection);
      });
      setInspections(fetchedIns.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (err) {
      console.error('Error fetching HSE archives:', err);
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

  const handleAddCard = () => {
    setCards(prev => [...prev, { id: `card_man_${Date.now()}_${Math.random()}`, description: '' }]);
  };

  const handleDeleteCard = (cardId: string) => {
    setCards(prev => {
      const card = prev.find(c => c.id === cardId);
      if (card?.localUrl) {
        URL.revokeObjectURL(card.localUrl);
      }
      return prev.filter(c => c.id !== cardId);
    });
  };

  const handleBatchPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    try {
      const fileArray = Array.from(files);

      const uploadPromises = fileArray.map(async (file) => {
        const compressedBlob = await compressImageFile(file);
        const localUrl = URL.createObjectURL(compressedBlob);
        const attachmentId = await uploadFileToFirestore(db, compressedBlob, file.name);
        return { attachmentId, localUrl };
      });

      const uploadedResults = await Promise.all(uploadPromises);

      setCards(prev => {
        let updatedCards = [...prev];

        uploadedResults.forEach(result => {
          const firstEmptyIndex = updatedCards.findIndex(c => !c.photoUrl && !c.localUrl);

          if (firstEmptyIndex !== -1) {
            updatedCards[firstEmptyIndex] = {
              ...updatedCards[firstEmptyIndex],
              photoUrl: result.attachmentId,
              localUrl: result.localUrl
            };
          } else {
            updatedCards.push({
              id: `card_batch_${Date.now()}_${Math.random()}`,
              photoUrl: result.attachmentId,
              localUrl: result.localUrl,
              description: ''
            });
          }
        });

        return updatedCards;
      });

    } catch (err) {
      console.error('Batch upload error:', err);
      showCustomAlert('Gagal mengunggah foto sekaligus.', 'Gagal Batch Upload');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleStartEdit = (inspection: SafetyInspection) => {
    if (!inspection.id) return;
    setEditingInspectionId(inspection.id);
    setOriginalCreatedAt(inspection.createdAt);
    
    // Populate form fields
    setAktivitas(inspection.aktivitas || '');
    setLokasi(inspection.lokasi || '');
    setPersonil(inspection.personil || '');
    setPic(inspection.pic || '');
    setAnggota(inspection.anggota || '');
    setInspectorK3(inspection.inspectorK3 || '');
    setComments(inspection.comments || '');
    setOverallStatus(inspection.overallStatus || 'Safe');

    // Populate documentation cards
    const editingCards: CardData[] = (inspection.steps || []).map((step, idx) => ({
      id: `card_edit_${idx}_${Math.random()}`,
      photoUrl: step.photoUrl || undefined,
      description: step.notes || '',
    }));
    setCards(editingCards.length > 0 ? editingCards : generateInitialCards());

    // Switch tab to form
    setActiveTab('buat-inspeksi');
  };

  const handleCancelEdit = () => {
    setEditingInspectionId(null);
    setOriginalCreatedAt(null);
    
    // Reset form fields
    setAktivitas('');
    setLokasi('');
    setPersonil('');
    setPic('');
    setAnggota('');
    setInspectorK3(userProfile.name && userProfile.name.toLowerCase() !== 'hse' ? userProfile.name : '');
    setComments('');
    setOverallStatus('Safe');
    setCards(generateInitialCards());

    // Switch tab to archive
    setActiveTab('arsip-laporan');
  };

  // Smart Camera capture result
  const handleCaptureResult = (blob: Blob, dataUrl: string) => {
    // Create a parent-owned Object URL to prevent broken image load in editor when modal closes
    const localUrl = URL.createObjectURL(blob);
    setRawImageSrc(localUrl);
    setIsEditingImage(true);
  };

  // Saved edited image markup
  const handleSaveEditedImage = async (editedBlob: Blob, editedDataUrl: string) => {
    // Revoke the temporary parent-owned Object URL to prevent memory leaks
    if (rawImageSrc) {
      URL.revokeObjectURL(rawImageSrc);
    }
    setRawImageSrc(null);
    setIsEditingImage(false);

    if (activeCardId) {
      setLoading(true);
      try {
        const fileUrl = await uploadFileToFirestore(db, editedBlob, `${Date.now()}_card_${activeCardId}.jpg`);
        setCards(prev => prev.map(c => c.id === activeCardId ? { ...c, photoUrl: fileUrl, localUrl: editedDataUrl } : c));
      } catch (err) {
        console.error('Failed to upload card image:', err);
        showCustomAlert('Gagal mengunggah foto. Silakan coba lagi.', 'Gagal');
      } finally {
        setLoading(false);
        setActiveCardId(null);
      }
    } else {
      setPhotoBlob(editedBlob);
      setWatermarkedPhotoUrl(editedDataUrl);
      
      // Save temporary coordinates mockup/metadata if needed
      setGpsCoords({
        latitude: -6.229391, // Default PAWA Headquarters context if mock
        longitude: 106.824691,
        address: '37th Floor, The East Tower, Kuningan Barat, Jakarta Selatan',
      });
    }
  };

  // Submit Incident & Hazard Report
  const handleSubmitHazard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hazardTitle || !description || !correctiveAction || !photoBlob) {
      showCustomAlert('Mohon isi data laporan lengkap dan lampirkan foto sorotan bahaya.', 'Peringatan');
      return;
    }
    setLoading(true);

    try {
      // Upload image markup to Firestore chunks
      const fileUrl = await uploadFileToFirestore(db, photoBlob, `${Date.now()}_hazard.jpg`);

      const newReport: ReportHSE = {
        title: hazardTitle,
        hseId: userProfile.uid,
        hseName: userProfile.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        location: gpsCoords || { latitude: 0, longitude: 0, address: 'Unknown' },
        category,
        description,
        correctiveAction,
        photoUrl: fileUrl,
        status: 'open',
      };

      await addDoc(collection(db, 'reports_hse'), newReport);
      
      // Reset form
      setHazardTitle('');
      setDescription('');
      setCorrectiveAction('');
      setWatermarkedPhotoUrl(null);
      setPhotoBlob(null);
      setActiveTab('arsip-laporan');
    } catch (err) {
      console.error(err);
      showCustomAlert('Gagal menyimpan laporan bahaya.', 'Gagal');
    } finally {
      setLoading(false);
    }
  };

  // Submit Safety Checklist
  const handleSubmitInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aktivitas) {
      showCustomAlert('Mohon isi aktivitas maintenance.', 'Peringatan');
      return;
    }
    setLoading(true);

    try {
      const newInspection: SafetyInspection = {
        title: `Inspeksi HSE - ${aktivitas} - ${new Date(originalCreatedAt || new Date().toISOString()).toLocaleDateString('id-ID')}`,
        hseId: userProfile.uid,
        hseName: userProfile.name,
        createdAt: originalCreatedAt || new Date().toISOString(),
        checklist: [], // Empty as it is replaced by documentation cards
        overallStatus,
        comments,
        inspectorK3: inspectorK3 || userProfile.name,
        aktivitas: aktivitas,
        lokasi: lokasi,
        personil: personil,
        pic: pic,
        anggota: anggota,
        steps: cards.map((card, idx) => ({
          stepNumber: idx + 1,
          task: `Dokumentasi ${idx + 1}`,
          status: 'completed',
          photoUrl: card.photoUrl || '',
          notes: card.description || '',
        })),
      };

      if (editingInspectionId) {
        await setDoc(doc(db, 'safety_inspections', editingInspectionId), newInspection);
      } else {
        await addDoc(collection(db, 'safety_inspections'), newInspection);
      }

      setComments('');
      setOverallStatus('Safe');
      setInspectorK3(userProfile.name && userProfile.name.toLowerCase() !== 'hse' ? userProfile.name : '');
      setAktivitas('');
      setLokasi('');
      setPersonil('');
      setPic('');
      setAnggota('');
      setCards(generateInitialCards());
      setEditingInspectionId(null);
      setOriginalCreatedAt(null);
      
      await fetchArchives();
      setActiveTab('arsip-laporan');
    } catch (err) {
      console.error(err);
      showCustomAlert('Gagal menyimpan inspeksi.', 'Gagal');
    } finally {
      setLoading(false);
    }
  };

  // Export Hazard Finding to A4 PDF Layout
  const exportHsePDF = async (finding: ReportHSE) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Banner header matching Woodmart dark-gold palette
    doc.setFillColor(28, 28, 28);
    doc.rect(0, 0, 210, 32, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('PT. PAWA INDONESIA ENGINEERING', 15, 12);
    
    doc.setFillColor(130, 130, 0); // HSE Brand Accent color
    doc.rect(15, 17, 30, 4.5, 'F');
    doc.setFontSize(8);
    doc.setFont('Helvetica', 'bold');
    doc.text('K3 / HSE SYSTEM', 18, 20.5);

    doc.setTextColor(220, 220, 220);
    doc.setFont('Helvetica', 'normal');
    doc.text('Laporan Temuan Bahaya & Insiden Lingkungan Kerja', 15, 27);

    // Metadata details
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont('Helvetica', 'bold');
    doc.text(finding.title, 15, 45);

    doc.setFontSize(9);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Kategori: ${finding.category}`, 15, 52);
    doc.text(`Pelapor HSE: ${finding.hseName}`, 15, 57);
    doc.text(`Tanggal Temuan: ${new Date(finding.createdAt).toLocaleString('id-ID')}`, 15, 62);
    doc.text(`Status: ${finding.status.toUpperCase()}`, 15, 67);

    // Finding description
    let y = 78;
    doc.setFont('Helvetica', 'bold');
    doc.text('Deskripsi Bahaya K3:', 15, y);
    doc.setFont('Helvetica', 'normal');
    doc.text(finding.description, 15, y + 5, { maxWidth: 180 });

    y += 20;
    doc.setFont('Helvetica', 'bold');
    doc.text('Tindakan Korektif Darurat:', 15, y);
    doc.setFont('Helvetica', 'normal');
    doc.text(finding.correctiveAction, 15, y + 5, { maxWidth: 180 });

    y += 20;
    doc.setFont('Helvetica', 'bold');
    doc.text('Lokasi GPS:', 15, y);
    doc.setFont('Helvetica', 'normal');
    doc.text(finding.location.address || `${finding.location.latitude}, ${finding.location.longitude}`, 15, y + 5, { maxWidth: 180 });

    // Embed highlighted photo
    if (finding.photoUrl) {
      try {
        const isHttp = finding.photoUrl.startsWith('http://') || finding.photoUrl.startsWith('https://');
        const url = isHttp ? finding.photoUrl : (await downloadFileFromFirestore(db, finding.photoUrl)).dataUrl;
        doc.addPage();
        doc.setFont('Helvetica', 'bold');
        doc.text('Lampiran Foto Sorotan Bahaya (Annotated Image):', 15, 20);
        doc.addImage(url, 'JPEG', 15, 25, 120, 90);
        if (!isHttp) {
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error('Error embedding image in PDF', err);
      }
    }

    doc.save(`PT_PAWA_HSE_Report_${finding.id || 'export'}.pdf`);
  };

  const getBase64ImageFromUrl = async (url: string): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
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

  const generateInspectionPDFDocument = async (inspection: SafetyInspection): Promise<jsPDF> => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    
    const margin = 10;
    const contentW = pageWidth - (margin * 2);

    const logoUrl = '/logo-pawa.png';
    const jointLogoUrl = '/logo-joint-operation.png';
    let logoBase64: string | null = null;
    let jointLogoBase64: string | null = null;

    try {
      logoBase64 = await getBase64ImageFromUrl(logoUrl);
    } catch (e) {
      console.error('Failed to load logo in PDF:', e);
    }

    try {
      jointLogoBase64 = await getBase64ImageFromUrl(jointLogoUrl);
    } catch (e) {
      console.error('Failed to load joint operation logo in PDF:', e);
    }

    const drawLogoTextFallback = () => {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(130, 130, 0);
      doc.text('PT. PAWA', margin, 18);
      doc.text('ENGINEER', margin - 1, 23);
    };

    const drawPageHeader = () => {
      doc.setFillColor(130, 130, 0);
      doc.rect(0, 0, pageWidth, 3, 'F');

      if (logoBase64) {
        try {
          doc.addImage(logoBase64, 'PNG', margin, 8, 16, 16);
        } catch (e) {
          drawLogoTextFallback();
        }
      } else {
        drawLogoTextFallback();
      }

      if (jointLogoBase64) {
        try {
          doc.addImage(jointLogoBase64, 'PNG', pageWidth - margin - 40, 8, 40, 20);
        } catch (e) {
          console.error('Failed to add joint logo:', e);
        }
      }

      doc.setTextColor(130, 130, 0);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('LAPORAN DOKUMENTASI INSPECTION HSE', pageWidth / 2, 14, { align: 'center' });

      doc.setTextColor(100, 100, 100);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Safety, Health & Equipment Documentation System', pageWidth / 2, 18, { align: 'center' });

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(130, 130, 0);
      const inspectionDate = new Date(inspection.createdAt).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      doc.text(`Tanggal: ${inspectionDate}`, pageWidth / 2, 23, { align: 'center' });

      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margin, 28, pageWidth - margin, 28);
    };

    // PAGE 1
    drawPageHeader();

    const metaY = 32;
    const metaH = 26;
    doc.setFillColor(245, 247, 250);
    doc.rect(margin, metaY, contentW, metaH, 'F');
    
    doc.setDrawColor(220, 225, 230);
    doc.setLineWidth(0.3);
    doc.rect(margin, metaY, contentW, metaH, 'S');

    const col1X = margin + 5;
    const col2X = pageWidth / 2 + 5;
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);

    doc.text('Inspector HSE', col1X, metaY + 6);
    doc.text('Aktivitas', col1X, metaY + 14);
    doc.text('Lokasi', col1X, metaY + 22);

    doc.text(':', col1X + 24, metaY + 6);
    doc.text(':', col1X + 24, metaY + 14);
    doc.text(':', col1X + 24, metaY + 22);

    doc.text('Personil', col2X, metaY + 6);
    doc.text('PIC', col2X, metaY + 14);
    doc.text('Anggota', col2X, metaY + 22);

    doc.text(':', col2X + 20, metaY + 6);
    doc.text(':', col2X + 20, metaY + 14);
    doc.text(':', col2X + 20, metaY + 22);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    const wrapText = (text: string, maxWidth: number) => {
      return doc.splitTextToSize(text || '-', maxWidth);
    };

    doc.text(wrapText(inspection.inspectorK3 || inspection.hseName, 55), col1X + 26, metaY + 6);
    doc.text(wrapText(inspection.aktivitas || '-', 55), col1X + 26, metaY + 14);
    doc.text(wrapText(inspection.lokasi || '-', 55), col1X + 26, metaY + 22);

    doc.text(wrapText(inspection.personil || '-', 60), col2X + 22, metaY + 6);
    doc.text(wrapText(inspection.pic || '-', 60), col2X + 22, metaY + 14);
    doc.text(wrapText(inspection.anggota || '-', 60), col2X + 22, metaY + 22);

    const steps = inspection.steps || [];

    // 1. Gather all unique photo URLs to download
    const photoUrlsToDownload: string[] = [];
    steps.forEach(step => {
      if (step.photoUrl && !photoUrlsToDownload.includes(step.photoUrl)) {
        photoUrlsToDownload.push(step.photoUrl);
      }
    });

    const downloadedImagesMap: Record<string, string> = {};
    
    // Download all step photos concurrently in parallel
    await Promise.all(
      photoUrlsToDownload.map(async (url) => {
        try {
          const isHttp = url.startsWith('http://') || url.startsWith('https://');
          if (isHttp) {
            downloadedImagesMap[url] = await getBase64ImageFromUrl(url);
          } else {
            const res = await downloadFileFromFirestore(db, url);
            downloadedImagesMap[url] = res.dataUrl;
          }
        } catch (err) {
          console.error(`Failed to download image ${url}:`, err);
        }
      })
    );

    // Let's draw the grid cards in 3 columns.
    let px = margin;
    const cardW = 58;
    const cardH = 76; // taller card to fit larger text and images nicely
    const gap = 8;
    
    let currentPage = 1;
    let currentY = 62; // start drawing cards below the metadata block (which ends at Y=58)

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      // Check if we need to move to the next page
      if (currentY + cardH > pageHeight - 15) {
        doc.addPage();
        currentPage++;
        drawPageHeader();
        currentY = 32; // on subsequent pages, we start right below the header (which ends at Y=28)
        px = margin;
      }
      
      // Draw card container box in PT PAWA brand colors (Olive Gold)
      doc.setDrawColor(130, 130, 0); // Olive Gold border
      doc.setLineWidth(0.3);
      doc.setFillColor(255, 255, 255);
      doc.rect(px, currentY, cardW, cardH, 'F');
      doc.rect(px, currentY, cardW, cardH, 'S');
      
      // Draw image (centered, with 3mm margin)
      if (step.photoUrl && downloadedImagesMap[step.photoUrl]) {
        try {
          const dataUrl = downloadedImagesMap[step.photoUrl];
          doc.addImage(dataUrl, 'JPEG', px + 3, currentY + 3, cardW - 6, cardH - 17);
        } catch (err) {
          console.error('Error rendering image in PDF:', err);
          doc.setFillColor(240, 240, 240);
          doc.rect(px + 3, currentY + 3, cardW - 6, cardH - 17, 'F');
          doc.setTextColor(200, 50, 50);
          doc.setFontSize(8);
          doc.text('[Foto Gagal Dimuat]', px + cardW/2 - 13, currentY + (cardH - 17)/2 + 1);
        }
      } else {
        // Draw placeholder box
        doc.setFillColor(245, 245, 245);
        doc.rect(px + 3, currentY + 3, cardW - 6, cardH - 17, 'F');
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(8);
        doc.setFont('Helvetica', 'normal');
        doc.text('TANPA FOTO', px + cardW/2 - 9, currentY + (cardH - 18)/2 + 1);
      }
      
      // Description details area below the image
      const descY = currentY + cardH - 11;
      
      // Documentation Title
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(130, 130, 0);
      doc.text(`DOKUMENTASI ${i + 1}`, px + 4, descY);
      
      // Description text
      doc.setTextColor(50, 50, 50);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7.5);
      const descText = step.notes || 'Tidak ada deskripsi.';
      const wrappedDesc = doc.splitTextToSize(descText, cardW - 8);
      doc.text(wrappedDesc, px + 4, descY + 3.5); // line height adjust
      
      // Move to next column
      px += cardW + gap;
      if (px + cardW > pageWidth - margin + 1) {
        // Wrap to next row
        px = margin;
        currentY += cardH + gap;
      }
    }
    
    // Add Y space if current column is not the first one
    if (px !== margin) {
      currentY += cardH + 8;
    } else {
      currentY += 8;
    }

    const spaceNeeded = 65;
    if (pageHeight - currentY - 15 < spaceNeeded) {
      doc.addPage();
      currentPage++;
      drawPageHeader();
      currentY = 32;
    } else {
      currentY += 8;
    }

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(130, 130, 0);
    doc.text('KOMENTAR / REKOMENDASI PERBAIKAN:', margin, currentY);

    currentY += 4;
    doc.setFillColor(253, 253, 250);
    doc.setDrawColor(230, 230, 220);
    
    const commentsText = inspection.comments || 'Tidak ada komentar tambahan.';
    const commentsLines = doc.splitTextToSize(commentsText, contentW - 8);
    const commentsH = Math.max(12, commentsLines.length * 4 + 4);
    
    doc.rect(margin, currentY, contentW, commentsH, 'F');
    doc.rect(margin, currentY, contentW, commentsH, 'S');

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    doc.text(commentsLines, margin + 4, currentY + 5);

    currentY += commentsH + 8;
    const sigW = 60;
    const sigX1 = margin + 10;
    const sigX2 = pageWidth - margin - sigW - 10;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    
    doc.text('Dibuat Oleh,', sigX1 + sigW/2, currentY, { align: 'center' });
    doc.text('Inspector HSE', sigX1 + sigW/2, currentY + 4, { align: 'center' });
    
    doc.setDrawColor(150, 150, 150);
    doc.line(sigX1, currentY + 20, sigX1 + sigW, currentY + 20);
    
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(inspection.inspectorK3 || inspection.hseName, sigX1 + sigW/2, currentY + 24, { align: 'center' });

    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text('Disetujui Oleh,', sigX2 + sigW/2, currentY, { align: 'center' });
    doc.text('PIC Lapangan', sigX2 + sigW/2, currentY + 4, { align: 'center' });
    
    doc.line(sigX2, currentY + 20, sigX2 + sigW, currentY + 20);
    
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(inspection.pic || 'PIC Lapangan', sigX2 + sigW/2, currentY + 24, { align: 'center' });

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.2);
      doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
      
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(7.5);
      doc.setFont('Helvetica', 'normal');
      doc.text('PT PAWA INDONESIA ENGINEER — Laporan Dokumentasi K3', margin, pageHeight - 6);
      doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin - 22, pageHeight - 6);
    }

    // Clean up Object URLs to prevent memory leak
    Object.values(downloadedImagesMap).forEach(url => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });

    return doc;
  };

  const exportInspectionPDF = async (inspection: SafetyInspection) => {
    setLoading(true);
    try {
      const docPdf = await generateInspectionPDFDocument(inspection);
      const cleanTitle = inspection.title.trim().replace(/\s+/g, '_');
      docPdf.save(`PT_PAWA_HSE_Inspection_${cleanTitle}.pdf`);
    } catch (err) {
      console.error('Failed to generate safety inspection PDF:', err);
      showCustomAlert('Gagal membuat laporan PDF inspeksi.', 'Gagal Export');
    } finally {
      setLoading(false);
    }
  };

  const handleClosePreview = () => {
    setIsPreviewModalOpen(false);
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl(null);
    }
  };

  const handleOpenPreview = async () => {
    setLoading(true);
    try {
      const tempInspection: SafetyInspection = {
        title: `Inspeksi HSE - ${aktivitas || 'DRAFT'} - ${new Date(originalCreatedAt || new Date().toISOString()).toLocaleDateString('id-ID')}`,
        hseId: userProfile.uid,
        hseName: userProfile.name,
        createdAt: originalCreatedAt || new Date().toISOString(),
        checklist: [],
        overallStatus,
        comments,
        inspectorK3: inspectorK3 || userProfile.name,
        aktivitas: aktivitas || 'Aktivitas Maintenance',
        lokasi: lokasi || 'Lokasi Kerja',
        personil: personil || '0 org',
        pic: pic || 'PIC Lapangan',
        anggota: anggota || 'Anggota',
        steps: cards.map((card, idx) => ({
          stepNumber: idx + 1,
          task: `Dokumentasi ${idx + 1}`,
          status: 'completed',
          photoUrl: card.photoUrl || '',
          notes: card.description || '',
        })),
      };

      const docPdf = await generateInspectionPDFDocument(tempInspection);
      const pdfBlob = docPdf.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      
      if (previewPdfUrl) {
        URL.revokeObjectURL(previewPdfUrl);
      }

      setPreviewPdfUrl(url);
      setPreviewInspection(tempInspection);
      setIsPreviewModalOpen(true);
    } catch (err) {
      console.error('PDF preview generation failed:', err);
      showCustomAlert('Gagal membuat preview laporan PDF.', 'Pratinjau Gagal');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndExportPDF = async () => {
    if (!aktivitas) {
      showCustomAlert('Mohon isi aktivitas maintenance.', 'Peringatan');
      return;
    }
    setLoading(true);
    try {
      const newInspection: SafetyInspection = {
        title: `Inspeksi HSE - ${aktivitas} - ${new Date(originalCreatedAt || new Date().toISOString()).toLocaleDateString('id-ID')}`,
        hseId: userProfile.uid,
        hseName: userProfile.name,
        createdAt: originalCreatedAt || new Date().toISOString(),
        checklist: [],
        overallStatus,
        comments,
        inspectorK3: inspectorK3 || userProfile.name,
        aktivitas: aktivitas,
        lokasi: lokasi,
        personil: personil,
        pic: pic,
        anggota: anggota,
        steps: cards.map((card, idx) => ({
          stepNumber: idx + 1,
          task: `Dokumentasi ${idx + 1}`,
          status: 'completed',
          photoUrl: card.photoUrl || '',
          notes: card.description || '',
        })),
      };

      if (editingInspectionId) {
        await setDoc(doc(db, 'safety_inspections', editingInspectionId), newInspection);
      } else {
        await addDoc(collection(db, 'safety_inspections'), newInspection);
      }
      
      // Generate and download PDF
      const docPdf = await generateInspectionPDFDocument(newInspection);
      const cleanTitle = newInspection.title.trim().replace(/\s+/g, '_');
      docPdf.save(`PT_PAWA_HSE_Inspection_${cleanTitle}.pdf`);

      // Reset form
      setComments('');
      setOverallStatus('Safe');
      setInspectorK3(userProfile.name && userProfile.name.toLowerCase() !== 'hse' ? userProfile.name : '');
      setAktivitas('');
      setLokasi('');
      setPersonil('');
      setPic('');
      setAnggota('');
      setCards(generateInitialCards());
      setEditingInspectionId(null);
      setOriginalCreatedAt(null);
      
      await fetchArchives();
      setActiveTab('arsip-laporan');
    } catch (err) {
      console.error('Save and export failed:', err);
      showCustomAlert('Gagal menyimpan dan mengekspor laporan.', 'Gagal');
    } finally {
      setLoading(false);
    }
  };

  // Mass Export Findings to Excel (.xlsx)
  const handleMassExcelExport = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Temuan Bahaya K3');

    worksheet.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Temuan Bahaya', key: 'title', width: 25 },
      { header: 'Kategori', key: 'category', width: 15 },
      { header: 'Tanggal', key: 'date', width: 18 },
      { header: 'Alamat Lokasi', key: 'address', width: 45 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    // Style headers matching Olive green theme
    worksheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '828200' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    });

    // Filtering logic based on dropdown choices
    const filtered = hazards.filter(h => {
      const yearMatches = searchYear === 'All' || h.createdAt.startsWith(searchYear);
      const monthMatches = searchMonth === 'All' || h.createdAt.slice(5, 7) === searchMonth;
      return yearMatches && monthMatches;
    });

    filtered.forEach((h, idx) => {
      worksheet.addRow({
        no: idx + 1,
        title: h.title,
        category: h.category,
        date: new Date(h.createdAt).toLocaleDateString('id-ID'),
        address: h.location.address || 'Unknown',
        status: h.status,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PT_PAWA_HSE_Findings_${Date.now()}.xlsx`;
    a.click();
  };

  const filteredHazards = hazards.filter((h) => {
    const yearMatches = searchYear === 'All' || h.createdAt.startsWith(searchYear);
    const monthMatches = searchMonth === 'All' || h.createdAt.slice(5, 7) === searchMonth;
    return yearMatches && monthMatches;
  });

  const filteredInspections = inspections.filter((ins) => {
    const yearMatches = searchYear === 'All' || ins.createdAt.startsWith(searchYear);
    const monthMatches = searchMonth === 'All' || ins.createdAt.slice(5, 7) === searchMonth;
    return yearMatches && monthMatches;
  });

  return (
    <div className="min-h-screen flex flex-col bg-[#080711] text-slate-100 font-sans animate-fade-in">
      {/* Top Header Bar */}
      <header className="bg-slate-950/40 border-b border-slate-900 px-4 py-3 sm:px-6 sm:py-4 flex flex-row justify-between items-center gap-4 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2 sm:gap-3">
          <img
            src="/logo-pawa.png"
            alt="PT PAWA Logo"
            className="w-8 h-8 sm:w-10 sm:h-10 object-contain drop-shadow-[0_2px_8px_rgba(130,130,0,0.25)]"
          />
          <div>
            <h1 className="text-xs sm:text-md font-bold tracking-tight text-white flex items-center gap-1 sm:gap-1.5">
              PT PAWA INDONESIA
              <span className="text-[9px] sm:text-xs bg-[#828200] text-white font-mono px-1.5 py-0.5 rounded">HSE & K3</span>
            </h1>
            <p className="text-[8px] sm:text-[10px] text-slate-400 font-mono uppercase tracking-widest">Kesehatan, Keselamatan & Lingkungan</p>
          </div>
        </div>

        {/* Logged in User Profile */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">LOGGED AS</p>
            <p className="text-xs font-semibold text-white">{userProfile.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 sm:p-2.5 bg-slate-900 hover:bg-red-955/60 hover:text-red-400 text-slate-400 rounded-xl border border-slate-800/80 transition duration-200 cursor-pointer"
            title="Keluar"
          >
            <LogOut size={14} className="sm:w-4 sm:h-4" />
          </button>
        </div>
      </header>

      {/* Horizontal Tabs bar below header matching style */}
      <div className="bg-slate-950/40 border-b border-slate-900 px-4 py-2.5 sm:px-6 sm:py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Buat Laporan Tab */}
          <button
            type="button"
            onClick={() => setActiveTab('buat-inspeksi')}
            className={`px-3 py-1.5 sm:px-5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-bold transition flex items-center gap-1.5 sm:gap-2 cursor-pointer border ${
              activeTab === 'buat-inspeksi'
                ? 'bg-[#828200] border-[#999900] text-white shadow-lg shadow-[#828200]/20'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <FileText size={12} className="sm:w-3.5 sm:h-3.5" />
            Buat Inspeksi
          </button>

          {/* Arsip Laporan Tab */}
          <button
            type="button"
            onClick={() => setActiveTab('arsip-laporan')}
            className={`px-3 py-1.5 sm:px-5 sm:py-2 rounded-xl text-[10px] sm:text-xs font-bold transition flex items-center gap-1.5 sm:gap-2 cursor-pointer border ${
              activeTab === 'arsip-laporan'
                ? 'bg-[#828200] border-[#999900] text-white shadow-lg shadow-[#828200]/20'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <FolderOpen size={12} className="sm:w-3.5 sm:h-3.5" />
            Arsip Laporan
          </button>
        </div>

        {/* Global mode indicator */}
        <div className="hidden sm:flex items-center gap-2 text-[10px] tracking-wider text-[#828200] font-bold uppercase">
          <span className="w-2 h-2 rounded-full bg-[#828200] animate-pulse"></span>
          MODE: {activeTab === 'buat-inspeksi' ? (editingInspectionId ? 'EDIT INSPECTION' : 'INPUT INSPECTION') : 'ARSIP LAPORAN'}
        </div>
      </div>

      {/* Main Work Area - upgraded to max-w-7xl matching Engineer Dashboard */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto overflow-y-auto">
        {loading && (
          <div className="fixed inset-0 bg-[#070b13]/60 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-slate-800 border-t-[#828200] rounded-full animate-spin"></div>
              <p className="text-xs font-mono tracking-widest text-slate-400">MEMPROSES DATA...</p>
            </div>
          </div>
        )}

        {activeTab === 'buat-inspeksi' && (
          <div className="space-y-6">
            {isEditingImage && rawImageSrc ? (
              <div className="flex justify-center py-4">
                <ImageEditor
                  imageSrc={rawImageSrc}
                  onSave={handleSaveEditedImage}
                  onCancel={() => {
                    if (rawImageSrc) {
                      URL.revokeObjectURL(rawImageSrc);
                    }
                    setRawImageSrc(null);
                    setIsEditingImage(false);
                    setActiveCardId(null);
                  }}
                />
              </div>
            ) : (
              <form onSubmit={handleSubmitInspection} className="space-y-6 animate-in fade-in duration-200">
                {/* Mode Indicator */}
                <div className="flex sm:hidden items-center gap-2 text-[10px] tracking-wider text-[#828200] font-bold uppercase mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#828200] animate-pulse"></span>
                  MODE: {editingInspectionId ? 'EDIT INSPECTION' : 'INPUT INSPECTION'}
                </div>

                {/* Informasi INSPECTION Card - upgraded borders and padding */}
                <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/30 space-y-4 shadow-xl">
                  <div className="flex items-center gap-2.5 border-b border-slate-800/50 pb-4 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-[#828200]/25 text-[#999900] flex items-center justify-center">
                      <FileText size={15} />
                    </div>
                    <h2 className="text-sm font-extrabold text-white uppercase tracking-wider">Informasi INSPECTION</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Inspector HSE */}
                    <div>
                      <label htmlFor="inspectorK3" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <User size={12} className="text-[#828200]" />
                        INSPECTOR HSE
                      </label>
                      <input
                        id="inspectorK3"
                        type="text"
                        required
                        value={inspectorK3}
                        onChange={(e) => setInspectorK3(e.target.value)}
                        placeholder="Nama Inspector HSE"
                        className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
                      />
                    </div>

                    {/* Aktivitas */}
                    <div>
                      <label htmlFor="aktivitas" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <FileText size={12} className="text-[#828200]" />
                        AKTIVITAS (NAMA MAINTENANCE)
                      </label>
                      <input
                        id="aktivitas"
                        type="text"
                        required
                        value={aktivitas}
                        onChange={(e) => setAktivitas(e.target.value)}
                        placeholder="Contoh: P.M Maintenance LIFT"
                        className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
                      />
                    </div>

                    {/* Lokasi */}
                    <div>
                      <label htmlFor="lokasi" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <MapPin size={12} className="text-[#828200]" />
                        LOKASI
                      </label>
                      <input
                        id="lokasi"
                        type="text"
                        required
                        value={lokasi}
                        onChange={(e) => setLokasi(e.target.value)}
                        placeholder="Lokasi Pekerjaan"
                        className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
                      />
                    </div>

                    {/* Personil */}
                    <div>
                      <label htmlFor="personil" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Users size={12} className="text-[#828200]" />
                        PERSONIL
                      </label>
                      <input
                        id="personil"
                        type="text"
                        required
                        value={personil}
                        onChange={(e) => setPersonil(e.target.value)}
                        placeholder="Contoh: 4 org"
                        className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
                      />
                    </div>

                    {/* PIC */}
                    <div>
                      <label htmlFor="pic" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <UserCheck size={12} className="text-[#828200]" />
                        PIC
                      </label>
                      <input
                        id="pic"
                        type="text"
                        required
                        value={pic}
                        onChange={(e) => setPic(e.target.value)}
                        placeholder="Nama PIC"
                        className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
                      />
                    </div>

                    {/* Anggota */}
                    <div>
                      <label htmlFor="anggota" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Settings size={12} className="text-[#828200]" />
                        ANGGOTA
                      </label>
                      <input
                        id="anggota"
                        type="text"
                        required
                        value={anggota}
                        onChange={(e) => setAnggota(e.target.value)}
                        placeholder="Nama anggota (pisahkan koma)"
                        className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200"
                      />
                    </div>
                  </div>
                </div>

                {/* Documentation Section Header & Controls */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-8 mb-4">
                  <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-[#828200] rounded-sm"></span>
                    DOKUMENTASI K3 INSPECTION ({cards.length})
                  </h3>
                  
                  <div className="flex flex-wrap gap-2.5 w-full sm:w-auto">
                    {/* Add Manual Card Button */}
                    <button
                      type="button"
                      onClick={handleAddCard}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer"
                    >
                      <Plus size={14} className="text-[#828200]" />
                      Tambah Card
                    </button>

                    {/* Batch Upload Images Button */}
                    <label className="px-4 py-2 bg-[#828200]/15 hover:bg-[#828200]/25 text-[#999900] border border-[#828200]/40 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer">
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        onChange={handleBatchPhotoUpload}
                      />
                      <UploadCloud size={14} />
                      Upload Foto Banyak Sekaligus
                    </label>
                  </div>
                </div>

                {/* Documentation Cards Grid - dynamic list */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {cards.map((card, idx) => (
                    <div key={card.id} className="glass-card overflow-hidden shadow-lg flex flex-col">
                      <div className="px-3.5 py-2.5 bg-slate-900/40 border-b border-white/5 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 tracking-wider">DOC #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteCard(card.id)}
                          className="text-slate-500 hover:text-red-400 p-1 rounded transition cursor-pointer"
                          title="Hapus Card"
                        >
                          <X size={12} />
                        </button>
                      </div>

                      {/* Image Preview / Trigger Area - upgraded aspect ratio and hover triggers */}
                      <div className="w-full aspect-[4/3] bg-slate-950/50 flex items-center justify-center relative overflow-hidden group">
                        {card.localUrl || card.photoUrl ? (
                          <div className="w-full h-full relative">
                            {card.localUrl ? (
                              <img
                                src={card.localUrl}
                                alt={`Dokumentasi ${idx + 1}`}
                                className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <FirestoreImage
                                db={db}
                                attachmentId={card.photoUrl!}
                                alt={`Dokumentasi ${idx + 1}`}
                                className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                              />
                            )}
                            {/* Centered Actions Overlay (always visible on hover) */}
                            <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-3 transition-opacity duration-200">
                              <button
                                type="button"
                                title="Ambil Ulang Foto"
                                onClick={() => {
                                  setActiveCardId(card.id);
                                  setIsCameraOpen(true);
                                }}
                                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 text-white flex items-center justify-center hover:bg-slate-850 hover:text-[#999900] transition-all active:scale-90 cursor-pointer shadow-lg"
                              >
                                <Camera size={14} />
                              </button>
                              <button
                                type="button"
                                title="Edit & Gambar Sorotan K3"
                                onClick={() => {
                                  if (card.localUrl) {
                                    setRawImageSrc(card.localUrl);
                                    setActiveCardId(card.id);
                                    setIsEditingImage(true);
                                  } else {
                                    showCustomAlert('Silakan ambil atau unggah foto terlebih dahulu.', 'Perhatian');
                                  }
                                }}
                                className="w-9 h-9 rounded-xl bg-[#828200] border border-[#999900]/25 text-white flex items-center justify-center hover:bg-[#999900] transition-all active:scale-90 cursor-pointer shadow-lg"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                type="button"
                                title="Hapus Foto"
                                onClick={() => handleRemovePhoto(card.id)}
                                className="w-9 h-9 rounded-xl bg-red-600 border border-red-500/60 text-white flex items-center justify-center hover:bg-red-550 transition-all active:scale-90 cursor-pointer shadow-lg"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-full grid grid-cols-2 text-center text-slate-400 text-[8px] font-bold bg-slate-950/30">
                            {/* Camera Trigger */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveCardId(card.id);
                                setIsCameraOpen(true);
                              }}
                              className="border-r border-white/5 hover:bg-slate-900/40 hover:text-[#999900] transition flex flex-col items-center justify-center gap-1.5 cursor-pointer py-2"
                            >
                              <Camera size={18} className="text-slate-500" />
                              <span>AMBIL FOTO</span>
                            </button>

                            {/* Gallery Upload Trigger */}
                            <label
                              className="hover:bg-slate-900/40 hover:text-[#999900] transition flex flex-col items-center justify-center gap-1.5 cursor-pointer py-2"
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

                      {/* Description Area - styled like Engineer */}
                      <div className="p-3 bg-slate-950/20 border-t border-white/5">
                        <textarea
                          value={card.description}
                          onChange={(e) => {
                            const updated = cards.map(c => c.id === card.id ? { ...c, description: e.target.value } : c);
                            setCards(updated);
                          }}
                          placeholder="Tuliskan keterangan detail K3..."
                          rows={2}
                          className="w-full bg-transparent border-none resize-none text-xs text-slate-300 placeholder-slate-700 focus:outline-none focus:ring-0 p-0"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Additional Comment Card */}
                <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 bg-slate-900/30 mt-6 shadow-xl">
                  <div>
                    <label htmlFor="comments" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">KOMENTAR / REKOMENDASI TAMBAHAN</label>
                    <textarea
                      id="comments"
                      rows={3}
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      placeholder="Tuliskan rekomendasi perbaikan atau laporan detail mitigasi..."
                      className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#828200] focus:ring-1 focus:ring-[#828200] transition duration-200 resize-none"
                    />
                  </div>
                </div>

                {/* Bottom Actions Control Bar - styled like Engineer */}
                <div className="glass-panel p-5 rounded-2xl border border-slate-900 bg-slate-900/20 flex flex-col sm:flex-row justify-center items-center gap-4 mt-6">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full sm:w-auto px-6 py-3 bg-[#828200] hover:bg-[#999900] text-white text-xs font-extrabold rounded-xl border border-[#999900] shadow-lg shadow-[#828200]/15 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
                  >
                    <CheckCircle2 size={14} />
                    {editingInspectionId ? 'UPDATE LAPORAN INSPEKSI!' : 'SIMPAN LAPORAN INSPEKSI!'}
                  </button>

                  {editingInspectionId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="w-full sm:w-auto px-6 py-3 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-extrabold rounded-xl border border-slate-850 flex items-center justify-center gap-2 cursor-pointer transition"
                    >
                      <X size={14} />
                      BATAL EDIT
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleOpenPreview}
                    className="w-full sm:w-auto px-6 py-3 bg-transparent hover:bg-[#828200]/10 text-[#999900] text-xs font-extrabold rounded-xl border border-[#828200]/40 flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <Eye size={14} />
                    PREVIEW REPORT
                  </button>

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
            )}
          </div>
        )}

        {activeTab === 'arsip-laporan' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/30">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-md font-bold text-white">Arsip Inspeksi Keselamatan K3</h2>
                  <p className="text-[11px] text-slate-400 font-medium">Histori data laporan dokumentasi inspeksi keselamatan K3 PT PAWA. Anda dapat mem-filter tanggal dan men-download laporan PDF.</p>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    id="searchMonth"
                    title="Filter Bulan"
                    value={searchMonth}
                    onChange={(e) => setSearchMonth(e.target.value)}
                    className="px-3 py-1.5 bg-[#060512]/60 border border-slate-850 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-[#828200]"
                  >
                    <option value="All">Semua Bulan</option>
                    <option value="01">Januari</option>
                    <option value="02">Februari</option>
                    <option value="03">Maret</option>
                    <option value="04">April</option>
                    <option value="05">Mei</option>
                    <option value="06">Juni</option>
                    <option value="07">Juli</option>
                    <option value="08">Agustus</option>
                    <option value="09">September</option>
                    <option value="10">Oktober</option>
                    <option value="11">November</option>
                    <option value="12">Desember</option>
                  </select>
                </div>
              </div>

              {/* Single Column List covering full width */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-850/60 pb-2.5">
                  <span className="w-1.5 h-3 bg-[#828200] rounded-sm"></span>
                  Laporan Inspeksi Keselamatan K3 ({filteredInspections.length})
                </h3>
                
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                  {filteredInspections.length === 0 ? (
                    <p className="text-slate-500 text-xs py-4 text-center">Tidak ada laporan inspeksi keselamatan.</p>
                  ) : (
                    filteredInspections.map((item) => {
                      return (
                        <div key={item.id} className="bg-[#060512]/40 border border-slate-850 p-4 rounded-xl flex justify-between items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] bg-slate-900/50 text-[#828200] px-1.5 py-0.5 rounded font-mono border border-slate-850">
                                Dokumentasi
                              </span>
                              <span className="text-[9px] text-slate-500 font-mono">
                                {new Date(item.createdAt).toLocaleDateString('id-ID')}
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-white mt-1.5 truncate">{item.title}</h4>
                            <p className="text-[9px] text-slate-500 font-mono mt-0.5">Inspector K3: {item.inspectorK3 || item.hseName}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              className="px-3 py-2 bg-slate-900 hover:bg-slate-850 hover:text-white text-slate-300 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer border border-slate-800 font-bold"
                            >
                              <Edit size={13} className="text-[#828200]" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => exportInspectionPDF(item)}
                              className="px-3 py-2 bg-[#828200] hover:bg-[#999900] text-white rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow shadow-[#828200]/20 font-bold"
                            >
                              <FileDown size={13} /> PDF
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ----------------- PREVIEW MODAL ----------------- */}
      {isPreviewModalOpen && previewInspection && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#070b13] border border-slate-800 rounded-2xl w-full max-w-4xl h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-900 flex justify-between items-center">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Eye size={16} className="text-[#999900]" />
                PREVIEW INSPECTION REPORT LAYOUT
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
                className="px-4 py-2 bg-[#828200] hover:bg-[#999900] text-white rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <FileDown size={12} /> Simpan & Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared Smart Camera Modal Overlay */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCaptureResult}
        brandTitle="PT PAWA INDONESIA HSE"
      />

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

      {/* Footer matching Woodmart Official Site */}
      <footer className="bg-black text-slate-500 border-t border-slate-900 py-6 text-center text-xs space-y-2">
        <p className="font-bold text-slate-400">PT. PAWA INDONESIA ENGINEERING</p>
        <p className="max-w-xl mx-auto px-4 text-[11px] leading-relaxed">
          37th Floor, The East Tower, Jalan Dr. Ide Anak Agung Kav E3.2 No.1 RT.005 RW.002, Kuningan Barat, Mampang Prapatan, Jakarta Selatan, DKI Jakarta
        </p>
        <p className="text-[10px]">
          Copyright © 2022 <span className="text-slate-400 font-semibold">PT. Pawa Indonesia Engineering</span> - All Rights Reserved
        </p>
      </footer>
    </div>
  );
};

export default HseDashboard;
