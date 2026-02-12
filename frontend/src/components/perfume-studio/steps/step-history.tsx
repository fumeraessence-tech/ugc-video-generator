"use client";

import { useState, useEffect } from "react";
import { Clock, ChevronDown, ChevronRight, Download, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

interface HistoryJob {
  job_id: string;
  status: string;
  started_at: number;
  total_products: number;
  completed_count: number;
  successful_count: number;
  total_images: number;
  results: Array<{
    perfume_name: string;
    status: string;
    images: Array<{ style: string; label: string; image_url: string }>;
    count: number;
  }>;
}

export function StepHistory() {
  const { toast } = useToast();
  const [history, setHistory] = useState<HistoryJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/perfume/history`);
      const data = await res.json();
      setHistory(data.history || []);
    } catch (e) {
      toast({ title: "Failed to load history", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const downloadJobZip = async (job: HistoryJob) => {
    const successResults = job.results.filter((r) => r.status === "success");
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/perfume/download-batch-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_results: successResults }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `batch_${job.job_id}_images.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    }
  };

  const formatDate = (ts: number) => {
    if (!ts) return "Unknown";
    return new Date(ts * 1000).toLocaleString();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Clock className="size-4" />
          Generation History
        </h3>
        <Button size="sm" variant="ghost" onClick={fetchHistory} disabled={loading}>
          {loading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
        </Button>
      </div>

      {history.length === 0 && !loading && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No generation history yet</p>
          </CardContent>
        </Card>
      )}

      {history.map((job) => {
        const isExpanded = expandedJob === job.job_id;
        return (
          <Card key={job.job_id}>
            <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpandedJob(isExpanded ? null : job.job_id)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  <div>
                    <CardTitle className="text-sm">Job {job.job_id}</CardTitle>
                    <p className="text-xs text-muted-foreground">{formatDate(job.started_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={job.status === "completed" ? "default" : "secondary"} className="text-xs">
                    {job.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {job.successful_count}/{job.total_products} products, {job.total_images} images
                  </span>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); downloadJobZip(job); }}>
                    <Download className="size-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {isExpanded && (
              <CardContent>
                <div className="space-y-3">
                  {job.results.map((result, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{result.perfume_name}</span>
                        <Badge
                          variant={result.status === "success" ? "outline" : "destructive"}
                          className="text-[10px]"
                        >
                          {result.count} images
                        </Badge>
                      </div>
                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {result.images
                          .filter((img) => img.image_url && !img.image_url.startsWith("Error"))
                          .map((img, i) => (
                            <div key={i} className="size-14 rounded overflow-hidden flex-shrink-0 border">
                              <img src={img.image_url} alt={img.label} className="w-full h-full object-cover" />
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
