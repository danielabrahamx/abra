# design-notes.md: Functional Design & UX

## 1. HTMX Interface Contract (Strict DD-MM-YYYY)
- **Day-Column Targeting:** Use `id="day-col-{DD-MM-YYYY}"`.
- **Team Section Targeting:** Use `id="team-{team_id}-{DD-MM-YYYY}"`.
- **Convention:** All `hx-target` must use CSS IDs (e.g., `#day-col-25-12-2024`), not classes.

## 2. Operational Logic
- **Worker View Polling:** Use `hx-trigger="every 60s, visibility:visible"`. Cease polling when the tab is backgrounded.
- **Manager Feedback:** Implement DOM-based toast notifications for all save/delete actions.

## 3. Worker Interface
- **Mobile Cards:** High-contrast borders, large typography.
- **Primary Action:** "Launch Navigation" (Deep-link to Google Maps). 48x48px minimum hit area.