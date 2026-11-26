# Copyright 2025 LavieAI (https://lavieai.com). All rights reserved.
#
# The FastFit Model is licensed by LavieAI under the FastFit Non-Commercial License. Copyright LavieAI.
# IN NO EVENT SHALL LAVIEAI BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
# TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH USE OF THIS MODEL.
#
# Modified for tAIlor (CMPS 4200 non-commercial academic coursework):
# - Disabled Triton-dependent torch.compile on Windows (os.name == "nt") to prevent Inductor runtime crashes.
# - Added DDIMScheduler support for fast 22-26 step multi-reference denoising alongside DDPMScheduler.
# - Added Gaussian-feathered boundary blending so inpainted garments merge seamlessly into mannequin/studio background.
# See fastfit_vton/NOTICE.txt and fastfit_vton/LICENSE.md for full terms.

from __future__ import annotations

import os
from typing import Dict, List, Optional, Union

import numpy as np
import torch
from diffusers.models.autoencoders.autoencoder_kl import AutoencoderKL
from diffusers.schedulers.scheduling_ddim import DDIMScheduler
from diffusers.schedulers.scheduling_ddpm import DDPMScheduler
from diffusers.utils.torch_utils import randn_tensor
from PIL import Image, ImageFilter

from .unet_2d_condition import UNet2DConditionModel
from .utils import (
    adjust_input_image,
    numpy_to_pil,
    paste_image_back_with_feathering,
    prepare_extra_step_kwargs,
    prepare_image,
    prepare_mask_image,
)

REF_LABEL_MAP = {
    "upper": 0,
    "lower": 1,
    "overall": 2,
    "shoe": 3,
    "bag": 4,
}


class FastFitPipeline:
    def __init__(
        self,
        base_model_path: str,
        device: Optional[str] = None,
        mixed_precision: str = "bf16",
        allow_tf32: bool = True,
        use_ddim: bool = True,
    ):
        self.device = (
            device
            if device is not None
            else ("cuda" if torch.cuda.is_available() else "cpu")
        )

        if mixed_precision == "bf16" and torch.cuda.is_available() and torch.cuda.is_bf16_supported():
            self.weight_dtype = torch.bfloat16
        elif mixed_precision in ("fp16", "bf16") and torch.cuda.is_available():
            self.weight_dtype = torch.float16
        else:
            self.weight_dtype = torch.float32

        if use_ddim:
            self.noise_scheduler = DDIMScheduler.from_pretrained(
                base_model_path,
                subfolder="scheduler",
                clip_sample=False,
            )
        else:
            self.noise_scheduler = DDPMScheduler.from_pretrained(
                base_model_path,
                subfolder="scheduler",
            )

        self.vae = AutoencoderKL.from_pretrained(base_model_path, subfolder="vae")
        self.vae.to(self.device, dtype=self.weight_dtype)
        self.vae.eval()

        self.unet = UNet2DConditionModel.from_pretrained(base_model_path, subfolder="unet")
        self.unet.to(self.device, dtype=self.weight_dtype)
        self.unet.fuse_qkv_projections()
        self.unet.eval()

        if os.name != "nt" and os.environ.get("FASTFIT_TORCH_COMPILE", "0") == "1":
            self.vae = torch.compile(self.vae, mode="max-autotune")

        if allow_tf32 and torch.cuda.is_available():
            torch.set_float32_matmul_precision("high")
            torch.backends.cuda.matmul.allow_tf32 = True

    @torch.inference_mode()
    def __call__(
        self,
        person: Union[torch.Tensor, Image.Image],
        mask: Union[torch.Tensor, Image.Image],
        ref_images: List[Union[torch.Tensor, Image.Image]],
        ref_labels: List[Union[int, str]],
        ref_attention_masks: List[int],
        pose: Union[torch.Tensor, Image.Image, None] = None,
        num_inference_steps: int = 24,
        guidance_scale: float = 2.5,
        generator: Optional[torch.Generator] = None,
        cross_attention_kwargs: Optional[Dict] = None,
        eta: float = 0.0,
        return_pil: bool = True,
        do_adjust_input_image: bool = False,
        feather_px: float = 3.5,
        step_callback=None,
    ):
        if do_adjust_input_image:
            background_img, person_img, mask_img, crop_box = adjust_input_image(
                person, mask, (768, 1024), 0.05
            )
        else:
            background_img = person
            person_img = person
            mask_img = mask
            crop_box = None

        if isinstance(ref_labels[0], str):
            mapped_labels = [REF_LABEL_MAP[label] for label in ref_labels]
        else:
            mapped_labels = list(ref_labels)

        person_t = prepare_image(person_img, self.device, self.weight_dtype)
        mask_t = prepare_mask_image(mask_img, self.device, self.weight_dtype)
        ref_images_t = [prepare_image(image, self.device, self.weight_dtype) for image in ref_images]

        if pose is not None:
            pose_t = prepare_image(pose, self.device, self.weight_dtype, do_normalize=False)
            if pose_t.shape[-2:] != person_t.shape[-2:]:
                pose_t = torch.nn.functional.interpolate(
                    pose_t,
                    size=person_t.shape[-2:],
                    mode="bilinear",
                    align_corners=False,
                )
            masked_person = person_t * (1.0 - mask_t) + mask_t * pose_t
        else:
            masked_person = person_t * (1.0 - mask_t)

        attn_masks_t = [
            torch.tensor([m], device=self.device) if isinstance(m, int) else m.to(self.device)
            for m in ref_attention_masks
        ]
        labels_t = [
            torch.tensor([lbl], device=self.device) if isinstance(lbl, int) else lbl.to(self.device)
            for lbl in mapped_labels
        ]

        masked_person_latent = (
            self.vae.encode(masked_person).latent_dist.sample(generator=generator)
            * self.vae.config.scaling_factor
        )
        ref_images_latent = [
            self.vae.encode(image).latent_dist.sample(generator=generator)
            * self.vae.config.scaling_factor
            for image in ref_images_t
        ]
        mask_latent = torch.nn.functional.interpolate(
            mask_t.to(dtype=torch.float32),
            size=masked_person_latent.shape[-2:],
            mode="nearest",
        ).to(self.weight_dtype)

        noise = randn_tensor(
            masked_person_latent.shape,
            generator=generator,
            device=torch.device(self.device),
            dtype=self.weight_dtype,
        )
        self.noise_scheduler.set_timesteps(num_inference_steps, device=self.device)
        timesteps = self.noise_scheduler.timesteps
        latents = noise * self.noise_scheduler.init_noise_sigma

        do_classifier_free_guidance = guidance_scale > 1.0
        if do_classifier_free_guidance:
            mask_latent = torch.cat([mask_latent] * 2)
            masked_person_latent = torch.cat([masked_person_latent] * 2)
            ref_images_latent = [
                torch.cat([torch.zeros_like(image), image]) for image in ref_images_latent
            ]
            attn_masks_t = [torch.cat([m] * 2) for m in attn_masks_t]
            labels_t = [torch.cat([lbl] * 2) for lbl in labels_t]

        extra_step_kwargs = prepare_extra_step_kwargs(self.noise_scheduler, generator, eta)

        # Semi-Attention Reference KV Caching: encode active references once before denoising!
        self.unet.clear_kv_cache()
        try:
            for ref_image_latent, ref_label, ref_attention_mask in zip(
                ref_images_latent, labels_t, attn_masks_t
            ):
                if ref_attention_mask.sum() == 0:
                    continue
                self.unet(
                    sample=ref_image_latent,
                    timestep=None,
                    class_labels=ref_label,
                    attention_mask=ref_attention_mask,
                    return_dict=False,
                    cache_kv=True,
                )

            step_attn_mask = torch.ones(
                (2 if do_classifier_free_guidance else 1,),
                dtype=torch.long,
                device=self.device,
            )
            for step_idx, t in enumerate(timesteps):
                t_dev = t.to(self.device)
                latent_model_input = (
                    torch.cat([latents] * 2) if do_classifier_free_guidance else latents
                )
                latent_model_input = self.noise_scheduler.scale_model_input(latent_model_input, t_dev)
                inpainting_input = torch.cat(
                    [latent_model_input, mask_latent, masked_person_latent],
                    dim=1,
                )
                noise_pred = self.unet(
                    inpainting_input,
                    t_dev,
                    cross_attention_kwargs=cross_attention_kwargs,
                    return_dict=False,
                    attention_mask=step_attn_mask,
                )[0]

                if do_classifier_free_guidance:
                    noise_pred_uncond, noise_pred_cond = noise_pred.chunk(2)
                    noise_pred = noise_pred_uncond + guidance_scale * (
                        noise_pred_cond - noise_pred_uncond
                    )

                latents = self.noise_scheduler.step(
                    noise_pred, t_dev, latents, **extra_step_kwargs
                ).prev_sample
                if step_callback is not None:
                    try:
                        step_callback(step_idx + 1, len(timesteps))
                    except Exception:
                        pass
        finally:
            self.unet.clear_kv_cache()

        latents = (latents / self.vae.config.scaling_factor).to(
            self.vae.device, dtype=self.vae.dtype
        )
        decoded = self.vae.decode(latents).sample

        # Soft-feathered mask blend prevents visible rectangular/polygon seam lines on studio backdrop
        if feather_px > 0 and isinstance(mask_img, Image.Image):
            soft_pil = mask_img.convert("L").filter(ImageFilter.GaussianBlur(radius=feather_px))
            soft_arr = np.array(soft_pil, dtype=np.float32) / 255.0
            # Keep interior solid 1.0 where original mask is eroded, feather only the outer boundary
            hard_arr = (np.array(mask_img.convert("L"), dtype=np.float32) / 255.0 >= 0.5).astype(
                np.float32
            )
            soft_blend = np.maximum(soft_arr * 0.92, hard_arr * soft_arr)
            blend_t = (
                torch.from_numpy(soft_blend)[None, None, :, :]
                .to(device=self.device, dtype=decoded.dtype)
            )
            image = decoded * blend_t + (1.0 - blend_t) * person_t
        else:
            image = decoded * mask_t + (1.0 - mask_t) * person_t

        if return_pil:
            image = (image / 2.0 + 0.5).clamp(0.0, 1.0)
            image = image.cpu().permute(0, 2, 3, 1).float().numpy()
            pil_list = numpy_to_pil(image)
            if do_adjust_input_image and crop_box is not None:
                merged, _ = paste_image_back_with_feathering(
                    background_img, pil_list[0], crop_box
                )
                return [merged]
            return pil_list

        return image
