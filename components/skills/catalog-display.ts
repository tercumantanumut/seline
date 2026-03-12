import type { CatalogSkillCollection, CatalogSkillWithStatus } from "@/lib/skills/catalog/types";

export const CATEGORY_LABELS: Record<string, string> = {
  design: "Design",
  deploy: "Deploy",
  "dev-tools": "Dev Tools",
  productivity: "Productivity",
  creative: "Creative",
  docs: "Docs",
  security: "Security",
  engineering: "Engineering",
  "paid-media": "Paid Media",
  sales: "Sales",
  marketing: "Marketing",
  product: "Product",
  "project-management": "Project Management",
  testing: "Testing",
  support: "Support",
  "spatial-computing": "Spatial Computing",
  specialized: "Specialized",
  "game-development": "Game Development",
};

export const CATEGORY_ORDER: string[] = [
  "dev-tools",
  "deploy",
  "design",
  "productivity",
  "creative",
  "docs",
  "security",
  "engineering",
  "paid-media",
  "sales",
  "marketing",
  "product",
  "project-management",
  "testing",
  "support",
  "spatial-computing",
  "specialized",
  "game-development",
];

export interface GroupedCatalogSkills {
  category: string;
  label: string;
  skills: CatalogSkillWithStatus[];
}

export interface CatalogCollectionSummary {
  id: string;
  label: string;
  description: string | null;
  url: string | null;
  count: number;
  installedCount: number;
  categories: string[];
}

function titleCase(value: string): string {
  return value
    .replace(/^[._-]+/, "")
    .split(/[\s._/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || titleCase(category);
}

export function groupCatalogSkills(skills: CatalogSkillWithStatus[]): GroupedCatalogSkills[] {
  const map = new Map<string, CatalogSkillWithStatus[]>();

  for (const skill of skills) {
    const existing = map.get(skill.category) || [];
    existing.push(skill);
    map.set(skill.category, existing);
  }

  const grouped: GroupedCatalogSkills[] = [];
  const seen = new Set<string>();

  for (const category of CATEGORY_ORDER) {
    const categorySkills = map.get(category);
    if (categorySkills && categorySkills.length > 0) {
      grouped.push({
        category,
        label: formatCategoryLabel(category),
        skills: categorySkills,
      });
    }
    seen.add(category);
  }

  for (const [category, categorySkills] of map) {
    if (seen.has(category) || categorySkills.length === 0) continue;
    grouped.push({
      category,
      label: formatCategoryLabel(category),
      skills: categorySkills,
    });
  }

  return grouped;
}

export function buildCatalogCollections(
  skills: CatalogSkillWithStatus[],
  collections: CatalogSkillCollection[] = []
): CatalogCollectionSummary[] {
  const map = new Map<string, CatalogCollectionSummary>();

  for (const collection of collections) {
    map.set(collection.id, {
      id: collection.id,
      label: collection.label,
      description: collection.description || null,
      url: collection.url || null,
      count: 0,
      installedCount: 0,
      categories: [],
    });
  }

  for (const skill of skills) {
    if (!skill.collectionId) continue;

    const existing = map.get(skill.collectionId) || {
      id: skill.collectionId,
      label: skill.collectionLabel || titleCase(skill.collectionId),
      description: null,
      url: skill.collectionUrl || null,
      count: 0,
      installedCount: 0,
      categories: [],
    };

    existing.count += 1;
    if (skill.isInstalled) {
      existing.installedCount += 1;
    }
    if (!existing.categories.includes(skill.category)) {
      existing.categories.push(skill.category);
    }

    map.set(skill.collectionId, existing);
  }

  return Array.from(map.values())
    .filter((collection) => collection.count > 0)
    .map((collection) => ({
      ...collection,
      categories: collection.categories.sort((a, b) => formatCategoryLabel(a).localeCompare(formatCategoryLabel(b))),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
