"""Authorization matrix and leak canaries (Wave 0 of the approved master plan).

These tests exist because the previous suite was green while the running API
handed candidates the examination answer keys, the cohort gradebook, the course
roster and course analytics. A test that only exercises the happy path with a
staff actor cannot detect an ownership bug, so this file asserts the *negative*
space instead:

* a candidate response body must never contain answer material;
* teaching/admin scope must be required for cohort data;
* the same endpoint must serve different audiences without cross-contamination.

Every assertion here failed (or could not even be written) before the
offering-scope authorization kernel existed.
"""

from datetime import UTC, datetime, timedelta

import pytest

from campusflow.bedrock.auth.jwt import create_access_token
from campusflow.bedrock.auth.pwd import get_password_hash
from campusflow.bedrock.rbac.service import assign_role_to_user
from campusflow.domain.academic_terms.models import AcademicTerm
from campusflow.domain.assignments.models import (
    Assignment,
    AssignmentSubmission,
    SubmissionGrade,
)
from campusflow.domain.courses.models import Course, CourseOffering, FacultyAssignment
from campusflow.domain.departments.models import Department
from campusflow.domain.enrollments.models import Enrollment
from campusflow.domain.exams.models import Exam, ExamQuestion
from campusflow.domain.question_banks.models import Question, QuestionBank, QuestionOption
from campusflow.domain.users.models import User

# Keys that carry answer material or grading internals. A candidate response
# containing any of these is a leak, regardless of which route produced it.
FORBIDDEN_CANDIDATE_KEYS = frozenset(
    {
        "is_correct",
        "explanation",
        "correct_answer",
        "accepted_answers",
        "expected_output",
        "proctor_flags",
    }
)


def assert_no_forbidden_keys(payload: object, *, context: str) -> None:
    """Walk a decoded payload and fail on any answer-bearing key."""
    stack: list[object] = [payload]
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            for key, value in node.items():
                assert key not in FORBIDDEN_CANDIDATE_KEYS, (
                    f"{context}: leaked key '{key}' into a candidate response"
                )
                stack.append(value)
        elif isinstance(node, list):
            stack.extend(node)


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


@pytest.mark.asyncio
async def test_authorization_matrix_and_leak_canaries(client, db_session):
    now = datetime.now(UTC)

    # ── 1. People ───────────────────────────────────────────────────────────
    admin = User(
        email="admin.w0@campusflow.edu",
        hashed_password=get_password_hash("AdminPass123!"),
        first_name="A",
        last_name="Dmin",
        status="active",
    )
    controller = User(
        email="controller.w0@campusflow.edu",
        hashed_password=get_password_hash("CtrlPass123!"),
        first_name="E",
        last_name="Vance",
        status="active",
    )
    hod_a = User(
        email="hod.a.w0@campusflow.edu",
        hashed_password=get_password_hash("HodPass123!"),
        first_name="M",
        last_name="Sterling",
        status="active",
    )
    faculty_a = User(
        email="faculty.a.w0@campusflow.edu",
        hashed_password=get_password_hash("FacPass123!"),
        first_name="S",
        last_name="Chen",
        status="active",
    )
    faculty_b = User(
        email="faculty.b.w0@campusflow.edu",
        hashed_password=get_password_hash("FacPass123!"),
        first_name="R",
        last_name="Davies",
        status="active",
    )
    student_a = User(
        email="student.a.w0@campusflow.edu",
        hashed_password=get_password_hash("StuPass123!"),
        first_name="Alex",
        last_name="Rivera",
        status="active",
    )
    student_b = User(
        email="student.b.w0@campusflow.edu",
        hashed_password=get_password_hash("StuPass123!"),
        first_name="Bri",
        last_name="Patel",
        status="active",
    )
    outsider = User(
        email="student.out.w0@campusflow.edu",
        hashed_password=get_password_hash("StuPass123!"),
        first_name="Out",
        last_name="Sider",
        status="active",
    )

    db_session.add_all(
        [admin, controller, hod_a, faculty_a, faculty_b, student_a, student_b, outsider]
    )
    await db_session.flush()

    for user, role in (
        (admin, "admin"),
        (controller, "exam_controller"),
        (hod_a, "department_head"),
        (faculty_a, "faculty"),
        (faculty_b, "faculty"),
        (student_a, "student"),
        (student_b, "student"),
        (outsider, "student"),
    ):
        await assign_role_to_user(db_session, user.id, role)

    # ── 2. Two departments, two offerings ───────────────────────────────────
    dept_a = Department(name="Computer Science W0", code="CSE-W0", head_id=hod_a.id)
    dept_b = Department(name="Mechanical W0", code="MECH-W0")
    term = AcademicTerm(
        name="Fall 2026 W0",
        start_date=now.date(),
        end_date=(now + timedelta(days=120)).date(),
        is_current=True,
    )
    db_session.add_all([dept_a, dept_b, term])
    await db_session.flush()

    course_a = Course(
        code="CS201-W0", title="Data Structures W0", department_id=dept_a.id, credits=4
    )
    course_b = Course(
        code="ME101-W0", title="Thermodynamics W0", department_id=dept_b.id, credits=4
    )
    db_session.add_all([course_a, course_b])
    await db_session.flush()

    offering_a = CourseOffering(
        course_id=course_a.id, academic_term_id=term.id, section="A", status="active"
    )
    offering_b = CourseOffering(
        course_id=course_b.id, academic_term_id=term.id, section="B", status="active"
    )
    db_session.add_all([offering_a, offering_b])
    await db_session.flush()

    db_session.add_all(
        [
            FacultyAssignment(
                course_offering_id=offering_a.id, faculty_id=faculty_a.id, role="primary"
            ),
            FacultyAssignment(
                course_offering_id=offering_b.id, faculty_id=faculty_b.id, role="primary"
            ),
            Enrollment(
                course_offering_id=offering_a.id, student_id=student_a.id, status="enrolled"
            ),
            Enrollment(
                course_offering_id=offering_a.id, student_id=student_b.id, status="enrolled"
            ),
        ]
    )

    # ── 3. Examinations: one gradable, one still in draft, one in dept B ────
    bank = QuestionBank(
        department_id=dept_a.id, course_id=course_a.id, title="W0 Bank", created_by_id=faculty_a.id
    )
    db_session.add(bank)
    await db_session.flush()

    question = Question(
        question_bank_id=bank.id,
        question_type="mcq",
        marks=5.0,
        body="Which structure gives O(1) average lookup by key?",
        explanation="Hash tables provide average O(1) lookup.",
        status="approved",
        created_by_id=faculty_a.id,
    )
    db_session.add(question)
    await db_session.flush()
    db_session.add_all(
        [
            QuestionOption(
                question_id=question.id, label="A", body="Hash table", is_correct=True, sort_order=1
            ),
            QuestionOption(
                question_id=question.id,
                label="B",
                body="Linked list",
                is_correct=False,
                sort_order=2,
            ),
        ]
    )

    exam_a = Exam(
        course_offering_id=offering_a.id,
        title="CS201 Midterm W0",
        exam_type="midterm",
        total_marks=5.0,
        duration_minutes=30,
        start_window=now - timedelta(minutes=5),
        end_window=now + timedelta(hours=2),
        config={"proctoring_enabled": True, "max_violations": 5},
        status="scheduled",
        created_by_id=faculty_a.id,
    )
    exam_draft = Exam(
        course_offering_id=offering_a.id,
        title="CS201 Draft Quiz W0",
        exam_type="quiz",
        total_marks=5.0,
        duration_minutes=15,
        start_window=now - timedelta(minutes=5),
        end_window=now + timedelta(hours=2),
        config={"proctoring_enabled": True},
        status="draft",
        created_by_id=faculty_a.id,
    )
    exam_b = Exam(
        course_offering_id=offering_b.id,
        title="ME101 Midterm W0",
        exam_type="midterm",
        total_marks=5.0,
        duration_minutes=30,
        start_window=now - timedelta(minutes=5),
        end_window=now + timedelta(hours=2),
        config={"proctoring_enabled": True},
        status="scheduled",
        created_by_id=faculty_b.id,
    )
    db_session.add_all([exam_a, exam_draft, exam_b])
    await db_session.flush()
    for exam in (exam_a, exam_draft, exam_b):
        db_session.add(
            ExamQuestion(exam_id=exam.id, question_id=question.id, sort_order=1, marks_override=5.0)
        )

    # ── 4. An assignment, a graded submission, real cohort numbers ─────────
    assignment = Assignment(
        course_offering_id=offering_a.id,
        title="W0 Assignment",
        total_marks=100.0,
        weightage=20.0,
        due_date=now + timedelta(days=3),
        is_published=True,
        created_by_id=faculty_a.id,
    )
    db_session.add(assignment)
    await db_session.flush()

    submission = AssignmentSubmission(
        assignment_id=assignment.id, student_id=student_a.id, status="graded", submitted_at=now
    )
    db_session.add(submission)
    await db_session.flush()
    db_session.add(
        SubmissionGrade(
            submission_id=submission.id,
            graded_by_id=faculty_a.id,
            marks_obtained=91.0,
            final_marks=91.0,
            feedback="Solid work.",
            graded_at=now,
        )
    )
    await db_session.commit()

    admin_h = auth_headers(admin)
    controller_h = auth_headers(controller)
    hod_h = auth_headers(hod_a)
    faculty_a_h = auth_headers(faculty_a)
    faculty_b_h = auth_headers(faculty_b)
    student_a_h = auth_headers(student_a)
    outsider_h = auth_headers(outsider)

    # ── 5. Candidate examination reads never carry answer material ─────────
    list_res = await client.get("/api/v1/exams", headers=student_a_h)
    assert list_res.status_code == 200, list_res.text
    listed = list_res.json()["data"]
    assert_no_forbidden_keys(listed, context="candidate GET /exams")
    assert "is_correct" not in list_res.text
    listed_ids = {e["id"] for e in listed}
    assert str(exam_a.id) in listed_ids, "enrolled, scheduled exam must be visible"
    assert str(exam_draft.id) not in listed_ids, "draft exams must be invisible to candidates"
    assert str(exam_b.id) not in listed_ids, "other-department exams must be invisible"
    assert "questions" not in listed[0], "candidate list must not embed question bodies"
    # The candidate config projection is intentionally narrow: this exact set is
    # the allowlist, so a new key on the projection has to be added here
    # deliberately. Alongside the two switches the delivery screen needs, it now
    # carries the three disclosures the candidate is entitled to before starting:
    # `warning_policy` (removal or review — ADR-023), `device_detection_enabled`
    # (whether their camera picture is analysed on their own device — ADR-024),
    # `obstruction_threshold_seconds` (the grace they actually have before
    # stillness is reported — D-12) and `evidence_retention_days` (when the
    # stills of them are erased — D-2). `max_violations` is the disclosed
    # allowance, so the candidate can answer "how many warnings do I have"
    # before the first event instead of after it. None of these reveal grading
    # internals.
    #
    # The integrity profile adds the disclosures the candidate is entitled to
    # know rather than internals: which dwell tier the paper runs at
    # (`integrity_sensitivity`), which camera cues are switched on
    # (`face_monitoring_enabled`, `hand_monitoring_enabled`,
    # `audio_monitoring_enabled` — ADR-029; `mouth_monitoring_enabled` —
    # ADR-030), and the seconds each one implies (`dwell_ms`). A candidate must
    # be able to answer "am I being listened to, and for how long can I look
    # away" before the paper starts. None of them carries a grading rule, an
    # answer key or another candidate's data. `demo` only says this is the
    # demonstration paper, so its stopped screen can offer a fresh sitting
    # instead of a lecturer reopen (ADR-033).
    assert set(listed[0]["config"].keys()) == {
        "proctoring_enabled",
        "max_attempts",
        "show_results_immediately",
        "warning_policy",
        "max_violations",
        "warning_cooldown_seconds",
        "device_detection_enabled",
        "obstruction_threshold_seconds",
        "evidence_retention_days",
        "integrity_sensitivity",
        "face_monitoring_enabled",
        "hand_monitoring_enabled",
        "audio_monitoring_enabled",
        "mouth_monitoring_enabled",
        "dwell_ms",
        "demo",
    }

    brief_res = await client.get(f"/api/v1/exams/{exam_a.id}/public", headers=student_a_h)
    assert brief_res.status_code == 200, brief_res.text
    assert_no_forbidden_keys(brief_res.json()["data"], context="candidate GET /exams/{id}/public")
    assert "is_correct" not in brief_res.text

    # Academic integrity test: the candidate cannot reach the staff definition.
    staff_def_res = await client.get(f"/api/v1/exams/{exam_a.id}", headers=student_a_h)
    assert staff_def_res.status_code == 403, staff_def_res.text

    # Non-visible exams are indistinguishable from missing ones (no enumeration).
    assert (
        await client.get(f"/api/v1/exams/{exam_draft.id}/public", headers=student_a_h)
    ).status_code == 404
    assert (
        await client.get(f"/api/v1/exams/{exam_b.id}/public", headers=student_a_h)
    ).status_code == 404

    # ── 6. Staff still get the full definition, scoped to their offering ────
    own_def = await client.get(f"/api/v1/exams/{exam_a.id}", headers=faculty_a_h)
    assert own_def.status_code == 200, own_def.text
    assert any(
        opt.get("is_correct") for q in own_def.json()["data"]["questions"] for opt in q["options"]
    ), "authoring staff must still receive the answer key"

    assert (await client.get(f"/api/v1/exams/{exam_b.id}", headers=faculty_a_h)).status_code == 403
    assert (await client.get(f"/api/v1/exams/{exam_a.id}", headers=faculty_b_h)).status_code == 403

    faculty_list = await client.get("/api/v1/exams", headers=faculty_a_h)
    assert faculty_list.status_code == 200
    faculty_ids = {e["id"] for e in faculty_list.json()["data"]}
    assert {str(exam_a.id), str(exam_draft.id)} <= faculty_ids, (
        "own drafts must remain visible to their author"
    )
    assert str(exam_b.id) not in faculty_ids

    # ── 7. Cohort data requires teaching or administrative scope ───────────
    assert (
        await client.get(f"/api/v1/course-offerings/{offering_a.id}/gradebook", headers=student_a_h)
    ).status_code == 403
    assert (
        await client.get(f"/api/v1/course-offerings/{offering_a.id}/gradebook", headers=faculty_b_h)
    ).status_code == 403
    gradebook_res = await client.get(
        f"/api/v1/course-offerings/{offering_a.id}/gradebook", headers=faculty_a_h
    )
    assert gradebook_res.status_code == 200, gradebook_res.text
    emails = {s["student_email"] for s in gradebook_res.json()["data"]["students"]}
    assert "student.a.w0@campusflow.edu" in emails, "own-student grades must be present"

    assert (
        await client.get(
            f"/api/v1/course-offerings/{offering_a.id}/enrollments", headers=student_a_h
        )
    ).status_code == 403
    assert (
        await client.get(
            f"/api/v1/course-offerings/{offering_a.id}/enrollments", headers=faculty_b_h
        )
    ).status_code == 403
    assert (
        await client.get(
            f"/api/v1/course-offerings/{offering_a.id}/enrollments", headers=faculty_a_h
        )
    ).status_code == 200
    # A department head reaches their own department's roster, not another's.
    assert (
        await client.get(f"/api/v1/course-offerings/{offering_a.id}/enrollments", headers=hod_h)
    ).status_code == 200
    assert (
        await client.get(f"/api/v1/course-offerings/{offering_b.id}/enrollments", headers=hod_h)
    ).status_code == 403
    # The examination bureau may roster institution-wide but does not grade.
    assert (
        await client.get(
            f"/api/v1/course-offerings/{offering_b.id}/enrollments", headers=controller_h
        )
    ).status_code == 200
    assert (
        await client.get(
            f"/api/v1/course-offerings/{offering_a.id}/gradebook", headers=controller_h
        )
    ).status_code == 403

    # Cohort analytics is scoped exactly like the gradebook.
    assert (
        await client.get(f"/api/v1/analytics/courses/{offering_a.id}", headers=student_a_h)
    ).status_code == 403
    assert (
        await client.get(f"/api/v1/analytics/courses/{offering_a.id}", headers=faculty_b_h)
    ).status_code == 403
    assert (
        await client.get(f"/api/v1/analytics/courses/{offering_a.id}", headers=faculty_a_h)
    ).status_code == 200

    # ── 8. A candidate always keeps their own marks, and only theirs ───────
    my_grades_res = await client.get(
        f"/api/v1/course-offerings/{offering_a.id}/my-grades", headers=student_a_h
    )
    assert my_grades_res.status_code == 200, my_grades_res.text
    my_grades = my_grades_res.json()["data"]
    assert my_grades["student_id"] == str(student_a.id)
    assert len(my_grades["assignments"]) == 1
    assert my_grades["assignments"][0]["final_marks"] == 91.0
    assert my_grades["percentage"] == 91.0
    assert "student.b.w0@campusflow.edu" not in my_grades_res.text
    assert_no_forbidden_keys(my_grades, context="candidate my-grades")

    # ── 9. Leadership-only reporting, and candidates keep their dashboard ──
    assert (await client.get("/api/v1/analytics/overview", headers=admin_h)).status_code == 200
    assert (await client.get("/api/v1/analytics/overview", headers=faculty_a_h)).status_code == 403
    assert (await client.get("/api/v1/analytics/overview", headers=student_a_h)).status_code == 403
    assert (
        await client.get("/api/v1/analytics/student/me", headers=student_a_h)
    ).status_code == 200

    # ── 10. Assessment-taking guards that must not regress ─────────────────
    assert (
        await client.get(f"/api/v1/exams/{exam_a.id}/attempts", headers=student_a_h)
    ).status_code == 403
    unenrolled_start = await client.post(
        f"/api/v1/exams/{exam_a.id}/start", headers=outsider_h, json={}
    )
    assert unenrolled_start.status_code == 403, unenrolled_start.text
    draft_start = await client.post(
        f"/api/v1/exams/{exam_draft.id}/start", headers=student_a_h, json={}
    )
    assert draft_start.status_code == 404, draft_start.text
