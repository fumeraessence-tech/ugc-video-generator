import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Music, Play } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Audio | Library",
  description: "View all generated audio files",
};

export default async function AudioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch all jobs with audio
  const jobs = await prisma.job.findMany({
    where: {
      userId: user.id,
      audioUrl: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      chat: {
        select: { title: true },
      },
    },
  });

  const audioFiles = jobs.map((job) => ({
    id: job.id,
    title: job.chat?.title || "Untitled",
    audioUrl: job.audioUrl,
    createdAt: job.createdAt,
    productName: job.productName,
  }));

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Audio Files</h1>
        <p className="text-muted-foreground">
          All generated voiceovers and audio ({audioFiles.length} files)
        </p>
      </div>

      {audioFiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="size-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <Music className="size-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              No audio files generated yet. Audio is generated during video
              creation.
            </p>
            <Link
              href="/generate"
              className="mt-4 inline-block text-primary hover:underline"
            >
              Create your first video
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {audioFiles.map((audio) => (
            <Card key={audio.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Music className="size-4" />
                      {audio.title}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {audio.productName && `${audio.productName} · `}
                      {new Date(audio.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1">
                      <Play className="size-3" />
                      Play
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1">
                      <Download className="size-3" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {audio.audioUrl && (
                  <audio controls className="w-full">
                    <source src={audio.audioUrl} type="audio/mpeg" />
                    Your browser does not support the audio element.
                  </audio>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
