"use client";

import { useBulkGeneratorStore } from "@/stores/bulk-generator-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, ImageIcon, FileSpreadsheet, Camera, Pin, User } from "lucide-react";

export function ReviewStep() {
  const {
    referenceImages,
    csvRows,
    csvColumns,
    brandName,
    setBrandName,
    pinterestImages,
    avatarImages,
  } = useBulkGeneratorStore();

  const shotsPerProduct = 9;
  const totalImages = csvRows.length * shotsPerProduct;
  const totalPinterestImages = Object.values(pinterestImages).reduce(
    (sum, urls) => sum + urls.length,
    0
  );
  const totalAvatarImages = Object.values(avatarImages).reduce(
    (sum, urls) => sum + urls.length,
    0
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5" />
            Review & Configure
          </CardTitle>
          <CardDescription>
            Review your setup before generating. Each product gets 9 styled shots.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-5 gap-4">
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/50 p-4">
              <ImageIcon className="size-5 text-primary" />
              <span className="text-2xl font-bold">{referenceImages.length}</span>
              <span className="text-xs text-muted-foreground">Reference Images</span>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/50 p-4">
              <FileSpreadsheet className="size-5 text-primary" />
              <span className="text-2xl font-bold">{csvRows.length}</span>
              <span className="text-xs text-muted-foreground">Products</span>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/50 p-4">
              <Pin className="size-5 text-primary" />
              <span className="text-2xl font-bold">{totalPinterestImages}</span>
              <span className="text-xs text-muted-foreground">Pinterest Images</span>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/50 p-4">
              <User className="size-5 text-primary" />
              <span className="text-2xl font-bold">{totalAvatarImages}</span>
              <span className="text-xs text-muted-foreground">Avatar Images</span>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/50 p-4">
              <Camera className="size-5 text-primary" />
              <span className="text-2xl font-bold">{totalImages}</span>
              <span className="text-xs text-muted-foreground">Total Images</span>
            </div>
          </div>

          {/* Brand Name Config */}
          <div className="space-y-2">
            <Label htmlFor="brand-name">Brand Name</Label>
            <Input
              id="brand-name"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="e.g., Fumera"
            />
            <p className="text-xs text-muted-foreground">
              This brand name will appear on all generated bottle labels.
            </p>
          </div>

          {/* Reference Images Preview */}
          <div className="space-y-2">
            <Label>Reference Images</Label>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {referenceImages.map((url) => (
                <div
                  key={url}
                  className="flex-shrink-0 overflow-hidden rounded-lg border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Reference"
                    className="size-24 object-cover"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Product List */}
          <div className="space-y-2">
            <Label>Products to Generate</Label>
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-b bg-muted">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">#</th>
                    {csvColumns.map((col) => (
                      <th key={col} className="px-4 py-2 text-left font-medium text-muted-foreground">
                        {col}
                      </th>
                    ))}
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Pinterest
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Output
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.map((row, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                      {csvColumns.map((col) => (
                        <td key={col} className="px-4 py-2">
                          {row[col] || "-"}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-muted-foreground">
                        {(pinterestImages[String(idx)] ?? []).length}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="secondary" className="text-xs">
                          {shotsPerProduct} images
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Generation Breakdown */}
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="mb-2 font-medium">Per product, the system will generate {shotsPerProduct} images:</p>
            <ol className="ml-4 list-decimal space-y-0.5 text-muted-foreground">
              <li>Bottle + Box Hero</li>
              <li>Pinterest Scene + Box</li>
              <li>Styled Product</li>
              <li>Key Notes (from CSV)</li>
              <li>Avatar + Bottle</li>
              <li>Creative Dynamic</li>
              <li>Variant Size 1 (from CSV)</li>
              <li>Variant Size 2 (from CSV)</li>
              <li>Variant Size 3 (from CSV)</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
