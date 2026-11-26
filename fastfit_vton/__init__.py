"""FastFit-MR-1024 Multi-Reference Virtual Try-On integration for tAIlor.

The FastFit Model is licensed by LavieAI under the FastFit Non-Commercial License. Copyright LavieAI.
IN NO EVENT SHALL LAVIEAI BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH USE OF THIS MODEL.

Modified for tAIlor (CMPS 4200 non-commercial academic coursework): see NOTICE.txt and LICENSE.md.
"""

from .masking import build_multi_slot_mask, build_open_outerwear_mask
from .pipeline_fastfit import REF_LABEL_MAP, FastFitPipeline
from .safety import (
    AI_DISCLOSURE_BADGE,
    AI_SOFTWARE_TAG,
    ContentFilterViolation,
    encode_jpeg_with_ai_disclosure,
    validate_tryon_content_safety,
)

__all__ = [
    "AI_DISCLOSURE_BADGE",
    "AI_SOFTWARE_TAG",
    "ContentFilterViolation",
    "FastFitPipeline",
    "REF_LABEL_MAP",
    "build_multi_slot_mask",
    "build_open_outerwear_mask",
    "encode_jpeg_with_ai_disclosure",
    "validate_tryon_content_safety",
]
