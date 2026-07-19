"use client";

import { useEffect, useRef, useState } from "react";
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
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

function appendTranscript(targetId: string, transcript: string): void {
  const textarea = document.getElementById(targetId);
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  const nextValue = textarea.value.trim()
    ? `${textarea.value.trimEnd()}\n${transcript}`
    : transcript;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) setter.call(textarea, nextValue);
  else textarea.value = nextValue;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
  textarea.setSelectionRange(nextValue.length, nextValue.length);
}

export function VoiceNoteButton({ targetId }: { targetId: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(Boolean(speechRecognitionConstructor()));
    return () => recognitionRef.current?.abort();
  }, []);

  if (!supported) return null;

  const start = () => {
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) return;
    setError("");
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) appendTranscript(targetId, transcript);
    };
    recognition.onerror = (event) => {
      setError(event.error === "not-allowed" ? "Microphone access was not granted." : "Voice dictation could not be completed.");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    setListening(true);
    recognition.start();
  };

  return (
    <span className="voice-note-control">
      <button
        type="button"
        className="button small voice-note-button"
        onClick={start}
        disabled={listening}
        aria-pressed={listening}
        title="Dictate Public Notes using your browser microphone"
      >
        <AppIcon name="circle" />
        <span>{listening ? "Listening…" : "Dictate"}</span>
      </button>
      {error && <small className="voice-note-error" role="alert">{error}</small>}
    </span>
  );
}
