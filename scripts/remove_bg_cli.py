import base64
import io
import json
import sys
import numpy as np
from PIL import Image
from rembg import remove, new_session

def main():
    raw = sys.stdin.read()
    payload = json.loads(raw)
    b64 = payload.get("image", "")
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    img_bytes = base64.b64decode(b64)
    im = Image.open(io.BytesIO(img_bytes)).convert("RGBA")

    # Resize large phone photos before segmentation for speed (<2s on CPU)
    max_dim = int(payload.get("maxDimension", 720))
    scale = min(1.0, max_dim / max(im.width, im.height, 1))
    if scale < 1.0:
        im = im.resize(
            (max(1, round(im.width * scale)), max(1, round(im.height * scale))),
            Image.Resampling.LANCZOS,
        )

    session = new_session("isnet-general-use")
    out = remove(im, session=session)

    # Return full-frame transparent PNG (same size as resized input) so the editor's
    # Restore brush aligns 1:1 with the original photo!
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    out_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    sys.stdout.write(json.dumps({
        "imageDataUrl": f"data:image/png;base64,{out_b64}",
        "width": out.width,
        "height": out.height,
        "method": "rembg-isnet",
    }))

if __name__ == "__main__":
    main()
