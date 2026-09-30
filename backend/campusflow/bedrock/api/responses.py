from datetime import datetime
from typing import Any, Dict, Optional
from fastapi import Request


def success_response(data: Any, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    response_meta = meta or {}
    return {
        "data": data,
        "meta": response_meta
    }

def paginated_response(data: list, total: int, page: int, page_size: int) -> Dict[str, Any]:
    return success_response(
        data=data,
        meta={
            "pagination": {
                "total": total,
                "page": page,
                "page_size": page_size
            }
        }
    )
