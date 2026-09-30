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
