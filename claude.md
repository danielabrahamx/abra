# claude.md: Abra Executive Protocol

## 1. System Mission
Abra is an Information Logistics System designed to eliminate communication asymmetry between management and cleaning teams via a mobile-optimized HTMX platform.

## 2. Engineering Constraints & Principles
- **Architecture:** Server-Side logic (Netlify Functions) with HTMX.
- **Persistence:** Local flat-file JSON storage (`data/schedule.json`). No external DBs.
- **Simplicity Principle:** Smallest code impact possible. Logic used in >1 place (e.g., URI-encoding or Date formatting) must be extracted to `/functions/lib/utils.js`.
- **Absolute Prohibitions:** No `alert()`/`console.log()` for users. No "Lorem Ipsum" text. No unauthorized npm packages.

## 3. Mandatory Workflow
1. **Analysis:** Compare request against `requirements.md` and `design-notes.md`.
2. **Traceability:** Update `tasks/todo.md` with specific task IDs.
3. **Activity Log:** Append every user prompt and technical change to `docs/activity.md`.
4. **HTML IDs:** Every interactive element MUST have a unique ID for targeting.

## 4. Verification Ritual
Before concluding any task:
1. Validate code against the Data Dictionary in `requirements.md`.
2. Ensure all HTMX `hx-target` attributes use specific CSS IDs (DD-MM-YYYY).
3. Confirm mobile touch targets are at least 48x48px.