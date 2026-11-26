# Third-Party AI Models & Terms of Use Compliance

This project (`tAIlor`, CMPS 4200 academic coursework & non-commercial research prototype) enforces technical and legal guardrails across every integrated model and API:

## 1. Stage-2 Multi-Reference Virtual Try-On (`zhengchong/FastFit-MR-1024`)
- **License:** [FastFit Non-Commercial License v1.0.0](./FASTFIT_LICENSE.md) (Copyright LavieAI; underlying Diffusers blocks Apache-2.0).
- **Permitted Scope (Sec. 1c & 2b):** Strictly **Non-Commercial, Non-Production** academic study, personal experimentation, and research evaluation. Commercial, revenue-generating, or commercial end-user production deployment requires a separate commercial license from LavieAI (`https://www.lavieai.com`) or setting `TRYON_STAGE2_VTON=sdxl_only` in `.env`.
- **Mandatory Attribution & Modification Notice (Sec. 3a–3c):** Full license text is distributed at `.licenses/FASTFIT_LICENSE.md` and `fastfit_vton/LICENSE.md`; the verbatim Attribution Notice, modification disclosure, warranty disclaimer, and non-endorsement statement are distributed in `fastfit_vton/NOTICE.txt` and surfaced in the Try-On Studio UI.
- **Content Filtering (Sec. 2e(i)):** Enforced in `fastfit_vton/safety.py` prior to and after inference to block unlawful, NSFW/explicit, minor-exploitative, violent, or non-consensual inputs and outputs.
- **AI-Generated Output Disclosure (Sec. 2e(ii)):** All generated images embed PNG/EXIF/JPEG software disclosure comments indicating AI synthesis and display a visible `"AI-Generated Virtual Try-On"` indicator in the UI.
- **Biometric & Digital Replica Safeguards (Sec. 4a(iv)–(v)):** Optional `"Include My Face"` portrait conditioning is disabled by default, requires explicit affirmative consent in the UI confirming self-ownership/permission, runs ephemerally in local RAM, and never stores biometric templates or trains/distills models.

## 2. Stage-1 Studio Pose & Lighting Synthesis
- **`SG161222/RealVisXL_V5.0_Lightning`:** Licensed under **CreativeML OpenRAIL++-M** (`https://huggingface.co/SG161222/RealVisXL_V5.0_Lightning`). Subject to OpenRAIL++ Attachment A use-based restrictions (no unlawful, harmful, defamatory, medical/legal advice, or non-consensual content), enforced via `fastfit_vton/safety.py`.
- **`xinsir/controlnet-union-sdxl-1.0`:** Licensed under **Apache License 2.0** (`https://huggingface.co/xinsir/controlnet-union-sdxl-1.0`).
- **`madebyollin/sdxl-vae-fp16-fix`:** Licensed under **MIT License** (`https://huggingface.co/madebyollin/sdxl-vae-fp16-fix`).
- **`h94/IP-Adapter`:** Licensed under **Apache License 2.0** (`https://huggingface.co/h94/IP-Adapter`).

## 3. Co-Resident Stylist & Wardrobe Vision Models
- **`Qwen/Qwen2.5-3B-Instruct`:** Licensed under the **Qwen Research License** (non-commercial / research compliant; `https://huggingface.co/Qwen/Qwen2.5-3B-Instruct`).
- **`Qwen/Qwen2.5-VL-3B-Instruct`:** Licensed under **Apache License 2.0** (`https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct`).

## 4. Scientific Literature & arXiv API
- Literature queries follow the [arXiv API Terms of Use](https://info.arxiv.org/help/api/index.html) (rate-limited <= 1 request / 3s via official helper scripts; see [literature_search_arxiv_LICENSE.txt](./literature_search_arxiv_LICENSE.txt)).
