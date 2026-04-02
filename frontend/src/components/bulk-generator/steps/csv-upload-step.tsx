"use client";

import { useCallback, useRef, useState } from "react";
import { useBulkGeneratorStore } from "@/stores/bulk-generator-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Upload, FileSpreadsheet, Trash2, X, ImagePlus, CheckSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function CsvUploadStep() {
  const {
    csvRows, csvColumns, csvFileName, setCsvData, removeCsvRow, removeCsvRows, clearCsv,
    pinterestImages, addPinterestImages,
  } = useBulkGeneratorStore();

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pinterestInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const bulkPinterestInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPinterest, setUploadingPinterest] = useState<number | null>(null);

  // Bulk selection state
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const allSelected = csvRows.length > 0 && selectedRows.size === csvRows.length;
  const someSelected = selectedRows.size > 0 && selectedRows.size < csvRows.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(csvRows.map((_, i) => i)));
    }
  };

  const toggleRow = (idx: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const deleteSelected = () => {
    removeCsvRows(selectedRows);
    setSelectedRows(new Set());
  };

  const uploadCsv = useCallback(
    async (file: File) => {
      setError(null);
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setError("Please upload a .csv file.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("CSV file too large (max 5MB).");
        return;
      }
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/bulk-generator/upload-csv", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? body?.error ?? `Upload failed (${res.status})`);
        }
        const data = await res.json();
        setCsvData(data.rows, data.columns, file.name);
        setSelectedRows(new Set());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [setCsvData]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadCsv(file);
      e.target.value = "";
    },
    [uploadCsv]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadCsv(file);
    },
    [uploadCsv]
  );

  const handlePinterestUpload = useCallback(
    async (rowIndex: number, files: FileList) => {
      setUploadingPinterest(rowIndex);
      try {
        const formData = new FormData();
        Array.from(files).forEach((f) => formData.append("files", f));
        const res = await fetch("/api/bulk-generator/upload-pinterest", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? body?.error ?? `Upload failed (${res.status})`);
        }
        const data = await res.json();
        addPinterestImages(rowIndex, data.urls);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Pinterest upload failed.");
      } finally {
        setUploadingPinterest(null);
      }
    },
    [addPinterestImages]
  );

  // Bulk Pinterest: upload to all selected rows at once
  const handleBulkPinterestUpload = useCallback(
    async (files: FileList) => {
      if (selectedRows.size === 0) return;
      setUploadingPinterest(-1); // -1 = bulk
      try {
        const formData = new FormData();
        Array.from(files).forEach((f) => formData.append("files", f));
        const res = await fetch("/api/bulk-generator/upload-pinterest", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? body?.error ?? `Upload failed (${res.status})`);
        }
        const data = await res.json();
        // Add same Pinterest refs to ALL selected rows
        for (const idx of selectedRows) {
          addPinterestImages(idx, data.urls);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Bulk Pinterest upload failed.");
      } finally {
        setUploadingPinterest(null);
      }
    },
    [addPinterestImages, selectedRows]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5" />
            CSV Upload
          </CardTitle>
          <CardDescription>
            Upload a CSV file with your product variants. Required column:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">PRODUCT_NAME</code>.
            Optional:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">LIQUID_COLOR</code>.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {csvRows.length === 0 ? (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                disabled={uploading}
                className={`flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                } ${uploading ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
              >
                <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                  <Upload className="size-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {uploading ? "Parsing CSV..." : "Upload your product CSV"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Drag and drop or click to browse &middot; .csv only &middot; Max 100 rows
                  </p>
                </div>
              </button>

              <div className="rounded-lg border bg-muted/50 p-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Example CSV format:</p>
                <pre className="text-xs font-mono text-muted-foreground">
{`PRODUCT_NAME,LIQUID_COLOR
Noir Elegance,deep amber
Rose Velvet,blush pink
Ocean Breeze,light blue
Golden Oud,rich gold`}
                </pre>
              </div>
            </>
          ) : (
            <>
              {/* CSV loaded header */}
              <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-3">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="size-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{csvFileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {csvRows.length} product{csvRows.length === 1 ? "" : "s"} &middot;{" "}
                      8 shots each &middot; {csvRows.length * 8} total images
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={clearCsv}>
                  <X className="mr-1 size-3.5" />
                  Remove
                </Button>
              </div>

              {/* Bulk actions bar — visible when rows selected */}
              {selectedRows.size > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
                  <CheckSquare className="size-4 text-primary" />
                  <span className="text-sm font-medium">
                    {selectedRows.size} product{selectedRows.size === 1 ? "" : "s"} selected
                  </span>
                  <div className="ml-auto flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => bulkPinterestInputRef.current?.click()}
                      disabled={uploadingPinterest === -1}
                    >
                      <ImagePlus className="mr-1 size-3.5" />
                      {uploadingPinterest === -1 ? "Uploading..." : "Add Pinterest to Selected"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={deleteSelected}
                    >
                      <Trash2 className="mr-1 size-3.5" />
                      Delete Selected
                    </Button>
                  </div>
                  <input
                    ref={bulkPinterestInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) handleBulkPinterestUpload(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}

              {/* Data table */}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => { if (el) el.indeterminate = someSelected; }}
                          onChange={toggleSelectAll}
                          className="size-4 rounded border-muted-foreground/50 accent-primary"
                        />
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">#</th>
                      {csvColumns.map((col) => (
                        <th key={col} className="px-4 py-2 text-left font-medium text-muted-foreground">
                          {col}
                        </th>
                      ))}
                      <th className="px-4 py-2 text-center font-medium text-muted-foreground">Pinterest</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.map((row, idx) => {
                      const isSelected = selectedRows.has(idx);
                      const pCount = pinterestImages[String(idx)]?.length ?? 0;
                      return (
                        <tr
                          key={idx}
                          className={`border-b last:border-0 transition-colors ${
                            isSelected ? "bg-primary/5" : "hover:bg-muted/30"
                          }`}
                        >
                          <td className="w-10 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRow(idx)}
                              className="size-4 rounded border-muted-foreground/50 accent-primary"
                            />
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                          {csvColumns.map((col) => (
                            <td key={col} className="px-4 py-2">
                              {row[col] || <span className="text-muted-foreground">-</span>}
                            </td>
                          ))}
                          <td className="px-4 py-2 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                disabled={uploadingPinterest === idx}
                                onClick={() => pinterestInputRefs.current[idx]?.click()}
                              >
                                <ImagePlus className="size-3.5" />
                              </Button>
                              {pCount > 0 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {pCount} ref{pCount === 1 ? "" : "s"}
                                </Badge>
                              )}
                              <input
                                ref={(el) => { pinterestInputRefs.current[idx] = el; }}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files?.length) handlePinterestUpload(idx, e.target.files);
                                  e.target.value = "";
                                }}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              onClick={() => removeCsvRow(idx)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
