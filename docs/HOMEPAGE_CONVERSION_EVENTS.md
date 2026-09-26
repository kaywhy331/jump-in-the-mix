**Homepage conversion events**

`PublicConversionEvents` exposes a vendor-neutral browser event, `jitm:conversion`, on the homepage and registration page. It does not send network requests, create cookies, assign visitor identifiers, or store analytics. A chosen collector must subscribe before hydration to receive the initial page-view event. There is no analytics service configured by this change.

| Event name | Trigger | Optional fields |
| --- | --- | --- |
| `homepage_view` | Homepage mount/navigation | — |
| `sample_engaged` | First sample interaction during this page visit | `placement: sample` |
| `handoff_requested` | User activates a sample text/email/phone link | `placement: sample`, `channel: text/email/phone` |
| `signup_start` | User activates a link to registration | `placement: header/hero/sample/workflow/closing/footer` when known |
| `registration_view` | Registration mount/navigation | — |
| `signup_submit` | A registration form submits | `placement: registration` |

All events include `version: relationships-v1` and the coarse viewport category `compact` (up to 760 CSS pixels) or `wide`. Payloads exclude draft text, subjects, contact details, form values, URLs, and query strings. Do Not Track and Global Privacy Control suppress these hooks. React development Strict Mode may repeat initial page-view effects; measure on the production build.

The adapter contract is:

```js
window.addEventListener("jitm:conversion", ({ detail }) => {
  // Pass only this documented payload to the selected analytics collector.
});
```

`handoff_requested` does not mean an OS app opened, a message was sent, or a call connected. `signup_submit` does not mean account creation succeeded. A collector should keep those distinctions in its reports.

To complete the activation funnel, connect the selected collector and record successful account creation, first contact creation, and first scheduled follow-up at their actual server-side success boundaries. Do not infer successful account creation from an onboarding page view: returning users can visit it too. An opt-in attribution design and retention policy should be settled with the collector configuration; this adapter deliberately has no cross-page visitor identity of its own.

The homepage tests verify that demo engagement is emitted once, native handoffs are distinct from signup, and edited messages never enter the event payload. The existing demo tests also verify that interactions make no server mutations.

Profession landing pages (`/for/<profession>`) emit the same `relationships-v1` events with an added `route` field holding the profession slug. The `sample_engaged` and `handoff_requested` events there refer to that persona's mixes.
