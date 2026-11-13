"use client";

import { useId } from "react";
import {
  MDXEditor, headingsPlugin, listsPlugin, quotePlugin, linkPlugin, linkDialogPlugin,
  tablePlugin, codeBlockPlugin, codeMirrorPlugin, thematicBreakPlugin, toolbarPlugin,
  UndoRedo, BoldItalicUnderlineToggles, BlockTypeSelect, ListsToggle, CreateLink,
  InsertTable, InsertCodeBlock,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

import { isVisualLinkAllowed } from "@/lib/workbox/markdown-visual-safety";

const plugins = [
  headingsPlugin(), listsPlugin(), quotePlugin(), thematicBreakPlugin(),
  linkPlugin({ validateUrl: isVisualLinkAllowed, disableAutoLink: true }), linkDialogPlugin(), tablePlugin(),
  codeBlockPlugin(),
  codeMirrorPlugin({ codeBlockLanguages: { "": "Plain text", js: "JavaScript", ts: "TypeScript", bash: "Shell", json: "JSON" } }),
  toolbarPlugin({ toolbarContents: () => <>
    <UndoRedo />
    <BlockTypeSelect />
    <BoldItalicUnderlineToggles options={["Bold", "Italic"]} />
    <ListsToggle />
    <CreateLink />
    <InsertTable />
    <InsertCodeBlock />
  </> }),
];

export default function MarkdownVisualEditor({ source, label, disabled, onChange, onError }: {
  source: string;
  label: string;
  disabled?: boolean;
  onChange: (source: string, initializing: boolean) => void;
  onError: () => void;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="dark-theme wb-panel [&_.mdxeditor]:[--basePageBg:var(--wb-panel)]">
      <span id={id} className="sr-only">{label}</span>
      <MDXEditor markdown={source} trim={false} suppressHtmlProcessing
        readOnly={disabled} onChange={onChange} onError={onError} plugins={plugins}
        contentEditableClassName="min-h-28 px-3 py-2" />
    </div>
  );
}
