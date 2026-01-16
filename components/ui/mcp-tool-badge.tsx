/**
 * MCP Tool Badge Component
 * 
 * Visual badge for displaying MCP tool information.
 */

import { Badge } from "@/components/ui/badge";
import { Plug } from "lucide-react";
import { cn } from "@/lib/utils";

interface MCPToolBadgeProps {
    serverName: string;
    toolName: string;
    connected?: boolean;
    className?: string;
}

export function MCPToolBadge({
    serverName,
    toolName,
    connected = true,
    className,
}: MCPToolBadgeProps) {
    return (
        <Badge
            variant="outline"
            className={cn(
                "gap-1.5 font-mono text-xs",
                connected ? "border-purple-500/50 text-purple-400" : "border-muted text-muted-foreground",
                className
            )}
        >
            <Plug className="h-3 w-3" />
            <span className="opacity-60">{serverName}:</span>
            {toolName}
        </Badge>
    );
}
