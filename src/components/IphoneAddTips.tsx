"use client";

import { AppIcon } from "@/components/AppIcon";
import { Sheet } from "@/components/Sheet";

/**
 * Short steps for sharing contacts from the iPhone Contacts app. Selecting several people is a hidden
 * two-finger gesture there, so the tips spell it out. Saving the card to Files and importing it comes first,
 * as on the page; `shortcut` says whether the share-sheet shortcut is offered as the advanced way.
 */
export function IphoneAddTips({ shortcut }: { shortcut: boolean }) {
  const finish = <li>Tap <strong>Save to Files</strong>, then choose the file in Import contacts.</li>;
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
        {shortcut && <p>Added the Shortcut? Tap <strong>Add to Jump in the Mix</strong> instead of Save to Files. Don&apos;t see it? Scroll to the bottom of the share options, tap <strong>Edit Actions</strong> and add it.</p>}
      </div>
    </Sheet>
  );
}
