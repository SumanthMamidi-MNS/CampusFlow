import uuid
from collections.abc import Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from campusflow.bedrock.api.errors import AuthorizationError, NotFoundError, ValidationError
from campusflow.bedrock.audit.service import record_audit_event
from campusflow.bedrock.config.settings import get_settings
from campusflow.bedrock.rbac.service import get_user_roles
from campusflow.bedrock.runner import ExecutionLimits, ExecutionRequest, ExecutionResult, run_code
from campusflow.domain.courses.models import CourseOffering, FacultyAssignment
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.notifications.service import create_notification
from campusflow.domain.programming.models import (
    CodingProblem,
    CodingSubmission,
    CodingTestCase,
    CodingTestResult,
)
from campusflow.domain.programming.schemas import (
    CodingProblemCreate,
    CodingProblemResponse,
    CodingProblemUpdate,
    CodingSubmissionResponse,
    CodingTestCaseCreate,
    CodingTestCaseResponse,
    CodingTestResultResponse,
)
from campusflow.domain.users.models import User

_OVERVIEW_ROLES = {"super_admin", "admin", "department_head", "exam_controller"}
_STAFF_ROLES = _OVERVIEW_ROLES | {"faculty"}


# ── Visibility ──────────────────────────────────────────────────────────────

async def _role_set(db: AsyncSession, user: User) -> set[str]:
    return set(await get_user_roles(db, user.id))


async def _teaching_offering_ids(db: AsyncSession, user: User) -> set[uuid.UUID]:
    res = await db.execute(
        select(FacultyAssignment.course_offering_id).where(FacultyAssignment.faculty_id == user.id)
    )
    return set(res.scalars().all())


async def _enrolled_offering_ids(db: AsyncSession, user: User) -> set[uuid.UUID]:
    res = await db.execute(
        select(Enrollment.course_offering_id).where(
            Enrollment.student_id == user.id,
            Enrollment.status == "enrolled",
        )
    )
    return set(res.scalars().all())


def _authorize_problem_access(problem: CodingProblem, roles: set[str], teach: set[uuid.UUID], enrolled: set[uuid.UUID]) -> None:
    if roles & _OVERVIEW_ROLES:
        return
    if problem.course_offering_id in teach:
        return
    if problem.course_offering_id in enrolled and problem.is_published:
        return
    raise AuthorizationError("You do not have access to this programming problem.")


# ── Problem CRUD ────────────────────────────────────────────────────────────

async def _offering_map(db: AsyncSession, offering_ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, CourseOffering]:
    ids = list({oid for oid in offering_ids})
    if not ids:
        return {}
    res = await db.execute(select(CourseOffering).where(CourseOffering.id.in_(ids)))
    return {o.id: o for o in res.scalars().all()}


def _problem_response(
    problem: CodingProblem,
    offering: CourseOffering | None,
    *,
    my_best_score: float | None = None,
    my_submission_count: int = 0,
) -> CodingProblemResponse:
    resp = CodingProblemResponse.model_validate(problem)
    if offering and offering.course:
        resp.course_code = offering.course.code
        resp.course_title = offering.course.title
    resp.visible_test_case_count = len(problem.test_cases)
    resp.my_best_score = my_best_score
    resp.my_submission_count = my_submission_count
    return resp


async def list_problems(db: AsyncSession, current_user: User) -> list[CodingProblemResponse]:
    roles = await _role_set(db, current_user)
    query = select(CodingProblem).options(selectinload(CodingProblem.test_cases))

    if roles & _OVERVIEW_ROLES:
        pass
    elif roles & _STAFF_ROLES:
        teach = await _teaching_offering_ids(db, current_user)
        if not teach:
            return []
        query = query.where(CodingProblem.course_offering_id.in_(teach))
    else:
        enrolled = await _enrolled_offering_ids(db, current_user)
        if not enrolled:
            return []
        query = query.where(
            CodingProblem.course_offering_id.in_(enrolled),
            CodingProblem.is_published.is_(True),
        )

    res = await db.execute(query.order_by(CodingProblem.created_at.desc()))
    problems = list(res.scalars().all())
    if not problems:
        return []

    offerings = await _offering_map(db, (p.course_offering_id for p in problems))

    # Best score / attempt count for the current user, in one query.
    score_res = await db.execute(
        select(
            CodingSubmission.problem_id,
            func.max(CodingSubmission.score),
            func.count(CodingSubmission.id),
        )
        .where(
            CodingSubmission.problem_id.in_([p.id for p in problems]),
            CodingSubmission.student_id == current_user.id,
        )
        .group_by(CodingSubmission.problem_id)
    )
    score_map = {row[0]: (row[1], row[2]) for row in score_res.all()}

    results: list[CodingProblemResponse] = []
    for problem in problems:
        best, count = score_map.get(problem.id, (None, 0))
        results.append(
            _problem_response(
                problem,
                offerings.get(problem.course_offering_id),
                my_best_score=best,
                my_submission_count=count,
            )
        )
    return results


async def get_problem_row(db: AsyncSession, problem_id: uuid.UUID) -> CodingProblem:
    res = await db.execute(
        select(CodingProblem)
        .where(CodingProblem.id == problem_id)
        .options(selectinload(CodingProblem.test_cases))
    )
    problem = res.scalar_one_or_none()
    if not problem:
        raise NotFoundError("Programming problem not found")
    return problem


async def get_problem(db: AsyncSession, problem_id: uuid.UUID, current_user: User) -> CodingProblemResponse:
    problem = await get_problem_row(db, problem_id)
    roles = await _role_set(db, current_user)
    teach = await _teaching_offering_ids(db, current_user)
    enrolled = await _enrolled_offering_ids(db, current_user)
    _authorize_problem_access(problem, roles, teach, enrolled)
    offerings = await _offering_map(db, [problem.course_offering_id])
    return _problem_response(problem, offerings.get(problem.course_offering_id))


async def create_problem(
    db: AsyncSession, payload: CodingProblemCreate, current_user: User
) -> CodingProblemResponse:
    roles = await _role_set(db, current_user)
    if not roles & _OVERVIEW_ROLES:
        teaching = await _teaching_offering_ids(db, current_user)
        if payload.course_offering_id not in teaching:
            raise AuthorizationError(
                "You can only create programming problems for course offerings you teach."
            )

    problem = CodingProblem(
        course_offering_id=payload.course_offering_id,
        created_by_id=current_user.id,
        title=payload.title,
        description=payload.description,
        language=payload.language,
        starter_code=payload.starter_code,
        total_marks=payload.total_marks,
        time_limit_ms=payload.time_limit_ms,
        memory_limit_kb=payload.memory_limit_kb,
        is_published=payload.is_published,
        due_date=payload.due_date,
    )
    db.add(problem)
    await db.commit()
    await db.refresh(problem, attribute_names=["test_cases"])

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="programming.problem_created",
        resource_type="coding_problem",
        resource_id=str(problem.id),
        extra_data={"title": problem.title},
    )
    offerings = await _offering_map(db, [problem.course_offering_id])
    return _problem_response(problem, offerings.get(problem.course_offering_id))


async def update_problem(
    db: AsyncSession, problem_id: uuid.UUID, payload: CodingProblemUpdate, current_user: User
) -> CodingProblemResponse:
    problem = await get_problem_row(db, problem_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(problem, field, value)
    await db.commit()
    await db.refresh(problem, attribute_names=["test_cases"])
    offerings = await _offering_map(db, [problem.course_offering_id])
    return _problem_response(problem, offerings.get(problem.course_offering_id))


async def delete_problem(db: AsyncSession, problem_id: uuid.UUID, current_user: User) -> None:
    problem = await get_problem_row(db, problem_id)
    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="programming.problem_deleted",
        resource_type="coding_problem",
        resource_id=str(problem.id),
        extra_data={"title": problem.title},
    )
    await db.delete(problem)
    await db.commit()


# ── Test cases ──────────────────────────────────────────────────────────────

async def list_test_cases(db: AsyncSession, problem_id: uuid.UUID) -> list[CodingTestCaseResponse]:
    await get_problem_row(db, problem_id)
    res = await db.execute(
        select(CodingTestCase)
        .where(CodingTestCase.problem_id == problem_id)
        .order_by(CodingTestCase.sort_order.asc())
    )
    return [CodingTestCaseResponse.model_validate(t) for t in res.scalars().all()]


async def add_test_case(
    db: AsyncSession, problem_id: uuid.UUID, payload: CodingTestCaseCreate, current_user: User
) -> CodingTestCaseResponse:
    await get_problem_row(db, problem_id)
    case = CodingTestCase(
        problem_id=problem_id,
        name=payload.name,
        stdin=payload.stdin,
        expected_output=payload.expected_output,
        is_hidden=payload.is_hidden,
        comparison=payload.comparison,
        marks=payload.marks,
        sort_order=payload.sort_order,
    )
    db.add(case)
    await db.commit()
    await db.refresh(case)
    return CodingTestCaseResponse.model_validate(case)


async def delete_test_case(db: AsyncSession, test_case_id: uuid.UUID, current_user: User) -> None:
    case = await db.get(CodingTestCase, test_case_id)
    if not case:
        raise NotFoundError("Test case not found")
    await db.delete(case)
    await db.commit()


# ── Execution ───────────────────────────────────────────────────────────────

def _limits_for(problem: CodingProblem) -> ExecutionLimits:
    settings = get_settings()
    timeout = min(problem.time_limit_ms, settings.code_run_max_timeout_ms)
    # The memory ceiling is opt-in: see Settings.code_run_memory_limit_kb. The
    # per-problem value is recorded for display but only forwarded to the sandbox
    # when the deployment can enforce it.
    memory_kb = (
        min(problem.memory_limit_kb, settings.code_run_memory_limit_kb)
        if settings.code_run_memory_limit_kb > 0
        else 0
    )
    return ExecutionLimits(
        run_timeout_ms=timeout,
        compile_timeout_ms=max(timeout, 10_000),
        memory_kb=memory_kb,
        max_output_bytes=settings.code_run_max_output_bytes,
    )


async def run_problem_code(
    db: AsyncSession,
    problem_id: uuid.UUID,
    source_code: str,
    stdin: str,
    current_user: User,
) -> ExecutionResult:
    problem = await get_problem_row(db, problem_id)
    roles = await _role_set(db, current_user)
    teach = await _teaching_offering_ids(db, current_user)
    enrolled = await _enrolled_offering_ids(db, current_user)
    _authorize_problem_access(problem, roles, teach, enrolled)

    request = ExecutionRequest(
        language=problem.language,
        source=source_code,
        stdin=stdin,
        limits=_limits_for(problem),
    )
    result = await run_code(request)
    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="programming.code_run",
        resource_type="coding_problem",
        resource_id=str(problem.id),
        extra_data={"status": result.status, "timed_out": result.timed_out},
    )
    return result


def _normalize(text: str | None, comparison: str) -> list[str] | str:
    cleaned = (text or "").replace("\r\n", "\n").rstrip("\n")
    if comparison == "exact":
        return [line.rstrip() for line in cleaned.split("\n")]
    return " ".join(cleaned.split())


def _outputs_match(actual: str | None, expected: str | None, comparison: str) -> bool:
    return _normalize(actual, comparison) == _normalize(expected, comparison)


async def submit_problem(
    db: AsyncSession,
    problem_id: uuid.UUID,
    source_code: str,
    current_user: User,
) -> CodingSubmissionResponse:
    problem = await get_problem_row(db, problem_id)
    roles = await _role_set(db, current_user)
    teach = await _teaching_offering_ids(db, current_user)
    enrolled = await _enrolled_offering_ids(db, current_user)
    _authorize_problem_access(problem, roles, teach, enrolled)

    cases = sorted(problem.test_cases, key=lambda c: (c.sort_order, c.created_at))
    if not cases:
        raise ValidationError(
            "This problem has no test cases yet, so it cannot be graded. Please contact your instructor."
        )

    limits = _limits_for(problem)
    per_case_default = problem.total_marks / len(cases)

    submission = CodingSubmission(
        problem_id=problem.id,
        student_id=current_user.id,
        language=problem.language,
        source_code=source_code,
        max_score=problem.total_marks,
        total_tests=len(cases),
    )
    db.add(submission)
    await db.flush()

    earned = 0.0
    passed_count = 0
    first_error: str | None = None
    total_duration = 0
    is_compile_error = False
    ran_successfully = False

    for case in cases:
        result = await run_code(
            ExecutionRequest(
                language=problem.language,
                source=source_code,
                stdin=case.stdin or "",
                limits=limits,
            )
        )
        if result.status == "compile_error":
            is_compile_error = True
        if result.status == "success":
            ran_successfully = True
        if first_error is None and (result.stderr or result.message):
            first_error = (result.stderr or result.message or "")[:4000]
        if result.duration_ms:
            total_duration += result.duration_ms

        matched = result.status == "success" and _outputs_match(
            result.stdout, case.expected_output, case.comparison
        )
        case_marks = case.marks if case.marks is not None else per_case_default
        if matched:
            passed_count += 1
            earned += case_marks

        db.add(
            CodingTestResult(
                submission_id=submission.id,
                test_case_id=case.id,
                name=case.name,
                passed=matched,
                status=result.status,
                expected_output=case.expected_output,
                actual_output=result.stdout,
                stderr=result.stderr or None,
                duration_ms=result.duration_ms,
                is_hidden=case.is_hidden,
            )
        )

    submission.passed_tests = passed_count
    submission.score = round(min(earned, problem.total_marks), 2)
    submission.duration_ms = total_duration or None
    submission.diagnostics = first_error
    if is_compile_error or not ran_successfully:
        submission.status = "error"
    elif passed_count == len(cases):
        submission.status = "passed"
    elif passed_count > 0:
        submission.status = "partial"
    else:
        submission.status = "failed"

    await db.commit()
    await db.refresh(submission, attribute_names=["results"])

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="programming.code_submitted",
        resource_type="coding_submission",
        resource_id=str(submission.id),
        extra_data={
            "problem_id": str(problem.id),
            "score": submission.score,
            "passed": passed_count,
            "total": len(cases),
        },
    )

    await create_notification(
        db=db,
        user_id=current_user.id,
        title="Programming submission evaluated",
        message=(
            f"'{problem.title}' was evaluated automatically: {submission.score}/{problem.total_marks} "
            f"marks ({passed_count}/{len(cases)} tests passed)."
        ),
        notification_type="programming_graded",
        link=f"/programming/{problem.id}",
    )

    payload = _submission_response(submission, include_hidden_expected=False)
    payload.student_name = f"{current_user.first_name} {current_user.last_name}"
    payload.student_email = current_user.email
    return payload


def _submission_response(
    submission: CodingSubmission, *, include_hidden_expected: bool
) -> CodingSubmissionResponse:
    payload = CodingSubmissionResponse.model_validate(submission)
    results: list[CodingTestResultResponse] = []
    for result in submission.results:
        item = CodingTestResultResponse.model_validate(result)
        if item.is_hidden and not include_hidden_expected:
            # Never disclose the expected output of a hidden case.
            item.expected_output = None
        results.append(item)
    payload.results = results
    return payload


# ── Submissions review ──────────────────────────────────────────────────────

async def list_problem_submissions(
    db: AsyncSession, problem_id: uuid.UUID, current_user: User
) -> list[CodingSubmissionResponse]:
    problem = await get_problem_row(db, problem_id)
    roles = await _role_set(db, current_user)
    teach = await _teaching_offering_ids(db, current_user)
    if not (roles & _OVERVIEW_ROLES) and problem.course_offering_id not in teach:
        raise AuthorizationError("You do not have access to this problem's submissions.")

    res = await db.execute(
        select(CodingSubmission)
        .where(CodingSubmission.problem_id == problem_id)
        .options(selectinload(CodingSubmission.results))
        .order_by(CodingSubmission.created_at.desc())
    )
    submissions = list(res.scalars().all())

    # Resolve student identities in one query.
    student_ids = {s.student_id for s in submissions}
    student_map: dict[uuid.UUID, User] = {}
    if student_ids:
        student_res = await db.execute(select(User).where(User.id.in_(student_ids)))
        student_map = {u.id: u for u in student_res.scalars().all()}

    responses: list[CodingSubmissionResponse] = []
    for submission in submissions:
        payload = _submission_response(submission, include_hidden_expected=True)
        student = student_map.get(submission.student_id)
        if student:
            payload.student_name = f"{student.first_name} {student.last_name}"
            payload.student_email = student.email
        responses.append(payload)
    return responses


async def list_my_submissions(
    db: AsyncSession, problem_id: uuid.UUID, current_user: User
) -> list[CodingSubmissionResponse]:
    problem = await get_problem_row(db, problem_id)
    roles = await _role_set(db, current_user)
    teach = await _teaching_offering_ids(db, current_user)
    enrolled = await _enrolled_offering_ids(db, current_user)
    _authorize_problem_access(problem, roles, teach, enrolled)

    res = await db.execute(
        select(CodingSubmission)
        .where(
            CodingSubmission.problem_id == problem_id,
            CodingSubmission.student_id == current_user.id,
        )
        .options(selectinload(CodingSubmission.results))
        .order_by(CodingSubmission.created_at.desc())
    )
    responses: list[CodingSubmissionResponse] = []
    for submission in res.scalars().all():
        payload = _submission_response(submission, include_hidden_expected=False)
        payload.student_name = f"{current_user.first_name} {current_user.last_name}"
        payload.student_email = current_user.email
        responses.append(payload)
    return responses
