import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SettingsPanelCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsPanelCard({ title, description, children, className }: SettingsPanelCardProps) {
  return (
    <section className={cn("space-y-5 rounded-xl border border-terminal-border bg-terminal-bg/60 p-4 sm:p-5", className)}>
      <header>
        <h3 className="font-mono text-base font-semibold text-terminal-dark">{title}</h3>
        {description && (
          <p className="mt-1 font-mono text-xs text-terminal-muted">{description}</p>
        )}
      </header>
      {children}
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
    <div className="flex flex-col gap-3 rounded-lg border border-terminal-border/70 bg-terminal-bg/50 p-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <label htmlFor={id} className="font-mono text-sm text-terminal-dark">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="mt-1 font-mono text-xs text-terminal-muted">
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
        className="size-5 accent-terminal-green sm:mt-0.5"
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
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block font-mono text-sm text-terminal-dark">
        {label}
      </label>
      {children}
      {helperText && (
        <p id={`${htmlFor}-help`} className="font-mono text-xs text-terminal-muted">
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
  description: string;
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
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
        checked
          ? "border-terminal-green/70 bg-terminal-green/10"
          : "border-terminal-border bg-terminal-bg/50 hover:bg-terminal-bg/80"
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-4 accent-terminal-green"
      />
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-terminal-dark">{label}</span>
          {badge && (
            <span className="rounded border border-terminal-border bg-terminal-cream/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-terminal-muted">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-1 font-mono text-xs text-terminal-muted">{description}</p>
      </div>
    </label>
  );
}
