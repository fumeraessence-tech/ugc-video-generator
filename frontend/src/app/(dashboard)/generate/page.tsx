import { MassGeneratorPanel } from "@/components/mass-generator/mass-generator-panel";

export const metadata = {
  title: "Generate Video | UGC Video Generator",
  description: "Create professional UGC videos with AI",
};

export default function GeneratePage() {
  return (
    <div className="h-full">
      <MassGeneratorPanel />
    </div>
  );
}
