"use client";

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  ImageIcon,
  BoldIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  CodeIcon,
  QuoteIcon,
  Heading2Icon,
  SendHorizontalIcon,
  Loader2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

/** A single part of the multimodal content array sent to threadRuntime.append() */
export interface ContentPart {
  type: "text" | "image";
  text?: string;
  image?: string;
}

export interface TiptapEditorHandle {
  /** Serialize editor content to multimodal content array */
  getContentArray: () => ContentPart[];
  /** Check if the editor has any meaningful content */
  hasContent: () => boolean;
  /** Clear the editor */
  clear: () => void;
  /** Focus the editor */
  focus: () => void;
}

interface TiptapEditorProps {
  /** Called when the user submits (Cmd/Ctrl+Enter) */
  onSubmit: (content: ContentPart[]) => void;
  /** Session ID for image uploads */
  sessionId?: string;
  /** Initial editor document, restored from draft persistence */
  initialContent?: JSONContent | null;
  /** Called whenever editor doc changes */
  onDraftChange?: (draft: JSONContent | null) => void;
  /** Called after editor content is cleared */
  onDraftClear?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether submission is disabled */
  disabled?: boolean;
  /** Whether currently submitting */
  isSubmitting?: boolean;
  /** Additional class name */
  className?: string;
}

// ============================================================================
// Image upload helper
// ============================================================================

async function uploadImage(
  file: File,
  sessionId?: string,
): Promise<string | null> {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_SIZE) {
    toast.error(
      `Image too large (${Math.round(file.size / 1024 / 1024)}MB). Max 10MB.`,
    );
    return null;
  }

  const formData = new FormData();
  formData.append("file", file);
  if (sessionId) formData.append("sessionId", sessionId);
  formData.append("role", "upload");

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      toast.error("Failed to upload image");
      return null;
    }

    const data = await response.json();
    return data.url as string;
  } catch {
    toast.error("Failed to upload image");
    return null;
  }
}

// ============================================================================
// Content serialization
// ============================================================================

type TiptapMark = {
  type?: string;
  attrs?: {
    href?: string;
  };
};

function wrapInlineCode(text: string): string {
  const runs = text.match(/`+/g);
  const longestRun = runs ? Math.max(...runs.map((run) => run.length)) : 0;
  const fence = "`".repeat(longestRun + 1);
  return `${fence}${text}${fence}`;
}

function applyTextMarks(
  text: string,
  marks: TiptapMark[],
): string {
  if (marks.length === 0) {
    return text;
  }

  const styleMarks: TiptapMark[] = [];
  let href: string | undefined;

  for (const mark of marks) {
    if (mark.type === "link") {
      href = mark.attrs?.href;
      continue;
    }
    styleMarks.push(mark);
  }

  let markedText = text;

  for (const mark of styleMarks) {
    switch (mark.type) {
      case "bold": {
        markedText = `**${markedText}**`;
        break;
      }
      case "italic": {
        markedText = `*${markedText}*`;
        break;
      }
      case "code": {
        markedText = wrapInlineCode(markedText);
        break;
      }
      case "strike": {
        markedText = `~~${markedText}~~`;
        break;
      }
      default:
        break;
    }
  }

  if (!href) {
    return markedText;
  }

  return `[${markedText}](${href})`;
}

export function plainTextToTiptapDoc(text: string): JSONContent | null {
  if (!text.trim()) {
    return null;
  }

  const normalizedText = text.replace(/\r\n?/g, "\n");
  const paragraphs = normalizedText.split("\n").map((line) => {
    if (line.length === 0) {
      return { type: "paragraph" };
    }

    return {
      type: "paragraph",
      content: [{ type: "text", text: line }],
    };
  });

  return {
    type: "doc",
    content: paragraphs,
  };
}

/**
 * Walk the Tiptap document and produce an interleaved content array.
 * Text paragraphs are merged into a single text part until an image
 * node is encountered, which flushes the buffer and emits an image part.
 */
export function serializeDocToContentArray(
  doc: JSONContent | null | undefined,
): ContentPart[] {
  if (!doc) return [];

  const parts: ContentPart[] = [];
  let textBuffer = "";

  const flushText = () => {
    const trimmed = textBuffer.trim();
    if (trimmed) {
      parts.push({ type: "text", text: trimmed });
    }
    textBuffer = "";
  };

  const processNode = (
    node: Record<string, unknown>,
    parentType?: string,
    listItemIndex?: number,
  ) => {
    if (node.type === "image") {
      flushText();
      const attrs = node.attrs as { src?: string } | undefined;
      if (attrs?.src) {
        parts.push({ type: "image", image: attrs.src });
      }
      return;
    }

    if (node.type === "text") {
      const rawText = (node.text as string) || "";
      const marks = (node.marks as TiptapMark[] | undefined) ?? [];
      textBuffer += applyTextMarks(rawText, marks);
      return;
    }

    const isParagraphInListItem =
      node.type === "paragraph" && parentType === "listItem";

    // Block-level nodes: add newlines for separation.
    if (
      (node.type === "paragraph" ||
        node.type === "heading" ||
        node.type === "blockquote" ||
        node.type === "codeBlock") &&
      !isParagraphInListItem
    ) {
      if (textBuffer && !textBuffer.endsWith("\n")) {
        textBuffer += "\n";
      }
    }

    if (node.type === "bulletList" || node.type === "orderedList") {
      if (textBuffer && !textBuffer.endsWith("\n")) {
        textBuffer += "\n";
      }
    }

    if (node.type === "listItem") {
      if (parentType === "orderedList" && typeof listItemIndex === "number") {
        textBuffer += `${listItemIndex}. `;
      } else {
        textBuffer += "- ";
      }
    }

    if (node.type === "heading") {
      const level = (node.attrs as { level?: number })?.level ?? 2;
      textBuffer += "#".repeat(level) + " ";
    }

    if (node.type === "blockquote") {
      textBuffer += "> ";
    }

    if (node.type === "codeBlock") {
      textBuffer += "```\n";
    }

    const children = node.content as Record<string, unknown>[] | undefined;
    if (children && Array.isArray(children)) {
      if (node.type === "orderedList") {
        const start = (node.attrs as { start?: number })?.start ?? 1;
        let index = start;
        for (const child of children) {
          if (child.type === "listItem") {
            processNode(child, "orderedList", index);
            index += 1;
          } else {
            processNode(child, "orderedList");
          }
        }
      } else {
        const currentType = typeof node.type === "string" ? node.type : undefined;
        for (const child of children) {
          processNode(child, currentType);
        }
      }
    }

    // Close block-level nodes.
    if (node.type === "codeBlock") {
      textBuffer += "\n```";
    }

    if (
      node.type === "paragraph" ||
      node.type === "heading" ||
      node.type === "blockquote" ||
      node.type === "listItem"
    ) {
      if (!textBuffer.endsWith("\n")) {
        textBuffer += "\n";
      }
    }
  };

  const content = doc.content as Record<string, unknown>[] | undefined;
  if (content) {
    for (const node of content) {
      processNode(node);
    }
  }

  flushText();
  return parts;
}

function serializeToContentArray(
  editor: ReturnType<typeof useEditor>,
): ContentPart[] {
  if (!editor) return [];
  return serializeDocToContentArray(editor.getJSON());
}

// ============================================================================
// Component
// ============================================================================

export const TiptapEditor = forwardRef<TiptapEditorHandle, TiptapEditorProps>(
  (
    {
      onSubmit,
      sessionId,
      placeholder = "Write your message... Add images inline with the image button or paste them.",
      disabled = false,
      isSubmitting = false,
      className,
      initialContent = null,
      onDraftChange,
      onDraftClear,
    },
    ref,
  ) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);

    const editor = useEditor({
      content: initialContent ?? undefined,
      onUpdate: ({ editor: currentEditor }) => {
        onDraftChange?.(currentEditor.isEmpty ? null : currentEditor.getJSON());
      },
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
        }),
        Image.configure({
          inline: false,
          allowBase64: true,
          HTMLAttributes: {
            class:
              "rounded-md max-w-full max-h-64 object-contain my-2 border border-terminal-border",
          },
        }),
        Placeholder.configure({
          placeholder,
          emptyEditorClass:
            "before:content-[attr(data-placeholder)] before:text-terminal-muted before:float-left before:h-0 before:pointer-events-none",
        }),
      ],
      editorProps: {
        attributes: {
          class:
            "prose prose-sm max-w-none focus:outline-none min-h-[120px] max-h-[400px] overflow-y-auto px-4 py-3 font-mono text-sm text-terminal-dark",
        },
        handleDrop: (view, event, _slice, moved) => {
          if (moved) return false;

          const files = event.dataTransfer?.files;
          if (!files?.length) return false;

          for (const file of files) {
            if (file.type.startsWith("image/")) {
              event.preventDefault();
              void handleImageFile(file, view.state.selection.anchor);
              return true;
            }
          }
          return false;
        },
        handlePaste: (_view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;

          for (const item of items) {
            if (item.type.startsWith("image/")) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) {
                void handleImageFile(file);
              }
              return true;
            }
          }
          return false;
        },
      },
      immediatelyRender: false,
    });

    const handleImageFile = useCallback(
      async (file: File, position?: number) => {
        if (!editor) return;

        setIsUploading(true);

        // Show local preview immediately
        const localUrl = URL.createObjectURL(file);
        if (position !== undefined) {
          editor
            .chain()
            .focus()
            .insertContentAt(position, {
              type: "image",
              attrs: { src: localUrl },
            })
            .run();
        } else {
          editor
            .chain()
            .focus()
            .setImage({ src: localUrl })
            .run();
        }

        // Upload to server
        const remoteUrl = await uploadImage(file, sessionId);

        if (remoteUrl) {
          // Replace local URL with remote URL in all image nodes
          const { doc } = editor.state;
          const tr = editor.state.tr;
          let replaced = false;

          doc.descendants((node, pos) => {
            if (
              node.type.name === "image" &&
              node.attrs.src === localUrl
            ) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                src: remoteUrl,
              });
              replaced = true;
            }
          });

          if (replaced) {
            editor.view.dispatch(tr);
          }
        } else {
          // Upload failed — remove the placeholder image
          const { doc } = editor.state;
          const tr = editor.state.tr;
          let offset = 0;

          doc.descendants((node, pos) => {
            if (
              node.type.name === "image" &&
              node.attrs.src === localUrl
            ) {
              tr.delete(pos - offset, pos - offset + node.nodeSize);
              offset += node.nodeSize;
            }
          });

          if (offset > 0) {
            editor.view.dispatch(tr);
          }
        }

        URL.revokeObjectURL(localUrl);
        setIsUploading(false);
      },
      [editor, sessionId],
    );

    const handleImageButtonClick = useCallback(() => {
      fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length) return;

        for (const file of files) {
          if (file.type.startsWith("image/")) {
            void handleImageFile(file);
          }
        }

        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      },
      [handleImageFile],
    );

    const handleSubmitClick = useCallback(() => {
      if (!editor || disabled || isSubmitting) return;
      const contentArray = serializeToContentArray(editor);
      if (contentArray.length === 0) return;
      onSubmit(contentArray);
    }, [editor, disabled, isSubmitting, onSubmit]);

    // Cmd/Ctrl+Enter to submit
    useEffect(() => {
      if (!editor) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey) &&
          !disabled &&
          !isSubmitting
        ) {
          event.preventDefault();
          handleSubmitClick();
        }
      };

      const editorElement = editor.view.dom;
      editorElement.addEventListener("keydown", handleKeyDown);
      return () => {
        editorElement.removeEventListener("keydown", handleKeyDown);
      };
    }, [editor, disabled, isSubmitting, handleSubmitClick]);

    // Expose handle
    useImperativeHandle(ref, () => ({
      getContentArray: () =>
        editor ? serializeToContentArray(editor) : [],
      hasContent: () => {
        if (!editor) return false;
        return !editor.isEmpty;
      },
      clear: () => {
        editor?.commands.clearContent();
        onDraftClear?.();
      },
      focus: () => {
        editor?.commands.focus();
      },
    }));

    if (!editor) return null;

    return (
      <div
        className={cn(
          "rounded-lg border border-terminal-border bg-terminal-cream/80 shadow-md transition-shadow focus-within:shadow-lg",
          className,
        )}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 border-b border-terminal-border px-2 py-1 flex-wrap">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            icon={<BoldIcon className="size-3.5" />}
            tooltip="Bold"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            icon={<ItalicIcon className="size-3.5" />}
            tooltip="Italic"
          />
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            active={editor.isActive("heading", { level: 2 })}
            icon={<Heading2Icon className="size-3.5" />}
            tooltip="Heading"
          />
          <div className="mx-1 h-4 w-px bg-terminal-border" />
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().toggleBulletList().run()
            }
            active={editor.isActive("bulletList")}
            icon={<ListIcon className="size-3.5" />}
            tooltip="Bullet list"
          />
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().toggleOrderedList().run()
            }
            active={editor.isActive("orderedList")}
            icon={<ListOrderedIcon className="size-3.5" />}
            tooltip="Ordered list"
          />
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().toggleBlockquote().run()
            }
            active={editor.isActive("blockquote")}
            icon={<QuoteIcon className="size-3.5" />}
            tooltip="Quote"
          />
          <ToolbarButton
            onClick={() =>
              editor.chain().focus().toggleCodeBlock().run()
            }
            active={editor.isActive("codeBlock")}
            icon={<CodeIcon className="size-3.5" />}
            tooltip="Code block"
          />
          <div className="mx-1 h-4 w-px bg-terminal-border" />
          <ToolbarButton
            onClick={handleImageButtonClick}
            active={false}
            icon={
              isUploading ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <ImageIcon className="size-3.5" />
              )
            }
            tooltip="Add image"
            disabled={isUploading}
          />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Submit button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                onClick={handleSubmitClick}
                disabled={
                  disabled || isSubmitting || editor.isEmpty
                }
                className="h-7 px-3 text-xs font-mono bg-terminal-dark hover:bg-terminal-dark/90 text-terminal-cream gap-1.5"
              >
                {isSubmitting ? (
                  <Loader2Icon className="size-3 animate-spin" />
                ) : (
                  <SendHorizontalIcon className="size-3" />
                )}
                <span className="hidden sm:inline">
                  Send
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs">
              Send message (⌘+Enter)
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Editor content */}
        <EditorContent editor={editor} />

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    );
  },
);

TiptapEditor.displayName = "TiptapEditor";

// ============================================================================
// Toolbar Button
// ============================================================================

function ToolbarButton({
  onClick,
  active,
  icon,
  tooltip,
  disabled = false,
}: {
  onClick: () => void;
  active: boolean;
  icon: React.ReactNode;
  tooltip: string;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "rounded p-1.5 transition-colors",
            active
              ? "bg-terminal-dark/15 text-terminal-dark"
              : "text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/5",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent className="bg-terminal-dark text-terminal-cream font-mono text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
