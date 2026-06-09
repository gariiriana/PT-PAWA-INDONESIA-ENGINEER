import React, { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { 
  LogOut, FileText, CheckCircle2, AlertCircle, Camera, FileDown, 
  Settings, User, Layers, Calendar, ChevronRight, Plus, Eye, CheckCircle 
} from 'lucide-react';
import { auth, db } from '../config/firebase';
import { 
  ReportEngineer, MaintenanceTemplate, MaintenanceStep, PermitToWork, UserProfile,
  uploadFileToFirestore, downloadFileFromFirestore, FirestoreImage
} from '@shared/index';
import CameraModal from '@shared/components/CameraModal';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import ExcelJS from 'exceljs';

interface DashboardProps {
  userProfile: { uid: string; email: string; name: string; role: string };
  onLogout: () => void;
}

// Preset maintenance steps based on templates
const TEMPLATE_STEPS: Record<MaintenanceTemplate, string[]> = {
  AHU: ['Pemeriksaan Filter Udara', 'Pengecekan Fan Belt', 'Pengukuran Arus Motor Fan', 'Pembersihan Koil Evaporator'],
  Chiller: ['Pemeriksaan Level Oli Kompresor', 'Pengukuran Tekanan Suction & Discharge', 'Uji Fungsi Water Flow Switch', 'Kalibrasi Sensor Suhu Chilled Water'],
  Trafo: ['Pemeriksaan Suhu Gulungan (Winding Temp)', 'Pengukuran Tegangan Sekunder', 'Pemeriksaan Level & Kebocoran Oli', 'Uji Kebersihan Bushing'],
  VRV: ['Pembersihan Filter Indoor Unit', 'Pengecekan Koil Kondensor Outdoor', 'Pengujian Sistem Kontrol Kabel', 'Pengukuran Tekanan Refrigeran'],
  General: ['Inspeksi Kebersihan Area Unit', 'Pengecekan Koneksi Kelistrikan', 'Uji Coba Fungsi Nyala/Mati (Run Test)'],
};

export const Dashboard: React.FC<DashboardProps> = ({ userProfile, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'preventive' | 'corrective' | 'ptw' | 'archive'>('preventive');
  const [reports, setReports] = useState<ReportEngineer[]>([]);
  const [ptws, setPtws] = useState<PermitToWork[]>([]);
  const [loading, setLoading] = useState(false);

  // Preventive Form State
  const [reportTitle, setReportTitle] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<MaintenanceTemplate>('AHU');
  const [steps, setSteps] = useState<MaintenanceStep[]>([]);
  
  // Camera Integration State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [cameraTarget, setCameraTarget] = useState<'step' | 'corrective_before' | 'corrective_after' | 'ptw'>('step');

  // Corrective Maintenance State
  const [correctiveTitle, setCorrectiveTitle] = useState('');
  const [damageDesc, setDamageDesc] = useState('');
  const [rectificationPlan, setRectificationPlan] = useState('');
  const [correctiveBeforePhoto, setCorrectiveBeforePhoto] = useState<string | null>(null);
  const [correctiveAfterPhoto, setCorrectiveAfterPhoto] = useState<string | null>(null);
  const [correctiveBeforeBlob, setCorrectiveBeforeBlob] = useState<Blob | null>(null);
  const [correctiveAfterBlob, setCorrectiveAfterBlob] = useState<Blob | null>(null);

  // PTW Form State
  const [ptwTitle, setPtwTitle] = useState('');
  const [ptwFile, setPtwFile] = useState<File | null>(null);
  const [ptwUploading, setPtwUploading] = useState(false);

  // Fetch archives on tab change
  useEffect(() => {
    fetchArchives();
    fetchPtws();
  }, [activeTab]);

  // Load steps when template changes
  useEffect(() => {
    const defaultTasks = TEMPLATE_STEPS[selectedTemplate];
    const initialSteps = defaultTasks.map((task, index) => ({
      stepNumber: index + 1,
      task,
      status: 'pending' as const,
      notes: '',
    }));
    setSteps(initialSteps);
  }, [selectedTemplate]);

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
      setReports(fetchedReports.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPtws = async () => {
    try {
      const q = query(
        collection(db, 'ptw'),
        where('engineerId', '==', userProfile.uid)
      );
      const querySnapshot = await getDocs(q);
      const fetchedPtws: PermitToWork[] = [];
      querySnapshot.forEach((doc) => {
        fetchedPtws.push({ id: doc.id, ...doc.data() } as PermitToWork);
      });
      setPtws(fetchedPtws.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (err) {
      console.error('Error fetching PTWs:', err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    onLogout();
  };

  // Open camera for step photo
  const triggerCameraForStep = (index: number) => {
    setCameraTarget('step');
    setActiveStepIndex(index);
    setIsCameraOpen(true);
  };

  const handleCaptureResult = async (blob: Blob, dataUrl: string) => {
    if (cameraTarget === 'step' && activeStepIndex !== null) {
      // Chunked upload to Firestore Database
      setLoading(true);
      try {
        const attachmentId = await uploadFileToFirestore(db, blob, `step_${activeStepIndex}.jpg`);
        
        const updatedSteps = [...steps];
        updatedSteps[activeStepIndex] = {
          ...updatedSteps[activeStepIndex],
          photoUrl: attachmentId,
          status: 'completed',
        };
        setSteps(updatedSteps);
      } catch (err) {
        alert('Gagal mengupload foto hasil tangkapan.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    } else if (cameraTarget === 'corrective_before') {
      setCorrectiveBeforePhoto(dataUrl);
      setCorrectiveBeforeBlob(blob);
    } else if (cameraTarget === 'corrective_after') {
      setCorrectiveAfterPhoto(dataUrl);
      setCorrectiveAfterBlob(blob);
    }
  };

  // Submit Preventive Report
  const handleSubmitPreventive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTitle) return alert('Judul laporan tidak boleh kosong.');
    setLoading(true);

    try {
      const newReport: ReportEngineer = {
        title: reportTitle,
        templateType: selectedTemplate,
        engineerId: userProfile.uid,
        engineerName: userProfile.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'submitted',
        steps,
      };

      await addDoc(collection(db, 'reports_engineer'), newReport);
      alert('Laporan pemeliharaan preventif berhasil disubmit!');
      setReportTitle('');
      setSelectedTemplate('AHU');
      setActiveTab('archive');
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat menyimpan laporan.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Corrective Maintenance
  const handleSubmitCorrective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctiveTitle || !damageDesc || !rectificationPlan) {
      return alert('Mohon isi semua field wajib.');
    }
    setLoading(true);

    try {
      let beforeUrl = '';
      let afterUrl = '';

      if (correctiveBeforeBlob) {
        beforeUrl = await uploadFileToFirestore(db, correctiveBeforeBlob, `${Date.now()}_before.jpg`);
      }

      if (correctiveAfterBlob) {
        afterUrl = await uploadFileToFirestore(db, correctiveAfterBlob, `${Date.now()}_after.jpg`);
      }

      const newReport: ReportEngineer = {
        title: correctiveTitle,
        templateType: 'General',
        engineerId: userProfile.uid,
        engineerName: userProfile.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'submitted',
        steps: [],
        isCorrective: true,
        damageDescription: damageDesc,
        rectificationPlan: rectificationPlan,
        photoBeforeUrl: beforeUrl,
        photoAfterUrl: afterUrl,
      };

      await addDoc(collection(db, 'reports_engineer'), newReport);
      alert('Laporan Corrective Maintenance berhasil disubmit!');
      setCorrectiveTitle('');
      setDamageDesc('');
      setRectificationPlan('');
      setCorrectiveBeforePhoto(null);
      setCorrectiveAfterPhoto(null);
      setCorrectiveBeforeBlob(null);
      setCorrectiveAfterBlob(null);
      setActiveTab('archive');
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan Laporan Corrective Maintenance.');
    } finally {
      setLoading(false);
    }
  };

  // Submit PTW Request
  const handleSubmitPTW = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ptwTitle || !ptwFile) return alert('Isi judul dan upload berkas izin.');
    setPtwUploading(true);

    try {
      // Upload PDF/Image to Firestore chunks
      const fileUrl = await uploadFileToFirestore(db, ptwFile, ptwFile.name);

      // Sequence: PTW-YYYYMMDD-XXXX
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const sequence = `PTW-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

      const newPtw: PermitToWork = {
        ptwNumber: sequence,
        title: ptwTitle,
        engineerId: userProfile.uid,
        engineerName: userProfile.name,
        status: 'pending',
        ptwDocumentUrl: fileUrl,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'ptw'), newPtw);
      alert('Pengajuan Permit to Work berhasil dikirim!');
      setPtwTitle('');
      setPtwFile(null);
      fetchPtws();
    } catch (err) {
      console.error(err);
      alert('Gagal mengajukan Permit to Work.');
    } finally {
      setPtwUploading(false);
    }
  };

  const handleOpenPTW = async (ptw: PermitToWork) => {
    try {
      setLoading(true);
      const isHttp = ptw.ptwDocumentUrl.startsWith('http://') || ptw.ptwDocumentUrl.startsWith('https://');
      if (isHttp) {
        window.open(ptw.ptwDocumentUrl, '_blank');
      } else {
        const { dataUrl } = await downloadFileFromFirestore(db, ptw.ptwDocumentUrl);
        window.open(dataUrl, '_blank');
      }
    } catch (err) {
      console.error(err);
      alert('Gagal membuka berkas PTW.');
    } finally {
      setLoading(false);
    }
  };

  // Client-Side PDF Export (9 photos per A4 page pagination layout)
  const exportToPDF = async (report: ReportEngineer) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Header Style
    doc.setFillColor(28, 28, 28);
    doc.rect(0, 0, 210, 30, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('PT. PAWA INDONESIA ENGINEERING', 15, 12);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Kuningan Barat, Mampang Prapatan, Jakarta Selatan, DKI Jakarta', 15, 18);
    doc.text('Laporan Pemeliharaan Teknis / Engineering Report', 15, 23);

    // Title / Metadata
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont('Helvetica', 'bold');
    doc.text(report.title, 15, 42);
    
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Tipe Dokumen: ${report.isCorrective ? 'Corrective Maintenance' : 'Preventive Maintenance (' + report.templateType + ')'}`, 15, 49);
    doc.text(`Engineer: ${report.engineerName}`, 15, 54);
    doc.text(`Tanggal: ${new Date(report.createdAt).toLocaleString('id-ID')}`, 15, 59);

    // Table Content
    let y = 68;
    if (report.isCorrective) {
      // Corrective details
      doc.setFont('Helvetica', 'bold');
      doc.text('Deskripsi Kerusakan:', 15, y);
      doc.setFont('Helvetica', 'normal');
      doc.text(report.damageDescription || '-', 15, y + 5, { maxWidth: 180 });
      
      y += 20;
      doc.setFont('Helvetica', 'bold');
      doc.text('Tindakan Perbaikan:', 15, y);
      doc.setFont('Helvetica', 'normal');
      doc.text(report.rectificationPlan || '-', 15, y + 5, { maxWidth: 180 });
      
      // Let's draw photos before/after on next page
      doc.addPage();
      doc.setFont('Helvetica', 'bold');
      doc.text('Foto Kondisi (Before / After):', 15, 20);

      // Embed photos if exist
      if (report.photoBeforeUrl) {
        try {
          const isHttp = report.photoBeforeUrl.startsWith('http://') || report.photoBeforeUrl.startsWith('https://');
          const url = isHttp ? report.photoBeforeUrl : (await downloadFileFromFirestore(db, report.photoBeforeUrl)).dataUrl;
          doc.text('Sebelum Perbaikan (Before):', 15, 30);
          doc.addImage(url, 'JPEG', 15, 35, 85, 60);
          if (!isHttp) {
            URL.revokeObjectURL(url);
          }
        } catch (err) {
          console.error('Failed to embed before photo in PDF:', err);
        }
      }
      if (report.photoAfterUrl) {
        try {
          const isHttp = report.photoAfterUrl.startsWith('http://') || report.photoAfterUrl.startsWith('https://');
          const url = isHttp ? report.photoAfterUrl : (await downloadFileFromFirestore(db, report.photoAfterUrl)).dataUrl;
          doc.text('Setelah Perbaikan (After):', 110, 30);
          doc.addImage(url, 'JPEG', 110, 35, 85, 60);
          if (!isHttp) {
            URL.revokeObjectURL(url);
          }
        } catch (err) {
          console.error('Failed to embed after photo in PDF:', err);
        }
      }
    } else {
      // Table Header
      doc.setFillColor(240, 240, 240);
      doc.rect(15, y, 180, 8, 'F');
      doc.setFont('Helvetica', 'bold');
      doc.text('No', 18, y + 5);
      doc.text('Tugas Pemeliharaan', 30, y + 5);
      doc.text('Status', 160, y + 5);
      y += 8;

      report.steps.forEach((step, idx) => {
        doc.setFont('Helvetica', 'normal');
        doc.text(String(idx + 1), 18, y + 5);
        doc.text(step.task, 30, y + 5, { maxWidth: 120 });
        doc.text(step.status.toUpperCase(), 160, y + 5);
        y += 8;
      });

      // Photos section (9 photos grid layout per page)
      const photoSteps = report.steps.filter(s => s.photoUrl);
      if (photoSteps.length > 0) {
        doc.addPage();
        doc.setFont('Helvetica', 'bold');
        doc.text('Lampiran Foto Pemeliharaan (9 Grid Layout):', 15, 20);
        
        let py = 30;
        let px = 15;
        let pCount = 0;

        for (const step of photoSteps) {
          if (pCount > 0 && pCount % 9 === 0) {
            doc.addPage();
            py = 30;
            px = 15;
          }

          try {
            const isHttp = step.photoUrl!.startsWith('http://') || step.photoUrl!.startsWith('https://');
            const url = isHttp ? step.photoUrl! : (await downloadFileFromFirestore(db, step.photoUrl!)).dataUrl;
            doc.addImage(url, 'JPEG', px, py, 55, 42);
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(7);
            doc.text(`Langkah ${step.stepNumber}: ${step.task.slice(0, 25)}...`, px, py + 46, { maxWidth: 55 });
            if (!isHttp) {
              URL.revokeObjectURL(url);
            }
          } catch (err) {
            console.error('Failed to embed step photo in PDF:', err);
          }

          pCount++;
          px += 65;
          if (px > 150) {
            px = 15;
            py += 55;
          }
        }
      }
    }

    // Save PDF
    doc.save(`PT_PAWA_Report_${report.id || 'export'}.pdf`);
  };

  // ExcelJS Export
  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Laporan Maintenance');

    worksheet.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Judul Laporan', key: 'title', width: 25 },
      { header: 'Tipe', key: 'type', width: 25 },
      { header: 'Nama Engineer', key: 'engineer', width: 20 },
      { header: 'Tanggal', key: 'date', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    // Styling Header
    worksheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '828200' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    });

    reports.forEach((rep, idx) => {
      worksheet.addRow({
        no: idx + 1,
        title: rep.title,
        type: rep.isCorrective ? 'Corrective' : 'Preventive',
        engineer: rep.engineerName,
        date: new Date(rep.createdAt).toLocaleDateString('id-ID'),
        status: rep.status,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PT_PAWA_All_Reports_${Date.now()}.xlsx`;
    a.click();
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#070b13]">
      {/* Navbar header matching brand identity */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center shadow-lg relative">
        <div className="flex items-center gap-3">
          <img
            src="https://pawaengineering.co.id/wp-content/uploads/2022/09/cropped-Logo-Pawa-192x192.png"
            alt="Logo"
            className="w-10 h-10 drop-shadow-[0_2px_5px_rgba(130,130,0,0.4)]"
          />
          <div>
            <h1 className="text-md font-bold tracking-tight text-white flex items-center gap-1.5">
              PT PAWA INDONESIA
              <span className="text-xs bg-[#828200] text-white font-mono px-2 py-0.5 rounded">ENGINEER</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">FACILITY MANAGEMENT & MAINTENANCE</p>
          </div>
        </div>

        {/* User profile details & Logout */}
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

      {/* Main Container Layout */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Navigation Sidebar */}
        <nav className="w-full lg:w-64 bg-slate-900/40 border-r border-slate-800/80 p-4 space-y-2 lg:block">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">MENU PEMELIHARAAN</p>
          
          <button
            onClick={() => setActiveTab('preventive')}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex items-center gap-3 cursor-pointer ${
              activeTab === 'preventive' 
                ? 'bg-[#828200] text-white shadow-lg shadow-[#828200]/10' 
                : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'
            }`}
          >
            <Layers size={18} />
            Preventive Maintenance
          </button>

          <button
            onClick={() => setActiveTab('corrective')}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex items-center gap-3 cursor-pointer ${
              activeTab === 'corrective' 
                ? 'bg-[#828200] text-white shadow-lg shadow-[#828200]/10' 
                : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'
            }`}
          >
            <AlertCircle size={18} />
            Corrective Maintenance
          </button>

          <button
            onClick={() => setActiveTab('ptw')}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition flex items-center gap-3 cursor-pointer ${
              activeTab === 'ptw' 
                ? 'bg-[#828200] text-white shadow-lg shadow-[#828200]/10' 
                : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'
            }`}
          >
            <FileText size={18} />
            Permit to Work (PTW)
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
            Arsip & Laporan
          </button>
        </nav>

        {/* Dynamic Content Panel */}
        <main className="flex-1 p-6 overflow-y-auto">
          {/* TAB 1: PREVENTIVE MAINTENANCE FORM */}
          {activeTab === 'preventive' && (
            <div className="space-y-6">
              <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                <h2 className="text-xl font-bold text-white mb-2">Preventive Maintenance Checklist</h2>
                <p className="text-xs text-slate-400">Pilih template, isi tugas perawatan, dan ambil foto dengan modul kamera bertanda air GPS.</p>
                
                <form onSubmit={handleSubmitPreventive} className="mt-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="reportTitle" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Judul Laporan</label>
                      <input
                        id="reportTitle"
                        type="text"
                        required
                        value={reportTitle}
                        onChange={(e) => setReportTitle(e.target.value)}
                        placeholder="Contoh: Pemeliharaan AHU Gedung A Lt 3"
                        className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-[#828200]"
                      />
                    </div>
                    <div>
                      <label htmlFor="selectedTemplate" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Template Unit</label>
                      <select
                        id="selectedTemplate"
                        title="Template Unit"
                        value={selectedTemplate}
                        onChange={(e) => setSelectedTemplate(e.target.value as MaintenanceTemplate)}
                        className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-[#828200]"
                      >
                        <option value="AHU">Air Handling Unit (AHU)</option>
                        <option value="Chiller">Chiller Unit</option>
                        <option value="Trafo">Transformator (Trafo)</option>
                        <option value="VRV">VRV / VRF Air Conditioning</option>
                        <option value="General">Pemeriksaan Umum (General)</option>
                      </select>
                    </div>
                  </div>

                  {/* Tasks List */}
                  <div className="border-t border-slate-800/80 pt-6">
                    <h3 className="text-sm font-bold text-white mb-4">Langkah Pekerjaan & Status</h3>
                    
                    <div className="space-y-4">
                      {steps.map((step, index) => (
                        <div key={index} className="glass-card p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-white">Langkah {step.stepNumber}: {step.task}</p>
                            <input
                              type="text"
                              value={step.notes || ''}
                              onChange={(e) => {
                                const newSteps = [...steps];
                                newSteps[index].notes = e.target.value;
                                setSteps(newSteps);
                              }}
                              placeholder="Catatan pengerjaan (opsional)..."
                              className="mt-2 text-xs w-full bg-slate-900/30 border border-slate-800 rounded px-2.5 py-1 text-slate-300"
                            />
                          </div>

                          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                            {/* Status radio select */}
                            <div className="flex gap-2">
                              {['pending', 'completed', 'not_applicable'].map((st) => (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => {
                                    const newSteps = [...steps];
                                    newSteps[index].status = st as any;
                                    setSteps(newSteps);
                                  }}
                                  className={`px-2 py-1 text-[10px] font-bold rounded uppercase transition ${
                                    step.status === st 
                                      ? 'bg-slate-700 text-white' 
                                      : 'bg-slate-900/60 text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  {st.replace('_', ' ')}
                                </button>
                              ))}
                            </div>

                            {/* Camera Action */}
                            <div className="flex items-center gap-2">
                              {step.photoUrl ? (
                                <FirestoreImage
                                  db={db}
                                  attachmentId={step.photoUrl}
                                  alt="Captured"
                                  className="w-10 h-10 object-cover rounded-lg border border-slate-700"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => triggerCameraForStep(index)}
                                  className="p-2 bg-slate-850 hover:bg-slate-750 text-[#828200] rounded-lg transition"
                                  title="Ambil foto dengan watermark"
                                >
                                  <Camera size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3 bg-[#828200] hover:bg-[#999900] disabled:bg-slate-800 text-white font-semibold rounded-xl cursor-pointer transition"
                  >
                    Submit Laporan Preventif
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: CORRECTIVE MAINTENANCE FORM */}
          {activeTab === 'corrective' && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800">
              <h2 className="text-xl font-bold text-white mb-2">Corrective Maintenance (Penanganan Kerusakan)</h2>
              <p className="text-xs text-slate-400">Laporkan perbaikan kerusakan darurat beserta bukti dokumentasi foto Before dan After.</p>

              <form onSubmit={handleSubmitCorrective} className="mt-6 space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Judul Laporan Kerusakan</label>
                  <input
                    type="text"
                    required
                    value={correctiveTitle}
                    onChange={(e) => setCorrectiveTitle(e.target.value)}
                    placeholder="Contoh: Perbaikan Kebocoran Pipa Chilled Water Pompa 2"
                    className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-[#828200]"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Deskripsi Kerusakan</label>
                    <textarea
                      required
                      value={damageDesc}
                      onChange={(e) => setDamageDesc(e.target.value)}
                      placeholder="Jelaskan detail kerusakan unit atau sistem..."
                      rows={4}
                      className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-[#828200]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Tindakan / Langkah Perbaikan</label>
                    <textarea
                      required
                      value={rectificationPlan}
                      onChange={(e) => setRectificationPlan(e.target.value)}
                      placeholder="Jelaskan detail tindakan perbaikan yang telah/akan dilakukan..."
                      rows={4}
                      className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-[#828200]"
                    />
                  </div>
                </div>

                {/* Before & After Photo Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                  {/* Photo Before */}
                  <div className="glass-card p-4 rounded-xl flex flex-col items-center justify-center min-h-[200px] border border-dashed border-slate-800">
                    <p className="text-xs font-semibold text-slate-400 mb-3">Foto Kondisi Sebelum Perbaikan (Before)</p>
                    {correctiveBeforePhoto ? (
                      <div className="relative w-full max-h-[160px] overflow-hidden rounded-lg">
                        <img src={correctiveBeforePhoto} alt="Before" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setCorrectiveBeforePhoto(null)}
                          className="absolute top-1.5 right-1.5 bg-black/60 p-1 text-white rounded-full text-[10px]"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setCameraTarget('corrective_before');
                          setIsCameraOpen(true);
                        }}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs flex items-center gap-1"
                      >
                        <Camera size={14} /> Ambil Foto Before
                      </button>
                    )}
                  </div>

                  {/* Photo After */}
                  <div className="glass-card p-4 rounded-xl flex flex-col items-center justify-center min-h-[200px] border border-dashed border-slate-800">
                    <p className="text-xs font-semibold text-slate-400 mb-3">Foto Kondisi Setelah Perbaikan (After)</p>
                    {correctiveAfterPhoto ? (
                      <div className="relative w-full max-h-[160px] overflow-hidden rounded-lg">
                        <img src={correctiveAfterPhoto} alt="After" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setCorrectiveAfterPhoto(null)}
                          className="absolute top-1.5 right-1.5 bg-black/60 p-1 text-white rounded-full text-[10px]"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setCameraTarget('corrective_after');
                          setIsCameraOpen(true);
                        }}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs flex items-center gap-1"
                      >
                        <Camera size={14} /> Ambil Foto After
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 bg-[#828200] hover:bg-[#999900] disabled:bg-slate-800 text-white font-semibold rounded-xl cursor-pointer transition"
                >
                  Submit Laporan Corrective
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: PTW REQUEST MODULE */}
          {activeTab === 'ptw' && (
            <div className="space-y-6">
              <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                <h2 className="text-xl font-bold text-white mb-2">Permit to Work (PTW) Request</h2>
                <p className="text-xs text-slate-400">Ajukan izin kerja baru untuk aktivitas berisiko tinggi. Upload dokumen format PDF/Foto yang disetujui HSE.</p>

                <form onSubmit={handleSubmitPTW} className="mt-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Judul Aktivitas Kerja</label>
                      <input
                        type="text"
                        required
                        id="ptwTitle"
                        value={ptwTitle}
                        onChange={(e) => setPtwTitle(e.target.value)}
                        placeholder="Contoh: Pekerjaan Welding Chilled Water Pipe"
                        className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="ptwFile" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Upload Berkas PTW (PDF/Image)</label>
                      <input
                        id="ptwFile"
                        title="Upload Berkas PTW"
                        type="file"
                        required
                        accept="application/pdf,image/*"
                        onChange={(e) => setPtwFile(e.target.files?.[0] || null)}
                        className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-white hover:file:bg-slate-700"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={ptwUploading}
                    className="px-6 py-2.5 bg-[#828200] hover:bg-[#999900] disabled:bg-slate-800 text-white font-semibold rounded-xl cursor-pointer transition flex items-center gap-2"
                  >
                    {ptwUploading ? 'Mengirim...' : 'Ajukan Izin Kerja'}
                  </button>
                </form>
              </div>

              {/* PTW List */}
              <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                <h3 className="text-md font-bold text-white mb-4">Daftar Pengajuan Permit to Work</h3>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-slate-300">
                    <thead className="text-xs text-slate-400 uppercase bg-slate-900/60 font-mono">
                      <tr>
                        <th className="px-4 py-3">No Izin</th>
                        <th className="px-4 py-3">Aktivitas Kerja</th>
                        <th className="px-4 py-3">Diajukan Pada</th>
                        <th className="px-4 py-3">Dokumen</th>
                        <th className="px-4 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ptws.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-6 text-slate-500">Belum ada pengajuan izin kerja.</td>
                        </tr>
                      ) : (
                        ptws.map((ptw) => (
                          <tr key={ptw.id} className="border-b border-slate-800/80 hover:bg-slate-900/20">
                            <td className="px-4 py-3 font-mono font-bold text-[#828200]">{ptw.ptwNumber}</td>
                            <td className="px-4 py-3 font-medium text-white">{ptw.title}</td>
                            <td className="px-4 py-3 text-xs">{new Date(ptw.createdAt).toLocaleDateString('id-ID')}</td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => handleOpenPTW(ptw)}
                                className="text-blue-400 hover:underline text-xs flex items-center gap-1 bg-transparent border-0 cursor-pointer"
                              >
                                <Eye size={12} /> Buka Berkas
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                ptw.status === 'approved' 
                                  ? 'bg-green-950/60 text-green-400 border border-green-900' 
                                  : ptw.status === 'rejected'
                                  ? 'bg-red-950/60 text-red-400 border border-red-900'
                                  : 'bg-yellow-950/60 text-yellow-400 border border-yellow-900'
                              }`}>
                                {ptw.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ARCHIVE / ARSIP LAPORAN */}
          {activeTab === 'archive' && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Arsip Dokumen Pemeliharaan</h2>
                  <p className="text-xs text-slate-400">Daftar laporan pemeliharaan Anda. Dapat diexport ke PDF layout presisi atau Excel spreadsheet.</p>
                </div>
                <button
                  onClick={exportToExcel}
                  className="px-4 py-2 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 font-semibold rounded-xl text-xs flex items-center gap-2 border border-emerald-800 transition cursor-pointer"
                >
                  📥 Export XLSX
                </button>
              </div>

              {/* Reports Archive Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-300">
                  <thead className="text-xs text-slate-400 uppercase bg-slate-900/60 font-mono">
                    <tr>
                      <th className="px-4 py-3">Judul Laporan</th>
                      <th className="px-4 py-3">Tipe Perawatan</th>
                      <th className="px-4 py-3">Tanggal Dibuat</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-6 text-slate-500">Belum ada laporan terdokumentasi.</td>
                      </tr>
                    ) : (
                      reports.map((rep) => (
                        <tr key={rep.id} className="border-b border-slate-800/80 hover:bg-slate-900/20">
                          <td className="px-4 py-3 font-semibold text-white">{rep.title}</td>
                          <td className="px-4 py-3 text-xs">
                            {rep.isCorrective ? (
                              <span className="text-red-400 bg-red-950/20 px-2 py-0.5 rounded">Corrective</span>
                            ) : (
                              <span className="text-emerald-400 bg-emerald-950/20 px-2 py-0.5 rounded">Preventive ({rep.templateType})</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs">{new Date(rep.createdAt).toLocaleString('id-ID')}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-slate-400 font-medium capitalize">{rep.status}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => exportToPDF(rep)}
                              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs transition flex items-center gap-1.5 ml-auto cursor-pointer"
                            >
                              <FileDown size={12} /> PDF
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
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
      />

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
