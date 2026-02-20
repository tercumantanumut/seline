import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const settingsInputClassName =
  "w-full rounded-md border border-terminal-border/60 bg-terminal-cream/95 px-3 py-2 font-mono text-sm text-terminal-dark shadow-sm transition-colors placeholder:text-terminal-muted/75 focus:border-terminal-green focus:outline-none focus:ring-2 focus:ring-terminal-green/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-terminal-border/85 dark:bg-terminal-bg/70 dark:text-terminal-text dark:placeholder:text-terminal-muted";

interface SettingsPanelCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsPanelCard({ title, description, children, className }: SettingsPanelCardProps) {
  return (
    <section
      className={cn(
        "space-y-5 rounded-2xl border border-terminal-border/60 bg-terminal-cream/95 p-4 shadow-sm dark:border-terminal-border/85 dark:bg-terminal-bg/80 sm:p-6",
        className
      )}
    >
      <header className="space-y-1">
        <h3 className="font-mono text-base font-semibold text-terminal-dark dark:text-terminal-cream-dark">{title}</h3>
        {description && <p className="font-mono text-xs leading-relaxed text-terminal-muted">{description}</p>}
      </header>
      {children}
    </section>
  );
}

interface SettingsOptionGroupProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsOptionGroup({ title, description, children, className }: SettingsOptionGroupProps) {
  return (
    <section className={cn("space-y-3", className)}>
      <header className="space-y-1">
        <h4 className="font-mono text-sm font-semibold text-terminal-dark dark:text-terminal-cream-dark">{title}</h4>
        {description && <p className="font-mono text-xs leading-relaxed text-terminal-muted">{description}</p>}
      </header>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

interface SettingsToggleRowProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function SettingsToggleRow({ id, label, description, checked, onChange }: SettingsToggleRowProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-terminal-border/55 bg-terminal-bg/5 p-3.5 dark:border-terminal-border/85 dark:bg-terminal-cream/5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <label htmlFor={id} className="font-mono text-sm font-semibold text-terminal-dark dark:text-terminal-cream-dark">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="mt-1 font-mono text-xs leading-relaxed text-terminal-muted">
            {description}
          </p>
        )}
      </div>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={description ? `${id}-description` : undefined}
        className="mt-0.5 size-5 shrink-0 cursor-pointer accent-terminal-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terminal-green/50"
      />
    </div>
  );
}

interface SettingsFieldProps {
  label: string;
  htmlFor: string;
  helperText?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsField({ label, htmlFor, helperText, children, className }: SettingsFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={htmlFor} className="block font-mono text-sm font-semibold text-terminal-dark dark:text-terminal-cream-dark">
        {label}
      </label>
      {children}
      {helperText && (
        <p id={`${htmlFor}-help`} className="font-mono text-xs leading-relaxed text-terminal-muted">
          {helperText}
        </p>
      )}
    </div>
  );
}

interface SettingsRadioCardProps {
  id: string;
  name: string;
  value: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  badge?: string;
}

export function SettingsRadioCard({
  id,
  name,
  value,
  label,
  description,
  checked,
  onChange,
  badge,
}: SettingsRadioCardProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 shadow-sm transition-colors focus-within:ring-2 focus-within:ring-terminal-green/45",
        checked
          ? "border-terminal-green/65 bg-terminal-green/10 dark:border-terminal-green/75 dark:bg-terminal-green/15"
          : "border-terminal-border/55 bg-terminal-bg/5 hover:bg-terminal-bg/10 dark:border-terminal-border/85 dark:bg-terminal-cream/5 dark:hover:bg-terminal-cream/10"
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-terminal-green"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-terminal-dark dark:text-terminal-cream-dark">{label}</span>
          {badge && (
            <span className="rounded-md border border-terminal-border/65 bg-terminal-cream-dark/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-terminal-muted dark:bg-terminal-bg/80">
              {badge}
            </span>
          )}
        </div>
        {description && <p className="mt-1 font-mono text-xs leading-relaxed text-terminal-muted">{description}</p>}
      </div>
    </label>
  );
}
