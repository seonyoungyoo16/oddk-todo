"use client";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";
export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { onLimit?: () => void }>(function AutoTextarea({ onLimit, onPaste, ...props }, forwardedRef) {
  const element = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => element.current!);
  useLayoutEffect(() => {
    const field = element.current; if (!field) return;
    const resize = () => { if (!field.getClientRects().length) return; field.style.height = "auto"; field.style.height = `${Math.min(field.scrollHeight + field.offsetHeight - field.clientHeight, 320)}px`; };
    resize();
    const dialog = field.closest("dialog");
    const mutation = new MutationObserver(resize);
    if (dialog) mutation.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    let width = field.parentElement?.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => { const next = field.parentElement?.getBoundingClientRect().width; if (next !== width) { width = next; resize(); } });
    if (field.parentElement) observer.observe(field.parentElement);
    return () => { mutation.disconnect(); observer.disconnect(); };
  }, [props.value]);
  return <textarea {...props} ref={element} rows={props.rows ?? 1} onPaste={event => {
    const text = event.clipboardData.getData("text"), field = event.currentTarget;
    if (props.maxLength !== undefined && field.value.length - (field.selectionEnd - field.selectionStart) + text.length > props.maxLength) { event.preventDefault(); onLimit?.(); return; }
    onPaste?.(event);
  }} />;
});
