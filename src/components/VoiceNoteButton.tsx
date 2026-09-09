"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";

type SpeechResultEvent = {
  results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
};

type SpeechErrorEvent = { error?: string };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
let cancelActiveDictation: (() => void) | null = null;

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

function appendTranscript(field: HTMLTextAreaElement | HTMLInputElement, transcript: string): boolean {
  const separator = field.value && !/\s$/.test(field.value) ? field instanceof HTMLTextAreaElement ? "\n" : " " : "";
  const remaining = Math.max(0, (field.maxLength >= 0 ? field.maxLength : 20_000) - field.value.length - separator.length);
  if (!remaining) return false;
  const bounded = field.value + separator + transcript.slice(0, remaining);
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(field, bounded);
  else field.value = bounded;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus();
  if (field instanceof HTMLTextAreaElement || ["text", "search", "tel", "url", "password"].includes(field.type)) field.setSelectionRange(bounded.length, bounded.length);
  return true;
}

export function VoiceNoteButton({ targetId, label = "Dictate" }: { targetId: string; label?: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const pathname = usePathname();
  const descriptionId = useId();

  useEffect(() => {
    setSupported(Boolean(speechRecognitionConstructor()));
    return () => cancelRef.current?.();
  }, [pathname]);

  if (!supported) return <small className="voice-note-control">Type here, or use your keyboard’s dictation.</small>;

  const start = () => {
    if (recognitionRef.current) {
      const cancel = cancelRef.current;
      try { recognitionRef.current.stop(); } catch { cancelRef.current?.(); }
      setTimeout(() => { if (cancelRef.current === cancel) cancel?.(); }, 2000);
      return;
    }
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) return;
    const field = document.getElementById(targetId);
    if (!(field instanceof HTMLTextAreaElement) && !(field instanceof HTMLInputElement) || field.disabled || field.readOnly || field.closest("[inert]")) return;
    cancelActiveDictation?.();
    setError(""); setNotice("");
    let recognition: SpeechRecognitionLike;
    try { recognition = new Recognition(); } catch { setError("Dictation is unavailable. You can still type here."); return; }
    recognitionRef.current = recognition;
    const dialog = field.closest("dialog");
    const form = field.form;
    let received = false, finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      recognition.onresult = recognition.onerror = recognition.onend = null;
      try { recognition.abort(); } catch { /* Already ended by the browser. */ }
      recognitionRef.current = null; cancelRef.current = null;
      if (cancelActiveDictation === cleanup) cancelActiveDictation = null;
      dialog?.removeEventListener("close", cleanup);
      form?.removeEventListener("submit", cleanup);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", cleanup);
      boundaryObserver.disconnect();
      setListening(false);
    };
    const visibility = () => { if (document.hidden) cleanup(); };
    const boundaryObserver = new MutationObserver(() => { if (document.documentElement.dataset.browserLocked === "true") cleanup(); });
    boundaryObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-browser-locked"] });
    cancelRef.current = cleanup; cancelActiveDictation = cleanup;
    dialog?.addEventListener("close", cleanup);
    form?.addEventListener("submit", cleanup);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", cleanup);
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (finished || document.hidden || document.getElementById(targetId) !== field || !field.isConnected || field.disabled || field.readOnly || field.closest("[inert]") || dialog && !dialog.open || !field.getClientRects().length) { cleanup(); return; }
      if (transcript) {
        received = true;
        if (appendTranscript(field, transcript)) setNotice("Added to your draft. Review it before saving.");
        else setError("This field is full. Shorten it before adding more dictation.");
        cleanup();
      }
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted") setError(event.error === "not-allowed" ? "Microphone access was not granted. You can still type here." : "Dictation could not be completed. Try again or type here.");
      cleanup();
    };
    recognition.onend = () => {
      if (!received) setNotice("No speech was recognized. Try again or type here.");
      cleanup();
    };
    setListening(true);
    timer = setTimeout(() => { setNotice("Dictation stopped after 45 seconds. Review your draft or start again."); cleanup(); }, 45_000);
    try { recognition.start(); } catch { setError("Dictation could not start. Try again or type here."); cleanup(); }
  };

  return (
    <span className="voice-note-control">
      <button
        type="button"
        className="button small voice-note-button"
        onClick={start}
        aria-pressed={listening}
        aria-describedby={descriptionId}
        title={`Use your microphone to ${label.toLowerCase()}`}
      >
        <AppIcon name="circle" />
        <span>{listening ? "Stop dictation" : label}</span>
      </button>
      <small id={descriptionId}>Your browser’s speech service may process audio. Review the text before saving.</small>
      {notice && <small role="status">{notice}</small>}
      {error && <small className="voice-note-error" role="alert">{error}</small>}
    </span>
  );
}
