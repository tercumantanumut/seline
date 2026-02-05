"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Hash, Loader2, MessageCircle, Phone, RefreshCw, Send, Trash2, Plug, Pencil } from "lucide-react";

type ChannelType = "whatsapp" | "telegram" | "slack";
type ChannelStatus = "disconnected" | "connecting" | "connected" | "error";

type ChannelConnection = {
  id: string;
  characterId: string;
  channelType: ChannelType;
  displayName?: string | null;
  status: ChannelStatus;
  lastError?: string | null;
  config?: Record<string, unknown>;
};

type ChannelConnectionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characterId: string;
  characterName: string;
  onConnectionsChange?: (connections: ChannelConnection[]) => void;
};

const CHANNEL_ICONS: Record<ChannelType, typeof Phone> = {
  whatsapp: Phone,
  telegram: Send,
  slack: Hash,
};

const STATUS_STYLES: Record<ChannelStatus, string> = {
  connected: "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30",
  connecting: "bg-amber-500/15 text-amber-700 border border-amber-500/30",
  disconnected: "bg-terminal-dark/10 text-terminal-muted border border-terminal-dark/20",
  error: "bg-red-500/15 text-red-700 border border-red-500/30",
};

const normalizeBool = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return false;
};

export function ChannelConnectionsDialog({
  open,
  onOpenChange,
  characterId,
  characterName,
  onConnectionsChange,
}: ChannelConnectionsDialogProps) {
  const t = useTranslations("channels");
  const tc = useTranslations("common");
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ChannelConnection | null>(null);
  const [formType, setFormType] = useState<ChannelType>("whatsapp");
  const [displayName, setDisplayName] = useState("");
  const [telegramToken, setTelegramToken] = useState("");
  const [slackBotToken, setSlackBotToken] = useState("");
  const [slackAppToken, setSlackAppToken] = useState("");
  const [slackSigningSecret, setSlackSigningSecret] = useState("");
  const [whatsappSelfChat, setWhatsappSelfChat] = useState(false);
  const [qrCodes, setQrCodes] = useState<Record<string, string | null>>({});

  const isEditing = Boolean(editingConnection);

  const resetForm = useCallback(() => {
    setEditingConnection(null);
    setFormType("whatsapp");
    setDisplayName("");
    setTelegramToken("");
    setSlackBotToken("");
    setSlackAppToken("");
    setSlackSigningSecret("");
    setWhatsappSelfChat(false);
  }, []);

  const loadConnections = useCallback(async () => {
    if (!characterId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/channels/connections?characterId=${characterId}`);
      if (!response.ok) {
        throw new Error(t("errors.load"));
      }
      const data = await response.json();
      const nextConnections = (data.connections || []) as ChannelConnection[];
      setConnections(nextConnections);
      onConnectionsChange?.(nextConnections);

      setQrCodes((prev) => {
        const next = { ...prev };
        for (const connection of nextConnections) {
          if (connection.channelType !== "whatsapp" || connection.status !== "connecting") {
            delete next[connection.id];
          }
        }
        return next;
      });
    } catch (error) {
      console.error("[Channels] Load error:", error);
      toast.error(t("errors.load"));
    } finally {
      setIsLoading(false);
    }
  }, [characterId, onConnectionsChange, t]);

  const fetchQr = useCallback(async (connectionId: string) => {
    try {
      const response = await fetch(`/api/channels/connections/${connectionId}/qr`);
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      setQrCodes((prev) => ({ ...prev, [connectionId]: data.dataUrl || null }));
    } catch (error) {
      console.error("[Channels] QR fetch error:", error);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadConnections();
  }, [open, loadConnections]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      void loadConnections();
    }, 6000);
    return () => clearInterval(interval);
  }, [open, loadConnections]);

  useEffect(() => {
    if (!open) return;
    const active = connections.filter(
      (connection) => connection.channelType === "whatsapp" && connection.status === "connecting"
    );
    if (active.length === 0) {
      return;
    }
    active.forEach((connection) => void fetchQr(connection.id));
    const interval = setInterval(() => {
      active.forEach((connection) => void fetchQr(connection.id));
    }, 2500);
    return () => clearInterval(interval);
  }, [connections, fetchQr, open]);

  const handleEdit = useCallback((connection: ChannelConnection) => {
    setEditingConnection(connection);
    setFormType(connection.channelType);
    setDisplayName(connection.displayName || "");
    setTelegramToken("");
    setSlackBotToken("");
    setSlackAppToken("");
    setSlackSigningSecret("");
    setWhatsappSelfChat(normalizeBool(connection.config?.selfChatMode));
  }, []);

  const handleSubmit = useCallback(async () => {
    setIsSaving(true);
    try {
      const config: Record<string, unknown> = {};
      if (formType === "telegram" && telegramToken.trim()) {
        config.botToken = telegramToken.trim();
      }
      if (formType === "slack") {
        if (slackBotToken.trim()) config.botToken = slackBotToken.trim();
        if (slackAppToken.trim()) config.appToken = slackAppToken.trim();
        if (slackSigningSecret.trim()) config.signingSecret = slackSigningSecret.trim();
      }
      if (isEditing && editingConnection) {
        const response = await fetch(`/api/channels/connections/${editingConnection.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: displayName.trim() || null,
            config: {
              ...config,
              ...(formType === "whatsapp" ? { selfChatMode: whatsappSelfChat } : {}),
            },
          }),
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || t("errors.update"));
        }
        toast.success(t("notices.updated"));
      } else {
        const response = await fetch("/api/channels/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId,
            channelType: formType,
            displayName: displayName.trim() || null,
            config: {
              ...config,
              ...(formType === "whatsapp" ? { selfChatMode: whatsappSelfChat } : {}),
            },
          }),
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || t("errors.create"));
        }
        const data = await response.json();
        const connectionId = data.connection?.id as string | undefined;
        if (connectionId) {
          await fetch(`/api/channels/connections/${connectionId}/connect`, { method: "POST" });
        }
        toast.success(t("notices.created"));
        if (formType === "slack") {
          toast.warning(t("notices.slackScopesHint"), { duration: 8000 });
        }
      }

      resetForm();
      await loadConnections();
    } catch (error) {
      console.error("[Channels] Save error:", error);
      toast.error(error instanceof Error ? error.message : t("errors.save"));
    } finally {
      setIsSaving(false);
    }
  }, [
    characterId,
    displayName,
    editingConnection,
    formType,
    isEditing,
    loadConnections,
    resetForm,
    slackAppToken,
    slackBotToken,
    slackSigningSecret,
    t,
    telegramToken,
  ]);

  const handleConnectToggle = useCallback(
    async (connection: ChannelConnection) => {
      try {
        const endpoint =
          connection.status === "connected"
            ? `/api/channels/connections/${connection.id}/disconnect`
            : `/api/channels/connections/${connection.id}/connect`;
        const response = await fetch(endpoint, { method: "POST" });
        if (!response.ok) {
          throw new Error(t("errors.update"));
        }
        await loadConnections();
      } catch (error) {
        console.error("[Channels] Toggle error:", error);
        toast.error(t("errors.update"));
      }
    },
    [loadConnections, t]
  );

  const handleDelete = useCallback(
    async (connection: ChannelConnection) => {
      const confirmed = window.confirm(t("confirmDelete"));
      if (!confirmed) return;
      try {
        const response = await fetch(`/api/channels/connections/${connection.id}`, { method: "DELETE" });
        if (!response.ok) {
          throw new Error(t("errors.delete"));
        }
        toast.success(t("notices.deleted"));
        await loadConnections();
      } catch (error) {
        console.error("[Channels] Delete error:", error);
        toast.error(t("errors.delete"));
      }
    },
    [loadConnections, t]
  );

  const formTitle = isEditing ? t("form.editTitle") : t("form.createTitle");
  const formDescription = isEditing ? t("form.editDescription") : t("form.createDescription");
  const submitLabel = isEditing ? t("form.update") : t("form.create");

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (!value) {
        resetForm();
      }
      onOpenChange(value);
    }}>
      <DialogContent className="max-w-4xl bg-terminal-cream">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-terminal-dark">
            <Plug className="h-5 w-5 text-terminal-green" />
            {t("title", { name: characterName })}
          </DialogTitle>
          <DialogDescription className="text-terminal-muted font-mono">
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-terminal-dark">
                {t("connections.title")}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-terminal-muted hover:text-terminal-green"
                onClick={loadConnections}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>

            {connections.length === 0 ? (
              <div className="rounded-lg border border-terminal-border/30 bg-terminal-cream/60 p-4 text-sm font-mono text-terminal-muted">
                {t("connections.empty")}
              </div>
            ) : (
              <div className="space-y-3">
                {connections.map((connection) => {
                  const Icon = CHANNEL_ICONS[connection.channelType];
                  const statusLabel = t(`status.${connection.status}`);
                  return (
                    <div
                      key={connection.id}
                      className="rounded-lg border border-terminal-border/30 bg-terminal-cream/70 p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-terminal-green" />
                            <span className="font-mono text-sm text-terminal-dark">
                              {connection.displayName || t(`types.${connection.channelType}`)}
                            </span>
                            <Badge className={cn("border px-2 py-0.5", STATUS_STYLES[connection.status])}>
                              {statusLabel}
                            </Badge>
                          </div>
                          <p className="text-xs font-mono text-terminal-muted">
                            {t(`types.${connection.channelType}`)}
                          </p>
                          {connection.lastError ? (
                            <p className="text-xs font-mono text-red-600">{connection.lastError}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(connection)}
                            className="h-8 px-3 font-mono text-xs"
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            {t("actions.edit")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleConnectToggle(connection)}
                            className="h-8 px-3 font-mono text-xs"
                          >
                            {connection.status === "connected" ? t("actions.disconnect") : t("actions.connect")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(connection)}
                            className="h-8 px-2 text-red-600 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {connection.channelType === "whatsapp" && connection.status === "connecting" && qrCodes[connection.id] ? (
                        <div className="mt-4 flex flex-wrap items-center gap-4">
                          <img
                            src={qrCodes[connection.id] ?? ""}
                            alt={t("whatsapp.qrAlt")}
                            className="h-28 w-28 rounded-lg border border-terminal-border/40 bg-white p-2"
                          />
                          <div className="max-w-sm text-xs font-mono text-terminal-muted">
                            <p>{t("whatsapp.qrHelp")}</p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-terminal-border/30 bg-terminal-cream/70 p-4 shadow-sm">
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-terminal-dark">
                {formTitle}
              </h3>
              <p className="mt-1 text-xs font-mono text-terminal-muted">{formDescription}</p>

              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-terminal-dark">{t("form.channelType")}</Label>
                  <Select
                    value={formType}
                    onValueChange={(value) => setFormType(value as ChannelType)}
                    disabled={isEditing}
                  >
                    <SelectTrigger className="font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">{t("types.whatsapp")}</SelectItem>
                      <SelectItem value="telegram">{t("types.telegram")}</SelectItem>
                      <SelectItem value="slack">{t("types.slack")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-terminal-dark">{t("form.displayName")}</Label>
                  <Input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder={t("form.displayNamePlaceholder")}
                    className="font-mono"
                  />
                </div>

                {formType === "telegram" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono text-terminal-dark">{t("form.telegramToken")}</Label>
                    <Input
                      value={telegramToken}
                      onChange={(event) => setTelegramToken(event.target.value)}
                      placeholder={t("form.telegramTokenPlaceholder")}
                      type="password"
                      className="font-mono"
                    />
                    {isEditing ? (
                      <p className="text-xs font-mono text-terminal-muted">{t("form.keepExisting")}</p>
                    ) : null}
                  </div>
                )}

                {formType === "slack" && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-mono text-terminal-dark">{t("form.slackBotToken")}</Label>
                      <Input
                        value={slackBotToken}
                        onChange={(event) => setSlackBotToken(event.target.value)}
                        placeholder={t("form.slackBotTokenPlaceholder")}
                        type="password"
                        className="font-mono"
                      />
                      {isEditing ? (
                        <p className="text-xs font-mono text-terminal-muted">{t("form.keepExisting")}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-mono text-terminal-dark">{t("form.slackAppToken")}</Label>
                      <Input
                        value={slackAppToken}
                        onChange={(event) => setSlackAppToken(event.target.value)}
                        placeholder={t("form.slackAppTokenPlaceholder")}
                        type="password"
                        className="font-mono"
                      />
                      {isEditing ? (
                        <p className="text-xs font-mono text-terminal-muted">{t("form.keepExisting")}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-mono text-terminal-dark">{t("form.slackSigningSecret")}</Label>
                      <Input
                        value={slackSigningSecret}
                        onChange={(event) => setSlackSigningSecret(event.target.value)}
                        placeholder={t("form.slackSigningSecretPlaceholder")}
                        type="password"
                        className="font-mono"
                      />
                      {isEditing ? (
                        <p className="text-xs font-mono text-terminal-muted">{t("form.keepExisting")}</p>
                      ) : null}
                    </div>
                  </div>
                )}

                {formType === "whatsapp" && (
                  <div className="space-y-3 rounded-md border border-terminal-border/30 bg-terminal-cream/70 p-3 text-xs font-mono text-terminal-muted">
                    <div className="flex items-start gap-2">
                      <MessageCircle className="mt-0.5 h-4 w-4 text-terminal-green" />
                      <div>{t("whatsapp.connectHint")}</div>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-mono text-terminal-dark">
                      <Checkbox
                        checked={whatsappSelfChat}
                        onCheckedChange={(value) => setWhatsappSelfChat(Boolean(value))}
                      />
                      {t("whatsapp.selfChat")}
                    </label>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Button
                    onClick={handleSubmit}
                    disabled={isSaving}
                    className="font-mono"
                  >
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {submitLabel}
                  </Button>
                  {isEditing && (
                    <Button
                      variant="ghost"
                      onClick={resetForm}
                      className="font-mono"
                    >
                      {tc("cancel")}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-terminal-border/30 bg-terminal-cream/70 p-4 text-xs font-mono text-terminal-muted">
              {t("securityNote")}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
