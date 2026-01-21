"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export type StatusFilter = "all" | "active" | "inactive" | "draft";
export type PriorityFilter = "all" | "high" | "normal" | "low";

interface FilterBarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    statusFilter: StatusFilter;
    onStatusChange: (status: StatusFilter) => void;
    priorityFilter: PriorityFilter;
    onPriorityChange: (priority: PriorityFilter) => void;
}

export function FilterBar({
    searchQuery,
    onSearchChange,
    statusFilter,
    onStatusChange,
    priorityFilter,
    onPriorityChange,
}: FilterBarProps) {
    const t = useTranslations("schedules.filters");

    return (
        <div className="flex flex-col sm:flex-row gap-3 p-3 bg-terminal-cream/50 rounded-lg border border-terminal-border/30">
            {/* Search Input */}
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-terminal-muted" />
                <Input
                    type="text"
                    placeholder={t("search")}
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-10 font-mono text-sm bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px bg-terminal-border/30" />

            {/* Status Filter */}
            <Select
                value={statusFilter}
                onValueChange={(value) => onStatusChange(value as StatusFilter)}
            >
                <SelectTrigger className="w-full sm:w-[140px] font-mono text-sm border-none bg-transparent focus:ring-0">
                    <SelectValue placeholder={t("allStatuses")} />
                </SelectTrigger>
                <SelectContent className="font-mono">
                    <SelectItem value="all">{t("allStatuses")}</SelectItem>
                    <SelectItem value="active">{t("active")}</SelectItem>
                    <SelectItem value="inactive">{t("inactive")}</SelectItem>
                    <SelectItem value="draft">{t("draft")}</SelectItem>
                </SelectContent>
            </Select>

            {/* Divider */}
            <div className="hidden sm:block w-px bg-terminal-border/30" />

            {/* Priority Filter */}
            <Select
                value={priorityFilter}
                onValueChange={(value) => onPriorityChange(value as PriorityFilter)}
            >
                <SelectTrigger className="w-full sm:w-[140px] font-mono text-sm border-none bg-transparent focus:ring-0">
                    <SelectValue placeholder={t("allPriorities")} />
                </SelectTrigger>
                <SelectContent className="font-mono">
                    <SelectItem value="all">{t("allPriorities")}</SelectItem>
                    <SelectItem value="high">{t("high")}</SelectItem>
                    <SelectItem value="normal">{t("normal")}</SelectItem>
                    <SelectItem value="low">{t("low")}</SelectItem>
                </SelectContent>
            </Select>
        </div>
    );
}
