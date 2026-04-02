import { BulkGeneratorPage } from "@/components/bulk-generator/bulk-generator-page";

export const metadata = {
  title: "Bulk Generator | UGC Video Generator",
  description: "Generate product images in bulk from CSV data",
};

export default function BulkGeneratorRoute() {
  return (
    <div className="h-full">
      <BulkGeneratorPage />
    </div>
  );
}
