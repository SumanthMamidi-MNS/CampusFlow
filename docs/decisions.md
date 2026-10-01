# Architectural Decision Records (ADR)

This document records the foundational architectural and technical decisions made for CampusFlow.

---

### ADR-001: Modular Monolith Architecture
* **Status:** Accepted
* **Context:** A college LMS and examination platform requires strong relational consistency across users, courses, enrollments, and examinations. Distributed microservices introduce network latency, distributed transactions, deployment overhead, and complex maintenance without justifiable benefit for a single-institution system.
* **Decision:** Adopt a modular monolith backend architecture. Organize code strictly by domain boundaries with internal service interfaces and isolate generic infrastructure in a reusable `bedrock` foundation layer.
* **Consequences:** Simple single-process deployment and local development. Clear extraction path if specific modules ever need to be isolated into independent services.

---

### ADR-002: Single Page Application (SPA) with Decoupled REST API
* **Status:** Accepted
* **Context:** The examination engine requires robust client-side state management, local question caching, millisecond-accurate client timers, and immediate resilience against intermittent network drops.
* **Decision:** Decouple the frontend as a React Single Page Application (SPA) consuming a versioned RESTful JSON API.
* **Consequences:** The frontend can be hosted independently or served via high-performance static file caches. The API serves as a clean contract for future native mobile clients or external LMS integrations (LTI).

---

### ADR-003: Observable Rule-Based Proctoring over AI/Biometric Surveillance
* **Status:** Accepted
* **Context:** Commercial AI proctoring tools introduce significant student privacy violations, false-positive bias, high bandwidth demands, and legal/regulatory liabilities.
* **Decision:** Implement observable, client-telemetry proctoring based on browser events (tab switches, window blur, resize detection, clipboard interception, fullscreen monitoring) paired with server-side duration enforcement and faculty audit review.
* **Consequences:** Eliminates webcam streaming costs and privacy compliance liabilities while providing actionable audit logs of test-taking behavior.

---

### ADR-004: PostgreSQL as the Primary Data Store
* **Status:** Accepted
* **Context:** CampusFlow models complex relational data (enrollments, grading hierarchies, question banks) alongside semi-structured examination configurations and proctoring event logs.
* **Decision:** Use PostgreSQL 15+ as the single database engine. Utilize standard relational tables for core academic entities and `JSONB` for polymorphic question options, configuration payloads, and proctoring event details.
* **Consequences:** Eliminates the operational complexity of managing dual datastores (e.g. relational + document DB) while retaining relational integrity and flexible JSON querying.

---

### ADR-005: UUID Primary Keys
* **Status:** Accepted
* **Context:** Sequential auto-increment integer IDs expose business metrics, allow easy ID enumeration attacks, and complicate distributed data migrations.
* **Decision:** Use UUIDs as the primary key format across all entities.
* **Consequences:** Safe exposure of IDs in API routes and client-side URLs. Prevents enumeration vulnerabilities and ensures migration portability.

---

### ADR-006: Internal Reusable Foundation ("Bedrock")
* **Status:** Accepted
* **Context:** The foundational subsystems (authentication, RBAC, audit logs, file storage, email, error handling) are project-agnostic and will be reused in future systems. However, managing separate multi-repo packages early introduces release overhead.
* **Decision:** Keep the Bedrock foundation inside the repository under `campusflow/bedrock`, enforcing a strict architectural rule that Bedrock code never imports domain code.
* **Consequences:** Zero external package release overhead during initial development. Future extraction into a standalone package is straightforward and requires no restructuring of CampusFlow domain code.

---

### ADR-007: Tailwind CSS v4 & Institutional Light Theme
* **Status:** Accepted
* **Context:** Enterprise and academic platforms require clean readability, accessibility (WCAG 2.1 AA), and institutional branding customization rather than dark/hacker aesthetics.
* **Decision:** Standardize on Tailwind CSS v4 and Radix primitives (shadcn-compatible) with an institutional light theme driven by CSS custom properties.
* **Consequences:** Consistent, professional appearance with low CSS bundle overhead and easy institutional white-labeling.

---

### ADR-008: Multi-Signal Observable Proctoring & Automated Threshold Enforcement
* **Status:** Accepted
* **Context:** Remote and computer-based college examinations require high academic integrity without intrusive or opaque third-party proprietary desktop agents that impair portability.
* **Decision:** Implement observable browser telemetry combining visibility change, window blur timing, fullscreen tracking, clipboard interception, context-menu prevention, and devtools blocking. Log events with severity tags into append-only tables and enforce an automated violation threshold that triggers an auto-submit of the attempt once breached. Faculty are provided a chronological audit trail.
* **Consequences:** Highly portable across modern desktop browsers without proprietary native installer dependencies; provides clear, auditable evidence for academic dispute resolution.

---

### ADR-009: Institutional White-Labeling & Configurable Policy Architecture
* **Status:** Accepted
* **Context:** Different colleges and university faculties operate under diverse visual brand guidelines, timezones, and academic submission policies. Hardcoding institution attributes prevents portable deployments.
* **Decision:** Store institution identity (name, code, logo URL, brand accent color, timezone, contact info) and system policies (`allow_late_submissions`, `exam_strict_proctoring`, `max_login_attempts`) in a dedicated `institutions` table with administration API (`/api/v1/institution`) and frontend management workspace (`/admin/settings`).
* **Consequences:** Any institution can instantly customize branding and policies without code modification or redeployment.

---

### ADR-010: Bedrock Security Headers & Multi-Layer E2E Verification
* **Status:** Accepted
* **Context:** Production college LMS platforms handle sensitive examination material, student records, and grading audits, requiring defense-in-depth protections against clickjacking, MIME-confusion, and unauthorized framing.
* **Decision:** Implement `SecurityHeadersMiddleware` in the Bedrock foundation to automatically attach `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` to all outgoing HTTP responses. Back this with an end-to-end integration test suite (`test_e2e_production_flows.py`) verifying security headers, RBAC isolation, exam auto-grading, proctoring telemetry, and gradebook export.
* **Consequences:** Hardens the system against common web vulnerabilities at zero latency cost and guarantees regression-free deployment verification.

---

### ADR-011: Strict 6-Warning Escalation, Vision Gaze Detection & Faculty Re-Entry Architecture
* **Status:** Accepted
* **Context:** Remote exam takers may attempt subtle cheating methods including looking away towards secondary displays or peers, looking downward to read or write unauthorized cheat notes, switching applications, or sharing clips. Strict limits and clear re-entry protocols are essential for fair administration.
* **Decision:** 
  1. Enforce a strict 6-warning limit across all proctoring event vectors (both camera gaze analysis and browser lockdown events).
  2. Implement real-time camera-based heuristic computer-vision analysis on an offscreen HTML5 canvas to detect sideways gaze deviations (`side_viewing`) and downward tilt towards paper or desk (`looking_down`), with a biometric fallback HUD and interactive simulation suite.
  3. Warnings 1 to 5 trigger modal alert dialogues with remaining counts and an escalation meter.
  4. On the 6th warning, the exam canvas terminates immediately into a locked state (`locked_violation`).
  5. Resuming requires explicit faculty or proctor authorization via `POST /api/v1/exams/{exam_id}/attempts/{attempt_id}/unlock`.
  6. Answers are preserved continuously in local storage and debounced server sync, allowing full recovery without data loss once unlocked.
* **Consequences:** Provides a rigorous, human-aligned defense against subtle exam tampering while guaranteeing fairness through an explicit faculty appeal and unlock mechanism.

---

### ADR-012: Zero-Tolerance Mobile Phone Termination, High-Urgency Blinking Strobe Warnings & Faculty Live Invigilator Hub
* **Status:** Accepted
* **Context:** Mobile phones, unauthorized handheld devices, and browser back-navigation represent severe threats to exam integrity. Furthermore, candidates require continuous visual feedback of their own camera stream to maintain confidence, while faculty invigilators need simultaneous visibility over all active candidates without chaotic peer-to-peer student communications.
* **Decision:**
  1. **Zero-Tolerance Prohibited Device Policy:** Mobile phone detection (`mobile_phone_detected`, `phone_detected`, `unauthorized_device_detected`) immediately terminates the exam attempt, sets `violations_count = max_violations`, marks status as `locked_violation`, and requires faculty intervention to unlock.
  2. **High-Urgency Blinking Strobe Warning:** Viewport renders a persistent pulsing red strobe border (`animate-pulse border-8 border-rose-600 bg-rose-500/15`) and warning header upon security breaches to make violations unmissable.
  3. **Candidate Visual Clarity:** Provide a prominent "Self-View" header action and expandable 1080p modal detailing gaze telemetry, lighting quality, and device scan confirmation.
  4. **Fixed Position Lockdown:** Intercept `popstate` / `history.pushState` and `beforeunload` to lock the exam canvas in place and convert navigation attempts into auditable infractions.
  5. **Faculty Live Invigilator Hub:** Provide an 8-candidate real-time video wall with live telemetry, status badges, HD stream inspection, one-click re-entry authorization, and mass announcement broadcast.
  6. **Private 1-to-1 Invigilator Channel:** Replace peer messaging with a dedicated Proctor Help Desk strictly connecting candidate to invigilator.
* **Consequences:** Completely eliminates illicit device usage and browser escape routes, provides comprehensive real-time situational awareness for faculty, and removes student-to-student collusion risks.




