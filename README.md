# PT PAWA INDONESIA ENGINEERING — Report Maintenance & HSE Platform

> Enterprise monorepo dual-portal application designed for PT Pawa Indonesia Engineering. The platform houses the **Engineer Report System** (Preventive/Corrective Maintenance tracking) and the **HSE & K3 System** (Hazard Reporting, Safety Inspections, and Digital Findings Archive).

---

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=FFD627)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Go](https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)

---

## 🌟 Key Features

### 🛠️ Portal Report Engineer

* **Preventive & Corrective Maintenance Logging:** Structured creation of maintenance workcards based on templated requirements.
* **Client-Side Report Compilers:** Instant on-demand generation of corporate-branded A4 PDF files and structured Excel spreadsheets directly in the browser.
* **Smart Camera Integration:** Built-in camera interface utilizing device cameras with auto-timestamping and coordinate metadata tags.

### 🛡️ Portal HSE & K3 (Safety)

* Unsafe Condition & Action Reports: Quick submission of hazard findings with visual annotations and markups.
* GPS Geo-tagging: Automatic address and coordinate resolution for precise hazard positioning.
* Safety Inspections Checklist: Digital audit checklists covering PPE, Fire Safety, Electrical Hazard, and Housekeeping rules.
* HSE Findings Archive: Centralized registry with advanced month/year filters and mass export tools (.xlsx).

---

## 📐 System Architecture

This repository is built as an npm monorepo separating frontend portals while maintaining shared modules:

```text
PT-PAWA-INDONESIA-ENGINEER/
├── apps/
│   ├── engineer-web/               # Engineer portal (React SPA on Port 3000)
│   └── hse-web/                    # HSE & K3 portal (React SPA on Port 3001)
├── shared/                         # Shared workspace for components & utils
│   ├── components/                 # Shared camera overlay modals
│   ├── types/                      # Common TypeScript interfaces
│   └── utils/                      # Geo-watermark, Firestore file helpers
├── api/                            # Vercel Serverless Server entry
├── backend/                        # Go 1.23 REST API helper stubs
└── firebase/                       # Firebase Firestore/Storage Security Rules
```

---

## 🎨 Premium UI/UX Design System

The application features a sleek corporate appearance designed to impress at first glance:

* **Woodmart Corporate Palette:** Dominated by a deep obsidian background (`#070b13`) and rich gold-olive accent colors (`#828200`).
* **Glassmorphism UI Panels:** Backdrop-blur filters combined with subtle thin border lines for a modern floating card aesthetic.
* **Aesthetic Background slideshow:** Housed in the login pages, utilizing official PT Pawa background assets with continuous smooth scaling (Ken Burns zoom) and Framer Motion cross-fade transitions.

---

## 🚦 Getting Started

### 1. Install Dependencies

Run npm install at the root folder of the monorepo workspace to resolve all shared workspace links automatically:

```bash
npm install
```

### 2. Configure Environment variables

Create a `.env.local` inside both `apps/engineer-web/` and `apps/hse-web/` folders:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=pt-pawa-indonesia.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=pt-pawa-indonesia
VITE_FIREBASE_STORAGE_BUCKET=pt-pawa-indonesia.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 3. Run Development Servers

Start both workspaces concurrently with:

```bash
# Run both websites simultaneously
npm run dev

# Or start specific applications individually:
npm run dev:engineer    # Available at http://localhost:3000
npm run dev:hse         # Available at http://localhost:3001
```

### 4. Build for Production

```bash
# Compiles all workspaces into optimized static HTML/JS bundles
npm run build:all
```

---

## 🛡️ Roles & Access Control Matrix

Strict security policies are enforced on the Firebase Firestore backend via security rules matching the following matrix:

| User Role | Engineer Portal | HSE Portal | Operational Scope |
| :--- | :---: | :---: | :--- |
| `engineer` | **Full Access** | No Access | Create, edit, and export own maintenance reports. |
| `hse` | No Access | **Full Access** | Audit safety checklists, record hazards, export archives. |
| `site_manager` | Read Only | Read Only | Monitor overview data across both portals. |
| `admin` | **Full Access** | **Full Access** | Superuser bypass for audit management. |

---

## 🌐 Live Deployment

The system is deployed on Firebase Cloud Infrastructure:

* **Engineer System:** [https://pt-pawa-indonesia-engineer-report.com](https://pt-pawa-indonesia-engineer-report.com)
* **HSE & K3 System:** [https://pt-pawa-indonesia-hse-report.com](https://pt-pawa-indonesia-hse-report.com)

---

Copyright © 2026 PT. Pawa Indonesia Engineering — All Rights Reserved
