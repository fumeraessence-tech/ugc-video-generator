import { VideoEditor } from "@/components/editor/video-editor";

export const metadata = {
  title: "Video Editor | UGC Video Generator",
  description: "Edit and produce your UGC video",
};

export default function EditorPage() {
  return (
    <div className="h-full">
      <VideoEditor />
    </div>
  );
}
