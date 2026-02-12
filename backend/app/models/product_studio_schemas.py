"""Pydantic models for Product Studio endpoints."""

from pydantic import BaseModel, Field


class ProductInfo(BaseModel):
    """Single product from CSV."""
    perfume_name: str
    cleaned_name: str = ""
    brand_name: str = ""
    gender: str = "unisex"
    description: str = ""
    handle: str = ""
    image_src: str = ""
    row_number: int = 0


class WhiteBgRequest(BaseModel):
    """Request to start white-background generation batch."""
    products: list[dict]
    bottle_images: dict[int, str] = Field(default_factory=dict)
    brand_name: str = ""
    logo_url: str | None = None
    aspect_ratio: str = "1:1"
    product_indices: list[int] | None = None


class InspirationGenRequest(BaseModel):
    """Request to start inspiration-based styled generation batch."""
    products: list[dict]
    white_bg_images: dict[int, str] = Field(default_factory=dict)
    inspiration_images: list[str] = Field(default_factory=list)
    angles_per_product: int = 5
    aspect_ratio: str = "1:1"
    product_indices: list[int] | None = None


class DownloadZipRequest(BaseModel):
    """Request to download images as ZIP."""
    mode: str = "all"  # "product" or "all"
    product_name: str = ""
    image_urls: list[str] = Field(default_factory=list)
    batch_results: list[dict] = Field(default_factory=list)
