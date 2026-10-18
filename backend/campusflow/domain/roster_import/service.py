"""Excel/CSV roster import — preview, then commit, never a silent write.

The rules this module implements:

* **No fixed spreadsheet layout.** College headers are aliased to canonical
  fields, and the caller may override every mapping explicitly, because no two
  colleges label "registration number" the same way.
* **Nothing is written during preview.** The file is parsed and every row is
  *classified* (valid, invalid, duplicate-in-file, conflicting, already
  existing) into ``staged_rows`` with an actionable reason.
* **The database is the authority.** Commit relies on the unique constraints on
  ``users.email`` / ``users.registration_number`` and on
  ``uq_enrollment_offering_student`` for correctness under concurrency; the
  pre-checks only produce better messages.
* **Idempotent by key.** A batch carries a unique ``idempotency_key``; submitting
  the same key returns the original result, and re-importing the same roster
  matches the existing accounts instead of duplicating them.
* **No credentials anywhere.** Staged rows, reports and audit records carry no
  password; imported accounts get a random temporary credential and
  ``must_change_password = True``.
"""

from __future__ import annotations

import csv
import io
import re
import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import ConflictError, NotFoundError, ValidationError
from campusflow.bedrock.audit.service import record_audit_event
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.models import Role, UserRole
from campusflow.domain.courses.access import assert_can_manage_offering
from campusflow.domain.courses.models import CourseOffering
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.roster_import.models import RosterImportBatch
from campusflow.domain.users.models import User
from campusflow.domain.users.service import normalize_registration_number

# ── Limits & vocabulary ─────────────────────────────────────────────────────
MAX_IMPORT_BYTES = 5 * 1024 * 1024
MAX_IMPORT_ROWS = 5000
MAX_CELL_CHARS = 512
ALLOWED_SUFFIXES = frozenset({".csv", ".xlsx"})
IMPORT_KINDS = frozenset({"student", "lecturer"})

#: Row classifications a preview can produce.
ROW_VALID = "valid"
ROW_INVALID = "invalid"
ROW_DUPLICATE = "duplicate"
ROW_CONFLICT = "conflict"
ROW_EXISTING = "existing"

_COMMITTABLE = frozenset({ROW_VALID, ROW_EXISTING})

#: Header aliasing. Keys are canonical field names; values are the normalized
#: spellings colleges actually put in cell A1. Matching is done on a
#: punctuation/space-stripped, lowercased version of the header.
_ALIASES: dict[str, tuple[str, ...]] = {
    "registration_number": (
        "registration", "registernumber", "registrationno", "registrationnumber",
        "regno", "rollno", "rollnumber", "roll", "admissionno", "admissionnumber",
        "studentid", "studentno", "matricno", "matriculationnumber", "enrollmentno",
    ),
    "first_name": ("firstname", "givenname", "fname", "forename"),
    "last_name": ("lastname", "surname", "familyname", "lname"),
    "full_name": ("name", "fullname", "studentname", "candidatename", "lecturername", "staffname"),
    "email": (
        "email", "emailaddress", "emailid", "mail", "collegeemail",
        "institutionalemail", "officialemail", "emailofthestudent",
    ),
    "department": ("department", "dept", "branch", "departmentname"),
    "course": ("course", "subject", "paper", "coursecode", "subjectcode"),
    "section": ("section", "class", "group", "division", "classgroup", "sectionname"),
    "academic_year": ("academicyear", "year", "admissionyear", "batch", "batchname", "yearofstudy"),
    "program": ("program", "programme", "degree", "degreeprogram"),
    "employee_code": ("employeecode", "empid", "staffid", "facultyid"),
    "phone": ("phone", "mobile", "contact", "phonenumber", "mobilenumber"),
}

#: Canonical fields that make sense for each import kind.
KIND_FIELDS: dict[str, tuple[str, ...]] = {
    "student": (
        "registration_number", "full_name", "first_name", "last_name", "email",
        "department", "course", "section", "academic_year", "program", "phone",
    ),
    "lecturer": (
        "full_name", "first_name", "last_name", "email", "employee_code",
        "department", "phone",
    ),
}

_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def normalize_header(value: str) -> str:
    """Strip case, spaces and punctuation so header aliasing is forgiving."""
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def sanitize_spreadsheet_cell(value: object) -> str:
    """Neutralise spreadsheet formula injection in any cell we generate.

    A cell that begins with ``= + - @`` (or a tab/CR) is executed as a formula by
    Excel and Sheets. Prefixing a single quote makes it inert while keeping the
    visible text intact.
    """
    text = "" if value is None else str(value)
    if text[:1] in _FORMULA_PREFIXES:
        return "'" + text
    return text


def resolve_mapping(
    headers: list[str],
    provided: dict[str, str] | None,
    *,
    kind: str,
) -> dict[str, str]:
    """Map canonical field → source column, honouring an explicit override.

    Aliasing guesses; ``provided`` wins. Only canonical fields valid for the
    kind are kept.
    """
    allowed = set(KIND_FIELDS[kind])
    by_normalized = {normalize_header(h): h for h in headers if h}
    mapping: dict[str, str] = {}

    for canonical, aliases in _ALIASES.items():
        if canonical not in allowed:
            continue
        for alias in aliases:
            if alias in by_normalized:
                mapping[canonical] = by_normalized[alias]
                break

    for canonical, source in (provided or {}).items():
        if canonical not in allowed or not source:
            continue
        if source in headers:
            mapping[canonical] = source

    return mapping


def parse_tabular(filename: str | None, content: bytes) -> tuple[list[str], list[list[str]]]:
    """Read CSV or XLSX into ``(headers, rows)`` as strings.

    XLSX is opened read-only and ``data_only``: a formula cell yields its cached
    value, never an evaluation, so a hostile sheet cannot make us run anything.
    """
    suffix = "." + (filename or "").rsplit(".", 1)[-1].lower() if "." in (filename or "") else ""
    if suffix not in ALLOWED_SUFFIXES:
        raise ValidationError(
            "Unsupported file type. Upload a .csv or .xlsx roster "
            f"(received '{filename or 'unknown'}')."
        )

    if suffix == ".xlsx":
        try:
            from openpyxl import load_workbook
        except ImportError as exc:  # pragma: no cover - depends on deployment
            raise ValidationError(
                "Excel support is not installed on this server; upload a CSV roster."
            ) from exc
        try:
            workbook = load_workbook(
                io.BytesIO(content), read_only=True, data_only=True
            )
            sheet = workbook.active
            raw_rows = [
                [("" if cell is None else str(cell)) for cell in row]
                for row in sheet.iter_rows(values_only=True)
            ]
            workbook.close()
        except Exception as exc:
            raise ValidationError(f"The Excel file could not be read: {exc}") from exc
    else:
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValidationError("The CSV file must be UTF-8 encoded.") from exc
        try:
            raw_rows = [list(row) for row in csv.reader(io.StringIO(text))]
        except csv.Error as exc:
            raise ValidationError(f"The CSV file is malformed: {exc}") from exc

    raw_rows = [row for row in raw_rows if any((cell or "").strip() for cell in row)]
    if not raw_rows:
        raise ValidationError("The uploaded file contains no rows.")

    headers = [(cell or "").strip() for cell in raw_rows[0]]
    if not any(headers):
        raise ValidationError("The uploaded file has an empty header row.")

    # Guard against a hostile/pathological sheet: cap rows and cell size.
    data_rows = raw_rows[1:]
    if len(data_rows) > MAX_IMPORT_ROWS:
        raise ValidationError(
            f"Roster has {len(data_rows)} rows; the limit per import is {MAX_IMPORT_ROWS}."
        )
    truncated = [
        [(cell or "")[:MAX_CELL_CHARS] for cell in row] for row in data_rows
    ]
    return headers, truncated


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(str(value).split())
    return cleaned or None


def _split_full_name(full_name: str | None) -> tuple[str | None, str | None]:
    if not full_name:
        return None, None
    parts = full_name.split()
    if len(parts) == 1:
        return parts[0], None
    return parts[0], " ".join(parts[1:])


def _coerce_year(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"(19|20)\d{2}", value)
    return int(match.group(0)) if match else None


class _RowOutcome:
    __slots__ = ("status", "reason", "user_id", "payload")

    def __init__(self, status: str, reason: str | None = None, user_id: str | None = None,
                 payload: dict | None = None):
        self.status = status
        self.reason = reason
        self.user_id = user_id
        self.payload = payload or {}


def _normalize_row(raw: dict[str, str], headers: list[str], mapping: dict[str, str]) -> dict:
    def value(canonical: str) -> str | None:
        source = mapping.get(canonical)
        if source is None or source not in headers:
            return None
        return _clean(raw.get(source))

    full_name = value("full_name")
    first = value("first_name")
    last = value("last_name")
    if not first and not last and full_name:
        first, last = _split_full_name(full_name)

    return {
        "registration_number": normalize_registration_number(value("registration_number")),
        "first_name": first,
        "last_name": last,
        "email": (value("email") or "").lower() or None,
        "department": value("department"),
        "course": value("course"),
        "section": value("section"),
        "academic_year": _coerce_year(value("academic_year")),
        "program": value("program"),
        "employee_code": normalize_registration_number(value("employee_code")),
        "phone": value("phone"),
    }


def _validate(kind: str, normalized: dict) -> str | None:
    """Return a human-readable reason the row cannot be imported, or ``None``."""
    if not normalized["first_name"]:
        return "Missing student/lecturer name (no name, first name or surname column matched)."
    if kind == "student":
        if not normalized["registration_number"] and not normalized["email"]:
            return (
                "No identity: provide a registration number or an institution email "
                "column (or map one explicitly)."
            )
    else:
        if not normalized["email"]:
            return "Lecturer rows require an institutional email address."
    return None


async def preview_import(
    db: AsyncSession,
    *,
    kind: str,
    filename: str | None,
    content: bytes,
    offering_id: uuid.UUID | None,
    mapping: dict[str, str] | None,
    idempotency_key: str | None,
    current_user: User,
) -> RosterImportBatch:
    """Parse, classify and stage an import. Writes no account or enrolment."""
    if kind not in IMPORT_KINDS:
        raise ValidationError("Import kind must be 'student' or 'lecturer'.")
    if not content:
        raise ValidationError("The uploaded file is empty.")
    if len(content) > MAX_IMPORT_BYTES:
        raise ValidationError(
            f"The uploaded file is {len(content)} bytes; the limit is {MAX_IMPORT_BYTES}."
        )

    key = idempotency_key or str(uuid.uuid4())
    existing_batch = await _batch_by_key(db, key)
    if existing_batch is not None:
        # Same submission retried: hand back the original classification rather
        # than staging (and later importing) the roster a second time.
        return existing_batch

    offering: CourseOffering | None = None
    if offering_id is not None:
        offering = await db.get(CourseOffering, offering_id)
        if offering is None:
            raise NotFoundError("Course offering not found")
        await assert_can_manage_offering(
            db,
            current_user,
            offering_id,
            purpose="section roster import",
            allow_exam_bureau=True,
        )

    headers, rows = parse_tabular(filename, content)
    resolved_mapping = resolve_mapping(headers, mapping, kind=kind)
    if not resolved_mapping:
        raise ValidationError(
            "None of the spreadsheet columns could be matched to roster fields. "
            "Provide an explicit column mapping."
        )
    if kind == "student" and offering is None and "registration_number" not in resolved_mapping:
        # Without a section there is nothing to enrol into and no stable key.
        raise ValidationError(
            "A student roster needs a target section, or a registration-number column."
        )

    staged: list[dict] = []
    seen_registration: dict[str, int] = {}
    seen_email: dict[str, int] = {}
    counts = {ROW_VALID: 0, ROW_INVALID: 0, ROW_DUPLICATE: 0, ROW_CONFLICT: 0, ROW_EXISTING: 0}

    for offset, raw in enumerate(rows):
        row_number = offset + 2  # 1-based, +1 for the header row
        raw_map = {
            header: (raw[index] if index < len(raw) else "")
            for index, header in enumerate(headers)
            if header
        }
        normalized = _normalize_row(raw_map, headers, resolved_mapping)

        reason = _validate(kind, normalized)
        if reason:
            outcome = _RowOutcome(ROW_INVALID, reason)
        elif normalized["registration_number"] and normalized["registration_number"] in seen_registration:
            outcome = _RowOutcome(
                ROW_DUPLICATE,
                f"Registration number already in this file (row "
                f"{seen_registration[normalized['registration_number']]}).",
            )
        elif normalized["email"] and normalized["email"] in seen_email:
            outcome = _RowOutcome(
                ROW_DUPLICATE,
                f"Email already in this file (row {seen_email[normalized['email']]}).",
            )
        else:
            if normalized["registration_number"]:
                seen_registration[normalized["registration_number"]] = row_number
            if normalized["email"]:
                seen_email[normalized["email"]] = row_number
            outcome = await _classify_existing(
                db, kind=kind, normalized=normalized, offering=offering
            )

        counts[outcome.status] += 1
        staged.append(
            {
                "row": row_number,
                "status": outcome.status,
                "reason": outcome.reason,
                "user_id": outcome.user_id,
                "normalized": normalized,
            }
        )

    batch = RosterImportBatch(
        kind=kind,
        status="previewed",
        source_filename=filename,
        course_offering_id=offering_id,
        column_mapping=resolved_mapping,
        summary={
            "total_rows": len(staged),
            "valid": counts[ROW_VALID],
            "existing": counts[ROW_EXISTING],
            "invalid": counts[ROW_INVALID],
            "duplicate": counts[ROW_DUPLICATE],
            "conflict": counts[ROW_CONFLICT],
            "committable": counts[ROW_VALID] + counts[ROW_EXISTING],
            "skipped": counts[ROW_INVALID] + counts[ROW_DUPLICATE] + counts[ROW_CONFLICT],
        },
        staged_rows=staged,
        idempotency_key=key,
        created_by_id=current_user.id,
    )
    db.add(batch)
    try:
        await db.commit()
    except IntegrityError:
        # A concurrent preview with the same key won; return theirs.
        await db.rollback()
        raced = await _batch_by_key(db, key)
        if raced is None:
            raise
        return raced
    await db.refresh(batch)
    return batch


async def _classify_existing(
    db: AsyncSession,
    *,
    kind: str,
    normalized: dict,
    offering: CourseOffering | None,
) -> _RowOutcome:
    """Match the row against existing accounts and enrolments."""
    user: User | None = None
    if normalized["registration_number"]:
        res = await db.execute(
            select(User).where(
                User.registration_number == normalized["registration_number"],
                User.deleted_at.is_(None),
            )
        )
        user = res.scalar_one_or_none()
    if user is None and normalized["email"]:
        res = await db.execute(
            select(User).where(User.email == normalized["email"], User.deleted_at.is_(None))
        )
        user = res.scalar_one_or_none()

    # Guard against two different accounts collapsing onto one identity: the
    # registration number matched one user while the email belongs to another.
    if (
        user is not None
        and normalized["registration_number"]
        and normalized["email"]
        and user.email != normalized["email"]
    ):
        other = await db.execute(
            select(User).where(User.email == normalized["email"], User.deleted_at.is_(None))
        )
        other_user = other.scalar_one_or_none()
        if other_user is not None and other_user.id != user.id:
            return _RowOutcome(
                ROW_CONFLICT,
                "The registration number and the email belong to two different "
                "accounts; resolve them before importing.",
            )

    if offering is None or kind != "student" or user is None:
        if user is None:
            return _RowOutcome(ROW_VALID)
        return _RowOutcome(ROW_EXISTING, "Account already exists.", user_id=str(user.id))

    # A section in this course+term different from the target is a *conflict*, not
    # a silent transfer: moving a student between sections is a deliberate act.
    conflict_res = await db.execute(
        select(Enrollment, CourseOffering)
        .join(CourseOffering, CourseOffering.id == Enrollment.course_offering_id)
        .where(
            Enrollment.student_id == user.id,
            Enrollment.status == "enrolled",
            Enrollment.course_offering_id != offering.id,
            CourseOffering.course_id == offering.course_id,
            CourseOffering.academic_term_id == offering.academic_term_id,
        )
    )
    conflict_row = conflict_res.first()
    if conflict_row is not None:
        other_offering = conflict_row[1]
        return _RowOutcome(
            ROW_CONFLICT,
            f"Already enrolled in section {other_offering.section} of the same course "
            "and term. Transfer the student explicitly instead of importing them here.",
            user_id=str(user.id),
        )

    already = await db.execute(
        select(Enrollment).where(
            Enrollment.course_offering_id == offering.id,
            Enrollment.student_id == user.id,
        )
    )
    if already.scalar_one_or_none() is not None:
        return _RowOutcome(
            ROW_EXISTING, "Already enrolled in this section.", user_id=str(user.id)
        )
    return _RowOutcome(ROW_EXISTING, "Account exists; will enrol in this section.",
                       user_id=str(user.id))


async def commit_import(
    db: AsyncSession,
    *,
    batch_id: uuid.UUID,
    current_user: User,
) -> RosterImportBatch:
    """Write the staged, committable rows in one all-or-nothing transaction."""
    batch = await db.get(RosterImportBatch, batch_id)
    if batch is None:
        raise NotFoundError("Roster import batch not found")
    if batch.status == "committed":
        return batch  # Idempotent: a retried commit changes nothing.

    offering: CourseOffering | None = None
    if batch.course_offering_id is not None:
        offering = await db.get(CourseOffering, batch.course_offering_id)
        if offering is None:
            raise NotFoundError(
                "The target section no longer exists; nothing was imported."
            )

    created_users = 0
    created_enrollments = 0
    assignments = 0

    # Everything that writes — row loop, audit entry, commit — sits inside one
    # guard. A unique-constraint refusal can surface on a flush deep inside the
    # loop (two concurrent imports of the same roster), not only on the final
    # commit, and it must roll the *whole* batch back and report a conflict.
    try:
        for row in batch.staged_rows:
            if row.get("status") not in _COMMITTABLE:
                continue
            normalized = row.get("normalized") or {}
            user, was_created = await _find_or_create_user(
                db, kind=batch.kind, normalized=normalized
            )
            if user is None:
                continue
            if was_created:
                created_users += 1

            if batch.kind == "student" and offering is not None:
                enrollment = await db.execute(
                    select(Enrollment).where(
                        Enrollment.course_offering_id == offering.id,
                        Enrollment.student_id == user.id,
                    )
                )
                existing = enrollment.scalar_one_or_none()
                if existing is None:
                    db.add(
                        Enrollment(
                            course_offering_id=offering.id,
                            student_id=user.id,
                            status="enrolled",
                        )
                    )
                    created_enrollments += 1
                elif existing.status != "enrolled":
                    existing.status = "enrolled"
                    created_enrollments += 1
                row["user_id"] = str(user.id)

            if batch.kind == "lecturer" and offering is not None:
                from campusflow.domain.courses.models import FacultyAssignment

                assigned = await db.execute(
                    select(FacultyAssignment).where(
                        FacultyAssignment.course_offering_id == offering.id,
                        FacultyAssignment.faculty_id == user.id,
                    )
                )
                if assigned.scalar_one_or_none() is None:
                    db.add(
                        FacultyAssignment(
                            course_offering_id=offering.id,
                            faculty_id=user.id,
                            role="additional",
                        )
                    )
                    assignments += 1

        batch.summary = {
            **(batch.summary or {}),
            "created_users": created_users,
            "created_enrollments": created_enrollments,
            "created_assignments": assignments,
        }
        batch.status = "committed"
        batch.committed_at = datetime.now(UTC)

        await record_audit_event(
            db=db,
            user_id=current_user.id,
            user_email=current_user.email,
            action="roster_import.commit",
        resource_type="roster_import_batch",
        resource_id=str(batch.id),
        extra_data={
            "kind": batch.kind,
            "course_offering_id": str(batch.course_offering_id) if batch.course_offering_id else None,
            "created_users": created_users,
                "created_enrollments": created_enrollments,
                "created_assignments": assignments,
                "source_filename": batch.source_filename,
            },
        )
        await db.commit()
    except IntegrityError as exc:
        # The unique constraints rejected a row that appeared valid at preview
        # time (typically a concurrent import of the same roster). Roll back the
        # whole batch: a partially imported roster is worse than none.
        await db.rollback()
        raise ConflictError(
            "The import conflicted with an account or enrolment created in the "
            "meantime. Nothing was imported; re-run the preview and commit again."
        ) from exc
    await db.refresh(batch)
    return batch


async def _find_or_create_user(
    db: AsyncSession, *, kind: str, normalized: dict
) -> tuple[User | None, bool]:
    """Resolve an account by registration number then email, creating it if new.

    Returns ``(user, created)``. Deliberately does **not** commit and does not use
    ``assign_role_to_user`` (which commits): the whole batch must stay inside one
    transaction so a later failure rolls every account back.
    """
    registration = normalized.get("registration_number")
    email = normalized.get("email")

    if registration:
        res = await db.execute(
            select(User).where(
                User.registration_number == registration, User.deleted_at.is_(None)
            )
        )
        found = res.scalar_one_or_none()
        if found is not None:
            return found, False
    if email:
        res = await db.execute(
            select(User).where(User.email == email, User.deleted_at.is_(None))
        )
        found = res.scalar_one_or_none()
        if found is not None:
            return found, False
    if not email:
        # Cannot create an account without a login identifier.
        return None, False

    user = User(
        email=email,
        hashed_password=get_password_hash(secrets.token_urlsafe(32)),
        first_name=normalized.get("first_name") or "Student",
        last_name=normalized.get("last_name") or "Imported",
        phone=normalized.get("phone"),
        status="active",
        registration_number=registration,
        admission_year=normalized.get("academic_year"),
        must_change_password=True,
    )
    db.add(user)
    await db.flush()

    role_name = "student" if kind == "student" else "faculty"
    role_res = await db.execute(select(Role).where(Role.name == role_name))
    role = role_res.scalar_one_or_none()
    if role is not None:
        db.add(
            UserRole(
                user_id=user.id,
                role_id=role.id,
                scope_type="institution",
                scope_id=None,
            )
        )
    return user, True


async def _batch_by_key(db: AsyncSession, key: str) -> RosterImportBatch | None:
    res = await db.execute(
        select(RosterImportBatch).where(RosterImportBatch.idempotency_key == key)
    )
    return res.scalar_one_or_none()


async def list_imports(db: AsyncSession, *, limit: int = 50) -> list[RosterImportBatch]:
    res = await db.execute(
        select(RosterImportBatch)
        .order_by(RosterImportBatch.created_at.desc())
        .limit(limit)
    )
    return list(res.scalars().all())


def render_report_csv(batch: RosterImportBatch) -> str:
    """Row-level report; every generated cell is injection-sanitised."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "row",
            "status",
            "registration_number",
            "email",
            "name",
            "section",
            "action",
            "reason",
        ]
    )
    for row in batch.staged_rows or []:
        normalized = row.get("normalized") or {}
        name = " ".join(
            part for part in (normalized.get("first_name"), normalized.get("last_name")) if part
        ).strip()
        writer.writerow(
            [
                sanitize_spreadsheet_cell(row.get("row")),
                sanitize_spreadsheet_cell(row.get("status")),
                sanitize_spreadsheet_cell(normalized.get("registration_number")),
                sanitize_spreadsheet_cell(normalized.get("email")),
                sanitize_spreadsheet_cell(name),
                sanitize_spreadsheet_cell(normalized.get("section")),
                sanitize_spreadsheet_cell(
                    "import" if row.get("status") in _COMMITTABLE else "skipped"
                ),
                sanitize_spreadsheet_cell(row.get("reason")),
            ]
        )
    return buffer.getvalue()
