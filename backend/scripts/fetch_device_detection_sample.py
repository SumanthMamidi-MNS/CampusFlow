"""Fetch a labelled still-image sample for measuring device detection.

The detector's accuracy is measured against official COCO val2017 ground truth,
not against impressions. Positives are images COCO annotated with a `cell phone`
covering at least ``--min-area`` of the frame; negatives are images containing a
person and no phone at all. The images are downloaded into the frontend project so
a browser measurement runs same-origin and the canvas is not tainted (a
cross-origin image would make the canvas unreadable and the measurement
impossible).

The whole qualifying set is used, not the largest phones. COCO val2017 holds 214
phone-annotated images; 91 of them have the phone covering at least 0.5% of the
frame and 46 at least 2%. Ranking by area and keeping the top twenty would
measure only phones held against the lens (11-71% of the frame) — the easiest
case, and not what a webcam sees at examination distance. Each row carries its
size bucket so the measurement can report recall per bucket instead of one
flattering average.

Usage (from the repository root):

    python backend/scripts/fetch_device_detection_sample.py              # 91 + 100
    python backend/scripts/fetch_device_detection_sample.py --min-area 0.02
    python backend/scripts/fetch_device_detection_sample.py --limit 30   # per class

The sample is disposable and git-ignored, and it is written to
``frontend/dev-measure/`` — **not** ``frontend/public/``: everything under the
public directory is copied into ``dist/`` by the production build, and this is a
hundred megabytes of COCO stills. The dev server serves it from the project root
just the same. Run the in-page measurement described in ``docs/development.md``
afterwards to produce precision/recall numbers.
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import urllib.request
import zipfile
from pathlib import Path

ANNOTATIONS_URL = "http://images.cocodataset.org/annotations/annotations_trainval2017.zip"
IMAGE_URL = "http://images.cocodataset.org/val2017/{file_name}"
REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "frontend" / "dev-measure"

# Phone size buckets as (lower, upper, label) over the phone's area as a fraction
# of the frame. The labels are what the harness groups by, so they are authored
# here once rather than being recomputed on both sides.
AREA_BUCKETS: tuple[tuple[float, float, str], ...] = (
    (0.005, 0.01, "0.5-1%"),
    (0.01, 0.02, "1-2%"),
    (0.02, 0.05, "2-5%"),
    (0.05, 0.10, "5-10%"),
    (0.10, 0.20, "10-20%"),
    (0.20, float("inf"), ">20%"),
)
BELOW_SAMPLE_LABEL = "<0.5%"


def _bucket_label(ratio: float) -> str:
    for lower, upper, label in AREA_BUCKETS:
        if lower <= ratio < upper:
            return label
    return BELOW_SAMPLE_LABEL


def _download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  fetching {url}")
    with urllib.request.urlopen(url) as response, open(dest, "wb") as handle:
        handle.write(response.read())


def _category_id(data: dict, name: str) -> int:
    return next(c["id"] for c in data["categories"] if c["name"] == name)


def _spread(image_ids: list[int], limit: int | None) -> list[int]:
    """Evenly spaced slice, so the negatives are not all the lowest image ids."""
    if not limit or len(image_ids) <= limit:
        return image_ids
    step = len(image_ids) / limit
    return [image_ids[int(index * step)] for index in range(limit)]


def _select(annotation_zip: Path, min_area: float, limit: int | None) -> list[dict]:
    with (
        zipfile.ZipFile(annotation_zip) as archive,
        archive.open("annotations/instances_val2017.json") as handle,
    ):
        data = json.load(handle)

    phone = _category_id(data, "cell phone")
    person = _category_id(data, "person")

    frame_area = {i["id"]: i["width"] * i["height"] for i in data["images"]}
    file_name = {i["id"]: i["file_name"] for i in data["images"]}

    phone_area: dict[int, float] = collections.defaultdict(float)
    has_person: set[int] = set()
    for annotation in data["annotations"]:
        if annotation["category_id"] == phone:
            ratio = annotation["area"] / max(1, frame_area[annotation["image_id"]])
            phone_area[annotation["image_id"]] = max(phone_area[annotation["image_id"]], ratio)
        elif annotation["category_id"] == person:
            has_person.add(annotation["image_id"])

    positives = sorted(
        ((image_id, ratio) for image_id, ratio in phone_area.items() if ratio >= min_area),
        key=lambda pair: -pair[1],
    )
    if limit:
        positives = positives[:limit]
    negatives = _spread(
        sorted(image_id for image_id in has_person if image_id not in phone_area), limit
    )

    rows = [
        {
            "file": file_name[image_id],
            "label": "phone",
            "phone_area_frac": round(ratio, 4),
            "bucket": _bucket_label(ratio),
        }
        for image_id, ratio in positives
    ]
    rows += [
        {"file": file_name[image_id], "label": "none", "bucket": None} for image_id in negatives
    ]
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--min-area",
        type=float,
        default=0.005,
        help="minimum phone area as a fraction of the frame (default: 0.005)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="cap per class (default: 100); 0 keeps every qualifying image",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path(os.environ.get("TEMP", "/tmp")) / "campusflow-coco",
        help="where to keep the annotations zip between runs",
    )
    args = parser.parse_args()

    cache = args.cache_dir
    cache.mkdir(parents=True, exist_ok=True)
    annotation_zip = cache / "annotations_trainval2017.zip"
    if not annotation_zip.exists():
        print("Downloading COCO val2017 annotations (about 250 MB, cached afterwards)...")
        _download(ANNOTATIONS_URL, annotation_zip)

    rows = _select(annotation_zip, args.min_area, args.limit or None)
    positives = [row for row in rows if row["label"] == "phone"]

    if not positives:
        print(
            "No annotated phone images matched. COCO val2017 only has a few dozen "
            "images with a phone this large; lower --min-area to widen the sample."
        )
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for row in rows:
        _download(IMAGE_URL.format(file_name=row["file"]), OUT_DIR / row["file"])
    (OUT_DIR / "manifest.json").write_text(json.dumps(rows, indent=1))

    print(f"sample written to {OUT_DIR}")
    print(f"  positives: {len(positives)}  negatives: {len(rows) - len(positives)}")
    sizes = collections.Counter(row["bucket"] for row in positives)
    for _, _, label in AREA_BUCKETS:
        if sizes[label]:
            print(f"    phone covering {label} of the frame: {sizes[label]}")
    print("Now run the in-page measurement from docs/development.md.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
