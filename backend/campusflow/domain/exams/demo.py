"""Demo examination and demo onboarding.

The institution asked for a way to *see* the examination experience — camera
check, integrity warnings, timer, question types, instant result — without
first provisioning accounts, courses, banks and a paper. ``ensure_demo_exam``
provisions all of that exactly once and repairs it if pieces are missing, so
pressing the demo button repeatedly is always safe: it never creates duplicate
courses, banks, questions, accounts or enrollments (the same idempotency rules
the rest of the product enforces).

The demo paper deliberately covers every machine-gradable candidate surface
(MCQ, multi-select, true/false, numeric, fill-blank and a code answer) and is
always open (``start_window`` in the past, ``end_window`` years ahead) with a
high attempt allowance so it can be sat again and again.

Nothing here is production ceremony: the demo student account exists so a
reviewer can get a full session in one click. Its password is random and never
displayed; nobody logs into it except through the demo-login endpoint that
mints the session server-side. The demo account makes no commercial-grade
promise, but it still gets real hashing and is reused, never duplicated.

Recording/monitoring disclosure: the demo exam runs with the observable
integrity features on — camera required, tab/fullscreen/copy signals recorded,
five-event allowance with faculty reopen — and the candidate-screen brief
discloses it before "Begin assessment" can be pressed.
"""

import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.courses.models import Course, CourseOffering
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.exams.models import Exam, ExamQuestion
from campusflow.domain.question_banks.models import Question, QuestionBank, QuestionOption
from campusflow.domain.users.models import User

DEMO_DEPARTMENT_CODE = "DEMO"
DEMO_COURSE_CODE = "DEMO101"
DEMO_BANK_TITLE = "CampusFlow Demo Bank"
DEMO_EXAM_TITLE = "CampusFlow Demo Assessment"
DEMO_EXAM_TYPE = "practice"
DEMO_DURATION_MINUTES = 20
DEMO_TOTAL_MARKS = 10.0
# Generous allowance: the demo button must never dead-end after five sittings.
DEMO_MAX_ATTEMPTS = 50
DEMO_STUDENT_EMAIL = "demo.student@campusflow.dev"

DEMO_QUESTIONS = [
    {
        "question_type": "mcq",
        "body": "Which HTTP status code means “created”?",
        "marks": 2.0,
        "options": [
            ("A", "200 OK", False),
            ("B", "201 Created", True),
            ("C", "202 Accepted", False),
        ],
        "meta": {},
    },
    {
        "question_type": "msq",
        "body": "Select every HTTP method that is considered safe (read-only).",
        "marks": 2.0,
        "options": [
            ("A", "GET", True),
            ("B", "HEAD", True),
            ("C", "POST", False),
            ("D", "DELETE", False),
        ],
        "meta": {},
    },
    {
        "question_type": "true_false",
        "body": "In SQL, DELETE FROM removes rows but the table structure remains.",
        "marks": 1.0,
        "options": [
            ("A", "true", True),
            ("B", "false", False),
        ],
        "meta": {},
    },
    {
        "question_type": "numerical",
        "body": "How many bits are in one byte?",
        "marks": 1.0,
        "options": [],
        "meta": {"answer": 8, "tolerance": 0},
    },
    {
        "question_type": "fill_blank",
        "body": "Complete the sentence: the Git command to stage a file is git ______.",
        "marks": 2.0,
        "options": [],
        "meta": {"accepted_answers": ["add"]},
    },
    {
        "question_type": "code",
        "body": (
            "Write a Python function ``sum_even(nums)`` that returns the sum of "
            "the even numbers in the list ``nums``. Example: sum_even([1, 2, 3, 4]) == 6."
        ),
        "marks": 2.0,
        "options": [],
        "meta": {},
    },
]


async def ensure_demo_scenario(db: AsyncSession) -> dict:
    """Provision, exactly once, everything the demo needs; return its ids."""

    # ── Department ──────────────────────────────────────────────────────────
    dept_res = await db.execute(select(Department).where(Department.code == DEMO_DEPARTMENT_CODE))
    dept = dept_res.scalar_one_or_none()
    if not dept:
        dept = Department(name="CampusFlow Demo Department", code=DEMO_DEPARTMENT_CODE)
        db.add(dept)
        await db.flush()

    # ── Term ────────────────────────────────────────────────────────────────
    term_res = await db.execute(
        select(AcademicTerm).where(AcademicTerm.name == "CampusFlow Demo Term")
    )
    term = term_res.scalar_one_or_none()
    if not term:
        today = datetime.now(UTC).date()
        term = AcademicTerm(
            name="CampusFlow Demo Term",
            term_type="semester",
            start_date=today,
            end_date=today + timedelta(days=365 * 5),
        )
        db.add(term)
        await db.flush()

    # ── Course + offering (always-open window keeps the demo sit-down ready) ─
    course_res = await db.execute(select(Course).where(Course.code == DEMO_COURSE_CODE))
    course = course_res.scalar_one_or_none()
    if not course:
        course = Course(
            department_id=dept.id,
            code=DEMO_COURSE_CODE,
            title="CampusFlow Demo Course",
            credits=1,
            description="A demonstration course with a ready-to-sit practice paper.",
        )
        db.add(course)
        await db.flush()

    offering_res = await db.execute(
        select(CourseOffering).where(
            CourseOffering.course_id == course.id,
            CourseOffering.section == "DEMO",
        )
    )
    offering = offering_res.scalar_one_or_none()
    if not offering or offering.status != "active":
        if not offering:
            offering = CourseOffering(
                course_id=course.id, academic_term_id=term.id, section="DEMO", status="active"
            )
            db.add(offering)
        else:
            offering.status = "active"
        await db.flush()

    # ── Student account (fixed identity, random unusable password) ──────────
    student_res = await db.execute(select(User).where(User.email == DEMO_STUDENT_EMAIL))
    student = student_res.scalar_one_or_none()
    if not student:
        student = User(
            email=DEMO_STUDENT_EMAIL,
            # Random per-creation secret; never displayed. Nobody knows this
            # password — sign-in to the demo runs through demo_login, which
            # mints the session server-side.
            hashed_password=secrets.token_urlsafe(32),
            first_name="Demo",
            last_name="Student",
            status="active",
        )
        db.add(student)
        await db.flush()

    enroll_res = await db.execute(
        select(Enrollment).where(
            Enrollment.course_offering_id == offering.id,
            Enrollment.student_id == student.id,
        )
    )
    if not enroll_res.scalar_one_or_none():
        db.add(Enrollment(course_offering_id=offering.id, student_id=student.id, status="enrolled"))
        await db.flush()

    # ── Question bank + questions ───────────────────────────────────────────
    bank_res = await db.execute(select(QuestionBank).where(QuestionBank.title == DEMO_BANK_TITLE))
    bank = bank_res.scalar_one_or_none()
    if not bank:
        bank = QuestionBank(
            department_id=dept.id, course_id=course.id, title=DEMO_BANK_TITLE
        )
        db.add(bank)
        await db.flush()

    existing_bank_questions = (
        await db.execute(select(Question).where(Question.question_bank_id == bank.id))
    ).scalars().all()
    # Match by exact body, so repeated prepare calls never duplicate a question
    # and a partially provisioned bank is completed rather than re-created.
    created_bank_questions: list[Question] = []
    for spec in DEMO_QUESTIONS:
        existing_body = next(
            (q for q in existing_bank_questions if q.body == spec["body"]), None
        )
        if existing_body:
            created_bank_questions.append(existing_body)
            continue
        question = Question(
            question_bank_id=bank.id,
            question_type=spec["question_type"],
            difficulty="easy",
            marks=spec["marks"],
            body=spec["body"],
            status="approved",
            metadata_info=spec["meta"] or None,
        )
        db.add(question)
        await db.flush()
        for dbq in spec["options"]:
            label, body_of_opt, is_correct = dbq
            db.add(
                QuestionOption(
                    question_id=question.id,
                    label=label,
                    body=body_of_opt,
                    is_correct=is_correct,
                    sort_order=0,
                )
            )
        created_bank_questions.append(question)

    # ── Exam ───────────────────────────────────────────────────────────────
    exam_res = await db.execute(
        select(Exam).where(
            Exam.course_offering_id == offering.id,
            Exam.title == DEMO_EXAM_TITLE,
        )
    )
    exam = exam_res.scalar_one_or_none()
    if not exam:
        exam = Exam(
            course_offering_id=offering.id,
            title=DEMO_EXAM_TITLE,
            description="A self-contained demonstration assessment.",
            exam_type=DEMO_EXAM_TYPE,
            total_marks=DEMO_TOTAL_MARKS,
            passing_marks=5.0,
            duration_minutes=DEMO_DURATION_MINUTES,
            # Started in the past, ends years ahead: the demo is always open.
            start_window=datetime.now(UTC) - timedelta(hours=1),
            end_window=datetime.now(UTC) + timedelta(days=365 * 5),
            instructions=(
                "This is a demo assessment. It exists so you can try the full "
                "examination experience — camera check, timer, question types, "
                "integrity warnings and instant scoring — as often as you like."
            ),
            config={
                "proctoring_enabled": True,
                "max_violations": 5,
                "max_attempts": DEMO_MAX_ATTEMPTS,
                "shuffle_questions": True,
                "auto_grade": True,
                "show_results_immediately": True,
            },
            status="scheduled",
        )
        db.add(exam)
        await db.flush()

    # Repair missing questions on an existing demo exam (partial earlier run).
    existing_exam_question_ids = (
        await db.execute(
            select(ExamQuestion.question_id).where(ExamQuestion.exam_id == exam.id)
        )
    ).scalars().all()
    have = set(existing_exam_question_ids)
    for sort_order, question in enumerate(created_bank_questions, start=1):
        if question.id not in have:
            db.add(
                ExamQuestion(
                    exam_id=exam.id,
                    question_id=question.id,
                    sort_order=sort_order,
                )
            )
    await db.flush()

    return {
        "exam_id": str(exam.id),
        "offering_id": str(offering.id),
        "student_email": DEMO_STUDENT_EMAIL,
    }


async def demo_login(db: AsyncSession) -> dict:
    """Create or fetch the demo student and mint a real access token.

    Uses the same token system as institutional login so the whole UI — my
    exams, attempts, results — works normally for the demo session.
    """
    from campusflow.bedrock.auth.jwt import create_access_token
    from campusflow.bedrock.auth.service import create_refresh_token_record
    from campusflow.bedrock.rbac.service import assign_role_to_user

    scen = await ensure_demo_scenario(db)
    email = scen["student_email"]

    user_res = await db.execute(select(User).where(User.email == email))
    student = user_res.scalar_one_or_none()
    if not student:
        raise RuntimeError("demo student missing after ensure_demo_scenario")

    # The demo account holds exactly one role: student. If re-provisioned with
    # a different role set (older demo), repair to the intended scope.
    from campusflow.bedrock.rbac.service import get_user_roles

    roles = await get_user_roles(db, student.id)
    if "student" not in roles:
        await assign_role_to_user(db, student.id, "student")
        await db.flush()

    access_token = create_access_token({"sub": str(student.id), "email": student.email})
    # The raw refresh token is handed back so the route can put it in the
    # httpOnly cookie: a demo session must survive the access token expiring,
    # exactly like an institutional one.
    refresh_token = await create_refresh_token_record(db, user_id=student.id)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "refresh_token": refresh_token,
        "user": {
            "id": str(student.id),
            "email": student.email,
            "first_name": student.first_name,
            "last_name": student.last_name,
            "roles": ["student"],
        },
        "exam_id": scen["exam_id"],
    }
