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
  const field = document.getElementById(targetId);
  if (!(field instanceof HTMLTextAreaElement) && !(field instanceof HTMLInputElement)) return;
  const nextValue = field.value.trim()
    ? `${field.value.trimEnd()}${field instanceof HTMLTextAreaElement ? "\n" : " "}${transcript}`
    : transcript;
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(field, nextValue);
  else field.value = nextValue;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus();
  field.setSelectionRange(nextValue.length, nextValue.length);
}

export function VoiceNoteButton({ targetId, label = "Dictate" }: { targetId: string; label?: string }) {
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
        title={`Use your microphone to ${label.toLowerCase()}`}
      >
        <AppIcon name="circle" />
        <span>{listening ? "Listening…" : label}</span>
      </button>
      {error && <small className="voice-note-error" role="alert">{error}</small>}
    </span>
  );
}
