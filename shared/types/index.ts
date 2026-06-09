export type UserRole = 'engineer' | 'hse' | 'site_manager' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface GPSCoords {
  latitude: number;
  longitude: number;
  address?: string;
}

// Maintenance Template Types
export type MaintenanceTemplate = 'AHU' | 'Chiller' | 'Trafo' | 'VRV' | 'General';

export interface MaintenanceStep {
  stepNumber: number;
  task: string;
  status: 'pending' | 'completed' | 'not_applicable';
  photoUrl?: string; // Watermarked image URL
  notes?: string;
}

export interface ReportEngineer {
  id?: string;
  title: string;
  templateType: MaintenanceTemplate;
  engineerId: string;
  engineerName: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'submitted' | 'approved';
  steps: MaintenanceStep[];
  
  // Corrective Maintenance fields
  isCorrective?: boolean;
  damageDescription?: string;
  rectificationPlan?: string;
  photoBeforeUrl?: string;
  photoAfterUrl?: string;
}

export interface ReportHSE {
  id?: string;
  title: string;
  hseId: string;
  hseName: string;
  createdAt: string;
  updatedAt: string;
  location: GPSCoords;
  category: 'Unsafe Action' | 'Unsafe Condition' | 'Incident' | 'Near Miss';
  description: string;
  correctiveAction: string;
  photoUrl: string; // Image with circle highlight or crop
  photoMarkup?: string; // Canvas overlay markup coordinates
  status: 'open' | 'resolved' | 'closed';
  resolvedAt?: string;
}

export interface SafetyCheckItem {
  id: string;
  category: string;
  question: string;
  checked: boolean;
  notes?: string;
}

export interface SafetyInspection {
  id?: string;
  title: string;
  hseId: string;
  hseName: string;
  createdAt: string;
  checklist: SafetyCheckItem[];
  overallStatus: 'Safe' | 'Attention Required' | 'Unsafe';
  comments?: string;
}

export interface PermitToWork {
  id?: string;
  ptwNumber: string; // Sequence: PTW-YYYYMMDD-XXXX
  title: string;
  engineerId: string;
  engineerName: string;
  approvedByHseId?: string;
  approvedByHseName?: string;
  approvedAt?: string;
  status: 'pending' | 'approved' | 'rejected';
  ptwDocumentUrl: string; // PDF/Image uploaded
  createdAt: string;
}
