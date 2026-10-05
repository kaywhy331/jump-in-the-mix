"use client";

import { AppIcon } from "@/components/AppIcon";
import { Sheet } from "@/components/Sheet";

/**
 * Short steps for sharing contacts from the iPhone Contacts app. Selecting several people is a hidden
 * two-finger gesture there, so the tips spell it out. `shortcut` says whether the share-sheet shortcut
 * is offered; without it, people save the card to Files and import it.
 */
export function IphoneAddTips({ shortcut }: { shortcut: boolean }) {
  const finish = shortcut
    ? <li>Tap <strong>Add to Jump in the Mix</strong>.</li>
    : <li>Tap <strong>Save to Files</strong>, then choose the file in Import contacts.</li>;
  return (
    <Sheet
      className="iphone-add-tips"
      trigger={<button className="text-button iphone-add-tips-trigger" type="button">Tips for adding on iPhone<AppIcon name="alert" /></button>}
      title="Tips for adding on iPhone"
    >
      <div className="iphone-add-tips-body">
        <section aria-labelledby="iphone-tips-one">
          <h3 id="iphone-tips-one">One person</h3>
          <ol>
            <li>In Contacts, tap the person.</li>
            <li>Tap <strong>Share Contact</strong>.</li>
            {finish}
          </ol>
        </section>
        <section aria-labelledby="iphone-tips-several">
          <h3 id="iphone-tips-several">Several people</h3>
          <ol>
            <li>In Contacts, drag <strong>two fingers</strong> down the list to select people.</li>
            <li>Touch and hold a selected name, then tap <strong>Share</strong>.</li>
            {finish}
          </ol>
        </section>
        {shortcut && <p>Don&apos;t see Add to Jump in the Mix? Scroll to the bottom of the share options, tap <strong>Edit Actions</strong> and add it.</p>}
      </div>
    </Sheet>
  );
}
