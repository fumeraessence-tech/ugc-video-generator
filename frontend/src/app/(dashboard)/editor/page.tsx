import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { VideoEditor } from "@/components/editor/video-editor";

export const metadata = {
  title: "Video Editor | UGC Video Generator",
  description: "Edit and produce your UGC video",
};

export default async function EditorPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="h-full">
      <VideoEditor />
    </div>
  );
}
