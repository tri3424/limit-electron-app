# Changelog

All notable changes to ExamMaster will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Exam taking UI with question navigation
- Timer implementation with Web Worker
- Cross-tab timer synchronization via BroadcastChannel
- Service Worker for complete offline support
- Module creation/editing UI
- PDF report generation
- CSV data export
- Automated tests (Jest + Playwright)
- Electron packaging scripts
- Backup encryption

## [0.1.0] - 2025-01-11

### Added
- **Core Pages**
  - Home dashboard with module cards (Exam and Practice buckets)
  - Questions page with filtering, search, and stats
  - Create/Edit Question page with rich form
  - Settings page with comprehensive configuration

- **Data Management**
  - IndexedDB schema with Dexie.js
  - Question CRUD (MCQ and free text types)
  - Module management (Exam/Practice types)
  - Tag system for categorization
  - Attempt tracking structure
  - Integrity event logging system

- **Settings Features**
  - User profile configuration
  - Exam integrity toggles (fullscreen, auto-submit, keyboard blocking)
  - Theme selection (light/dark/auto)
  - Data export/import (JSON format)
  - Clear all data functionality
  - Database statistics viewer

- **UI/UX**
  - Desktop-only enforcement (1280px minimum)
  - Mobile warning screen
  - Professional blue/teal color scheme
  - Semantic color tokens for theming
  - Responsive layout with sidebar navigation
  - Card-based design pattern
  - Loading states and animations

- **Sample Data**
  - 20 sample questions (mix of MCQ and text)
  - 8 predefined tags
  - 3 sample modules (1 practice, 2 exam)
  - Automatic seeding on first run

- **Developer Experience**
  - TypeScript throughout
  - React 18 with Vite
  - Tailwind CSS + shadcn/ui
  - Zustand state management
  - Comprehensive README with setup instructions
  - Design notes document
  - Database schema documentation

### Technical Details
- **Dependencies**: React, TypeScript, Vite, Dexie, Zustand, React Router, Tailwind, shadcn/ui
- **Database**: IndexedDB with 6 stores (questions, modules, attempts, integrityEvents, tags, settings)
- **State**: Zustand for global UI state, IndexedDB for persistence
- **Routing**: React Router v6 with Layout wrapper
- **Build**: Vite with SWC for fast refresh

### Known Limitations
- Exam taking UI not yet implemented
- Timer system planned but not yet built
- Service Worker not implemented (partial offline support)
- No automated tests yet
- PDF export not implemented
- Encryption for backups not implemented
- Web Worker timer not implemented

## [0.0.1] - 2025-01-11

### Added
- Initial project setup
- Basic project structure
- Vite + React + TypeScript configuration
- Tailwind CSS setup
- shadcn/ui component library integration

---

## Version Guidelines

### Major Version (X.0.0)
- Breaking changes to data schema
- Major UI/UX overhaul
- Significant architecture changes

### Minor Version (0.X.0)
- New features (e.g., exam taking UI, analytics)
- Non-breaking enhancements
- New pages or major components

### Patch Version (0.0.X)
- Bug fixes
- UI polish
- Performance improvements
- Documentation updates
