# tasks/todo.md: Abra Development Task Tracker

## Project Initialization
- [x] Read project documentation (claude.md, requirements.md, tech-stack.md, design-notes.md)
- [x] Create repository structure (/html, /functions, /data)
- [x] Initialize baseline data/schedule.json with DD-MM-YYYY format
- [x] Document initialization in tasks/todo.md and docs/activity.md

## Frontend Development
- [x] Create main HTML interface with HTMX
- [x] Implement day-column targeting with `id="day-col-{DD-MM-YYYY}"`
- [x] Implement team section targeting with `id="team-{team_id}-{DD-MM-YYYY}"`
- [x] Add Tailwind CSS styling for mobile-first design
- [ ] Integrate Lucide icons (Maps, Delete, Add)
- [x] Ensure all touch targets are ≥ 48x48px

## Backend Development
- [x] Create Netlify Functions for CRUD operations
- [x] Implement Read-Modify-Write pattern for schedule.json
- [x] Create utility functions in /functions/lib/utils.js
- [x] Implement soft delete logic (status='cancelled')
- [x] Generate Google Maps deep-links with URI encoding

## Worker Interface
- [x] Create mobile-optimized worker view
- [x] Implement polling with visibility-aware 60s interval
- [x] Add "Launch Navigation" primary action
- [x] High-contrast borders and large typography

## Manager Interface
- [x] Create manager dashboard
- [x] Implement DOM-based toast notifications
- [x] Add schedule management controls (drag-and-drop, quick-add, cancel)
- [x] Add 'Time Interval' field to Quick Add and Job Cards (Manager & Worker views)
- [x] Implement Hard Delete for jobs
- [x] Fix 'Clear All Assignments' race condition with batched API endpoint

## Testing & Verification
- [x] Validate all HTMX targets use CSS IDs
- [ ] Test mobile responsiveness
- [ ] Verify page load < 1.5s on 4G
- [x] Ensure no alert()/console.log() for users (console.error only for dev debugging)

## Deployment
- [x] Create netlify.toml with publish/functions config

---

## Verification Ritual — Final Review (2026-02-17)

### 1. Data Audit — schedule.json ✅
| Check | Result |
|-------|--------|
| DD-MM-YYYY key format | ✅ All 7 keys consistent: `17-02-2026` through `23-02-2026` |
| Team IDs | ✅ All entries use `Team_A` and `Team_B` |
| Address fields | ✅ `id`, `street`, `house_number`, `status`, `maps_url` present |
| Status enum | ✅ Values are `pending`, `completed`, or `cancelled` |
| Worker names | ✅ Only `Amylea` and `Angelo` (Team_A on 17-02), `Chloe` (Team_B on 17-02) — all match WORKER_ROSTER |

### 2. Interface Audit — Launch Navigation ✅
| Check | Result |
|-------|--------|
| `worker.html` `buildMapsURL()` | ✅ Uses `encodeURIComponent()` for query param |
| `utils.js` `buildMapsURL()` | ✅ Same encoding via `encodeURIComponent()` |
| `schedule.json` pre-computed `maps_url` | ✅ `%20` encoding correctly applied (e.g., `42%20Main%20Street`) |
| Touch target ≥ 48px | ✅ `.touch-target { min-height: 48px }` class applied |

### 3. Soft-Delete Audit — Cancelled Jobs ✅
| Check | Result |
|-------|--------|
| `schedule.json` Oak Avenue entry | ✅ `status: "cancelled"`, `assigned_workers` preserved (`["Amylea","Angelo"]`) |
| `worker.html` styling | ✅ `.job-cancelled { opacity: 0.5 }` + `.job-cancelled .job-address-text { text-decoration: line-through }` |
| `manager.html` styling | ✅ `.job-card.cancelled { opacity: 0.5 }` + `.job-card.cancelled .job-address { text-decoration: line-through }` |
| Cancel button hidden for cancelled jobs | ✅ Conditional render shows "Cancelled" label instead |
| Backend `cancelJob()` | ✅ Sets `status='cancelled'`, does NOT delete the record |

### 4. Deployment — netlify.toml ✅
| Setting | Value |
|---------|-------|
| `publish` | `html` |
| `functions` | `functions` |
| API redirect | `/api/get-schedule` → `/.netlify/functions/get-schedule` |
| API redirect | `/api/update-schedule` → `/.netlify/functions/update-schedule` |
| Security headers | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` |

### Observations / Notes
- `requirements.md` Data Dictionary does not yet list `assigned_workers` as a field, though it is fully implemented in code. Consider adding it for traceability.
- Lucide icons integration is still outstanding (emoji placeholders in use).
- `worker.html` uses JS-based polling (`setInterval` + `visibilitychange`) instead of HTMX `hx-trigger` — functionally equivalent but diverges from `design-notes.md` spec.
