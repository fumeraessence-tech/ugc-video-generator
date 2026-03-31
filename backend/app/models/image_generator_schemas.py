"""Pydantic models for Image Generator endpoints."""

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    """Request to generate product images using replace technique."""
    product_images: list[str] = []      # all product images (for DNA/general ref)
    bottle_images: list[str] = []       # bottle-only reference images
    box_images: list[str] = []          # box/packaging reference images
    reference_images: list[str]         # Pinterest/reference scene URLs
    product_name: str
    brand_name: str = ""
    liquid_color: str = ""
    product_dna: dict | None = None
    shot_types: list[str] | None = None  # defaults to all 5 if None
    api_key: str | None = None


class RegenerateRequest(BaseModel):
    """Request to regenerate a single shot."""
    product_images: list[str] = []
    bottle_images: list[str] = []
    box_images: list[str] = []
    reference_images: list[str]
    product_name: str
    brand_name: str = ""
    liquid_color: str = ""
    product_dna: dict | None = None
    shot_type: str                     # which shot to regenerate
    api_key: str | None = None


class GeneratedImage(BaseModel):
    """A single generated product image."""
    shot_type: str
    label: str
    image_url: str
    prompt: str


class GenerateResponse(BaseModel):
    """Response with all generated images."""
    images: list[GeneratedImage]


class DownloadZipRequest(BaseModel):
    """Request to download images as ZIP."""
    image_urls: list[str] = Field(default_factory=list)
    product_name: str = "product-images"
