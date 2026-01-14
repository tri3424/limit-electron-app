# ExamMaster - Design & Architecture Notes

## Overview

ExamMaster is designed as a desktop-first, offline-capable exam and practice platform with a focus on data integrity, accurate timing, and exam security.

## Architecture Decisions

### Why IndexedDB?

**Decision**: Use IndexedDB (via Dexie.js) for all data storage

**Reasoning**:
- **Offline-First**: Full functionality without server/network
- **Capacity**: Much larger storage limits than localStorage (typically >50MB)
- **Structured**: Proper database with indexes and queries
- **Transactional**: ACID compliance for data integrity
- **Async**: Non-blocking operations

**Trade-offs**:
- More complex than localStorage
- Browser can clear under storage pressure (mitigated by export/import)
- Requires polyfills for older browsers

### Timer System Design

#### Problem Statement
Need accurate, tamper-resistant timers that:
1. Continue running if user switches tabs
2. Persist across page reloads
3. Sync across multiple tabs/windows
4. Detect system clock manipulation
5. Handle browser throttling

#### Solution: Multi-Layered Timer

**Layer 1: Monotonic Time Base**
```typescript
// Use performance.now() for drift-free elapsed time
const elapsed = performance.now() - startPerformanceTime;
```

**Why**: `performance.now()` is monotonic (never goes backwards) and unaffected by system clock changes.

**Layer 2: UTC Reference Point**
```typescript
const startUtc = Date.now();
const localMonotonicOffset = startUtc - performance.now();
```

**Why**: Provides absolute time reference for cross-tab sync and persistence.

**Layer 3: Clock Tampering Detection**
```typescript
const expectedUtc = startUtc + elapsed;
const actualUtc = Date.now();
const drift = Math.abs(actualUtc - expectedUtc);

if (drift > THRESHOLD) {
  logIntegrityEvent('clock_tampering');
}
```

**Why**: Catches user attempts to manipulate system clock.

**Layer 4: Cross-Tab Synchronization**
```typescript
const channel = new BroadcastChannel('exam-timer');

// Leader tab broadcasts
channel.postMessage({
  type: 'timer_update',
  startUtc,
  remainingMs,
  monotonicOffset
});

// Follower tabs sync
channel.onmessage = (e) => {
  const { startUtc, monotonicOffset } = e.data;
  syncTimer(startUtc, monotonicOffset);
};
```

**Why**: Ensures consistent time across all tabs. Prevents timer reset by opening new tab.

**Layer 5: Persistence**
```typescript
// Save timer state periodically
await db.timerState.put({
  attemptId,
  startUtc,
  expectedDurationMs,
  localMonotonicOffset,
  lastSyncedAt: Date.now()
});
```

**Why**: Recovers timer after crash or page reload.

#### Future Enhancement: Web Worker Timer

Move timer logic to Web Worker to:
- Avoid main thread blocking
- Continue running during heavy computation
- Provide more accurate intervals

```typescript
// timer.worker.ts
let timerId: number;
let state: TimerState;

self.onmessage = (e) => {
  if (e.data.type === 'start') {
    state = e.data.state;
    timerId = setInterval(() => {
      const elapsed = performance.now() - state.startPerformance;
      const remaining = state.expectedDurationMs - elapsed;
      
      self.postMessage({
        type: 'tick',
        remainingMs: Math.max(0, remaining)
      });
      
      if (remaining <= 0) {
        self.postMessage({ type: 'expired' });
        clearInterval(timerId);
      }
    }, 100); // 100ms granularity
  }
};
```

### Exam Integrity Implementation

#### Browser Limitations

Modern browsers intentionally limit lockdown capabilities for security:
- **Cannot prevent**: Alt+Tab, Cmd+Tab, Task Manager
- **Cannot block**: System screenshots, external cameras
- **Cannot detect**: Virtual machines, external displays
- **Limited control**: Keyboard shortcuts vary by OS

#### Our Approach: Best-Effort + Logging

Instead of trying to perfectly prevent cheating (impossible in browser), we:

1. **Implement Best-Effort Prevention**
   - Fullscreen requirement
   - Keyboard shortcut blocking
   - Right-click prevention
   - Tab/window blur detection

2. **Comprehensive Event Logging**
   - Every integrity event is logged with timestamp
   - Events include context (e.g., which shortcut was attempted)
   - Logs are immutable and timestamped

3. **Graduated Response**
   - First violation: Warning
   - N violations: Auto-submit current question
   - N+X violations: Terminate exam

4. **Post-Exam Review**
   - Proctors can review integrity logs
   - Suspicious patterns flagged
   - Time-correlated with answers

5. **Electron Option for Stronger Control**
   - True kiosk mode
   - OS-level keyboard hooks
   - Screenshot prevention (setContentProtection)
   - Network blocking
   - Process whitelisting

#### Implementation Details

**Fullscreen Enforcement**:
```typescript
// Request fullscreen on exam start
await document.documentElement.requestFullscreen();

// Monitor fullscreen state
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && isExamActive) {
    logIntegrityEvent('fullscreen_exit');
    autoSubmitIfConfigured();
  }
});
```

**Keyboard Blocking**:
```typescript
const blockedKeys = [
  'F12', // DevTools
  'Control+Shift+I', // DevTools
  'Control+Shift+J', // Console
  'Control+C', // Copy
  'Control+V', // Paste
  'Control+X', // Cut
  'Control+A', // Select All
  'Control+P', // Print
  'Control+S', // Save
];

window.addEventListener('keydown', (e) => {
  const combo = [
    e.ctrlKey && 'Control',
    e.shiftKey && 'Shift',
    e.altKey && 'Alt',
    e.metaKey && 'Meta',
    e.key
  ].filter(Boolean).join('+');
  
  if (blockedKeys.includes(combo)) {
    e.preventDefault();
    logIntegrityEvent('keyboard_shortcut', combo);
  }
});
```

**Visibility Tracking**:
```typescript
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isExamActive) {
    logIntegrityEvent('visibility_change');
    
    if (settings.autoSubmitOnTabChange) {
      autoSubmitCurrentQuestion();
    }
    
    if (++visibilityLossCount > settings.maxVisibilityLosses) {
      terminateExam('Too many visibility losses');
    }
  }
});
```

### Data Model Design

#### Normalized vs Denormalized

**Decision**: Partially denormalized

**Reasoning**:
- IndexedDB doesn't support JOINs
- Faster reads (common operation)
- Acceptable duplication (questions in modules)

**Structure**:
- Questions are independent documents
- Modules store question IDs (normalized)
- Questions store module IDs for reverse lookup (denormalized)
- Tags are both separate entities and embedded in questions

**Example**:
```typescript
// Question knows its modules
question.modules = ['module1', 'module2'];

// Module knows its questions
module.questionIds = ['q1', 'q2', 'q3'];

// Bidirectional for fast lookups
```

#### Attempt History Storage

**Decision**: Hierarchical structure with embedded per-question attempts

**Reasoning**:
- Keeps related data together
- Easy to export entire attempt
- Fast retrieval for review
- Supports analytics queries via Dexie indexes

**Structure**:
```typescript
attempt = {
  id: 'attempt1',
  moduleId: 'module1',
  // ... metadata
  perQuestionAttempts: [
    {
      questionId: 'q1',
      userAnswer: ['opt2'],
      isCorrect: true,
      timeTakenMs: 23450,
      // ... per-question data
    }
  ],
  integrityEvents: [
    { type: 'visibility_change', timestamp: 1234567890 }
  ]
}
```

#### Why Not Separate IntegrityEvents Store?

**Current**: Events embedded in attempts
**Alternative**: Separate store with attemptId foreign key

**Rationale for Current Approach**:
- Events are always queried in context of attempt
- Embedding eliminates need for JOIN-like queries
- Export/import simpler
- No orphan events

**Rationale for Alternative** (future consideration):
- Large number of events could bloat attempt documents
- Separate querying of all events across attempts
- Could implement if event volume becomes issue

### State Management

#### Why Zustand?

**Decision**: Use Zustand for global state

**Reasoning**:
- **Simplicity**: Less boilerplate than Redux
- **TypeScript**: Excellent type inference
- **Performance**: Minimal re-renders
- **DevTools**: Time-travel debugging
- **Size**: <1KB gzipped

**What Goes in Zustand**:
- Current exam/practice attempt
- Timer state (for UI reactivity)
- UI state (sidebar open, filters)
- Transient state (not persisted)

**What Stays in IndexedDB**:
- All persistent data
- Questions, modules, attempts
- Settings
- Long-term state

**Pattern**:
```typescript
// Load from DB → Zustand → UI
const loadExam = async (moduleId) => {
  const module = await db.modules.get(moduleId);
  const questions = await db.questions.bulkGet(module.questionIds);
  
  useAppStore.setState({
    currentModule: module,
    currentQuestions: questions,
    currentQuestionIndex: 0
  });
};

// User action → Zustand → DB
const submitAnswer = async (answer) => {
  const state = useAppStore.getState();
  
  // Update Zustand for immediate UI feedback
  useAppStore.setState({
    currentAnswer: answer,
    isSubmitting: true
  });
  
  // Persist to DB
  await db.attempts.update(state.currentAttempt.id, {
    // ... update
  });
  
  useAppStore.setState({ isSubmitting: false });
};
```

### UI/UX Design Decisions

#### Desktop-Only Approach

**Decision**: Explicitly block mobile devices

**Reasoning**:
- Exam integrity requires keyboard shortcuts
- Sufficient screen space for question+options+timer
- Full keyboard for text answers
- Better focus (fewer mobile distractions)
- Easier to implement comprehensive lockdown

**Implementation**:
```typescript
// main.tsx
const MIN_DESKTOP_WIDTH = 1280;
const isDesktop = window.innerWidth >= MIN_DESKTOP_WIDTH;

render(isDesktop ? <App /> : <MobileWarning />);
```

#### Semantic Color Tokens

**Decision**: All colors via CSS custom properties

**Reasoning**:
- Theme switching (light/dark)
- Consistent design system
- Easy global updates
- Accessible (proper contrast)

**Pattern**:
```css
/* index.css */
:root {
  --primary: 212 85% 48%;
  --exam-primary: 210 100% 45%;
}

/* Component */
.exam-card {
  background: hsl(var(--exam-primary));
}
```

**Never**:
```css
.exam-card {
  background: #3B82F6; /* Hard-coded color */
}
```

#### Card-Based Layout

**Decision**: Dashboard uses card metaphor

**Reasoning**:
- Clear visual hierarchy
- Scannable information
- Consistent spacing
- Modern aesthetic
- Easy to extend (add new cards)

### Security Considerations

#### XSS Prevention

**Risk**: User-entered question text could contain scripts

**Mitigation**:
- React automatically escapes JSX content
- For Markdown/HTML (explanation field), use sanitization library
- Never use `dangerouslySetInnerHTML` without sanitization

```typescript
// Future: Add DOMPurify
import DOMPurify from 'dompurify';

<div dangerouslySetInnerHTML={{
  __html: DOMPurify.sanitize(question.explanation)
}} />
```

#### Data Integrity

**Risk**: Corrupted data from manual DB edits or bugs

**Mitigation**:
- Schema validation on read
- Try-catch around all DB operations
- Export/import validation
- Version field in DB schema (future)

#### Timer Tampering

**Risk**: User manipulates timer via:
- DevTools
- System clock changes
- Browser throttling bypass

**Mitigation**:
- Multi-layered timer (see Timer System Design)
- Clock tampering detection
- Web Worker for isolation (future)
- Server-side timer validation (future, if online mode added)

### Performance Optimizations

#### IndexedDB Query Strategy

**Pattern**:
```typescript
// ❌ Bad: Load all, filter in memory
const allQuestions = await db.questions.toArray();
const filtered = allQuestions.filter(q => q.tags.includes('Biology'));

// ✅ Good: Use index
const filtered = await db.questions
  .where('tags')
  .equals('Biology')
  .toArray();
```

#### Dexie React Hooks

**Pattern**:
```typescript
// Automatically re-renders when DB changes
const questions = useLiveQuery(() => 
  db.questions
    .where('type')
    .equals('mcq')
    .toArray()
);
```

**Why**: Eliminates manual subscription management

#### Lazy Loading

**Pattern** (future):
```typescript
// Only load questions when module is opened
const { data: questions } = useQuery(
  ['module-questions', moduleId],
  () => loadModuleQuestions(moduleId),
  { enabled: isModuleOpen }
);
```

### Offline Strategy

#### Current State: Partial Offline

**Working Offline**:
- App loads (after first visit)
- All CRUD operations
- Timer functionality
- Integrity tracking

**Not Yet Offline**:
- First load (Service Worker not implemented)
- Asset caching
- Background sync

#### Future: Full Offline with Service Worker

**Strategy**: Network First, Fallback to Cache

```typescript
// sw.js
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});
```

**Why**: Ensures fresh data when online, falls back to cached when offline

### Testing Strategy

#### Unit Tests

**What to Test**:
- Timer calculations
- Data validation
- Utility functions
- Store actions

**Example**:
```typescript
describe('Timer', () => {
  it('calculates remaining time correctly', () => {
    const start = performance.now();
    const duration = 60000;
    
    // Simulate 30s elapsed
    const elapsed = 30000;
    const remaining = calculateRemaining(start + elapsed, duration);
    
    expect(remaining).toBe(30000);
  });
  
  it('detects clock tampering', () => {
    const state = {
      startUtc: Date.now(),
      localMonotonicOffset: Date.now() - performance.now()
    };
    
    // Simulate clock jump
    jest.spyOn(Date, 'now').mockReturnValue(state.startUtc + 100000);
    
    expect(detectClockTampering(state)).toBe(true);
  });
});
```

#### Integration Tests

**What to Test**:
- Question CRUD flows
- Module creation
- Settings updates
- Data export/import

#### E2E Tests (Playwright)

**Critical Flows**:
1. Create question → Add to module → Start exam → Submit → Review results
2. Export data → Clear DB → Import data → Verify integrity
3. Multi-tab exam (timer sync)
4. Integrity event triggers

**Example**:
```typescript
test('exam timer syncs across tabs', async ({ context }) => {
  const page1 = await context.newPage();
  const page2 = await context.newPage();
  
  // Start exam in page1
  await page1.goto('/module/123/start');
  await page1.click('button:has-text("Start Exam")');
  
  // Open page2
  await page2.goto('/module/123/continue');
  
  // Verify timer is synced
  const time1 = await page1.locator('.timer').textContent();
  const time2 = await page2.locator('.timer').textContent();
  
  expect(Math.abs(parseTime(time1) - parseTime(time2))).toBeLessThan(1000);
});
```

## Future Enhancements

### Phase 2: Core Exam Experience
- [ ] Exam taking UI with question navigation
- [ ] Timer worker implementation
- [ ] Real-time cross-tab sync
- [ ] Service Worker for full offline

### Phase 3: Advanced Features
- [ ] Module creation wizard
- [ ] Question bank import (CSV)
- [ ] Analytics dashboard
- [ ] PDF report generation
- [ ] Spaced repetition

### Phase 4: Enterprise Features
- [ ] Electron packaging
- [ ] Enhanced lockdown (native)
- [ ] Multi-user support
- [ ] LMS integration
- [ ] Remote proctoring hooks

## Conclusion

ExamMaster is built with a focus on:
- **Reliability**: Offline-first, data integrity, crash recovery
- **Accuracy**: Tamper-resistant timers, clock tampering detection
- **Security**: Exam integrity features, event logging, gradual lockdown
- **Usability**: Clean UI, semantic colors, accessible design
- **Extensibility**: Modular architecture, clear separation of concerns

The architecture supports growth from a single-user desktop app to a potential enterprise exam platform while maintaining code quality and user experience.
