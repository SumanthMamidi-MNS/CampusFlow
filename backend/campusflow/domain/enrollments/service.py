import csv
import io
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import ConflictError, NotFoundError
from campusflow.domain.courses.models import CourseOffering
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.enrollments.schemas import BulkEnrollResult, EnrollmentResponse
from campusflow.domain.users.models import User


async def enroll_student(
    db: AsyncSession, offering_id: uuid.UUID, student_id: uuid.UUID
) -> Enrollment:
    # Verify offering
    off_res = await db.execute(select(CourseOffering).where(CourseOffering.id == offering_id))
    if not off_res.scalar_one_or_none():
        raise NotFoundError("Course offering not found.")

    # Verify student
    usr_res = await db.execute(select(User).where(User.id == student_id, User.deleted_at.is_(None)))
    if not usr_res.scalar_one_or_none():
        raise NotFoundError("Student user not found.")

    # Check existing enrollment
    existing = await db.execute(
        select(Enrollment).where(
            Enrollment.course_offering_id == offering_id,
            Enrollment.student_id == student_id,
        )
    )
    enr = existing.scalar_one_or_none()
    if enr:
        if enr.status == "enrolled":
            raise ConflictError("Student is already actively enrolled in this course offering.")
        enr.status = "enrolled"
        await db.commit()
        await db.refresh(enr)
        return enr

    new_enr = Enrollment(
        course_offering_id=offering_id,
        student_id=student_id,
        status="enrolled",
    )
    db.add(new_enr)
    await db.commit()
    await db.refresh(new_enr)
    return new_enr


async def drop_student(db: AsyncSession, offering_id: uuid.UUID, student_id: uuid.UUID) -> None:
    res = await db.execute(
        select(Enrollment).where(
            Enrollment.course_offering_id == offering_id,
            Enrollment.student_id == student_id,
        )
    )
    enr = res.scalar_one_or_none()
    if not enr:
        raise NotFoundError("Enrollment not found.")
    enr.status = "dropped"
    await db.commit()


async def list_enrolled_students(
    db: AsyncSession, offering_id: uuid.UUID
) -> list[EnrollmentResponse]:
    stmt = (
        select(Enrollment, User)
        .join(User, User.id == Enrollment.student_id)
        .where(Enrollment.course_offering_id == offering_id)
        .order_by(User.last_name, User.first_name)
    )
    res = await db.execute(stmt)
    rows = res.all()

    return [
        EnrollmentResponse(
            id=enr.id,
            course_offering_id=enr.course_offering_id,
            student_id=enr.student_id,
            first_name=u.first_name,
            last_name=u.last_name,
            email=u.email,
            status=enr.status,
            enrolled_at=enr.enrolled_at,
        )
        for enr, u in rows
    ]


async def bulk_enroll_students(
    db: AsyncSession, offering_id: uuid.UUID, csv_content: str
) -> BulkEnrollResult:
    reader = csv.DictReader(io.StringIO(csv_content))
    enrolled = 0
    skipped = 0
    errors = []

    for idx, row in enumerate(reader, start=1):
        email = row.get("email", "").strip().lower()
        if not email:
            skipped += 1
            errors.append({"row": idx, "email": "", "error": "Email column missing"})
            continue

        u_res = await db.execute(select(User).where(User.email == email, User.deleted_at.is_(None)))
        student = u_res.scalar_one_or_none()
        if not student:
            skipped += 1
            errors.append({"row": idx, "email": email, "error": "Student account not found"})
            continue

        try:
            await enroll_student(db, offering_id, student.id)
            enrolled += 1
        except ConflictError:
            skipped += 1
            errors.append({"row": idx, "email": email, "error": "Already enrolled"})
        except Exception as e:
            skipped += 1
            errors.append({"row": idx, "email": email, "error": str(e)})

    return BulkEnrollResult(
        total_processed=enrolled + skipped,
        enrolled_count=enrolled,
        skipped_count=skipped,
        errors=errors,
    )
