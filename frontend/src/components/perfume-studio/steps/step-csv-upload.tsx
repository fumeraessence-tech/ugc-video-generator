"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2, Upload, Trash2, Check, Square, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePerfumeStudioStore } from "@/stores/perfume-studio-store";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export function StepCSVUpload() {
  const store = usePerfumeStudioStore();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const uploadCSV = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BACKEND_URL}/api/v1/perfume/upload-csv`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        store.setCsvProducts(data.products);
        store.setCsvFileName(file.name);
        store.selectAllProducts();
        toast({ title: `${data.count} products loaded` });
      } else {
        toast({ title: "CSV error", description: data.detail, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Upload failed", description: String(e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const allSelected = store.selectedProductIndices.length === store.csvProducts.length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="size-4" />
              Product CSV
            </CardTitle>
            {store.csvFileName && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{store.csvFileName}</Badge>
                <Button size="sm" variant="ghost" onClick={() => { store.setCsvProducts([]); store.setCsvFileName(null); }}>
                  <Trash2 className="size-3" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {store.csvProducts.length === 0 ? (
            <label className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
              {uploading ? (
                <Loader2 className="size-6 animate-spin text-primary" />
              ) : (
                <>
                  <Upload className="size-6 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Upload CSV file</span>
                  <span className="text-xs text-muted-foreground mt-1">Supports Shopify exports</span>
                </>
              )}
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadCSV(file);
                  e.target.value = "";
                }}
              />
            </label>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {store.selectedProductIndices.length} of {store.csvProducts.length} selected
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => allSelected ? store.deselectAllProducts() : store.selectAllProducts()}
                >
                  {allSelected ? <CheckSquare className="size-3 mr-1" /> : <Square className="size-3 mr-1" />}
                  {allSelected ? "Deselect All" : "Select All"}
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="p-2 w-8"></th>
                      <th className="p-2 text-left font-medium">#</th>
                      <th className="p-2 text-left font-medium">Clean Name</th>
                      <th className="p-2 text-left font-medium text-muted-foreground">Raw Name</th>
                      <th className="p-2 text-left font-medium">Brand</th>
                      <th className="p-2 text-left font-medium">Gender</th>
                    </tr>
                  </thead>
                  <tbody>
                    {store.csvProducts.map((product, idx) => {
                      const selected = store.selectedProductIndices.includes(idx);
                      return (
                        <tr
                          key={idx}
                          className={`border-b last:border-0 cursor-pointer transition-colors ${selected ? "bg-primary/5" : "hover:bg-muted/30"}`}
                          onClick={() => store.toggleProductIndex(idx)}
                        >
                          <td className="p-2 text-center">
                            {selected ? (
                              <CheckSquare className="size-3.5 text-primary" />
                            ) : (
                              <Square className="size-3.5 text-muted-foreground" />
                            )}
                          </td>
                          <td className="p-2 text-muted-foreground">{idx + 1}</td>
                          <td className="p-2 font-medium">{product.cleaned_name || product.perfume_name}</td>
                          <td className="p-2 text-muted-foreground">{product.perfume_name}</td>
                          <td className="p-2">{product.brand_name}</td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-[10px] capitalize">{product.gender}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
