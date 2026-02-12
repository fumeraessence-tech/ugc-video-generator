import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MassGeneratorPanel } from "@/components/mass-generator/mass-generator-panel";

export const metadata = {
  title: "Generate Video | UGC Video Generator",
  description: "Create professional UGC videos with AI",
};

export default async function GeneratePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="h-full">
      <MassGeneratorPanel />
    </div>
  );
}
