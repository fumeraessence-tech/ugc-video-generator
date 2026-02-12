import { ProductStudioPage } from "@/components/product-studio/product-studio-page";

export const metadata = {
  title: "Product Studio | UGC Video Generator",
  description: "Generate professional product images from CSV data",
};

export default function ProductStudioRoute() {
  return (
    <div className="h-full">
      <ProductStudioPage />
    </div>
  );
}
