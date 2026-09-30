from typing import Any


def success_response(data: Any, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    response_meta = meta or {}
    return {"data": data, "meta": response_meta}


def paginated_response(data: list, total: int, page: int, page_size: int) -> dict[str, Any]:
    return success_response(
        data=data, meta={"pagination": {"total": total, "page": page, "page_size": page_size}}
    )
