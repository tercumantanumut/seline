"use client";

import type { CSSProperties, FC, ReactNode } from "react";
import {
  BarChart3Icon,
  BracesIcon,
  CheckCircle2Icon,
  Code2Icon,
  LayoutPanelTopIcon,
  SearchCodeIcon,
  TerminalSquareIcon,
  WrenchIcon,
} from "lucide-react";
import {
  type GenerativeUINode,
  type GenerativeUISpec,
  type GenerativeUITone,
} from "@/lib/ai/generative-ui/spec";
import type { GenerativeUISpecMetadata } from "@/lib/ai/generative-ui/payload";
import { cn } from "@/lib/utils";

interface OpenJsonUIRendererProps {
  toolName: string;
  spec: GenerativeUISpec;
  meta?: GenerativeUISpecMetadata;
}

function toneClass(tone?: GenerativeUITone): string {
  switch (tone) {
    case "success":
      return "border-emerald-300/70 bg-emerald-50/90";
    case "warning":
      return "border-amber-300/80 bg-amber-50/95";
    case "danger":
      return "border-red-300/75 bg-red-50/95";
    case "info":
      return "border-sky-300/75 bg-sky-50/95";
    default:
      return "border-terminal-dark/20 bg-white/90";
  }
}

function textVariantClass(variant?: string): string {
  switch (variant) {
    case "title":
      return "text-base font-semibold text-terminal-dark tracking-tight";
    case "muted":
      return "text-xs text-terminal-muted";
    case "caption":
      return "text-[11px] text-terminal-muted uppercase tracking-[0.08em]";
    case "code":
      return "text-xs text-terminal-dark font-mono leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]";
    default:
      return "text-sm text-terminal-dark leading-relaxed";
  }
}

function colorForIndex(index: number): string {
  const palette = ["#217a58", "#2a6fb5", "#ca7c2b", "#b64a2b", "#4f6b35", "#6d5cae"];
  return palette[index % palette.length];
}

function toolIcon(toolName: string) {
  if (toolName === "vectorSearch") return SearchCodeIcon;
  if (toolName === "executeCommand") return TerminalSquareIcon;
  if (toolName === "editFile" || toolName === "writeFile" || toolName === "patchFile") return Code2Icon;
  if (toolName === "workspace") return WrenchIcon;
  return LayoutPanelTopIcon;
}

function renderNode(node: GenerativeUINode, key: string): ReactNode {
  switch (node.type) {
    case "stack": {
      const isHorizontal = node.direction === "horizontal";
      const gapClass =
        node.gap === "xs"
          ? "gap-1.5"
          : node.gap === "sm"
            ? "gap-2.5"
            : node.gap === "lg"
              ? "gap-5"
              : "gap-3.5";

      return (
        <div
          key={key}
          className={cn(isHorizontal ? "flex flex-wrap items-start" : "flex flex-col", gapClass)}
        >
          {node.children.map((child, index) => renderNode(child, `${key}-${index}`))}
        </div>
      );
    }

    case "card":
      return (
        <section
          key={key}
          className={cn(
            "rounded-xl border px-3.5 py-3 shadow-[0_1px_0_rgba(16,17,15,0.07)]",
            "bg-gradient-to-b from-white/95 to-white/75",
            toneClass(node.tone)
          )}
        >
          {node.title ? (
            <h4 className="text-sm font-semibold text-terminal-dark tracking-tight">{node.title}</h4>
          ) : null}
          {node.subtitle ? <p className="mt-0.5 text-xs text-terminal-muted">{node.subtitle}</p> : null}
          {node.children && node.children.length > 0 ? (
            <div className="mt-2.5 space-y-2.5">
              {node.children.map((child, index) => renderNode(child, `${key}-child-${index}`))}
            </div>
          ) : null}
        </section>
      );

    case "text":
      return (
        <p key={key} className={textVariantClass(node.variant)}>
          {node.text}
        </p>
      );

    case "badge":
      return (
        <span
          key={key}
          className={cn(
            "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase",
            toneClass(node.tone)
          )}
        >
          {node.label}
        </span>
      );

    case "kv":
      return (
        <dl key={key} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {node.items.map((item, index) => (
            <div
              key={`${key}-item-${index}`}
              className="rounded-lg border border-terminal-dark/15 bg-terminal-cream/40 px-2.5 py-2"
            >
              <dt className="text-[10px] uppercase tracking-[0.08em] text-terminal-muted">{item.label}</dt>
              <dd className="mt-1 text-sm text-terminal-dark font-mono break-words [overflow-wrap:anywhere]">
                {item.value === null ? "-" : String(item.value)}
              </dd>
            </div>
          ))}
        </dl>
      );

    case "list":
      return node.ordered ? (
        <ol key={key} className="list-decimal pl-5 space-y-1.5 text-sm text-terminal-dark">
          {node.items.map((item, index) => (
            <li key={`${key}-item-${index}`} className="leading-relaxed">
              {typeof item === "string" ? item : renderNode(item, `${key}-node-${index}`)}
            </li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="list-disc pl-5 space-y-1.5 text-sm text-terminal-dark">
          {node.items.map((item, index) => (
            <li key={`${key}-item-${index}`} className="leading-relaxed">
              {typeof item === "string" ? item : renderNode(item, `${key}-node-${index}`)}
            </li>
          ))}
        </ul>
      );

    case "table":
      return (
        <div key={key} className="overflow-x-auto rounded-xl border border-terminal-dark/20 bg-white/80">
          <table className="min-w-full border-collapse text-left text-xs font-mono">
            <thead className="bg-terminal-dark/8 text-terminal-dark">
              <tr>
                {node.columns.map((column, index) => (
                  <th
                    key={`${key}-col-${index}`}
                    className="px-2.5 py-2 font-semibold uppercase tracking-[0.06em] text-[10px]"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {node.rows.map((row, rowIdx) => (
                <tr
                  key={`${key}-row-${rowIdx}`}
                  className={cn(
                    "border-t border-terminal-dark/12",
                    rowIdx % 2 === 0 ? "bg-white/65" : "bg-terminal-cream/30"
                  )}
                >
                  {row.map((cell, cellIdx) => (
                    <td
                      key={`${key}-cell-${rowIdx}-${cellIdx}`}
                      className="px-2.5 py-2 text-terminal-dark break-words [overflow-wrap:anywhere]"
                    >
                      {cell === null ? "-" : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "chart": {
      const max = Math.max(...node.series.map((item) => item.value), 1);
      const total = node.series.reduce((sum, item) => sum + item.value, 0);
      const pieStops = node.series
        .map((item, index) => {
          const previousShare =
            node.series.slice(0, index).reduce((sum, current) => sum + current.value, 0) / (total || 1);
          const currentShare = item.value / (total || 1);
          return `${item.color || colorForIndex(index)} ${(previousShare * 100).toFixed(2)}% ${( (previousShare + currentShare) * 100).toFixed(2)}%`;
        })
        .join(", ");

      return (
        <div key={key} className="space-y-2.5">
          {node.title ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-terminal-dark uppercase tracking-[0.08em]">
              <BarChart3Icon className="size-3.5 text-terminal-amber" />
              <span>{node.title}</span>
            </div>
          ) : null}

          {node.chartType === "pie" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[110px_1fr] sm:items-center">
              <div
                className="mx-auto size-24 rounded-full border border-terminal-dark/15"
                style={{
                  background: pieStops.length > 0 ? (`conic-gradient(${pieStops})` as CSSProperties["background"]) : "#ddd",
                }}
              />
              <div className="space-y-1.5">
                {node.series.map((item, index) => {
                  const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={`${key}-series-${index}`} className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-terminal-dark">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: item.color || colorForIndex(index) }}
                        />
                        {item.label}
                      </span>
                      <span className="font-mono text-terminal-muted">
                        {item.value}{node.unit ? ` ${node.unit}` : ""} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {node.series.map((item, index) => {
                const width = `${Math.max(4, (item.value / max) * 100)}%`;
                const style = {
                  width,
                  backgroundColor: item.color || colorForIndex(index),
                } as CSSProperties;

                return (
                  <div key={`${key}-bar-${index}`} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-terminal-muted">
                      <span className="truncate pr-2 text-terminal-dark">{item.label}</span>
                      <span className="font-mono">
                        {item.value}
                        {node.unit ? ` ${node.unit}` : ""}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-terminal-dark/12">
                      <div
                        className={cn(
                          "h-2.5 rounded-full",
                          node.chartType === "line" ? "opacity-85" : "opacity-100"
                        )}
                        style={style}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    case "divider":
      return <hr key={key} className="border-terminal-dark/15" />;

    default:
      return null;
  }
}

export const OpenJsonUIRenderer: FC<OpenJsonUIRendererProps> = ({ toolName, spec, meta }) => {
  const Icon = toolIcon(toolName);
  const sourceAuto = meta?.source === "auto";

  return (
    <div className="rounded-2xl border border-terminal-dark/20 bg-gradient-to-br from-terminal-cream to-white p-3.5 shadow-[0_1px_0_rgba(16,17,15,0.08)] space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-terminal-dark/15 bg-white/85 px-2.5 py-1">
          <Icon className="size-3.5 text-terminal-dark" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-terminal-dark">
            {spec.title || `${toolName} UI`}
          </span>
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
            sourceAuto
              ? "text-amber-800 border-amber-300/70 bg-amber-100/80"
              : "text-sky-800 border-sky-300/70 bg-sky-100/80"
          )}
        >
          {sourceAuto ? <WrenchIcon className="size-3" /> : <CheckCircle2Icon className="size-3" />}
          {sourceAuto ? "Auto UI" : "Model UI"}
        </span>

        <span className="inline-flex items-center gap-1 rounded-full border border-terminal-dark/15 bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-terminal-muted">
          <BracesIcon className="size-3" />
          {meta?.nodeCount ?? "?"} nodes
        </span>
      </div>

      {spec.description ? (
        <p className="text-xs text-terminal-muted leading-relaxed">{spec.description}</p>
      ) : null}

      <div className="space-y-3">{renderNode(spec.root, `${toolName}-root`)}</div>
    </div>
  );
};
