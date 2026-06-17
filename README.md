# PT PAWA INDONESIA ENGINEERING — Report Maintenance System

> Monorepo dual-app platform for **Engineer** (Preventive/Corrective Maintenance & PTW) and **HSE** (K3 Hazard Reporting, Safety Inspections, & Findings Archive).

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=FFD627)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Go](https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)

## Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + TypeScript + Vite 6 | Two SPAs sharing modules via npm workspaces |
| **Styling** | Tailwind CSS v4 + Glassmorphism | Premium dark-mode UI with HSL palette |
| **Database** | Firebase Firestore (client SDK) | Real-time NoSQL with RBAC security rules |
| **Auth** | Firebase Authentication | Email/password with role-gated access |
| **Storage** | Firebase Cloud Storage | Watermarked photos, PTW documents |
| **Backend** | Go 1.23 (helper API) | Health checks, server-side export stubs |
| **Export** | jsPDF + html2canvas + ExcelJS | Client-side PDF (A4 layout) and .xlsx |

## Quick Start

```bash
# 1. Install dependencies (from monorepo root)
npm install

# 2. Run Engineer Portal (Port 3000)
npm run dev:engineer

# 3. Run HSE Portal (Port 3001)
npm run dev:hse

# 4. Run Go backend helper (Port 8080)
go run backend/cmd/api/main.go
```

## Project Structure

```
pawa-report-maintenance/
├── api/index.go                    # Vercel serverless entry
├── backend/
│   ├── cmd/api/main.go             # Local Go server
│   ├── core/
│   │   ├── middlewares/            # Auth, CORS, Security, RateLimiter
│   │   ├── models/                 # Firestore struct DTOs
│   │   └── routes/                 # API routing + middleware chain
│   └── pkg/
│       ├── helpers/                # JSON response builders
│       └── logger/                 # Structured logging
├── shared/
│   ├── types/index.ts              # TypeScript interfaces
│   ├── utils/camera.ts             # Smart Camera + GPS watermark
│   └── components/CameraModal.tsx  # Shared camera UI component
├── apps/
│   ├── engineer-web/               # Port 3000
│   └── hse-web/                    # Port 3001
├── firebase/
│   ├── firestore.rules             # RBAC security rules
│   └── firestore.indexes.json      # Composite indexes
└── package.json                    # npm workspaces config
```

## Roles & Access Control

| Role | Engineer Portal | HSE Portal | Scope |
|------|:---:|:---:|-------|
| `engineer` | ✅ Full | ❌ | Create/edit own maintenance reports, submit PTW |
| `hse` | ❌ | ✅ Full | Create hazard reports, run safety inspections, approve PTW |
| `site_manager` | ✅ Read-only | ✅ Read-only | Dashboard monitoring across both portals |
| `admin` | ✅ Full | ✅ Full | Full CRUD, user management |

## Firebase Project

- **Project ID:** `pt-pawa-indonesia`
- **Auth Domain:** `pt-pawa-indonesia.firebaseapp.com`

## License

Copyright © 2022 PT. Pawa Indonesia Engineering — All Rights Reserved
