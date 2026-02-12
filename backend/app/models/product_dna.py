"""Product DNA model - extracted visual characteristics from product images."""

from pydantic import BaseModel, Field


class ProductColors(BaseModel):
    """Color palette extracted from product."""

    primary: str = Field(description="Dominant color of the product")
    secondary: str | None = Field(default=None, description="Secondary color if present")
    accent: str | None = Field(default=None, description="Accent/highlight color if present")
    packaging: str | None = Field(default=None, description="Packaging/container color")


class ProductDNA(BaseModel):
    """Complete visual DNA of a product extracted via Vision API.

    This serves as the immutable reference for product consistency
    across all generated scenes.
    """

    # Core identification
    product_type: str = Field(description="Category: perfume, skincare, food, electronics, etc.")
    product_name: str | None = Field(default=None, description="Brand/product name if visible")

    # Visual characteristics
    colors: ProductColors = Field(description="Color palette of the product")
    shape: str = Field(description="Physical form: bottle, box, tube, jar, etc.")
    materials: list[str] = Field(default_factory=list, description="Materials: glass, plastic, metal, etc.")
    texture: str | None = Field(default=None, description="Surface texture: matte, glossy, frosted, etc.")

    # Branding elements (for consistency, NOT for generation)
    branding_text: list[str] = Field(default_factory=list, description="Visible text on product")
    logo_description: str | None = Field(default=None, description="Description of logo if present")

    # Dimensional characteristics
    size_category: str = Field(default="medium", description="small, medium, large relative to hand")
    proportions: str | None = Field(default=None, description="tall/short, wide/narrow, etc.")

    # Key visual features for generation
    distinctive_features: list[str] = Field(
        default_factory=list,
        description="Unique visual elements that must be preserved"
    )

    # Complete prose description for prompt injection
    visual_description: str = Field(
        description="Detailed prose description of the product for prompt injection"
    )

    # Generation guidance
    hero_angles: list[str] = Field(
        default_factory=lambda: ["front", "45-degree", "close-up-detail"],
        description="Best angles to showcase the product"
    )

    # What to avoid
    prohibited_variations: list[str] = Field(
        default_factory=list,
        description="Things that should NOT change: color shifts, text alterations, etc."
    )


class ProductAnalysisRequest(BaseModel):
    """Request to analyze product images."""

    image_urls: list[str] = Field(min_length=1, max_length=5)
    product_name: str | None = Field(default=None, description="Optional product name hint")
    brand_name: str | None = Field(default=None, description="Optional brand name hint")


class ProductAnalysisResponse(BaseModel):
    """Response from product analysis."""

    success: bool
    product_dna: ProductDNA | None = None
    error: str | None = None
    analyzed_images: int = 0
