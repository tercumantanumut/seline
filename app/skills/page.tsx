import { Shell } from "@/components/layout/shell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SkillCatalogPage } from "@/components/skills/skill-catalog-page";

export default function SkillsPage() {
  return (
    <Shell>
      <ScrollArea className="h-full">
        <div className="px-6 py-8">
          <SkillCatalogPage />
        </div>
      </ScrollArea>
    </Shell>
  );
}
