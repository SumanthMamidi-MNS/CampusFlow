import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.auth.dependencies import get_current_active_user
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_permission
from campusflow.domain.exams.schemas import (
    BatchSaveAnswersRequest,
    ExamAttemptSummary,
    ExamCreate,
    ExamQuestionBatchAdd,
    ExamUpdate,
    GradeSingleResponseRequest,
    StartAttemptRequest,
)
from campusflow.domain.exams.service import (
    add_questions_to_exam,
    create_exam,
    delete_exam,
    get_exam,
    get_student_exam_result,
    grade_attempt_response,
    list_attempts_for_exam,
    list_exams,
    publish_exam_results,
    remove_question_from_exam,
    save_answers_batch,
    start_or_resume_attempt,
    submit_attempt,
    update_exam,
)
from campusflow.domain.users.models import User

router = APIRouter(tags=["exams"])


# ── Exam Authoring & Management (Faculty / Admin) ───────────────────────────

@router.post("/exams")
async def create_exam_endpoint(
    payload: ExamCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("exams:create")),
):
    exam = await create_exam(db, payload=payload, current_user=current_user)
    resp = await get_exam(db, exam.id)
    return success_response(resp.model_dump(mode="json"))


@router.get("/exams")
async def list_exams_endpoint(
    course_offering_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    exams = await list_exams(db, course_offering_id=course_offering_id, status=status)
    return success_response([e.model_dump(mode="json") for e in exams])


@router.get("/exams/{exam_id}")
async def get_exam_endpoint(
    exam_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    exam = await get_exam(db, exam_id=exam_id)
    return success_response(exam.model_dump(mode="json"))


@router.put("/exams/{exam_id}")
async def update_exam_endpoint(
    exam_id: uuid.UUID,
    payload: ExamUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("exams:create")),
):
    await update_exam(db, exam_id=exam_id, payload=payload, current_user=current_user)
    exam = await get_exam(db, exam_id=exam_id)
    return success_response(exam.model_dump(mode="json"))


@router.delete("/exams/{exam_id}")
async def delete_exam_endpoint(
    exam_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("exams:create")),
):
    await delete_exam(db, exam_id=exam_id, current_user=current_user)
    return success_response({"message": "Exam deleted successfully"})


@router.post("/exams/{exam_id}/questions")
async def add_questions_to_exam_endpoint(
    exam_id: uuid.UUID,
    payload: ExamQuestionBatchAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("exams:create")),
):
    await add_questions_to_exam(db, exam_id=exam_id, payload=payload, current_user=current_user)
    exam = await get_exam(db, exam_id=exam_id)
    return success_response(exam.model_dump(mode="json"))


@router.delete("/exams/{exam_id}/questions/{exam_question_id}")
async def remove_question_from_exam_endpoint(
    exam_id: uuid.UUID,
    exam_question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("exams:create")),
):
    await remove_question_from_exam(
        db, exam_id=exam_id, exam_question_id=exam_question_id, current_user=current_user
    )
    return success_response({"message": "Question removed from exam"})


# ── Student Exam Delivery & Auto-Save ───────────────────────────────────────

@router.post("/exams/{exam_id}/start")
async def start_or_resume_exam_endpoint(
    exam_id: uuid.UUID,
    payload: StartAttemptRequest | None = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("exams:take")),
):
    client_ip = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    fingerprint = payload.browser_fingerprint if payload else None

    delivery = await start_or_resume_attempt(
        db=db,
        exam_id=exam_id,
        student_user=current_user,
        client_ip=client_ip,
        user_agent=user_agent,
        browser_fingerprint=fingerprint,
    )
    return success_response(delivery.model_dump(mode="json"))


@router.put("/exam-attempts/{attempt_id}/answers")
async def save_answers_endpoint(
    attempt_id: uuid.UUID,
    payload: BatchSaveAnswersRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("exams:take")),
):
    result = await save_answers_batch(
        db=db,
        attempt_id=attempt_id,
        payload=payload,
        student_user=current_user,
    )
    return success_response(result)


@router.post("/exam-attempts/{attempt_id}/submit")
async def submit_exam_endpoint(
    attempt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("exams:take")),
):
    attempt = await submit_attempt(
        db=db,
        attempt_id=attempt_id,
        student_user=current_user,
        is_auto_submit=False,
    )
    return success_response({
        "attempt_id": str(attempt.id),
        "status": attempt.status,
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "total_score": attempt.total_score,
        "percentage": attempt.percentage,
    })


# ── Grading & Results ───────────────────────────────────────────────────────

@router.get("/exams/{exam_id}/attempts")
async def list_exam_attempts_endpoint(
    exam_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("exams:grade")),
):
    attempts = await list_attempts_for_exam(db, exam_id=exam_id)
    summaries = []
    for att in attempts:
        name = f"{att.student.first_name} {att.student.last_name}" if att.student else None
        email = att.student.email if att.student else None
        summaries.append(
            ExamAttemptSummary(
                id=att.id,
                exam_id=att.exam_id,
                student_id=att.student_id,
                student_name=name,
                student_email=email,
                attempt_number=att.attempt_number,
                started_at=att.started_at,
                submitted_at=att.submitted_at,
                status=att.status,
                total_score=att.total_score,
                percentage=att.percentage,
                proctor_violations_count=att.proctor_violations_count,
            ).model_dump(mode="json")
        )
    return success_response(summaries)


@router.post("/exam-responses/{response_id}/grade")
async def grade_exam_response_endpoint(
    response_id: uuid.UUID,
    payload: GradeSingleResponseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("exams:grade")),
):
    resp = await grade_attempt_response(
        db=db, response_id=response_id, payload=payload, current_user=current_user
    )
    return success_response({
        "response_id": str(resp.id),
        "marks_awarded": resp.marks_awarded,
        "feedback": resp.feedback,
        "attempt_total_score": resp.attempt.total_score,
        "attempt_status": resp.attempt.status,
    })


@router.post("/exams/{exam_id}/publish")
async def publish_exam_results_endpoint(
    exam_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("exams:grade")),
):
    exam = await publish_exam_results(db, exam_id=exam_id, current_user=current_user)
    return success_response({
        "exam_id": str(exam.id),
        "status": exam.status,
        "message": "Results published successfully and students notified",
    })


@router.get("/exams/{exam_id}/my-result")
async def get_my_exam_result_endpoint(
    exam_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await get_student_exam_result(db, exam_id=exam_id, student_user=current_user)
    return success_response(result.model_dump(mode="json"))
