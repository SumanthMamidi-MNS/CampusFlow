import uuid

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_permission
from campusflow.domain.question_banks.access import (
    assert_department_permitted,
    permitted_department_ids,
)
from campusflow.domain.question_banks.schemas import (
    BulkQuestionImportResponse,
    QuestionBankCreate,
    QuestionBankUpdate,
    QuestionCreate,
    QuestionResponse,
    QuestionUpdate,
)
from campusflow.domain.question_banks.service import (
    approve_question,
    bulk_import_questions_from_csv,
    create_question,
    create_question_bank,
    delete_question,
    delete_question_bank,
    export_questions_to_csv,
    get_question,
    get_question_bank,
    list_question_banks,
    list_questions,
    update_question,
    update_question_bank,
)
from campusflow.domain.users.models import User

router = APIRouter(tags=["question_banks"])

# Answer material lives behind this router, so reads and writes alike need
# the "questions:manage" capability *and* a department scope. The scope check
# runs through the shared kernel (domain.question_banks.access), never inline.
manage_questions = require_permission("questions:manage")


async def _assert_bank_in_scope(
    db: AsyncSession, current_user: User, department_id: uuid.UUID, *, purpose: str
) -> None:
    permitted = await permitted_department_ids(db, current_user)
    assert_department_permitted(permitted, department_id, purpose=purpose)


# ── Question Bank Endpoints ──────────────────────────────────────────────────
@router.post("/question-banks")
async def create_question_bank_endpoint(
    payload: QuestionBankCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(manage_questions),
):
    await _assert_bank_in_scope(
        db, current_user, payload.department_id, purpose="question bank authoring"
    )
    bank = await create_question_bank(db, payload=payload, current_user=current_user)
    resp = await get_question_bank(db, bank.id)
    return success_response(resp.model_dump(mode="json"))


@router.get("/question-banks")
async def list_question_banks_endpoint(
    department_id: uuid.UUID | None = Query(None),
    course_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(manage_questions),
):
    permitted = await permitted_department_ids(db, current_user)
    banks = await list_question_banks(
        db, department_id=department_id, course_id=course_id, department_ids=permitted
    )
    return success_response([b.model_dump(mode="json") for b in banks])


@router.get("/question-banks/{bank_id}")
async def get_question_bank_endpoint(
    bank_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(manage_questions),
):
    bank = await get_question_bank(db, bank_id=bank_id)
    await _assert_bank_in_scope(
        db, current_user, bank.department_id, purpose="question bank reading"
    )
    return success_response(bank.model_dump(mode="json"))


@router.put("/question-banks/{bank_id}")
async def update_question_bank_endpoint(
    bank_id: uuid.UUID,
    payload: QuestionBankUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(manage_questions),
):
    bank = await get_question_bank(db, bank_id=bank_id)
    await _assert_bank_in_scope(
        db, current_user, bank.department_id, purpose="question bank authoring"
    )
    await update_question_bank(db, bank_id=bank_id, payload=payload, current_user=current_user)
    bank = await get_question_bank(db, bank_id=bank_id)
    return success_response(bank.model_dump(mode="json"))


@router.delete("/question-banks/{bank_id}")
async def delete_question_bank_endpoint(
    bank_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(manage_questions),
):
    bank = await get_question_bank(db, bank_id=bank_id)
    await _assert_bank_in_scope(
        db, current_user, bank.department_id, purpose="question bank authoring"
    )
    await delete_question_bank(db, bank_id=bank_id, current_user=current_user)
    return success_response({"message": "Question bank deleted successfully"})


# ── Question Endpoints ───────────────────────────────────────────────────────
@router.post("/question-banks/{bank_id}/questions")
async def create_question_endpoint(
    bank_id: uuid.UUID,
    payload: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(manage_questions),
):
    bank = await get_question_bank(db, bank_id=bank_id)
    await _assert_bank_in_scope(
        db, current_user, bank.department_id, purpose="question authoring"
    )
    payload.question_bank_id = bank_id
    question = await create_question(db, payload=payload, current_user=current_user)
    return success_response(QuestionResponse.model_validate(question).model_dump(mode="json"))


@router.get("/question-banks/{bank_id}/questions")
async def list_questions_endpoint(
    bank_id: uuid.UUID,
    question_type: str | None = Query(None),
    difficulty: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(manage_questions),
):
    bank = await get_question_bank(db, bank_id=bank_id)
    await _assert_bank_in_scope(
        db, current_user, bank.department_id, purpose="question reading"
    )
    questions = await list_questions(
        db,
        question_bank_id=bank_id,
        question_type=question_type,
        difficulty=difficulty,
        status=status,
        search=search,
    )
    return success_response([QuestionResponse.model_validate(q).model_dump(mode="json") for q in questions])


@router.get("/questions/{question_id}")
async def get_question_endpoint(
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(manage_questions),
):
    question = await get_question(db, question_id=question_id)
    await _assert_bank_in_scope(
        db, current_user, question.question_bank.department_id, purpose="question reading"
    )
    return success_response(QuestionResponse.model_validate(question).model_dump(mode="json"))


@router.put("/questions/{question_id}")
async def update_question_endpoint(
    question_id: uuid.UUID,
    payload: QuestionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(manage_questions),
):
    question = await get_question(db, question_id=question_id)
    await _assert_bank_in_scope(
        db, current_user, question.question_bank.department_id, purpose="question authoring"
    )
    question = await update_question(db, question_id=question_id, payload=payload, current_user=current_user)
    return success_response(QuestionResponse.model_validate(question).model_dump(mode="json"))


@router.delete("/questions/{question_id}")
async def delete_question_endpoint(
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(manage_questions),
):
    question = await get_question(db, question_id=question_id)
    await _assert_bank_in_scope(
        db, current_user, question.question_bank.department_id, purpose="question authoring"
    )
    await delete_question(db, question_id=question_id, current_user=current_user)
    return success_response({"message": "Question deleted successfully"})


@router.post("/questions/{question_id}/approve")
async def approve_question_endpoint(
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(manage_questions),
):
    question = await get_question(db, question_id=question_id)
    await _assert_bank_in_scope(
        db, current_user, question.question_bank.department_id, purpose="question approval"
    )
    question = await approve_question(db, question_id=question_id, current_user=current_user)
    return success_response(QuestionResponse.model_validate(question).model_dump(mode="json"))


# ── Bulk CSV Import & Export ────────────────────────────────────────────────
@router.post("/question-banks/{bank_id}/import-csv")
async def bulk_import_csv_endpoint(
    bank_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(manage_questions),
):
    bank = await get_question_bank(db, bank_id=bank_id)
    await _assert_bank_in_scope(
        db, current_user, bank.department_id, purpose="question authoring"
    )
    content_bytes = await file.read()
    csv_text = content_bytes.decode("utf-8-sig", errors="replace")
    result: BulkQuestionImportResponse = await bulk_import_questions_from_csv(
        db, question_bank_id=bank_id, csv_content=csv_text, current_user=current_user
    )
    return success_response(result.model_dump(mode="json"))


@router.get("/question-banks/{bank_id}/export-csv")
async def export_csv_endpoint(
    bank_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(manage_questions),
):
    bank = await get_question_bank(db, bank_id=bank_id)
    await _assert_bank_in_scope(
        db, current_user, bank.department_id, purpose="question export"
    )
    csv_data = await export_questions_to_csv(db, question_bank_id=bank_id)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="question_bank_{bank_id}.csv"'},
    )
