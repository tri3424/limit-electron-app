# Limit - Desktop Exam & Practice Platform

A production-grade, desktop-only web application for creating, managing, and taking exams and practice tests with robust offline support, accurate timers, and exam integrity features.

## 🚀 Features

### Core Functionality
- **Question Management**: Create and edit MCQ (single/multi-select) and free-text questions
- **Module System**: Organize questions into Exam or Practice modules
- **Tagging System**: Categorize and filter questions with tags
- **Offline-First**: Fully functional without internet connection using IndexedDB
- **Exam Integrity**: Browser lockdown features for secure exam taking
- **Timer System**: Accurate, tamper-resistant timers with cross-tab synchronization
- **Attempt Tracking**: Comprehensive per-question history and analytics
- **Data Management**: Import/export functionality with optional encryption

### Pages
1. **Home** - Dashboard with module cards (Exam and Practice buckets)
2. **Questions** - Question bank with advanced filtering and search
3. **Create/Edit Question** - Rich form for question creation and editing
4. **Settings** - Comprehensive configuration panel

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui components
- **State**: Zustand for global state management
- **Database**: IndexedDB via Dexie.js
- **Offline**: Service Worker (future implementation)
- **Testing**: Jest + React Testing Library + Playwright (future)
- **Desktop Packaging**: Electron (optional, instructions included)

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+ and npm
- Modern browser (Chrome, Firefox, Edge, Safari)
- Screen resolution: minimum 1280px width

### Quick Start

```bash
# Clone the repository
git clone <your-repo-url>
cd exammaster

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The app will be available at `http://localhost:8080`

### First Run
On first launch, the application will:
1. Initialize IndexedDB with default settings
2. Seed the database with 20 sample questions
3. Create 3 sample modules (1 practice, 2 exam)

## 🗄️ Database Schema

### IndexedDB Stores

#### `questions`
```typescript
{
  id: string;
  text: string;
  type: 'mcq' | 'text';
  options?: Array<{ id: string, text: string, image?: string }>;
  correctAnswers?: string[];
  tags: string[];
  modules: string[];
  explanation?: string;
  metadata: {
    difficulty?: 'easy' | 'medium' | 'hard';
    createdAt: number;
    updatedAt: number;
  };
}
```

#### `modules`
```typescript
{
  id: string;
  title: string;
  description?: string;
  type: 'exam' | 'practice';
  questionIds: string[];
  settings: {
    randomize: boolean;
    allowReview: boolean;
    allowBackNavigation: boolean;
    perModuleTimerMs?: number;
    perQuestionTimerMs?: number;
    maxVisibilityLosses?: number;
    autoSubmitOnVisibilityLoss: boolean;
  };
  tags: string[];
  metadata: {
    createdAt: number;
    updatedAt: number;
  };
}
```

#### `attempts`
```typescript
{
  id: string;
  moduleId: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  score?: number;
  perQuestionAttempts: Array<{
    questionId: string;
    userAnswer: string | string[];
    isCorrect?: boolean;
    timeTakenMs: number;
    timestamp: number;
    questionIndexInModule: number;
    attemptNumberForQuestion: number;
    integrityEvents: string[];
  }>;
  integrityEvents: IntegrityEvent[];
  syncStatus: 'local' | 'synced';
  userProfile?: { name?: string; email?: string };
  metadata: {
    browserInfo: string;
    completed: boolean;
  };
}
```

#### `integrityEvents`
```typescript
{
  id: string;
  attemptId: string;
  type: 'visibility_change' | 'focus_lost' | 'contextmenu' | 
        'keyboard_shortcut' | 'clock_tampering' | 'tab_opened';
  timestamp: number;
  details?: string;
}
```

#### `tags`
```typescript
{
  id: string;
  name: string;
  createdAt: number;
}
```

#### `settings`
```typescript
{
  id: string; // always '1'
  theme: 'light' | 'dark' | 'auto';
  examIntegrity: {
    requireFullscreen: boolean;
    autoSubmitOnTabChange: boolean;
    blockRightClick: boolean;
    maxVisibilityLosses: number;
    blockKeyboardShortcuts: boolean;
  };
  defaultModuleOptions: {
    timerDefault: number;
    randomizeDefault: boolean;
  };
  userProfile: { name?: string; email?: string };
  analytics: { enabled: boolean };
}
```

## ⏱️ Timer System Design

### Timer Accuracy & Synchronization

The timer system uses a multi-layered approach for accuracy:

1. **Monotonic Time Base**: Uses `performance.now()` for drift-free elapsed time
2. **UTC Reference**: Stores `Date.now()` at start for absolute time reference
3. **Clock Tampering Detection**: Compares system clock vs monotonic offset
4. **Cross-Tab Sync**: BroadcastChannel API synchronizes timer state across tabs
5. **Persistence**: Timer state saved to IndexedDB for crash recovery

### Implementation Details

**On Exam Start:**
```typescript
{
  startUtc: Date.now(),
  expectedDurationMs: 3600000, // e.g., 60 minutes
  localMonotonicOffset: Date.now() - performance.now(),
  remainingMs: 3600000
}
```

**Timer Worker** (future):
- Runs in Web Worker for accurate background timing
- Unaffected by main thread blocking
- Broadcasts updates via BroadcastChannel

**Cross-Tab Coordination:**
- First tab becomes "leader" via leader election
- New tabs sync by reading canonical start time
- Timer continues if leader tab closes

## 🔒 Exam Integrity Features

### Browser Lockdown (Best Effort)

⚠️ **Important**: Browser-based lockdown has inherent limitations. For stronger control, use Electron packaging.

**Implemented Features:**
- ✅ Fullscreen requirement (requestFullscreen API)
- ✅ Right-click/context menu blocking
- ✅ Keyboard shortcut interception (Ctrl+C, Ctrl+V, F12, etc.)
- ✅ Visibility change detection (tab switching, window minimize)
- ✅ Focus loss tracking
- ✅ Auto-submit on integrity violations
- ✅ Comprehensive event logging

**Known Limitations:**
- Cannot prevent Alt+Tab or OS-level task switching
- Cannot block system key combinations (Windows key, Cmd+Tab)
- Cannot detect virtual machines or external displays
- Cannot prevent screenshots (use Electron + native APIs for this)

### Integrity Event Tracking

All integrity events are logged with:
- Event type (visibility_change, focus_lost, etc.)
- Precise timestamp (UTC milliseconds)
- Context details
- Associated attempt ID

Events trigger configurable responses:
- Warning notification
- Auto-submit current question
- Auto-submit entire exam
- Exam termination

## 💾 Data Management

### Export/Import

**Export Format** (JSON):
```json
{
  "questions": [...],
  "modules": [...],
  "attempts": [...],
  "tags": [...],
  "settings": [...],
  "exportedAt": "2025-01-01T00:00:00.000Z"
}
```

**To Export:**
1. Go to Settings → Data Management
2. Click "Export Data"
3. JSON file will download automatically

**To Import:**
1. Go to Settings → Data Management
2. Click "Import Data"
3. Select your JSON backup file
4. Confirm - this will **replace all existing data**

### Clear All Data

Settings → Data Management → Clear All Data

⚠️ **Warning**: This is irreversible. Export your data first!

## 🎨 Design System

### Color Scheme
- **Primary**: Professional blue (HSL 212, 85%, 48%)
- **Accent**: Teal for interactivity (HSL 180, 65%, 48%)
- **Success**: Green for correct answers
- **Warning**: Orange for timer warnings
- **Destructive**: Red for errors and critical states

### Semantic Tokens
All components use semantic color tokens:
- `--primary`: Main brand color
- `--accent`: Interactive elements
- `--success`: Positive feedback
- `--warning`: Caution states
- `--destructive`: Errors and deletions
- `--exam-primary`: Exam-specific theming
- `--practice-primary`: Practice-specific theming

### Responsive Design
The app enforces desktop-only usage:
- **Minimum width**: 1280px
- Displays mobile warning on narrow screens
- Optimized for 1920x1080 and larger displays

## 🧪 Testing

### Unit Tests (Future)
```bash
npm run test
```

Tests will cover:
- Question CRUD operations
- Module creation and management
- Timer accuracy calculations
- Data import/export
- Integrity event logging

### E2E Tests (Future)
```bash
npm run test:e2e
```

Playwright tests will cover:
- Complete user flows
- Exam taking scenarios
- Timer behavior across tabs
- Data persistence
- Settings changes

## 📱 Desktop Packaging (Electron)

### Option 1: Electron Forge (Recommended)

```bash
# Install Electron
npm install --save-dev @electron-forge/cli

# Initialize Electron
npx electron-forge import

# Configure main.js with:
# - Fullscreen enforcement
# - Enhanced keyboard interception
# - System tray for exam status
# - Native notifications
# - Screen capture prevention

# Package
npm run make
```

### Option 2: Manual Electron Setup

Create `electron/main.js`:
```javascript
const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    kiosk: true, // Stricter than browser fullscreen
    webPreferences: {
      contextIsolation: true,
      enableRemoteModule: false,
    }
  });

  win.loadFile('dist/index.html');
  
  // Prevent window from being closed during exam
  win.on('close', (e) => {
    if (examInProgress) {
      e.preventDefault();
    }
  });
}

app.whenReady().then(createWindow);
```

**Benefits of Electron:**
- True kiosk mode
- Disable Task Manager access
- Prevent screenshots (setContentProtection)
- Stronger keyboard interception
- System-level lockdown

## 📊 Analytics & Reporting

### Current Implementation
- Per-question attempt history
- Module completion tracking
- Integrity event logging
- Database statistics

### Future Enhancements
- Visual analytics dashboard
- Performance charts (recharts)
- Spaced repetition recommendations
- Export to CSV for external analysis
- PDF report generation (jsPDF)

## 🔧 Configuration

### Environment Variables (Future)
Create `.env` file:
```
VITE_ENABLE_ANALYTICS=true
VITE_MAX_QUESTIONS_PER_MODULE=100
VITE_DEFAULT_TIMER_MS=3600000
```

### Build Configuration

**Vite Config** (`vite.config.ts`):
- React SWC for fast refresh
- Path aliases (@/)
- Development port: 8080

**Tailwind Config** (`tailwind.config.ts`):
- Custom color system
- Extended animation utilities
- Container configuration

## 🐛 Known Issues & Limitations

1. **Service Worker**: Not yet implemented - offline support is partial
2. **Exam Taking UI**: Core exam flow in progress
3. **Timer Worker**: Main thread implementation only (Web Worker planned)
4. **PDF Export**: Not yet implemented
5. **Encryption**: Backup encryption feature planned
6. **Browser Lockdown**: Limited by browser security model (see Electron)

## 📝 Development Roadmap

### Phase 1 (Current - v0.1)
- ✅ Core CRUD for questions
- ✅ Module management
- ✅ Settings panel
- ✅ IndexedDB schema
- ✅ Sample data seeding

### Phase 2 (In Progress - v0.2)
- 🔄 Exam taking UI
- 🔄 Timer implementation with Web Worker
- 🔄 Cross-tab synchronization
- 🔄 Exam integrity enforcement
- 🔄 Service Worker for offline support

### Phase 3 (Planned - v0.3)
- ⏳ Module creation UI
- ⏳ Advanced filtering and search
- ⏳ Analytics dashboard
- ⏳ PDF report generation
- ⏳ CSV export

### Phase 4 (Future - v1.0)
- ⏳ Electron packaging scripts
- ⏳ Automated tests (Jest + Playwright)
- ⏳ CI/CD pipeline
- ⏳ Backup encryption
- ⏳ Spaced repetition study mode

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file

## 🆘 Support & Troubleshooting

### Common Issues

**Database not seeding:**
- Check browser console for errors
- Clear IndexedDB manually: Dev Tools → Application → IndexedDB
- Refresh the page

**Timer drift:**
- Ensure system clock is accurate
- Check for browser throttling (DevTools Performance tab)
- Consider using Web Worker timer (future implementation)

**Exam integrity not working:**
- Some features require HTTPS
- Fullscreen may be blocked by browser policy
- Test in different browsers (Chrome recommended)

**Data loss:**
- Always export data regularly
- IndexedDB can be cleared by browser under storage pressure
- Consider using Electron for persistent storage

### Browser Compatibility

✅ **Recommended**: Chrome/Edge 90+, Firefox 88+
⚠️ **Partial**: Safari 14+ (some features limited)
❌ **Not Supported**: IE11, mobile browsers

## 📞 Contact

For questions, issues, or feature requests:
- GitHub Issues: [Repository URL]
- Email: support@exammaster.dev

---

**Built with ❤️ using React, TypeScript, and modern web technologies**
