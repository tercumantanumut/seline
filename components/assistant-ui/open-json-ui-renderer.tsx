"use client";

import type { CSSProperties, FC, ReactNode } from "react";
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
      return "border-green-200 bg-green-50/70";
    case "warning":
      return "border-amber-200 bg-amber-50/70";
    case "danger":
      return "border-red-200 bg-red-50/70";
    case "info":
      return "border-sky-200 bg-sky-50/70";
    default:
      return "border-terminal-dark/10 bg-terminal-cream/70";
  }
}

function textVariantClass(variant?: string): string {
  switch (variant) {
    case "title":
      return "text-sm font-semibold text-terminal-dark";
    case "muted":
      return "text-xs text-terminal-muted";
    case "caption":
      return "text-[11px] text-terminal-muted uppercase tracking-wide";
    case "code":
      return "text-xs text-terminal-dark font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere]";
    default:
      return "text-sm text-terminal-dark";
  }
}

function colorForIndex(index: number): string {
  const palette = ["#2f855a", "#3182ce", "#d69e2e", "#c05621", "#805ad5", "#0f766e"];
  return palette[index % palette.length];
}

function renderNode(node: GenerativeUINode, key: string): ReactNode {
  switch (node.type) {
    case "stack": {
      const isHorizontal = node.direction === "horizontal";
      const gapClass =
        node.gap === "xs"
          ? "gap-1"
          : node.gap === "sm"
            ? "gap-2"
            : node.gap === "lg"
              ? "gap-5"
              : "gap-3";
      return (
        <div key={key} className={cn(isHorizontal ? "flex flex-wrap" : "flex flex-col", gapClass)}>
          {node.children.map((child, index) => renderNode(child, `${key}-${index}`))}
        </div>
      );
    }

    case "card":
      return (
        <section key={key} className={cn("rounded-lg border p-3 shadow-sm", toneClass(node.tone))}>
          {node.title ? <h4 className="text-sm font-semibold text-terminal-dark">{node.title}</h4> : null}
          {node.subtitle ? <p className="mt-0.5 text-xs text-terminal-muted">{node.subtitle}</p> : null}
          {node.children && node.children.length > 0 ? (
            <div className="mt-2 space-y-2">
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
            "inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-medium",
            toneClass(node.tone)
          )}
        >
          {node.label}
        </span>
      );

    case "kv":
      return (
        <dl key={key} className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {node.items.map((item, index) => (
            <div key={`${key}-item-${index}`} className="rounded border border-terminal-dark/10 bg-white/60 px-2 py-1.5">
              <dt className="text-[11px] text-terminal-muted">{item.label}</dt>
              <dd className="text-sm text-terminal-dark font-mono break-words [overflow-wrap:anywhere]">
                {String(item.value)}
              </dd>
            </div>
          ))}
        </dl>
      );

    case "list":
      return node.ordered ? (
        <ol key={key} className="list-decimal pl-5 space-y-1 text-sm text-terminal-dark">
          {node.items.map((item, index) => (
            <li key={`${key}-item-${index}`}>
              {typeof item === "string" ? item : renderNode(item, `${key}-node-${index}`)}
            </li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="list-disc pl-5 space-y-1 text-sm text-terminal-dark">
          {node.items.map((item, index) => (
            <li key={`${key}-item-${index}`}>
              {typeof item === "string" ? item : renderNode(item, `${key}-node-${index}`)}
            </li>
          ))}
        </ul>
      );

    case "table":
      return (
        <div key={key} className="overflow-x-auto rounded border border-terminal-dark/10">
          <table className="min-w-full border-collapse text-left text-xs font-mono">
            <thead className="bg-terminal-dark/5 text-terminal-muted">
              <tr>
                {node.columns.map((column, index) => (
                  <th key={`${key}-col-${index}`} className="px-2 py-1.5 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {node.rows.map((row, rowIdx) => (
                <tr key={`${key}-row-${rowIdx}`} className="border-t border-terminal-dark/10">
                  {row.map((cell, cellIdx) => (
                    <td key={`${key}-cell-${rowIdx}-${cellIdx}`} className="px-2 py-1.5 text-terminal-dark break-words [overflow-wrap:anywhere]">
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

      return (
        <div key={key} className="space-y-2">
          {node.title ? <p className="text-xs font-semibold text-terminal-dark">{node.title}</p> : null}
          {node.chartType === "bar" ? (
            <div className="space-y-1.5">
              {node.series.map((item, index) => {
                const width = `${Math.max(4, (item.value / max) * 100)}%`;
                const style = { width, backgroundColor: item.color || colorForIndex(index) } as CSSProperties;
                return (
                  <div key={`${key}-bar-${index}`} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px] text-terminal-muted">
                      <span>{item.label}</span>
                      <span>{item.value}{node.unit ? ` ${node.unit}` : ""}</span>
                    </div>
                    <div className="h-2 rounded bg-terminal-dark/10">
                      <div className="h-2 rounded" style={style} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1 text-xs text-terminal-dark">
              {node.series.map((item, index) => {
                const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
                return (
                  <div key={`${key}-series-${index}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{item.label}</span>
                    <span className="font-mono">
                      {item.value}{node.unit ? ` ${node.unit}` : ""}
                      {node.chartType === "pie" ? ` (${pct}%)` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    case "divider":
      return <hr key={key} className="border-terminal-dark/10" />;

    default:
      return null;
  }
}

export const OpenJsonUIRenderer: FC<OpenJsonUIRendererProps> = ({ toolName, spec, meta }) => {
  const chipTone = meta?.source === "auto" ? "text-amber-700 border-amber-200 bg-amber-50" : "text-sky-700 border-sky-200 bg-sky-50";

  return (
    <div className="rounded-xl border border-terminal-dark/10 bg-white/80 p-3 shadow-sm space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-terminal-dark">{spec.title || `${toolName} UI`}</span>
        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium", chipTone)}>
          {meta?.source === "auto" ? "Auto UI" : "Model UI"}
        </span>
      </div>
      {spec.description ? <p className="text-xs text-terminal-muted">{spec.description}</p> : null}
      {renderNode(spec.root, `${toolName}-root`)}
    </div>
  );
};
