import csv
import io
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from campusflow.bedrock.api.errors import NotFoundError
from campusflow.bedrock.audit.service import record_audit_event
from campusflow.domain.departments.models import Department
from campusflow.domain.question_banks.models import (
    Question,
    QuestionBank,
    QuestionOption,
)
from campusflow.domain.question_banks.schemas import (
    BulkQuestionImportResponse,
    QuestionBankCreate,
    QuestionBankResponse,
    QuestionBankUpdate,
    QuestionCreate,
    QuestionOptionCreate,
    QuestionUpdate,
)
from campusflow.domain.users.models import User

VALID_QUESTION_TYPES = {
    "mcq",
    "msq",
    "true_false",
    "numerical",
    "short_answer",
    "essay",
    "fill_blank",
}


def validate_question_structure(
    question_type: str,
    options: list[QuestionOptionCreate] | list[dict[str, Any]] | None,
    metadata_info: dict[str, Any] | None,
) -> None:
    if question_type not in VALID_QUESTION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid question type '{question_type}'. Must be one of: {', '.join(sorted(VALID_QUESTION_TYPES))}",
        )

    opts = options or []

    if question_type == "mcq":
        if len(opts) < 2:
            raise HTTPException(
                status_code=400,
                detail="MCQ questions must have at least 2 options.",
            )
        correct_count = sum(
            1 for o in opts if (o.is_correct if isinstance(o, QuestionOptionCreate) else o.get("is_correct"))
        )
        if correct_count != 1:
            raise HTTPException(
                status_code=400,
                detail=f"MCQ questions must have exactly 1 correct option. Found {correct_count}.",
            )

    elif question_type == "msq":
        if len(opts) < 2:
            raise HTTPException(
                status_code=400,
                detail="MSQ questions must have at least 2 options.",
            )
        correct_count = sum(
            1 for o in opts if (o.is_correct if isinstance(o, QuestionOptionCreate) else o.get("is_correct"))
        )
        if correct_count < 1:
            raise HTTPException(
                status_code=400,
                detail="MSQ questions must have at least 1 correct option.",
            )

    elif question_type == "true_false":
        if len(opts) != 2:
            raise HTTPException(
                status_code=400,
                detail="True/False questions must have exactly 2 options (True and False).",
            )
        correct_count = sum(
            1 for o in opts if (o.is_correct if isinstance(o, QuestionOptionCreate) else o.get("is_correct"))
        )
        if correct_count != 1:
            raise HTTPException(
                status_code=400,
                detail="True/False questions must have exactly 1 correct option.",
            )


# ── Question Bank CRUD ──────────────────────────────────────────────────────
async def create_question_bank(
    db: AsyncSession,
    payload: QuestionBankCreate,
    current_user: User,
) -> QuestionBank:
    dept = await db.get(Department, payload.department_id)
    if not dept:
        raise NotFoundError("Department not found")

    bank = QuestionBank(
        department_id=payload.department_id,
        course_id=payload.course_id,
        title=payload.title,
        description=payload.description,
        created_by_id=current_user.id,
    )
    db.add(bank)
    await db.commit()
    await db.refresh(bank)

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="question_bank.create",
        resource_type="question_bank",
        resource_id=str(bank.id),
        extra_data={"title": bank.title, "department_id": str(bank.department_id)},
    )
    return bank


async def get_question_bank(
    db: AsyncSession,
    bank_id: uuid.UUID,
) -> QuestionBankResponse:
    query = (
        select(QuestionBank)
        .where(QuestionBank.id == bank_id)
        .options(
            selectinload(QuestionBank.department),
            selectinload(QuestionBank.course),
        )
    )
    res = await db.execute(query)
    bank = res.scalar_one_or_none()
    if not bank:
        raise NotFoundError("Question bank not found")

    count_res = await db.execute(
        select(func.count(Question.id)).where(Question.question_bank_id == bank_id)
    )
    q_count = count_res.scalar_one_or_none() or 0

    resp = QuestionBankResponse.model_validate(bank)
    resp.department_name = bank.department.name if bank.department else None
    resp.course_title = bank.course.title if bank.course else None
    resp.questions_count = q_count
    return resp


async def list_question_banks(
    db: AsyncSession,
    department_id: uuid.UUID | None = None,
    course_id: uuid.UUID | None = None,
    *,
    department_ids: set[uuid.UUID] | None = None,
) -> list[QuestionBankResponse]:
    """List banks, optionally filtered by one department and by the set of
    departments the caller may see.

    ``department_ids=None`` means "no department restriction" (the caller has
    institution-wide scope); an explicit empty set yields no rows.
    """
    query = (
        select(QuestionBank)
        .options(
            selectinload(QuestionBank.department),
            selectinload(QuestionBank.course),
        )
        .order_by(desc(QuestionBank.created_at))
    )
    if department_id:
        query = query.where(QuestionBank.department_id == department_id)
    if course_id:
        query = query.where(QuestionBank.course_id == course_id)
    if department_ids is not None:
        query = query.where(QuestionBank.department_id.in_(department_ids))

    res = await db.execute(query)
    banks = list(res.scalars().all())

    if not banks:
        return []

    bank_ids = [b.id for b in banks]
    count_res = await db.execute(
        select(Question.question_bank_id, func.count(Question.id))
        .where(Question.question_bank_id.in_(bank_ids))
        .group_by(Question.question_bank_id)
    )
    counts = dict(count_res.all())

    results = []
    for b in banks:
        resp = QuestionBankResponse.model_validate(b)
        resp.department_name = b.department.name if b.department else None
        resp.course_title = b.course.title if b.course else None
        resp.questions_count = counts.get(b.id, 0)
        results.append(resp)

    return results


async def update_question_bank(
    db: AsyncSession,
    bank_id: uuid.UUID,
    payload: QuestionBankUpdate,
    current_user: User,
) -> QuestionBank:
    bank = await db.get(QuestionBank, bank_id)
    if not bank:
        raise NotFoundError("Question bank not found")

    update_dict = payload.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(bank, field, value)

    await db.commit()
    await db.refresh(bank)

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="question_bank.update",
        resource_type="question_bank",
        resource_id=str(bank.id),
        changes=update_dict,
    )
    return bank


async def delete_question_bank(
    db: AsyncSession,
    bank_id: uuid.UUID,
    current_user: User,
) -> None:
    bank = await db.get(QuestionBank, bank_id)
    if not bank:
        raise NotFoundError("Question bank not found")

    await db.delete(bank)
    await db.commit()

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="question_bank.delete",
        resource_type="question_bank",
        resource_id=str(bank.id),
    )


# ── Question CRUD ───────────────────────────────────────────────────────────
async def create_question(
    db: AsyncSession,
    payload: QuestionCreate,
    current_user: User,
) -> Question:
    bank = await db.get(QuestionBank, payload.question_bank_id)
    if not bank:
        raise NotFoundError("Question bank not found")

    validate_question_structure(payload.question_type, payload.options, payload.metadata_info)

    question = Question(
        question_bank_id=payload.question_bank_id,
        question_type=payload.question_type,
        difficulty=payload.difficulty,
        marks=payload.marks,
        negative_marks=payload.negative_marks,
        body=payload.body,
        explanation=payload.explanation,
        tags=payload.tags,
        metadata_info=payload.metadata_info,
        status=payload.status,
        created_by_id=current_user.id,
    )
    db.add(question)
    await db.flush()

    if payload.options:
        for idx, opt in enumerate(payload.options):
            option = QuestionOption(
                question_id=question.id,
                label=opt.label or chr(65 + idx),
                body=opt.body,
                is_correct=opt.is_correct,
                sort_order=opt.sort_order if opt.sort_order is not None else idx,
            )
            db.add(option)

    await db.commit()
    await db.refresh(question)

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="question.create",
        resource_type="question",
        resource_id=str(question.id),
        extra_data={"question_bank_id": str(question.question_bank_id), "type": question.question_type},
    )
    return question


async def get_question(
    db: AsyncSession,
    question_id: uuid.UUID,
) -> Question:
    query = (
        select(Question)
        .where(Question.id == question_id)
        .options(
            selectinload(Question.options),
            selectinload(Question.question_bank),
        )
    )
    res = await db.execute(query)
    q = res.scalar_one_or_none()
    if not q:
        raise NotFoundError("Question not found")
    return q


async def list_questions(
    db: AsyncSession,
    question_bank_id: uuid.UUID,
    question_type: str | None = None,
    difficulty: str | None = None,
    status: str | None = None,
    search: str | None = None,
) -> list[Question]:
    query = (
        select(Question)
        .where(Question.question_bank_id == question_bank_id)
        .options(selectinload(Question.options))
        .order_by(Question.created_at.asc())
    )
    if question_type:
        query = query.where(Question.question_type == question_type)
    if difficulty:
        query = query.where(Question.difficulty == difficulty)
    if status:
        query = query.where(Question.status == status)
    if search:
        query = query.where(Question.body.ilike(f"%{search}%"))

    res = await db.execute(query)
    return list(res.scalars().all())


async def update_question(
    db: AsyncSession,
    question_id: uuid.UUID,
    payload: QuestionUpdate,
    current_user: User,
) -> Question:
    query = (
        select(Question)
        .where(Question.id == question_id)
        .options(selectinload(Question.options))
    )
    res = await db.execute(query)
    question = res.scalar_one_or_none()
    if not question:
        raise NotFoundError("Question not found")

    q_type = payload.question_type or question.question_type
    opts = payload.options if payload.options is not None else [
        QuestionOptionCreate(label=o.label, body=o.body, is_correct=o.is_correct, sort_order=o.sort_order)
        for o in question.options
    ]
    meta = payload.metadata_info if payload.metadata_info is not None else question.metadata_info

    validate_question_structure(q_type, opts, meta)

    update_dict = payload.model_dump(exclude_unset=True, exclude={"options"})
    for field, value in update_dict.items():
        setattr(question, field, value)

    # If options explicitly updated, replace options
    if payload.options is not None:
        question.options.clear()
        for idx, opt in enumerate(payload.options):
            option = QuestionOption(
                question_id=question.id,
                label=opt.label or chr(65 + idx),
                body=opt.body,
                is_correct=opt.is_correct,
                sort_order=opt.sort_order if opt.sort_order is not None else idx,
            )
            db.add(option)

    await db.commit()
    await db.refresh(question)

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="question.update",
        resource_type="question",
        resource_id=str(question.id),
        changes=update_dict,
    )
    return question


async def delete_question(
    db: AsyncSession,
    question_id: uuid.UUID,
    current_user: User,
) -> None:
    question = await db.get(Question, question_id)
    if not question:
        raise NotFoundError("Question not found")

    await db.delete(question)
    await db.commit()

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="question.delete",
        resource_type="question",
        resource_id=str(question.id),
    )


async def approve_question(
    db: AsyncSession,
    question_id: uuid.UUID,
    current_user: User,
) -> Question:
    question = await db.get(Question, question_id)
    if not question:
        raise NotFoundError("Question not found")

    question.status = "approved"
    question.approved_by_id = current_user.id
    await db.commit()
    await db.refresh(question)

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="question.approve",
        resource_type="question",
        resource_id=str(question.id),
    )
    return question


# ── Bulk Import & CSV Export ────────────────────────────────────────────────
async def bulk_import_questions_from_csv(
    db: AsyncSession,
    question_bank_id: uuid.UUID,
    csv_content: str,
    current_user: User,
) -> BulkQuestionImportResponse:
    bank = await db.get(QuestionBank, question_bank_id)
    if not bank:
        raise NotFoundError("Question bank not found")

    reader = csv.DictReader(io.StringIO(csv_content))
    imported_count = 0
    failed_count = 0
    errors: list[str] = []

    for row_idx, row in enumerate(reader, start=1):
        try:
            q_type = (row.get("question_type") or "mcq").strip().lower()
            diff = (row.get("difficulty") or "medium").strip().lower()
            body = (row.get("body") or "").strip()
            marks = float(row.get("marks") or 1.0)
            neg_marks = float(row.get("negative_marks") or 0.0)
            explanation = (row.get("explanation") or "").strip() or None
            tags_raw = (row.get("tags") or "").strip()
            tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else None

            if not body:
                raise ValueError("Question body cannot be empty.")

            # Parse options
            options_raw = (row.get("options") or "").strip()
            correct_raw = (row.get("correct_options") or "").strip()

            options_list: list[QuestionOptionCreate] = []
            if options_raw:
                split_opts = [o.strip() for o in options_raw.split("|") if o.strip()]
                correct_set = {c.strip() for c in correct_raw.split("|") if c.strip()}
                for idx, opt_body in enumerate(split_opts):
                    label = chr(65 + idx)
                    is_corr = opt_body in correct_set or label in correct_set
                    options_list.append(
                        QuestionOptionCreate(
                            label=label,
                            body=opt_body,
                            is_correct=is_corr,
                            sort_order=idx,
                        )
                    )

            # Metadata info
            metadata_info = {}
            if row.get("accepted_answers"):
                metadata_info["accepted_answers"] = [
                    a.strip() for a in row["accepted_answers"].split("|") if a.strip()
                ]
            if row.get("numerical_answer"):
                metadata_info["answer"] = float(row["numerical_answer"])
            if row.get("tolerance"):
                metadata_info["tolerance"] = float(row["tolerance"])

            validate_question_structure(
                q_type,
                options_list if options_list else None,
                metadata_info or None,
            )

            q = Question(
                question_bank_id=question_bank_id,
                question_type=q_type,
                difficulty=diff if diff in ("easy", "medium", "hard") else "medium",
                marks=marks,
                negative_marks=neg_marks,
                body=body,
                explanation=explanation,
                tags=tags,
                metadata_info=metadata_info or None,
                status="approved",
                created_by_id=current_user.id,
                approved_by_id=current_user.id,
            )
            db.add(q)
            await db.flush()

            for opt in options_list:
                db.add(
                    QuestionOption(
                        question_id=q.id,
                        label=opt.label,
                        body=opt.body,
                        is_correct=opt.is_correct,
                        sort_order=opt.sort_order,
                    )
                )

            imported_count += 1
        except Exception as exc:
            failed_count += 1
            errors.append(f"Row {row_idx}: {exc}")

    await db.commit()

    await record_audit_event(
        db=db,
        user_id=current_user.id,
        user_email=current_user.email,
        action="question_bank.bulk_import",
        resource_type="question_bank",
        resource_id=str(question_bank_id),
        extra_data={"imported": imported_count, "failed": failed_count},
    )

    return BulkQuestionImportResponse(
        imported_count=imported_count,
        failed_count=failed_count,
        errors=errors,
    )


async def export_questions_to_csv(
    db: AsyncSession,
    question_bank_id: uuid.UUID,
) -> str:
    questions = await list_questions(db, question_bank_id=question_bank_id)
    output = io.StringIO()
    writer = csv.writer(output)

    headers = [
        "question_type",
        "difficulty",
        "marks",
        "negative_marks",
        "body",
        "options",
        "correct_options",
        "explanation",
        "tags",
        "accepted_answers",
        "numerical_answer",
        "tolerance",
    ]
    writer.writerow(headers)

    for q in questions:
        opts_str = "|".join(o.body for o in q.options) if q.options else ""
        corr_str = "|".join(o.body for o in q.options if o.is_correct) if q.options else ""
        tags_str = ",".join(q.tags) if q.tags else ""
        acc_str = (
            "|".join(q.metadata_info.get("accepted_answers", []))
            if q.metadata_info and "accepted_answers" in q.metadata_info
            else ""
        )
        num_ans = str(q.metadata_info.get("answer", "")) if q.metadata_info else ""
        tol = str(q.metadata_info.get("tolerance", "")) if q.metadata_info else ""

        writer.writerow([
            q.question_type,
            q.difficulty,
            q.marks,
            q.negative_marks,
            q.body,
            opts_str,
            corr_str,
            q.explanation or "",
            tags_str,
            acc_str,
            num_ans,
            tol,
        ])

    return output.getvalue()
