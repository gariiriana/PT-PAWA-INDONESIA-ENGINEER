import React, { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { 
  LogOut, ShieldAlert, CheckCircle2, AlertTriangle, Camera, FileDown, 
  Settings, User, Plus, Search, Calendar, ChevronRight, CheckSquare, Eye 
} from 'lucide-react';
import { auth, db } from '../config/firebase';
import { 
  ReportHSE, SafetyInspection, SafetyCheckItem, GPSCoords,
  uploadFileToFirestore, downloadFileFromFirestore
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

export const Dashboard: React.FC<DashboardProps> = ({ userProfile, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'hazard' | 'inspection' | 'archive'>('hazard');
  const [hazards, setHazards] = useState<ReportHSE[]>([]);
  const [inspections, setInspections] = useState<SafetyInspection[]>([]);
  const [loading, setLoading] = useState(false);

  // Smart Camera integration state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [isEditingImage, setIsEditingImage] = useState(false);

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
  const [tanggalInspeksi, setTanggalInspeksi] = useState(new Date().toISOString().slice(0, 10));
  const [inspectorK3, setInspectorK3] = useState(userProfile?.name || '');
  const [aktivitas, setAktivitas] = useState('');
  const [lokasi, setLokasi] = useState('');
  const [personil, setPersonil] = useState('');
  const [pic, setPic] = useState('');
  const [anggota, setAnggota] = useState('');

  // Archive Search states
  const [searchYear, setSearchYear] = useState('2026');
  const [searchMonth, setSearchMonth] = useState('All');

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

  // Smart Camera capture result
  const handleCaptureResult = (blob: Blob, dataUrl: string) => {
    // Create a parent-owned Object URL to prevent broken image load in editor when modal closes
    const localUrl = URL.createObjectURL(blob);
    setRawImageSrc(localUrl);
    setIsEditingImage(true);
  };

  // Saved edited image markup
  const handleSaveEditedImage = (editedBlob: Blob, editedDataUrl: string) => {
    // Revoke the temporary parent-owned Object URL to prevent memory leaks
    if (rawImageSrc) {
      URL.revokeObjectURL(rawImageSrc);
    }
    setRawImageSrc(null);

    setPhotoBlob(editedBlob);
    setWatermarkedPhotoUrl(editedDataUrl);
    setIsEditingImage(false);
    
    // Save temporary coordinates mockup/metadata if needed
    setGpsCoords({
      latitude: -6.229391, // Default PAWA Headquarters context if mock
      longitude: 106.824691,
      address: '37th Floor, The East Tower, Kuningan Barat, Jakarta Selatan',
    });
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
      setActiveTab('archive');
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
    if (!inspectionTitle) {
      showCustomAlert('Mohon isi judul inspeksi keselamatan.', 'Peringatan');
      return;
    }
    setLoading(true);

    try {
      const newInspection: SafetyInspection = {
        title: inspectionTitle,
        hseId: userProfile.uid,
        hseName: userProfile.name,
        createdAt: new Date(tanggalInspeksi).toISOString(),
        checklist,
        overallStatus,
        comments,
        inspectorK3: inspectorK3 || userProfile.name,
        aktivitas: aktivitas,
        lokasi: lokasi,
        personil: personil,
        pic: pic,
        anggota: anggota,
      };

      await addDoc(collection(db, 'safety_inspections'), newInspection);
      setInspectionTitle('');
      setComments('');
      setOverallStatus('Safe');
      setInspectorK3(userProfile.name);
      setAktivitas('');
      setLokasi('');
      setPersonil('');
      setPic('');
      setAnggota('');
      setTanggalInspeksi(new Date().toISOString().slice(0, 10));
      
      // Reset checklist choices
      const resetList = checklist.map(item => ({ ...item, checked: true, notes: '' }));
      setChecklist(resetList);
      
      setActiveTab('archive');
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

  const exportInspectionPDF = async (inspection: SafetyInspection) => {
    setLoading(true);
    try {
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

      const drawPageHeader = (pageNumber: number, totalPagesPlaceholder: string) => {
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
        doc.setFontSize(13);
        doc.text('HSE INSPECTION REPORT', pageWidth / 2, 14, { align: 'center' });

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

      drawPageHeader(1, '1');

      const metaY = 32;
      const metaH = 34;
      doc.setFillColor(245, 247, 250);
      doc.rect(margin, metaY, contentW, metaH, 'F');
      
      doc.setDrawColor(220, 225, 230);
      doc.setLineWidth(0.3);
      doc.rect(margin, metaY, contentW, metaH, 'S');

      const col1X = margin + 5;
      const col2X = pageWidth / 2 + 10;
      
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);

      doc.text('Inspector K3', col1X, metaY + 6);
      doc.text('Aktivitas', col1X, metaY + 14);
      doc.text('Lokasi', col1X, metaY + 22);
      doc.text('Personil', col1X, metaY + 29);

      doc.text(':', col1X + 24, metaY + 6);
      doc.text(':', col1X + 24, metaY + 14);
      doc.text(':', col1X + 24, metaY + 22);
      doc.text(':', col1X + 24, metaY + 29);

      doc.text('PIC', col2X, metaY + 6);
      doc.text('Anggota', col2X, metaY + 14);
      doc.text('Overall Status', col2X, metaY + 22);

      doc.text(':', col2X + 24, metaY + 6);
      doc.text(':', col2X + 24, metaY + 14);
      doc.text(':', col2X + 24, metaY + 22);

      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      
      const wrapText = (text: string, maxWidth: number) => {
        return doc.splitTextToSize(text || '-', maxWidth);
      };

      doc.text(wrapText(inspection.inspectorK3 || inspection.hseName, 60), col1X + 27, metaY + 6);
      doc.text(wrapText(inspection.aktivitas || '-', 60), col1X + 27, metaY + 14);
      doc.text(wrapText(inspection.lokasi || '-', 60), col1X + 27, metaY + 22);
      doc.text(wrapText(inspection.personil || '-', 60), col1X + 27, metaY + 29);

      doc.text(wrapText(inspection.pic || '-', 60), col2X + 27, metaY + 6);
      doc.text(wrapText(inspection.anggota || '-', 60), col2X + 27, metaY + 14);
      
      const statusText = inspection.overallStatus || 'Safe';
      if (statusText === 'Safe') {
        doc.setTextColor(16, 120, 60);
      } else if (statusText === 'Attention Required') {
        doc.setTextColor(200, 120, 0);
      } else {
        doc.setTextColor(200, 30, 30);
      }
      doc.text(statusText, col2X + 27, metaY + 22);

      let currentY = metaY + metaH + 6;

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(130, 130, 0);
      doc.text('DAFTAR POIN PEMERIKSAAN K3', margin, currentY);
      
      currentY += 3.5;
      
      const colWidths = [10, 30, 95, 25, 30];
      const colLabels = ['No', 'Kategori', 'Poin Pemeriksaan', 'Status', 'Catatan'];
      
      const drawTableHeader = (yPos: number) => {
        doc.setFillColor(130, 130, 0);
        doc.rect(margin, yPos, contentW, 7, 'F');
        
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        
        let cx = margin;
        for (let idx = 0; idx < colLabels.length; idx++) {
          let alignOpt: 'left' | 'center' = (idx === 0 || idx === 3) ? 'center' : 'left';
          let xOffset = alignOpt === 'center' ? colWidths[idx] / 2 : 2.5;
          doc.text(colLabels[idx], cx + xOffset, yPos + 4.8, { align: alignOpt });
          cx += colWidths[idx];
        }
      };

      drawTableHeader(currentY);
      currentY += 7;

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      
      let itemIndex = 1;
      for (const item of inspection.checklist) {
        const questionLines = doc.splitTextToSize(item.question, colWidths[2] - 5);
        const notesLines = doc.splitTextToSize(item.notes || '-', colWidths[4] - 5);
        
        const rowHeight = Math.max(
          5, 
          questionLines.length * 4.2 + 2, 
          notesLines.length * 4.2 + 2
        );

        if (currentY + rowHeight > pageHeight - 20) {
          doc.addPage();
          drawPageHeader(doc.getNumberOfPages(), 'Total');
          currentY = 32;
          drawTableHeader(currentY);
          currentY += 7;
        }

        if (itemIndex % 2 === 0) {
          doc.setFillColor(250, 251, 253);
          doc.rect(margin, currentY, contentW, rowHeight, 'F');
        }

        doc.setDrawColor(225, 225, 225);
        doc.setLineWidth(0.15);
        
        doc.setTextColor(0, 0, 0);
        doc.setFont('Helvetica', 'normal');
        
        doc.text(itemIndex.toString(), margin + colWidths[0]/2, currentY + rowHeight/2 + 1, { align: 'center' });
        
        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(80, 80, 80);
        doc.text(item.category, margin + colWidths[0] + 2.5, currentY + 4);
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(0, 0, 0);

        doc.text(questionLines, margin + colWidths[0] + colWidths[1] + 2.5, currentY + 4);

        const statusVal = item.checked ? 'TERPENUHI' : 'TDK TERPENUHI';
        if (item.checked) {
          doc.setTextColor(16, 120, 60);
          doc.setFont('Helvetica', 'bold');
        } else {
          doc.setTextColor(200, 30, 30);
          doc.setFont('Helvetica', 'bold');
        }
        doc.text(statusVal, margin + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]/2, currentY + rowHeight/2 + 1, { align: 'center' });
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(0, 0, 0);

        doc.text(notesLines, margin + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 2.5, currentY + 4);

        doc.setDrawColor(210, 210, 210);
        doc.line(margin, currentY + rowHeight, margin + contentW, currentY + rowHeight);

        currentY += rowHeight;
        itemIndex++;
      }

      currentY += 6;
      if (currentY + 25 > pageHeight - 20) {
        doc.addPage();
        drawPageHeader(doc.getNumberOfPages(), 'Total');
        currentY = 32;
      }

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(130, 130, 0);
      doc.text('KOMENTAR / REKOMENDASI PERBAIKAN:', margin, currentY);

      currentY += 4;
      doc.setFillColor(253, 253, 250);
      doc.setDrawColor(230, 230, 220);
      
      const commentsText = inspection.comments || 'Tidak ada komentar tambahan.';
      const commentsLines = doc.splitTextToSize(commentsText, contentW - 8);
      const commentsH = Math.max(12, commentsLines.length * 4.2 + 6);
      
      doc.rect(margin, currentY, contentW, commentsH, 'F');
      doc.rect(margin, currentY, contentW, commentsH, 'S');

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(50, 50, 50);
      doc.text(commentsLines, margin + 4, currentY + 5);

      currentY += commentsH + 10;
      if (currentY + 30 > pageHeight - 15) {
        doc.addPage();
        drawPageHeader(doc.getNumberOfPages(), 'Total');
        currentY = 32;
      }

      const sigW = 60;
      const sigX1 = margin + 10;
      const sigX2 = pageWidth - margin - sigW - 10;

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);
      
      doc.text('Dibuat Oleh,', sigX1 + sigW/2, currentY, { align: 'center' });
      doc.text('Inspector K3', sigX1 + sigW/2, currentY + 4, { align: 'center' });
      
      doc.setDrawColor(150, 150, 150);
      doc.line(sigX1, currentY + 22, sigX1 + sigW, currentY + 22);
      
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(inspection.inspectorK3 || inspection.hseName, sigX1 + sigW/2, currentY + 26, { align: 'center' });

      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(80, 80, 80);
      doc.text('Disetujui Oleh,', sigX2 + sigW/2, currentY, { align: 'center' });
      doc.text('PIC Lapangan', sigX2 + sigW/2, currentY + 4, { align: 'center' });
      
      doc.line(sigX2, currentY + 22, sigX2 + sigW, currentY + 22);
      
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(inspection.pic || 'PIC Lapangan', sigX2 + sigW/2, currentY + 26, { align: 'center' });

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.2);
        doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
        
        doc.setTextColor(120, 120, 120);
        doc.setFontSize(7.5);
        doc.setFont('Helvetica', 'normal');
        doc.text('PT PAWA INDONESIA ENGINEERING — Laporan Dokumentasi K3', margin, pageHeight - 6);
        doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin - 22, pageHeight - 6);
      }

      const cleanTitle = inspection.title.trim().replace(/\s+/g, '_');
      doc.save(`PT_PAWA_HSE_Inspection_${cleanTitle}.pdf`);

    } catch (err) {
      console.error('Failed to generate safety inspection PDF:', err);
      showCustomAlert('Gagal membuat laporan PDF inspeksi.', 'Gagal Export');
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
    <div className="min-h-screen flex flex-col bg-[#080713]">
      {/* Navbar header with dark-green accents */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center shadow-lg relative">
        <div className="flex items-center gap-3">
          <img
            src="/logo-pawa.png"
            alt="Logo"
            className="w-10 h-10 drop-shadow-[0_2px_5px_rgba(16,185,129,0.3)]"
          />
          <div>
            <h1 className="text-md font-bold tracking-tight text-white flex items-center gap-1.5">
              PT PAWA INDONESIA
              <span className="text-xs bg-emerald-700 text-white font-mono px-2 py-0.5 rounded">HSE & K3</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">SAFETY INSPECTIONS & HAZARD ARCHIVES</p>
          </div>
        </div>

        {/* User profile & Signout */}
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-white">{userProfile.name}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">{userProfile.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 bg-slate-800 hover:bg-red-950/60 hover:text-red-400 text-slate-300 rounded-xl transition duration-200 cursor-pointer"
            title="Keluar"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Workspace split layout */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Navigation Sidebar */}
        <nav className="w-full lg:w-64 bg-slate-900/40 border-r border-slate-800/80 p-4 space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">MENU UTAMA HSE</p>

          <button
            onClick={() => setActiveTab('hazard')}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex items-center gap-3 cursor-pointer ${
              activeTab === 'hazard' 
                ? 'bg-[#828200] text-white shadow-lg shadow-[#828200]/10' 
                : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'
            }`}
          >
            <ShieldAlert size={18} />
            Hazard & Incident Report
          </button>

          <button
            onClick={() => setActiveTab('inspection')}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex items-center gap-3 cursor-pointer ${
              activeTab === 'inspection' 
                ? 'bg-[#828200] text-white shadow-lg shadow-[#828200]/10' 
                : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'
            }`}
          >
            <CheckSquare size={18} />
            Safety Inspection List
          </button>

          <button
            onClick={() => setActiveTab('archive')}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex items-center gap-3 cursor-pointer ${
              activeTab === 'archive' 
                ? 'bg-[#828200] text-white shadow-lg shadow-[#828200]/10' 
                : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'
            }`}
          >
            <FileDown size={18} />
            Arsip Temuan Bahaya
          </button>
        </nav>

        {/* Dynamic Panels */}
        <main className="flex-1 p-6 overflow-y-auto">
          {/* TAB 1: INCIDENT & HAZARD REPORT */}
          {activeTab === 'hazard' && (
            <div className="space-y-6">
              {isEditingImage && rawImageSrc ? (
                <ImageEditor
                  imageSrc={rawImageSrc}
                  onSave={handleSaveEditedImage}
                  onCancel={() => {
                    if (rawImageSrc) {
                      URL.revokeObjectURL(rawImageSrc);
                    }
                    setRawImageSrc(null);
                    setIsEditingImage(false);
                  }}
                />
              ) : (
                <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                  <h2 className="text-xl font-bold text-white mb-2">HSE Hazard & Incident Report Form</h2>
                  <p className="text-xs text-slate-400">Laporkan tindakan tidak aman, kondisi bahaya, atau insiden di lapangan dengan bukti foto beranotasi.</p>

                  <form onSubmit={handleSubmitHazard} className="mt-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="hazardTitle" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Nama Temuan Bahaya</label>
                        <input
                          id="hazardTitle"
                          type="text"
                          required
                          value={hazardTitle}
                          onChange={(e) => setHazardTitle(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-[#828200]"
                        />
                      </div>
                      <div>
                        <label htmlFor="category" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Kategori K3</label>
                        <select
                          id="category"
                          title="Kategori K3"
                          value={category}
                          onChange={(e) => setCategory(e.target.value as any)}
                          className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-[#828200]"
                        >
                          <option value="Unsafe Condition">Unsafe Condition (Kondisi Tidak Aman)</option>
                          <option value="Unsafe Action">Unsafe Action (Tindakan Tidak Aman)</option>
                          <option value="Incident">Incident (Kecelakaan Kerja)</option>
                          <option value="Near Miss">Near Miss (Hampir Celaka)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Deskripsi Bahaya</label>
                        <textarea
                          required
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          title="Deskripsi Bahaya"
                          rows={4}
                          className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Tindakan Korektif Langsung</label>
                        <textarea
                          required
                          value={correctiveAction}
                          onChange={(e) => setCorrectiveAction(e.target.value)}
                          title="Tindakan Korektif Langsung"
                          rows={4}
                          className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Camera Capture Attachment preview */}
                    <div className="border-t border-slate-800/80 pt-6 flex flex-col items-center justify-center min-h-[220px] border-dashed border rounded-2xl">
                      {watermarkedPhotoUrl ? (
                        <div className="text-center space-y-3">
                          <img
                            src={watermarkedPhotoUrl}
                            alt="Watermarked & Annotated"
                            className="max-h-[160px] rounded-lg border border-slate-700 object-contain"
                          />
                          <p className="text-[10px] text-emerald-400 font-mono">✓ Foto berhasil ditandai & diarsir</p>
                          <button
                            type="button"
                            onClick={() => setWatermarkedPhotoUrl(null)}
                            className="text-xs text-red-400 hover:underline"
                          >
                            Hapus Foto
                          </button>
                        </div>
                      ) : (
                        <div className="text-center space-y-2">
                          <p className="text-xs text-slate-400">Lampiran bukti visual dengan sorotan bahaya.</p>
                          <button
                            type="button"
                            onClick={() => setIsCameraOpen(true)}
                            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs flex items-center gap-2 mx-auto font-medium transition active:scale-95 cursor-pointer"
                          >
                            <Camera size={14} /> Ambil Foto Bahaya
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-3 bg-[#828200] hover:bg-[#999900] disabled:bg-slate-800 text-white font-semibold rounded-xl cursor-pointer transition shadow-lg"
                    >
                      Submit Temuan Bahaya K3
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SAFETY INSPECTION CHECKLIST */}
          {activeTab === 'inspection' && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800">
              <h2 className="text-xl font-bold text-white mb-2">Safety Inspections Checklist</h2>
              <p className="text-xs text-slate-400">Lakukan penilaian pemenuhan standar K3 harian/mingguan di lingkungan kerja PT PAWA.</p>

              <form onSubmit={handleSubmitInspection} className="mt-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="inspectionTitle" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Judul Inspeksi</label>
                    <input
                      id="inspectionTitle"
                      type="text"
                      required
                      value={inspectionTitle}
                      onChange={(e) => setInspectionTitle(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="overallStatus" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Kondisi Area Kerja</label>
                    <select
                      id="overallStatus"
                      title="Kondisi Area Kerja"
                      value={overallStatus}
                      onChange={(e) => setOverallStatus(e.target.value as any)}
                      className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none"
                    >
                      <option value="Safe">Safe (Aman & Sesuai Standard)</option>
                      <option value="Attention Required">Attention Required (Butuh Perbaikan Ringan)</option>
                      <option value="Unsafe">Unsafe (Kondisi Bahaya Kritikal)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-800/40 pt-4">
                  {/* Tanggal Inspeksi */}
                  <div>
                    <label htmlFor="tanggalInspeksi" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Calendar size={12} className="text-[#828200]" />
                      Tanggal Inspeksi
                    </label>
                    <input
                      id="tanggalInspeksi"
                      type="date"
                      required
                      value={tanggalInspeksi}
                      onChange={(e) => setTanggalInspeksi(e.target.value)}
                      title="Tanggal Inspeksi"
                      className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-[#828200]"
                    />
                  </div>

                  {/* Inspector K3 */}
                  <div>
                    <label htmlFor="inspectorK3" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Inspector K3</label>
                    <input
                      id="inspectorK3"
                      type="text"
                      required
                      value={inspectorK3}
                      onChange={(e) => setInspectorK3(e.target.value)}
                      title="Inspector K3"
                      className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-[#828200]"
                    />
                  </div>

                  {/* Aktivitas */}
                  <div>
                    <label htmlFor="aktivitas" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Aktivitas</label>
                    <input
                      id="aktivitas"
                      type="text"
                      required
                      value={aktivitas}
                      onChange={(e) => setAktivitas(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-[#828200]"
                    />
                  </div>

                  {/* Lokasi */}
                  <div>
                    <label htmlFor="lokasi" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Lokasi</label>
                    <input
                      id="lokasi"
                      type="text"
                      required
                      value={lokasi}
                      onChange={(e) => setLokasi(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-[#828200]"
                    />
                  </div>

                  {/* Personil */}
                  <div>
                    <label htmlFor="personil" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Personil</label>
                    <input
                      id="personil"
                      type="text"
                      required
                      value={personil}
                      onChange={(e) => setPersonil(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-[#828200]"
                    />
                  </div>

                  {/* PIC */}
                  <div>
                    <label htmlFor="pic" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">PIC</label>
                    <input
                      id="pic"
                      type="text"
                      required
                      value={pic}
                      onChange={(e) => setPic(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-[#828200]"
                    />
                  </div>

                  {/* Anggota */}
                  <div>
                    <label htmlFor="anggota" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Anggota</label>
                    <input
                      id="anggota"
                      type="text"
                      required
                      value={anggota}
                      onChange={(e) => setAnggota(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-[#828200]"
                    />
                  </div>
                </div>

                {/* Checklist items list */}
                <div className="border-t border-slate-800/80 pt-6 space-y-4">
                  <h3 className="text-sm font-bold text-white mb-4">Daftar Poin Pemeriksaan</h3>

                  {checklist.map((item, idx) => (
                    <div key={item.id} className="glass-card p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex-1">
                        <span className="text-[10px] bg-slate-800 text-slate-400 font-mono px-2 py-0.5 rounded font-bold uppercase">{item.category}</span>
                        <p className="text-sm font-semibold text-white mt-1.5">{item.question}</p>
                        <input
                          id={`note_${item.id}`}
                          title={`Catatan ${item.question}`}
                          type="text"
                          value={item.notes || ''}
                          onChange={(e) => {
                            const updated = [...checklist];
                            updated[idx].notes = e.target.value;
                            setChecklist(updated);
                          }}
                          className="mt-2 text-xs w-full bg-slate-900/30 border border-slate-800 rounded px-2.5 py-1 text-slate-300"
                        />
                      </div>

                      <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                        <label htmlFor={`chk_${item.id}`} className="text-xs text-slate-400 mr-1">Terpenuhi?</label>
                        <input
                          id={`chk_${item.id}`}
                          title="Terpenuhi?"
                          type="checkbox"
                          checked={item.checked}
                          onChange={(e) => {
                            const updated = [...checklist];
                            updated[idx].checked = e.target.checked;
                            setChecklist(updated);
                          }}
                          className="w-5 h-5 accent-[#828200] rounded focus:ring-0 cursor-pointer"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label htmlFor="comments" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Komentar / Saran Tambahan</label>
                  <textarea
                    id="comments"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 bg-[#828200] hover:bg-[#999900] disabled:bg-slate-800 text-white font-semibold rounded-xl cursor-pointer transition shadow-lg"
                >
                  Simpan Laporan Inspeksi
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: FINDINGS ARCHIVES */}
          {activeTab === 'archive' && (
            <div className="space-y-6">
              <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-white">Arsip Temuan Bahaya & Inspeksi</h2>
                    <p className="text-xs text-slate-400">Histori data K3 PT PAWA. Anda dapat mencari berdasarkan filter tanggal, dan mengexport.</p>
                  </div>

                  <div className="flex gap-2 items-center">
                    <select
                      id="searchMonth"
                      title="Filter Bulan"
                      value={searchMonth}
                      onChange={(e) => setSearchMonth(e.target.value)}
                      className="px-3 py-1.5 bg-slate-900 border border-slate-850 rounded-lg text-xs text-slate-300 focus:outline-none"
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

                    <button
                      onClick={handleMassExcelExport}
                      className="px-4 py-2 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 font-semibold rounded-xl text-xs flex items-center gap-2 border border-emerald-800 transition cursor-pointer"
                    >
                      📥 Mass Export XLSX
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column: Hazard Reports */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
                      <span className="w-1.5 h-4 bg-red-600 rounded-sm"></span>
                      Temuan Bahaya K3 ({filteredHazards.length})
                    </h3>
                    
                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                      {filteredHazards.length === 0 ? (
                        <p className="text-slate-500 text-xs py-4 text-center">Tidak ada temuan bahaya K3.</p>
                      ) : (
                        filteredHazards.map((item) => (
                          <div key={item.id} className="glass-card p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-950/20 border border-slate-900">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] bg-red-950/40 text-red-400 border border-red-900/50 px-1.5 py-0.5 rounded font-bold uppercase">
                                  {item.category}
                                </span>
                                <span className="text-[9px] text-slate-500 font-mono">
                                  {new Date(item.createdAt).toLocaleDateString('id-ID')}
                                </span>
                              </div>
                              <h4 className="text-xs font-bold text-white mt-1.5">{item.title}</h4>
                            </div>
                            <button
                              onClick={() => exportHsePDF(item)}
                              className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-[10px] transition flex items-center gap-1 cursor-pointer flex-shrink-0"
                            >
                              <FileDown size={11} /> PDF Report
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right Column: Safety Inspections */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
                      <span className="w-1.5 h-4 bg-[#828200] rounded-sm"></span>
                      Inspeksi Keselamatan K3 ({filteredInspections.length})
                    </h3>
                    
                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                      {filteredInspections.length === 0 ? (
                        <p className="text-slate-500 text-xs py-4 text-center">Tidak ada inspeksi keselamatan.</p>
                      ) : (
                        filteredInspections.map((item) => {
                          const safeCount = item.checklist.filter(c => c.checked).length;
                          const totalCount = item.checklist.length;
                          const ratio = `${safeCount}/${totalCount}`;
                          
                          let statusBg = 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50';
                          if (item.overallStatus === 'Attention Required') {
                            statusBg = 'bg-amber-950/40 text-amber-400 border border-amber-900/50';
                          } else if (item.overallStatus === 'Unsafe') {
                            statusBg = 'bg-red-950/40 text-red-400 border border-red-900/50';
                          }

                          return (
                            <div key={item.id} className="glass-card p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-950/20 border border-slate-900">
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${statusBg}`}>
                                    {item.overallStatus}
                                  </span>
                                  <span className="text-[9px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded font-mono border border-slate-800">
                                    Poin: {ratio}
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-mono">
                                    {new Date(item.createdAt).toLocaleDateString('id-ID')}
                                  </span>
                                </div>
                                <h4 className="text-xs font-bold text-white mt-1.5">{item.title}</h4>
                                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Inspector K3: {item.inspectorK3 || item.hseName}</p>
                              </div>
                              <button
                                onClick={() => exportInspectionPDF(item)}
                                className="px-2.5 py-1.5 bg-[#828200] hover:bg-[#999900] text-white rounded-lg text-[10px] transition flex items-center gap-1 cursor-pointer flex-shrink-0"
                              >
                                <FileDown size={11} /> PDF Report
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

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
export default Dashboard;
