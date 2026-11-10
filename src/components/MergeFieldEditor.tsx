"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Sheet } from "@/components/Sheet";
import { MergeFieldText } from "@/components/MergeFieldText";
import { mergeFieldHtml, mergeFieldOptions, readMergeFieldDom, type MergeFieldOption } from "@/lib/merge-field-parts";
import styles from "./MergeFieldEditor.module.css";

/** The editable surface owns its DOM; React owns only the exact submitted string. */
export function MergeFieldEditor({ label, name, value, onChange, required = false, maxLength = 20_000,
  multiline = true, placeholder = "Write your message", fields = [], includePrivate = false }: {
  label: string; name?: string; value: string; onChange: (value: string) => void;
  required?: boolean; maxLength?: number; multiline?: boolean; placeholder?: string;
  fields?: MergeFieldOption[]; includePrivate?: boolean;
}) {
  const id = useId(), editor = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const selection = useRef<Range | null>(null), composing = useRef(false);
  const [invalid, setInvalid] = useState(false);
  const [ready, setReady] = useState(false);
  const { pending } = useFormStatus();
  const options = [...mergeFieldOptions(includePrivate), ...fields];
  const rememberSelection = () => {
    const current = window.getSelection();
    if (current?.rangeCount && editor.current?.contains(current.anchorNode) && editor.current.contains(current.focusNode)) {
      selection.current = current.getRangeAt(0).cloneRange();
    }
  };
  useLayoutEffect(() => {
    if (!composing.current && editor.current && readMergeFieldDom(editor.current) !== value) editor.current.innerHTML = mergeFieldHtml(value, fields);
    setReady(true);
    input.current?.setCustomValidity(value.length > maxLength ? `Use ${maxLength} characters or fewer.` : required && !value.trim() ? `Enter ${label.toLowerCase()}.` : "");
  });
  const sync = () => {
    if (!editor.current || composing.current) return;
    const text = readMergeFieldDom(editor.current);
    onChange(text);
    setInvalid(false);
    // Convert newly typed syntax only after composition finishes. Raw offsets count each
    // chip's stored spelling, so the caret survives the change from text to an atomic chip.
    const walker = document.createTreeWalker(editor.current, NodeFilter.SHOW_TEXT);
    let typedField = false;
    while (walker.nextNode()) {
      if (!walker.currentNode.parentElement?.closest("[data-merge-field]") && /\{\{[^{}]+\}\}/.test(walker.currentNode.textContent ?? "")) typedField = true;
    }
    if (typedField) {
      const current = window.getSelection();
      const before = current?.rangeCount ? current.getRangeAt(0).cloneRange() : null;
      let offset = text.length;
      if (before && editor.current.contains(before.startContainer)) {
        before.selectNodeContents(editor.current);
        before.setEnd(current!.getRangeAt(0).startContainer, current!.getRangeAt(0).startOffset);
        offset = readMergeFieldDom(before.cloneContents()).length;
      }
      editor.current.innerHTML = mergeFieldHtml(text, fields);
      const caret = document.createRange();
      caret.selectNodeContents(editor.current); caret.collapse(false);
      for (const node of editor.current.childNodes) {
        const length = readMergeFieldDom(node).length;
        if (offset <= length) {
          if (node.nodeType === 3) caret.setStart(node, offset);
          else if (offset === 0) caret.setStartBefore(node);
          else caret.setStartAfter(node);
          caret.collapse(true); break;
        }
        offset -= length;
      }
      current?.removeAllRanges(); current?.addRange(caret);
    }
    rememberSelection();
  };
  const insert = (text: string) => {
    const target = editor.current;
    if (!target) return;
    target.focus();
    const current = window.getSelection();
    if (selection.current && target.contains(selection.current.commonAncestorContainer)) {
      current?.removeAllRanges(); current?.addRange(selection.current);
    } else {
      const end = document.createRange(); end.selectNodeContents(target); end.collapse(false);
      current?.removeAllRanges(); current?.addRange(end);
    }
    // Native editing commands retain browser undo/redo, unlike Range.insertNode.
    document.execCommand("insertHTML", false, mergeFieldHtml(multiline ? text : text.replace(/[\r\n]+/g, " "), fields));
    const chip = current?.anchorNode?.parentElement?.closest("[data-merge-field]");
    if (chip && target.contains(chip)) {
      const after = document.createRange(); after.setStartAfter(chip); after.collapse(true);
      current?.removeAllRanges(); current?.addRange(after);
    }
    sync();
  };
  return <div className={`field full ${styles.field}`}>
    <span id={`${id}-label`}>{label}</span>
    <div ref={editor} className={styles.editor} contentEditable={ready && !pending} suppressContentEditableWarning role="textbox" aria-disabled={!ready || pending}
      aria-labelledby={`${id}-label`} aria-multiline={multiline} aria-required={required}
      aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}
      onInput={sync} onKeyUp={rememberSelection} onMouseUp={rememberSelection} onBlur={rememberSelection}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; sync(); }}
      onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); if (multiline) { document.execCommand("insertText", false, "\n"); sync(); } } }}
      onPaste={event => { event.preventDefault(); rememberSelection(); insert(event.clipboardData.getData("text/plain")); }}
      onCopy={event => { rememberSelection(); if (selection.current) { event.preventDefault(); event.clipboardData.setData("text/plain", readMergeFieldDom(selection.current.cloneContents())); } }}
      onCut={event => { rememberSelection(); if (selection.current && !pending) { event.preventDefault(); event.clipboardData.setData("text/plain", readMergeFieldDom(selection.current.cloneContents())); document.execCommand("delete"); sync(); } }}
      onDrop={event => event.preventDefault()}
    />
    {!value && <div className={styles.hint}><MergeFieldText text={placeholder} /></div>}
    {name && <input type="hidden" name={name} value={value} />}
    {/* Multipart form transport normalizes line endings; JSON preserves their exact spelling. */}
    {name && <input type="hidden" name={`${name}-exact`} value={JSON.stringify(value)} />}
    <input ref={input} className="sr-only" tabIndex={-1} aria-hidden="true" value={value}
      required={required} onChange={() => {}} onInvalid={event => { event.preventDefault(); setInvalid(true); requestAnimationFrame(() => editor.current?.focus()); }} />
    {invalid && <small id={`${id}-error`} role="alert">{value.trim() ? `Use ${maxLength} characters or fewer.` : `Enter ${label.toLowerCase()}.`}</small>}
    <Sheet title="Insert field" description="Choose a detail to fill in for each person."
      trigger={<button className="button small" type="button" disabled={pending} onPointerDown={rememberSelection}>Insert field</button>}>
      <div className={styles.options}>{options.map(field => <button className="button" type="button" key={field.token}
        onClick={event => {
          const dialog = event.currentTarget.closest("dialog");
          dialog?.addEventListener("close", () => requestAnimationFrame(() => insert(field.token)), { once: true });
          dialog?.close();
        }}>
        <span className="merge-field-chip">{field.label}</span>
      </button>)}</div>
    </Sheet>
  </div>;
}
