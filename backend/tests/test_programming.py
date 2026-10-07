from datetime import UTC, datetime, timedelta

import pytest

import campusflow.domain.programming.service as programming_service
from campusflow.bedrock.api.errors import ServiceUnavailableError
from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.bedrock.runner.interface import (
    STATUS_RUNTIME_ERROR,
    STATUS_SUCCESS,
    ExecutionResult,
)
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.courses.models import Course, CourseOffering, FacultyAssignment
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.users.models import User


async def _fake_runner(request) -> ExecutionResult:
    """Deterministic stand-in for the sandbox, keyed on recognisable programs."""
    source = request.source
    stdin = request.stdin or ""

    if "undefined_name" in source:
        return ExecutionResult(
            status=STATUS_RUNTIME_ERROR,
            stderr="NameError: name 'undefined_name' is not defined",
            exit_code=1,
        )
    if "input().upper()" in source:
        return ExecutionResult(status=STATUS_SUCCESS, stdout=stdin.upper() + "\n", exit_code=0, duration_ms=4)
    return ExecutionResult(status=STATUS_SUCCESS, stdout=stdin + "\n", exit_code=0, duration_ms=3)


async def _unavailable_runner(request) -> ExecutionResult:
    raise ServiceUnavailableError("The code execution service is currently unavailable.")


@pytest.mark.asyncio
async def test_programming_environment_end_to_end(client, db_session, monkeypatch):
    # 1. Users
    faculty = User(
        email="faculty.prog@campusflow.edu",
        hashed_password=get_password_hash("FacultyPass123!"),
        first_name="Ada",
        last_name="Lovelace",
        status="active",
    )
    student = User(
        email="student.prog@campusflow.edu",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Alan",
        last_name="Turing",
        status="active",
    )
    outsider = User(
        email="student.other@campusflow.edu",
        hashed_password=get_password_hash("StudentPass123!"),
        first_name="Grace",
        last_name="Hopper",
        status="active",
    )
    db_session.add_all([faculty, student, outsider])
    await db_session.flush()
    await assign_role_to_user(db_session, faculty.id, "faculty")
    await assign_role_to_user(db_session, student.id, "student")
    await assign_role_to_user(db_session, outsider.id, "student")
    await db_session.commit()

    faculty_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(faculty.id)})}"}
    student_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(student.id)})}"}
    outsider_headers = {"Authorization": f"Bearer {create_access_token({'sub': str(outsider.id)})}"}

    # 2. Academic structure
    dept = Department(name="Computer Science", code="CS-PROG")
    term = AcademicTerm(
        name="Fall 2026 Programming",
        start_date=datetime.now(UTC).date(),
        end_date=(datetime.now(UTC) + timedelta(days=90)).date(),
    )
    db_session.add_all([dept, term])
    await db_session.flush()

    course = Course(department_id=dept.id, code="CS101-PROG", title="Intro to Programming", credits=3)
    db_session.add(course)
    await db_session.flush()

    offering = CourseOffering(course_id=course.id, academic_term_id=term.id, section="A", status="active")
    db_session.add(offering)
    await db_session.flush()
    db_session.add(Enrollment(course_offering_id=offering.id, student_id=student.id, status="enrolled"))
    db_session.add(
        FacultyAssignment(course_offering_id=offering.id, faculty_id=faculty.id, role="primary")
    )
    await db_session.commit()

    # 3. Faculty authors a problem
    create_resp = await client.post(
        "/api/v1/programming/problems",
        headers=faculty_headers,
        json={
            "course_offering_id": str(offering.id),
            "title": "Echo in upper case",
            "description": "Read a line and print it in upper case.",
            "language": "python",
            "total_marks": 10,
            "time_limit_ms": 2000,
            "is_published": True,
        },
    )
    assert create_resp.status_code == 200, create_resp.text
    problem_id = create_resp.json()["data"]["id"]

    # Students cannot author problems
    forbidden_create = await client.post(
        "/api/v1/programming/problems",
        headers=student_headers,
        json={"course_offering_id": str(offering.id), "title": "Nope", "total_marks": 5},
    )
    assert forbidden_create.status_code == 403

    # 4. Faculty adds a visible and a hidden test case
    for case in (
        {"name": "Sample", "stdin": "abc", "expected_output": "ABC", "is_hidden": False},
        {"name": "Hidden case", "stdin": "hello world", "expected_output": "HELLO WORLD", "is_hidden": True},
    ):
        case_resp = await client.post(
            f"/api/v1/programming/problems/{problem_id}/test-cases",
            headers=faculty_headers,
            json=case,
        )
        assert case_resp.status_code == 200, case_resp.text

    # 5. A different student cannot see the unpublished-scope problem
    outsider_list = await client.get("/api/v1/programming/problems", headers=outsider_headers)
    assert outsider_list.status_code == 200
    assert outsider_list.json()["data"] == []

    # Enrolled student sees it
    student_list = await client.get("/api/v1/programming/problems", headers=student_headers)
    assert student_list.status_code == 200
    assert [p["id"] for p in student_list.json()["data"]] == [problem_id]

    # 6. Students cannot read the test-case definitions
    forbidden_cases = await client.get(
        f"/api/v1/programming/problems/{problem_id}/test-cases", headers=student_headers
    )
    assert forbidden_cases.status_code == 403

    # 7. Run code (sandbox faked for the suite)
    monkeypatch.setattr(programming_service, "run_code", _fake_runner)
    run_resp = await client.post(
        f"/api/v1/programming/problems/{problem_id}/run",
        headers=student_headers,
        json={"source_code": "print(input().upper())", "stdin": "hey"},
    )
    assert run_resp.status_code == 200, run_resp.text
    run_data = run_resp.json()["data"]
    assert run_data["status"] == "success"
    assert run_data["stdout"] == "HEY\n"

    # 8. Correct submission is graded to full marks
    submit_resp = await client.post(
        f"/api/v1/programming/problems/{problem_id}/submit",
        headers=student_headers,
        json={"source_code": "print(input().upper())"},
    )
    assert submit_resp.status_code == 200, submit_resp.text
    submission = submit_resp.json()["data"]
    assert submission["status"] == "passed"
    assert submission["score"] == 10
    assert submission["passed_tests"] == 2
    assert submission["total_tests"] == 2
    # Hidden expected outputs must never be disclosed to the student
    hidden = [r for r in submission["results"] if r["is_hidden"]]
    assert hidden and hidden[0]["expected_output"] is None

    # 9. An incorrect submission fails and scores zero
    wrong = await client.post(
        f"/api/v1/programming/problems/{problem_id}/submit",
        headers=student_headers,
        json={"source_code": "print(input())"},
    )
    wrong_data = wrong.json()["data"]
    assert wrong_data["status"] == "failed"
    assert wrong_data["score"] == 0
    assert wrong_data["passed_tests"] == 0

    # 10. A program that errors is reported as an error with diagnostics
    errored = await client.post(
        f"/api/v1/programming/problems/{problem_id}/submit",
        headers=student_headers,
        json={"source_code": "print(undefined_name)"},
    )
    errored_data = errored.json()["data"]
    assert errored_data["status"] == "error"
    assert errored_data["score"] == 0
    assert "NameError" in (errored_data["diagnostics"] or "")

    # 11. Faculty can review all submissions with hidden expectations visible
    review = await client.get(
        f"/api/v1/programming/problems/{problem_id}/submissions", headers=faculty_headers
    )
    assert review.status_code == 200, review.text
    reviewed = review.json()["data"]
    assert len(reviewed) == 3
    assert any(
        r["is_hidden"] and r["expected_output"] == "HELLO WORLD"
        for sub in reviewed
        for r in sub["results"]
    )

    # Students cannot review the whole cohort
    forbidden_review = await client.get(
        f"/api/v1/programming/problems/{problem_id}/submissions", headers=student_headers
    )
    assert forbidden_review.status_code == 403

    # 12. Student can read back their own submissions
    mine = await client.get(
        f"/api/v1/programming/problems/{problem_id}/my-submissions", headers=student_headers
    )
    assert mine.status_code == 200
    assert len(mine.json()["data"]) == 3

    # 13. Fail closed when the sandbox is unavailable
    monkeypatch.setattr(programming_service, "run_code", _unavailable_runner)
    unavailable = await client.post(
        f"/api/v1/programming/problems/{problem_id}/submit",
        headers=student_headers,
        json={"source_code": "print(input().upper())"},
    )
    assert unavailable.status_code == 503
    assert unavailable.json()["error"]["code"] == "SERVICE_UNAVAILABLE"
