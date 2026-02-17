# requirements.md: System Requirements Specification

## 1. Functional Requirements
- **FR-101:** Store a 7-day schedule in `schedule.json` using `DD-MM-YYYY` keys.
- **FR-102:** "Soft Delete" logic for cancellations: update `status` field to 'cancelled' (do not delete).
- **FR-103:** Generate deep-links to Google Maps with proper URI encoding.

## 2. Data Dictionary (schedule.json)
- **Date (Key):** String `DD-MM-YYYY` (e.g., "17-02-2026").
- **Team_ID (Key):** String, e.g., "Team_A", "Team_B".
- **Address_Object:**
  - `id`: String (UUID).
  - `street`: String.
  - `house_number`: String.
  - `status`: Enum ["pending", "completed", "cancelled"].
  - `maps_url`: String (auto-generated).

## 3. Performance & Usability
- **NFR-201:** Touch targets ≥ 48x48px.
- **NFR-202:** Page load < 1.5s on 4G.