#!/usr/bin/env python3
"""사진을 촬영 시간 순으로 이름 변경하는 스크립트.

사용법:
    python rename_photos.py <폴더경로> [옵션]

옵션:
    --dry-run     실제 변경 없이 미리보기만 출력
    --prefix      파일명 앞에 붙일 텍스트 (기본값: 없음)
    --format      날짜 형식 (기본값: %Y%m%d_%H%M%S)
    --start-index 번호 시작값 (기본값: 1)

예시:
    python rename_photos.py ./사진폴더
    python rename_photos.py ./사진폴더 --dry-run
    python rename_photos.py ./사진폴더 --prefix "여행_"
    python rename_photos.py ./사진폴더 --format "%Y-%m-%d_%H-%M-%S"
"""

import argparse
import os
import struct
import sys
from datetime import datetime
from pathlib import Path

SUPPORTED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".heic", ".heif",
    ".tiff", ".tif", ".bmp", ".webp", ".raw",
    ".cr2", ".cr3", ".nef", ".arw", ".dng",
}

# EXIF 태그 ID
EXIF_TAG_DATETIME_ORIGINAL = 0x9003
EXIF_TAG_DATETIME_DIGITIZED = 0x9004
EXIF_TAG_DATETIME = 0x0132
EXIF_TAG_EXIF_IFD = 0x8769

EXIF_DATETIME_FORMAT = "%Y:%m:%d %H:%M:%S"


def _read_uint16(data, offset, little_endian):
    fmt = "<H" if little_endian else ">H"
    return struct.unpack_from(fmt, data, offset)[0]


def _read_uint32(data, offset, little_endian):
    fmt = "<I" if little_endian else ">I"
    return struct.unpack_from(fmt, data, offset)[0]


def _parse_ifd(data, ifd_offset, little_endian, target_tags):
    """IFD에서 지정된 태그 값들을 파싱해 반환."""
    results = {}
    try:
        count = _read_uint16(data, ifd_offset, little_endian)
        for i in range(count):
            entry_offset = ifd_offset + 2 + i * 12
            tag = _read_uint16(data, entry_offset, little_endian)
            if tag not in target_tags:
                continue
            type_ = _read_uint16(data, entry_offset + 2, little_endian)
            components = _read_uint32(data, entry_offset + 4, little_endian)
            value_offset = _read_uint32(data, entry_offset + 8, little_endian)
            # type 2 = ASCII string
            if type_ == 2:
                start = value_offset if components > 4 else entry_offset + 8
                end = start + components
                if end <= len(data):
                    results[tag] = data[start:end].rstrip(b"\x00").decode("ascii", errors="ignore")
            # type 4 = LONG (for sub-IFD offset)
            elif type_ == 4:
                results[tag] = value_offset
    except (struct.error, IndexError):
        pass
    return results


def _get_exif_datetime_from_jpeg(data):
    """JPEG 파일 바이너리에서 EXIF 촬영 시간 추출."""
    pos = 0
    if data[:2] != b"\xff\xd8":
        return None
    pos = 2
    while pos + 4 <= len(data):
        marker = data[pos:pos + 2]
        if marker[0] != 0xFF:
            break
        seg_len = struct.unpack_from(">H", data, pos + 2)[0]
        if marker == b"\xff\xe1":  # APP1 (EXIF)
            app1 = data[pos + 4: pos + 2 + seg_len]
            if app1[:6] == b"Exif\x00\x00":
                return _parse_tiff_exif(app1[6:])
        pos += 2 + seg_len
    return None


def _get_exif_datetime_from_tiff(data):
    """TIFF 파일 바이너리에서 EXIF 촬영 시간 추출."""
    return _parse_tiff_exif(data)


def _parse_tiff_exif(data):
    """TIFF/EXIF 바이너리 블록에서 촬영 시간 추출."""
    if len(data) < 8:
        return None
    byte_order = data[:2]
    if byte_order == b"II":
        little_endian = True
    elif byte_order == b"MM":
        little_endian = False
    else:
        return None

    magic = _read_uint16(data, 2, little_endian)
    if magic != 42:
        return None

    ifd0_offset = _read_uint32(data, 4, little_endian)
    ifd0 = _parse_ifd(data, ifd0_offset, little_endian,
                       {EXIF_TAG_DATETIME, EXIF_TAG_EXIF_IFD})

    datetime_str = None
    if EXIF_TAG_EXIF_IFD in ifd0:
        exif_ifd = _parse_ifd(data, ifd0[EXIF_TAG_EXIF_IFD], little_endian,
                               {EXIF_TAG_DATETIME_ORIGINAL, EXIF_TAG_DATETIME_DIGITIZED})
        datetime_str = (exif_ifd.get(EXIF_TAG_DATETIME_ORIGINAL)
                        or exif_ifd.get(EXIF_TAG_DATETIME_DIGITIZED))

    if not datetime_str:
        datetime_str = ifd0.get(EXIF_TAG_DATETIME)

    if datetime_str:
        try:
            return datetime.strptime(datetime_str.strip(), EXIF_DATETIME_FORMAT)
        except ValueError:
            pass
    return None


def get_photo_datetime(path: Path) -> datetime:
    """사진의 촬영 시간을 반환. EXIF → 파일 수정 시간 순으로 시도."""
    ext = path.suffix.lower()
    try:
        with open(path, "rb") as f:
            header = f.read(min(65536, os.path.getsize(path)))

        dt = None
        if ext in (".jpg", ".jpeg"):
            dt = _get_exif_datetime_from_jpeg(header)
        elif ext in (".tiff", ".tif", ".dng", ".cr2", ".cr3", ".nef", ".arw"):
            dt = _get_exif_datetime_from_tiff(header)

        if dt:
            return dt
    except (OSError, struct.error):
        pass

    return datetime.fromtimestamp(path.stat().st_mtime)


def collect_photos(folder: Path) -> list[tuple[datetime, Path]]:
    """폴더에서 지원하는 이미지 파일을 수집하고 시간 순 정렬."""
    photos = []
    for p in folder.iterdir():
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS:
            dt = get_photo_datetime(p)
            photos.append((dt, p))
    photos.sort(key=lambda x: x[0])
    return photos


def build_new_name(dt: datetime, index: int, total: int,
                   prefix: str, date_format: str, ext: str) -> str:
    """새 파일명 생성. 동일 시간 파일 구분을 위해 인덱스 번호 포함."""
    digits = len(str(total))
    timestamp = dt.strftime(date_format)
    num = str(index).zfill(digits)
    return f"{prefix}{timestamp}_{num}{ext}"


def rename_photos(folder: Path, prefix: str = "", date_format: str = "%Y%m%d_%H%M%S",
                  start_index: int = 1, dry_run: bool = False) -> None:
    """폴더 내 사진을 촬영 시간 순으로 이름 변경."""
    photos = collect_photos(folder)
    if not photos:
        print("지원하는 이미지 파일을 찾지 못했습니다.")
        return

    total = len(photos)
    print(f"총 {total}개 파일 발견\n")

    renames = []
    for i, (dt, path) in enumerate(photos, start=start_index):
        new_name = build_new_name(dt, i, total, prefix, date_format, path.suffix.lower())
        new_path = path.parent / new_name
        renames.append((path, new_path, dt))

    # 충돌 감지: 새 이름이 기존 다른 파일과 겹치면 임시 이름 사용
    existing = {p.name for _, p, _ in renames}
    temp_renames = []
    for old, new, dt in renames:
        if new.exists() and new != old and new.name not in {o.name for o, _, _ in renames}:
            # 이미 다른 파일이 그 이름을 가지고 있으면 임시명으로
            temp = old.parent / f"__tmp__{old.name}"
            temp_renames.append((old, temp, new))

    if dry_run:
        print("[미리보기 모드 - 실제 변경 없음]\n")
        for old, new, dt in renames:
            source_label = "EXIF" if dt != datetime.fromtimestamp(old.stat().st_mtime) else "파일시간"
            print(f"  {old.name}")
            print(f"    → {new.name}  [{dt.strftime('%Y-%m-%d %H:%M:%S')}]")
        print()
        return

    # 실제 이름 변경 (충돌 방지를 위해 2단계로)
    renamed = 0
    skipped = 0
    for old, new, dt in renames:
        if old == new:
            print(f"  건너뜀 (이미 올바른 이름): {old.name}")
            skipped += 1
            continue
        if new.exists():
            print(f"  건너뜀 (파일 이름 충돌): {old.name} → {new.name}")
            skipped += 1
            continue
        try:
            old.rename(new)
            print(f"  {old.name} → {new.name}")
            renamed += 1
        except OSError as e:
            print(f"  오류 ({old.name}): {e}")
            skipped += 1

    print(f"\n완료: {renamed}개 변경, {skipped}개 건너뜀")


def main():
    parser = argparse.ArgumentParser(
        description="사진을 촬영 시간 순으로 이름 변경",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("folder", help="사진이 있는 폴더 경로")
    parser.add_argument("--dry-run", action="store_true",
                        help="실제 변경 없이 미리보기만 출력")
    parser.add_argument("--prefix", default="",
                        help="파일명 앞에 붙일 텍스트 (예: '여행_')")
    parser.add_argument("--format", dest="date_format", default="%Y%m%d_%H%M%S",
                        help="날짜 형식 (기본값: %%Y%%m%%d_%%H%%M%%S)")
    parser.add_argument("--start-index", type=int, default=1,
                        help="번호 시작값 (기본값: 1)")
    args = parser.parse_args()

    folder = Path(args.folder).expanduser().resolve()
    if not folder.is_dir():
        print(f"오류: '{folder}' 폴더를 찾을 수 없습니다.", file=sys.stderr)
        sys.exit(1)

    rename_photos(
        folder=folder,
        prefix=args.prefix,
        date_format=args.date_format,
        start_index=args.start_index,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
