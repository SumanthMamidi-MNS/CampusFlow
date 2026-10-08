import uuid

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.responses import success_response
from campusflow.bedrock.auth.dependencies import get_current_active_user
from campusflow.bedrock.db.session import get_db
from campusflow.bedrock.rbac.dependencies import require_permission
from campusflow.domain.courses.access import (
    assert_can_manage_offering,
    assert_can_view_offering,
)
from campusflow.domain.materials.schemas import (
    MaterialCreate,
    MaterialFolderCreate,
    MaterialFolderResponse,
    MaterialResponse,
)
from campusflow.domain.materials.service import (
    create_folder,
    create_link_or_text_material,
    download_material_file,
    get_material,
    list_folders,
    list_materials,
    upload_file_material,
)
from campusflow.domain.users.models import User

router = APIRouter(tags=["materials"])


# Folders
@router.get("/course-offerings/{offering_id}/folders")
async def get_folders_endpoint(
    offering_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await assert_can_view_offering(db, current_user, offering_id, purpose="course material access")
    folders = await list_folders(db, offering_id)
    return success_response(
        [MaterialFolderResponse.model_validate(f).model_dump(mode="json") for f in folders]
    )


@router.post("/course-offerings/{offering_id}/folders")
async def create_folder_endpoint(
    offering_id: uuid.UUID,
    payload: MaterialFolderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("materials:manage")),
):
    await assert_can_manage_offering(
        db, current_user, offering_id, purpose="course material management"
    )
    folder = await create_folder(db, offering_id, payload)
    return success_response(MaterialFolderResponse.model_validate(folder).model_dump(mode="json"))


# Materials
@router.get("/course-offerings/{offering_id}/materials")
async def get_materials_endpoint(
    offering_id: uuid.UUID,
    folder_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await assert_can_view_offering(db, current_user, offering_id, purpose="course material access")
    materials = await list_materials(db, offering_id, folder_id=folder_id)
    return success_response(
        [MaterialResponse.model_validate(m).model_dump(mode="json") for m in materials]
    )


@router.post("/course-offerings/{offering_id}/materials")
async def create_material_endpoint(
    offering_id: uuid.UUID,
    payload: MaterialCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("materials:manage")),
):
    await assert_can_manage_offering(
        db, current_user, offering_id, purpose="course material management"
    )
    material = await create_link_or_text_material(db, offering_id, payload)
    return success_response(MaterialResponse.model_validate(material).model_dump(mode="json"))


@router.post("/course-offerings/{offering_id}/materials/upload")
async def upload_material_file_endpoint(
    offering_id: uuid.UUID,
    title: str = Form(...),
    folder_id: uuid.UUID | None = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("materials:manage")),
):
    await assert_can_manage_offering(
        db, current_user, offering_id, purpose="course material management"
    )
    file_bytes = await file.read()
    material = await upload_file_material(
        db=db,
        offering_id=offering_id,
        title=title,
        file_bytes=file_bytes,
        filename=file.filename or "upload.bin",
        mime_type=file.content_type or "application/octet-stream",
        folder_id=folder_id,
    )
    return success_response(MaterialResponse.model_validate(material).model_dump(mode="json"))


@router.get("/materials/{material_id}/download")
async def download_file_endpoint(
    material_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    material = await get_material(db, material_id)
    await assert_can_view_offering(
        db, current_user, material.course_offering_id, purpose="course material access"
    )
    file_bytes, filename, mime_type = await download_material_file(db, material_id)
    return Response(
        content=file_bytes,
        media_type=mime_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
