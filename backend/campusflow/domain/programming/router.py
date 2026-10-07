import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.auth.dependencies import get_current_active_user
from campusflow.bedrock.config.settings import get_settings
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_permission
from campusflow.bedrock.runner.service import get_runner
from campusflow.domain.programming.schemas import (
    CodeRunRequest,
    CodeRunResponse,
    CodingProblemCreate,
    CodingProblemUpdate,
    CodingTestCaseCreate,
)
from campusflow.domain.programming.service import (
    add_test_case,
    create_problem,
    delete_problem,
    delete_test_case,
    get_problem,
    list_my_submissions,
    list_problem_submissions,
    list_problems,
    list_test_cases,
    run_problem_code,
    submit_problem,
    update_problem,
)
from campusflow.domain.users.models import User

router = APIRouter(tags=["programming"])


# ── Problems ────────────────────────────────────────────────────────────────
@router.get("/programming/problems")
async def list_problems_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    problems = await list_problems(db, current_user=current_user)
    return success_response([p.model_dump(mode="json") for p in problems])


@router.post("/programming/problems")
async def create_problem_endpoint(
    payload: CodingProblemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("programming:manage")),
):
    problem = await create_problem(db, payload=payload, current_user=current_user)
    return success_response(problem.model_dump(mode="json"))


@router.get("/programming/problems/{problem_id}")
async def get_problem_endpoint(
    problem_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    problem = await get_problem(db, problem_id=problem_id, current_user=current_user)
    return success_response(problem.model_dump(mode="json"))


@router.patch("/programming/problems/{problem_id}")
async def update_problem_endpoint(
    problem_id: uuid.UUID,
    payload: CodingProblemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("programming:manage")),
):
    problem = await update_problem(db, problem_id=problem_id, payload=payload, current_user=current_user)
    return success_response(problem.model_dump(mode="json"))


@router.delete("/programming/problems/{problem_id}")
async def delete_problem_endpoint(
    problem_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("programming:manage")),
):
    await delete_problem(db, problem_id=problem_id, current_user=current_user)
    return success_response({"deleted": True})


# ── Test cases (faculty only) ──────────────────────────────────────────────
@router.get("/programming/problems/{problem_id}/test-cases")
async def list_test_cases_endpoint(
    problem_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("programming:manage")),
):
    cases = await list_test_cases(db, problem_id=problem_id)
    return success_response([c.model_dump(mode="json") for c in cases])


@router.post("/programming/problems/{problem_id}/test-cases")
async def add_test_case_endpoint(
    problem_id: uuid.UUID,
    payload: CodingTestCaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("programming:manage")),
):
    case = await add_test_case(db, problem_id=problem_id, payload=payload, current_user=current_user)
    return success_response(case.model_dump(mode="json"))


@router.delete("/programming/test-cases/{test_case_id}")
async def delete_test_case_endpoint(
    test_case_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("programming:manage")),
):
    await delete_test_case(db, test_case_id=test_case_id, current_user=current_user)
    return success_response({"deleted": True})


# ── Execution & grading ────────────────────────────────────────────────────
@router.post("/programming/problems/{problem_id}/run")
async def run_problem_endpoint(
    problem_id: uuid.UUID,
    payload: CodeRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("programming:submit")),
):
    result = await run_problem_code(
        db,
        problem_id=problem_id,
        source_code=payload.source_code,
        stdin=payload.stdin,
        current_user=current_user,
    )
    return success_response(
        CodeRunResponse(
            status=result.status,
            stdout=result.stdout,
            stderr=result.stderr,
            exit_code=result.exit_code,
            duration_ms=result.duration_ms,
            timed_out=result.timed_out,
            message=result.message,
        ).model_dump(mode="json")
    )


@router.post("/programming/problems/{problem_id}/submit")
async def submit_problem_endpoint(
    problem_id: uuid.UUID,
    payload: CodeRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("programming:submit")),
):
    submission = await submit_problem(
        db,
        problem_id=problem_id,
        source_code=payload.source_code,
        current_user=current_user,
    )
    return success_response(submission.model_dump(mode="json"))


@router.get("/programming/problems/{problem_id}/submissions")
async def list_problem_submissions_endpoint(
    problem_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("programming:manage")),
):
    submissions = await list_problem_submissions(db, problem_id=problem_id, current_user=current_user)
    return success_response([s.model_dump(mode="json") for s in submissions])


@router.get("/programming/problems/{problem_id}/my-submissions")
async def list_my_submissions_endpoint(
    problem_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("programming:submit")),
):
    submissions = await list_my_submissions(db, problem_id=problem_id, current_user=current_user)
    return success_response([s.model_dump(mode="json") for s in submissions])


# ── Runner health ──────────────────────────────────────────────────────────
@router.get("/programming/health")
async def runner_health_endpoint(
    current_user: User = Depends(get_current_active_user),
):
    settings = get_settings()
    runner = get_runner()
    if not settings.code_runner_enabled or runner is None:
        return success_response(
            {"enabled": False, "backend": settings.code_runner_backend, "reachable": False}
        )
    reachable = await runner.health()
    return success_response(
        {"enabled": True, "backend": settings.code_runner_backend, "reachable": reachable}
    )
