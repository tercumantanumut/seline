"use client";

import { useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
  TrophyIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import { SettingsPanelCard } from "@/components/settings/settings-form-layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatUsdReward,
  type TaskRewardRecord,
} from "@/lib/rewards/reward-calculator";
import { useTranslations } from "next-intl";

interface RewardsSectionProps {
  rewards: TaskRewardRecord[];
}

export function RewardsSection({ rewards }: RewardsSectionProps) {
  const t = useTranslations("settings.rewards");
  const [expandedRewardIds, setExpandedRewardIds] = useState<string[]>([]);

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const monthAgo = new Date(now);
    monthAgo.setMonth(now.getMonth() - 1);

    let totalOwed = 0;
    let weeklyOwed = 0;
    let monthlyOwed = 0;

    for (const reward of rewards) {
      totalOwed += reward.amountUsd;
      const completedAt = new Date(reward.completedAt);
      if (completedAt >= weekAgo) {
        weeklyOwed += reward.amountUsd;
      }
      if (completedAt >= monthAgo) {
        monthlyOwed += reward.amountUsd;
      }
    }

    return {
      totalOwed,
      weeklyOwed,
      monthlyOwed,
    };
  }, [rewards]);

  const toggleExpanded = (rewardId: string) => {
    setExpandedRewardIds((current) =>
      current.includes(rewardId)
        ? current.filter((id) => id !== rewardId)
        : [...current, rewardId],
    );
  };

  if (rewards.length === 0) {
    return (
      <div className="space-y-5 rounded-2xl bg-terminal-bg/5 p-3 dark:bg-terminal-cream-dark/25 sm:p-4">
        <SettingsPanelCard
          title={t("title")}
          description={t("subtitle")}
          className="overflow-hidden border-terminal-green/25 bg-[radial-gradient(circle_at_top_left,_rgba(51,146,81,0.12),_transparent_55%),linear-gradient(180deg,rgba(255,250,240,0.98),rgba(248,243,230,0.9))]"
        >
          <div className="rounded-2xl border border-dashed border-terminal-green/35 bg-terminal-bg/10 px-5 py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-terminal-green/30 bg-terminal-green/10 text-terminal-green">
              <TrophyIcon className="h-5 w-5" />
            </div>
            <p className="font-mono text-sm font-semibold text-terminal-dark">{t("emptyTitle")}</p>
            <p className="mt-2 font-mono text-xs leading-relaxed text-terminal-muted">{t("emptyBody")}</p>
          </div>
        </SettingsPanelCard>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl bg-terminal-bg/5 p-3 dark:bg-terminal-cream-dark/25 sm:p-4">
      <SettingsPanelCard
        title={t("title")}
        description={t("subtitle")}
        className="overflow-hidden border-terminal-green/25 bg-[radial-gradient(circle_at_top_left,_rgba(51,146,81,0.14),_transparent_52%),linear-gradient(180deg,rgba(255,250,240,0.98),rgba(248,243,230,0.94))]"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <RewardStatCard
            icon={WalletIcon}
            label={t("stats.total")}
            value={formatUsdReward(stats.totalOwed)}
            tone="primary"
          />
          <RewardStatCard
            icon={TrendingUpIcon}
            label={t("stats.week")}
            value={formatUsdReward(stats.weeklyOwed)}
            tone="neutral"
          />
          <RewardStatCard
            icon={SparklesIcon}
            label={t("stats.month")}
            value={formatUsdReward(stats.monthlyOwed)}
            tone="neutral"
          />
        </div>
      </SettingsPanelCard>

      <SettingsPanelCard
        title={t("historyTitle")}
        description={t("historySubtitle", { count: rewards.length })}
      >
        <div className="space-y-3">
          {rewards.map((reward) => {
            const isExpanded = expandedRewardIds.includes(reward.id);
            return (
              <div
                key={reward.id}
                className="rounded-2xl border border-terminal-border/60 bg-terminal-cream/75 p-4 shadow-sm transition-colors dark:border-terminal-border/80 dark:bg-terminal-cream-dark/55"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn(
                        "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]",
                        reward.complexityBand === "epic"
                          ? "bg-terminal-dark text-terminal-cream"
                          : reward.complexityBand === "large"
                          ? "bg-terminal-green/15 text-terminal-green"
                          : reward.complexityBand === "medium"
                          ? "bg-terminal-amber/20 text-terminal-dark"
                          : "bg-terminal-dark/8 text-terminal-muted"
                      )}>
                        {t(`bands.${reward.complexityBand}`)}
                      </span>
                      <span className="font-mono text-[11px] text-terminal-muted">
                        {formatCompletedAt(reward.completedAt)}
                      </span>
                    </div>
                    <p className="font-mono text-sm font-semibold leading-relaxed text-terminal-dark">
                      {reward.queryExcerpt}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start md:pl-4">
                    <div className="rounded-2xl border border-terminal-green/25 bg-terminal-green/10 px-3 py-2 text-right">
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-terminal-muted">
                        {t("earned")}
                      </p>
                      <p className="font-mono text-base font-semibold text-terminal-green">
                        {formatUsdReward(reward.amountUsd)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="font-mono text-xs text-terminal-muted hover:text-terminal-dark"
                      onClick={() => toggleExpanded(reward.id)}
                    >
                      {isExpanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                      {isExpanded ? t("hideDetails") : t("showDetails")}
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 grid gap-3 border-t border-terminal-border/50 pt-4 md:grid-cols-2 xl:grid-cols-4">
                    <RewardBreakdownItem
                      label={t("breakdown.base")}
                      value={formatUsdReward(reward.baseAmountUsd)}
                    />
                    <RewardBreakdownItem
                      label={t("breakdown.toolBonus", { count: reward.toolCallCount })}
                      value={formatUsdReward(reward.toolBonusUsd)}
                    />
                    <RewardBreakdownItem
                      label={t("breakdown.tokenBonus", { count: reward.totalTokens.toLocaleString() })}
                      value={formatUsdReward(reward.tokenBonusUsd)}
                    />
                    <RewardBreakdownItem
                      label={t("breakdown.steps", { count: reward.stepCount })}
                      value={reward.approxInputTokens.toLocaleString()}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SettingsPanelCard>
    </div>
  );
}

function RewardStatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof WalletIcon;
  label: string;
  value: string;
  tone: "primary" | "neutral";
}) {
  return (
    <div className={cn(
      "rounded-2xl border px-4 py-4 shadow-sm",
      tone === "primary"
        ? "border-terminal-green/30 bg-terminal-green/10"
        : "border-terminal-border/60 bg-terminal-bg/10"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex h-10 w-10 items-center justify-center rounded-2xl border",
          tone === "primary"
            ? "border-terminal-green/30 bg-terminal-green/15 text-terminal-green"
            : "border-terminal-border/60 bg-terminal-cream/80 text-terminal-dark"
        )}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-terminal-muted">{label}</p>
          <p className="font-mono text-lg font-semibold text-terminal-dark">{value}</p>
        </div>
      </div>
    </div>
  );
}

function RewardBreakdownItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-terminal-border/50 bg-terminal-bg/10 px-3 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-terminal-muted">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-terminal-dark">{value}</p>
    </div>
  );
}

function formatCompletedAt(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
