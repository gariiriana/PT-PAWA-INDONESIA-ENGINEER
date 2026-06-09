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

  // Archive Search states
  const [searchYear, setSearchYear] = useState('2026');
  const [searchMonth, setSearchMonth] = useState('All');

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

  const handleLogout = async () => {
    await signOut(auth);
    onLogout();
  };

  // Smart Camera capture result
  const handleCaptureResult = (blob: Blob, dataUrl: string) => {
    // Save raw capture and open drawing/editor interface
    setRawImageSrc(dataUrl);
    setIsEditingImage(true);
  };

  // Saved edited image markup
  const handleSaveEditedImage = (editedBlob: Blob, editedDataUrl: string) => {
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
      return alert('Mohon isi data laporan lengkap dan lampirkan foto sorotan bahaya.');
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
      alert('Laporan K3 & Bahaya berhasil disubmit!');
      
      // Reset form
      setHazardTitle('');
      setDescription('');
      setCorrectiveAction('');
      setWatermarkedPhotoUrl(null);
      setPhotoBlob(null);
      setActiveTab('archive');
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan laporan bahaya.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Safety Checklist
  const handleSubmitInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectionTitle) return alert('Mohon isi judul inspeksi keselamatan.');
    setLoading(true);

    try {
      const newInspection: SafetyInspection = {
        title: inspectionTitle,
        hseId: userProfile.uid,
        hseName: userProfile.name,
        createdAt: new Date().toISOString(),
        checklist,
        overallStatus,
        comments,
      };

      await addDoc(collection(db, 'safety_inspections'), newInspection);
      alert('Checklist Inspeksi Keselamatan berhasil disimpan!');
      setInspectionTitle('');
      setComments('');
      setOverallStatus('Safe');
      
      // Reset checklist choices
      const resetList = checklist.map(item => ({ ...item, checked: true, notes: '' }));
      setChecklist(resetList);
      
      setActiveTab('archive');
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan inspeksi.');
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

  return (
    <div className="min-h-screen flex flex-col bg-[#080713]">
      {/* Navbar header with dark-green accents */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center shadow-lg relative">
        <div className="flex items-center gap-3">
          <img
            src="https://pawaengineering.co.id/wp-content/uploads/2022/09/cropped-Logo-Pawa-192x192.png"
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
                  onCancel={() => setIsEditingImage(false)}
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
                          placeholder="Contoh: Tangga Scaffolding Tidak Kokoh di Lapangan"
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
                          placeholder="Jelaskan potensi ancaman keselamatan secara detail..."
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
                          placeholder="Tindakan darurat yang diambil untuk mereduksi bahaya..."
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
                      placeholder="Contoh: Inspeksi K3 Mingguan Project Data Center Cikarang"
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
                          placeholder="Tambahkan catatan khusus..."
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
                    placeholder="Tuliskan rekomendasi perbaikan atau laporan detail mitigasi..."
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

                {/* Findings List */}
                <div className="space-y-4">
                  {hazards.length === 0 ? (
                    <p className="text-center py-6 text-slate-500 text-sm">Tidak ada temuan bahaya K3 dalam database.</p>
                  ) : (
                    hazards.map((item) => (
                      <div key={item.id} className="glass-card p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-red-950/40 text-red-400 border border-red-900/50 px-2 py-0.5 rounded font-bold uppercase">
                              {item.category}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(item.createdAt).toLocaleDateString('id-ID')}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-white mt-2">{item.title}</h4>
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{item.description}</p>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                          <button
                            onClick={() => exportHsePDF(item)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs transition flex items-center gap-1 cursor-pointer"
                          >
                            <FileDown size={13} /> PDF Report
                          </button>
                        </div>
                      </div>
                    ))
                  )}
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
