import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from campusflow.bedrock.api.errors import NotFoundError
from campusflow.bedrock.storage.service import get_storage
from campusflow.domain.materials.models import Material, MaterialFolder
from campusflow.domain.materials.schemas import MaterialCreate, MaterialFolderCreate


# ── Folders ─────────────────────────────────────────────────────────────────
async def create_folder(
    db: AsyncSession, offering_id: uuid.UUID, payload: MaterialFolderCreate
) -> MaterialFolder:
    folder = MaterialFolder(
        course_offering_id=offering_id,
        parent_id=payload.parent_id,
        title=payload.title,
        sort_order=payload.sort_order,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return folder


async def list_folders(db: AsyncSession, offering_id: uuid.UUID) -> list[MaterialFolder]:
    res = await db.execute(
        select(MaterialFolder)
        .where(MaterialFolder.course_offering_id == offering_id)
        .order_by(MaterialFolder.sort_order, MaterialFolder.title)
    )
    return list(res.scalars().all())


# ── Materials ───────────────────────────────────────────────────────────────
async def create_link_or_text_material(
    db: AsyncSession, offering_id: uuid.UUID, payload: MaterialCreate
) -> Material:
    material = Material(
        course_offering_id=offering_id,
        folder_id=payload.folder_id,
        title=payload.title,
        material_type=payload.material_type,
        url=payload.url,
        content_text=payload.content_text,
        sort_order=payload.sort_order,
    )
    db.add(material)
    await db.commit()
    await db.refresh(material)
    return material


async def upload_file_material(
    db: AsyncSession,
    offering_id: uuid.UUID,
    title: str,
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    folder_id: uuid.UUID | None = None,
) -> Material:
    storage = get_storage()
    sanitized_name = "".join(c for c in filename if c.isalnum() or c in "._- ")
    storage_path = f"materials/{offering_id}/{uuid.uuid4()}_{sanitized_name}"
    await storage.upload(storage_path, file_bytes, content_type=mime_type)

    material = Material(
        course_offering_id=offering_id,
        folder_id=folder_id,
        title=title or filename,
        material_type="file",
        file_path=storage_path,
        file_size=len(file_bytes),
        mime_type=mime_type,
    )
    db.add(material)
    await db.commit()
    await db.refresh(material)
    return material


async def list_materials(
    db: AsyncSession,
    offering_id: uuid.UUID,
    folder_id: uuid.UUID | None = None,
) -> list[Material]:
    query = select(Material).where(
        Material.course_offering_id == offering_id,
        Material.is_published.is_(True),
    )
    if folder_id is not None:
        query = query.where(Material.folder_id == folder_id)

    res = await db.execute(query.order_by(Material.sort_order, Material.created_at.desc()))
    return list(res.scalars().all())


async def get_material(db: AsyncSession, material_id: uuid.UUID) -> Material:
    res = await db.execute(select(Material).where(Material.id == material_id))
    m = res.scalar_one_or_none()
    if not m:
        raise NotFoundError("Material not found.")
    return m


async def download_material_file(
    db: AsyncSession, material_id: uuid.UUID
) -> tuple[bytes, str, str]:
    material = await get_material(db, material_id)
    if material.material_type != "file" or not material.file_path:
        raise NotFoundError("This material item is not a downloadable file.")

    storage = get_storage()
    file_bytes = await storage.download(material.file_path)
    filename = material.file_path.split("/")[-1].split("_", 1)[-1]
    return file_bytes, filename, material.mime_type or "application/octet-stream"
