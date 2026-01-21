import { 
  Users,           // daily-standup (communication)
  GitPullRequest,  // code-review (development)
  ListChecks,      // linear-summary (productivity)
  Calendar,        // weekly-digest (analytics)
  type LucideIcon 
} from "lucide-react";

export const PRESET_ICONS: Record<string, LucideIcon> = {
  "Users": Users,
  "GitPullRequest": GitPullRequest,
  "ListChecks": ListChecks,
  "Calendar": Calendar,
};

export const CATEGORY_COLORS: Record<string, string> = {
  productivity: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  development: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  communication: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800",
  analytics: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
};
