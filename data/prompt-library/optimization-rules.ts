export interface OptimizationRuleExample {
  before: string;
  after: string;
}

export interface OptimizationRule {
  id: string;
  name: string;
  description: string;
  examples: OptimizationRuleExample[];
}

export interface SceneTypeGuide {
  type: string;
  recommendedTerms: string[];
  recommendedParams: string[];
  commonConstraints: string[];
}

export const OPTIMIZATION_RULES: OptimizationRule[] = [
  {
    id: "replace-feeling-words",
    name: "Replace feeling words with professional terms",
    description:
      "Replace vague descriptors with concrete references to artists, film stocks, visual aesthetics, or design systems.",
    examples: [
      { before: "cinematic, vintage", after: "Wong Kar-wai aesthetics, Saul Leiter style" },
      { before: "film look", after: "Kodak Vision3 500T, Cinestill 800T" },
      { before: "high-end design", after: "Swiss International Style, Bauhaus functionalism" },
    ],
  },
  {
    id: "quantify-adjectives",
    name: "Replace adjectives with quantified parameters",
    description:
      "Translate subjective quality words into concrete camera/lighting/composition parameters.",
    examples: [
      { before: "professional photography", after: "90mm lens, f/1.8, high dynamic range" },
      { before: "top-down", after: "45-degree overhead angle" },
      { before: "tilted composition", after: "Dutch angle" },
    ],
  },
  {
    id: "add-negative-constraints",
    name: "Add negative constraints",
    description:
      "Explicitly prohibit common failure modes at the end of prompts.",
    examples: [
      { before: "portrait", after: "portrait, no text or watermark, maintain realistic facial features" },
      { before: "product shot", after: "product shot, no distortion, no redesign" },
    ],
  },
  {
    id: "sensory-stacking",
    name: "Use sensory stacking",
    description:
      "Augment pure visual specification with tactile, motion, and temperature cues for richer outputs.",
    examples: [
      { before: "warm soup", after: "steamy warmth, rising wisps of steam, rich texture" },
      { before: "fresh pastry", after: "delicate crust texture, buttery aroma implied, soft crumb" },
    ],
  },
  {
    id: "group-and-cluster",
    name: "Group and cluster complex prompts",
    description:
      "For multi-constraint scenes, organize requirements into sections such as visual rules, lighting/style, and constraints.",
    examples: [
      { before: "single paragraph with many constraints", after: "Visual Rules / Lighting & Style / Constraints" },
    ],
  },
  {
    id: "format-adaptation",
    name: "Adapt output format to scene complexity",
    description:
      "Use natural paragraphs for simple scenes and structured grouped format for complex scenes.",
    examples: [
      { before: "simple portrait", after: "single concise descriptive paragraph" },
      { before: "9-panel product storyboard", after: "structured sections with per-frame constraints" },
    ],
  },
];

export const SCENE_TYPES: SceneTypeGuide[] = [
  // Alias export name follows the implementation plan wording.
  {
    type: "Product Photography",
    recommendedTerms: ["Hasselblad", "Apple product aesthetics"],
    recommendedParams: ["studio lighting", "high dynamic range"],
    commonConstraints: ["no product distortion", "no text watermarks"],
  },
  {
    type: "Portrait Photography",
    recommendedTerms: ["Wong Kar-wai", "Annie Leibovitz"],
    recommendedParams: ["90mm lens", "f/1.8", "shallow depth of field"],
    commonConstraints: ["maintain realistic facial features", "preserve identity"],
  },
  {
    type: "Food Photography",
    recommendedTerms: ["high-end culinary magazine style"],
    recommendedParams: ["45-degree overhead", "soft side light"],
    commonConstraints: ["no utensil distractions", "no text"],
  },
  {
    type: "Cinematic",
    recommendedTerms: ["Christopher Doyle", "Cinestill 800T"],
    recommendedParams: ["35mm anamorphic lens", "Dutch angle"],
    commonConstraints: ["no low-key dark lighting unless requested"],
  },
];

export function getPromptLibraryRulesSummary(): string {
  const ruleLines = OPTIMIZATION_RULES.map((rule, index) => `${index + 1}. ${rule.name}`);
  return ruleLines.join("\n");
}

export function getSceneGuideSummary(): string {
  return SCENE_TYPES.map((guide) => {
    const terms = guide.recommendedTerms.join(", ");
    const params = guide.recommendedParams.join(", ");
    const constraints = guide.commonConstraints.join(", ");
    return `- ${guide.type}: terms(${terms}); params(${params}); constraints(${constraints})`;
  }).join("\n");
}
