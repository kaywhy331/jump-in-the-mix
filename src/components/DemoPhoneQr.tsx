"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import styles from "./ProductDemo.module.css";

type Props = { channel: "text" | "phone"; person: string; phone: string; code: string; nativeUrl: string; onDone: () => void; onClose: () => void };

// Desktop stand-in for the phone handoff: the same draft or number as a QR code shown on a drawn phone.
// The code is drawn from the module matrix, so no markup is injected; the library loads only when needed.
export function DemoPhoneQr({ channel, person, phone, code, nativeUrl, onDone, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const finished = useRef(false);
  const [qr, setQr] = useState<{ size: number; path: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const titleId = useId(), descriptionId = useId();
  const firstName = person.split(" ")[0];
  const text = channel === "text";

  useEffect(() => {
    let live = true;
    import("qrcode").then(({ create }) => {
      const { modules } = create(code, { errorCorrectionLevel: "L" });
      let path = "";
      for (let row = 0; row < modules.size; row++) for (let col = 0; col < modules.size; col++) if (modules.get(row, col)) path += `M${col} ${row}h1v1h-1z`;
      if (live) setQr({ size: modules.size, path });
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [code]);
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.showModal();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const close = (done: boolean) => { finished.current = done; dialogRef.current?.close(); };

  return <dialog ref={dialogRef} className={`confirm-dialog ${styles.qrDialog}`} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => event.stopPropagation()} onClose={event => { event.stopPropagation(); if (finished.current) onDone(); else onClose(); }}>
    <div className="confirm-dialog-header">
      <div><h2 id={titleId}>Scan to {text ? "text" : "call"} {firstName} from your phone</h2>
        <p id={descriptionId}>{text
          ? `Texts send from a phone, not from this website. Point your phone’s camera at the code. It opens your messages app with this draft to ${phone}. Nothing is sent until you press send.`
          : `Calls are placed from a phone, not from this website. Point your phone’s camera at the code. It opens your phone app with ${phone} ready to dial. Nothing is dialed until you press call.`}</p></div>
      <button className="icon-button" type="button" onClick={() => close(false)} aria-label="Close"><AppIcon name="close" /></button>
    </div>
    <div className={styles.phoneFrame} aria-hidden="true">
      <div className={styles.phoneScreen}>
        <span className={styles.island} />
        <span className={styles.phoneApp}><AppIcon name={text ? "message" : "phone"} />{text ? "Messages" : "Phone"}</span>
        {qr ? <svg className={styles.qr} viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} shapeRendering="crispEdges" data-demo-qr={channel}><rect x="-2" y="-2" width={qr.size + 4} height={qr.size + 4} fill="#fff" /><path d={qr.path} fill="#000" /></svg>
          : <span className={styles.qrPending}>{failed ? "No code" : "Drawing the code…"}</span>}
        <span className={styles.phoneCaption}>{text ? `Text ${firstName}` : `Call ${firstName}`}<small>{phone}</small></span>
      </div>
    </div>
    {failed && <p className={styles.hint} role="alert">The code could not be drawn. Use the link below instead.</p>}
    <p className={styles.hint}>{phone} is a fictional demo number, so no one will {text ? "reply" : "answer"}.</p>
    <div className="confirm-dialog-actions">
      <button className="button primary" type="button" autoFocus onClick={() => close(true)}>Done</button>
    </div>
    <p className={styles.hint}>Can this computer {text ? "send texts, for example with Messages" : "make calls, for example with FaceTime"} on a Mac? <a href={nativeUrl} data-demo-native={channel} onClick={() => close(true)}>Open it here instead</a>. If nothing opens, this computer has no app for it.</p>
  </dialog>;
}
