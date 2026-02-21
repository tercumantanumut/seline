"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Terminal, X, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
}

/**
 * DevLogsViewer - Streaming logs viewer for Electron dev mode
 * Shows real-time logs from the main process with error toasts for critical issues.
 */
export function DevLogsViewer() {
    const t = useTranslations("dev");
    const [isElectron, setIsElectron] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState("");
    const [autoScroll, setAutoScroll] = useState(true);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Check if we're in Electron after mount (to avoid hydration mismatch)
    useEffect(() => {
        setIsElectron(typeof window !== "undefined" && !!window.electronAPI?.logs);
    }, []);

    // Subscribe to logs when component mounts and viewer is open
    useEffect(() => {
        if (!isElectron || !isOpen) return;

        const electron = window.electronAPI!;

        // Subscribe to log stream
        electron.logs.subscribe();

        // Get existing buffer
        electron.logs.getBuffer().then((buffer) => {
            setLogs(buffer);
        });

        // Listen for new entries
        electron.logs.onEntry((entry: LogEntry) => {
            setLogs((prev) => {
                const newLogs = [...prev, entry];
                // Keep max 1000 entries in UI
                return newLogs.slice(-1000);
            });
        });

        // Listen for critical errors
        electron.logs.onCritical((data: { type: string; message: string }) => {
            if (data.type === "dimension_mismatch") {
                toast.error(t("dimensionMismatch"), {
                    duration: 10000,
                });
            }
        });

        return () => {
            electron.logs.unsubscribe();
            electron.logs.removeListeners();
        };
    }, [isElectron, isOpen]);

    // Auto-scroll to bottom when new logs arrive
    useEffect(() => {
        if (autoScroll && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs, autoScroll]);

    const clearLogs = useCallback(() => {
        if (isElectron && window.electronAPI) {
            window.electronAPI.logs.clear();
            setLogs([]);
        }
    }, [isElectron]);

    const filteredLogs = filter
        ? logs.filter((log) => log.message.toLowerCase().includes(filter.toLowerCase()))
        : logs;

    // Don't render anything if not in Electron
    if (!isElectron) {
        return null;
    }

    const getLevelColor = (level: string) => {
        switch (level) {
            case "error":
                return "text-red-400";
            case "warning":
                return "text-yellow-400";
            default:
                return "text-gray-300";
        }
    };

    return (
        <>
            {/* Toggle button */}
            <Button
                variant="outline"
                size="icon"
                className="fixed bottom-4 right-4 z-50 h-10 w-10 rounded-full bg-gray-900 border-gray-700 hover:bg-gray-800 shadow-lg"
                onClick={() => setIsOpen(!isOpen)}
            >
                <Terminal className="h-5 w-5 text-green-400" />
            </Button>

            {/* Logs panel */}
            {isOpen && (
                <div className="fixed bottom-16 right-4 z-50 w-[600px] max-w-[90vw] h-[400px] bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800 rounded-t-lg">
                        <div className="flex items-center gap-2">
                            <Terminal className="h-4 w-4 text-green-400" />
                            <span className="text-sm font-medium text-gray-200">Dev Logs</span>
                            <span className="text-xs text-gray-500">({filteredLogs.length})</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-gray-400 hover:text-white"
                                onClick={() => setAutoScroll(!autoScroll)}
                                title={autoScroll ? "Disable auto-scroll" : "Enable auto-scroll"}
                            >
                                {autoScroll ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-gray-400 hover:text-white"
                                onClick={clearLogs}
                                title="Clear logs"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-gray-400 hover:text-white"
                                onClick={() => setIsOpen(false)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Filter */}
                    <div className="px-2 py-1 border-b border-gray-700">
                        <input
                            type="text"
                            placeholder="Filter logs..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="w-full px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-green-500"
                        />
                    </div>

                    {/* Logs */}
                    <div className="flex-1 overflow-y-auto font-mono text-xs p-2 space-y-0.5">
                        {filteredLogs.map((log, i) => (
                            <div key={i} className="flex gap-2 hover:bg-gray-800 px-1 rounded">
                                <span className="text-gray-500 flex-shrink-0">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                </span>
                                <span className={`${getLevelColor(log.level)} whitespace-pre-wrap break-all`}>
                                    {log.message}
                                </span>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>
            )}
        </>
    );
}
