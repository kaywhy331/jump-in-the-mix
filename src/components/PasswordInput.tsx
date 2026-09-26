"use client";
import { useId, useState, type InputHTMLAttributes } from "react";
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const generated = useId(), id = props.id ?? generated;
  return <span className="password-control"><input {...props} id={id} type={visible ? "text" : "password"} /><button type="button" className="text-button" aria-controls={id} aria-pressed={visible} aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(value => !value)}>{visible ? "Hide" : "Show"}</button></span>;
}
