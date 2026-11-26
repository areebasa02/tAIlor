"""Terms-of-Use Content Filters, Portrait Consent Verification & AI-Output Disclosure Stamping.

Enforces:
  1. FastFit Non-Commercial License v1.0.0 Section 2(e)(i) ("Content Filters") & Section 4(a) restrictions
  2. CreativeML OpenRAIL++-M Attachment A use-based restrictions (RealVisXL V5.0 Lightning)
  3. FastFit Non-Commercial License v1.0.0 Section 2(e)(ii) AI-generated output disclosure metadata
"""

from __future__ import annotations

import io
import re
from typing import Iterable

from PIL import Image

AI_SOFTWARE_TAG = (
    "tAIlor AI Virtual Try-On (RealVisXL V5.0 Lightning + ControlNet Union + FastFit-MR-1024) "
    "| AI-Generated Image | Non-Commercial Academic Research"
)
AI_DISCLOSURE_BADGE = "AI-Generated Preview · Non-Commercial Academic Use"

# Strict lexical blocklist covering NSFW/explicit/intimate, minor exploitation, gore/violence,
# surveillance/biometric abuse, and non-consensual nudity terms.
_BLOCKED_PATTERN = re.compile(
    r"\b("
    r"nsfw|nude|nudity|naked|topless|bottomless|undressed|strip|stripping|lingerie|erotic|"
    r"porn|pornographic|explicit|fetish|sex|sexual|genital|nipple|breasts|cleavage|bikini\s*micro|"
    r"see[-\s]?through|transparent\s+mesh\s+nude|deepfake|non[-\s]?consensual|"
    r"underage|minor|child|kid|toddler|infant|loli|shota|csam|"
    r"gore|blood|mutilat|torture|weapon|terror|surveillance"
    r")\b",
    re.IGNORECASE,
)


class ContentFilterViolation(ValueError):
    """Raised when an input description, pose label, or portrait request violates model Terms of Use."""


def validate_tryon_content_safety(
    texts: Iterable[str],
    *,
    include_my_face: bool = False,
    has_custom_face_upload: bool = False,
    face_consent_confirmed: bool = True,
) -> None:
    """Validate garment descriptions, labels, and biometric/portrait consent prior to GPU synthesis."""
    for raw in texts:
        text = (raw or "").strip()
        if not text:
            continue
        match = _BLOCKED_PATTERN.search(text)
        if match:
            raise ContentFilterViolation(
                "Try-On Content Filter: request blocked because item text contains restricted or unsafe terms "
                f"('{match.group(0)}'). Only standard studio apparel and accessories are permitted."
            )

    if include_my_face and has_custom_face_upload and not face_consent_confirmed:
        raise ContentFilterViolation(
            "Portrait consent required: please confirm you own or have permission to use the uploaded face photo "
            "before enabling 'Put My Face on Final Image'."
        )


def encode_jpeg_with_ai_disclosure(image: Image.Image, quality: int = 93) -> bytes:
    """Encode final output JPEG with embedded COM/EXIF AI-generated disclosure comment (FastFit Sec. 2(e)(ii))."""
    rgb = image.convert("RGB")
    exif = rgb.getexif()
    # Tag 0x0131 = Software, Tag 0x010E = ImageDescription
    exif[0x0131] = AI_SOFTWARE_TAG
    exif[0x010E] = "AI-generated virtual outfit try-on preview created locally by tAIlor."
    buf = io.BytesIO()
    rgb.save(
        buf,
        format="JPEG",
        quality=quality,
        optimize=True,
        exif=exif.tobytes(),
        comment=AI_SOFTWARE_TAG.encode("utf-8"),
    )
    return buf.getvalue()
