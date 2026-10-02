# Mobile presentation script mode

Date: 2026-10-02

## Goal

Add a presenter-only mobile script experience before the existing live Q&A. The immediate target is tomorrow's six-minute 「揪甘心」 pitch on iPhone Chrome. The desktop remains dedicated to the product demo.

## Chosen architecture

Keep the existing `/` route and mount the script experience as another client-side mode inside `App`:

```text
App (recorder, questions, room sync stay mounted)
├── setup
├── script
└── Q&A
```

This is safer than a separate route because switching routes would unmount the recorder and question state under the current Next.js configuration. A complete multi-project application shell is deferred because it is unnecessary for tomorrow's presentation.

## Presenter flow

1. Open a setup screen showing microphone state, AI warm-up state, and a configurable total presentation duration. Default to 6:00 and remember the last setting.
2. Starting a new presentation clears the previous Q&A session, starts the countdown, opens P1, and requests a screen wake lock.
3. Navigate the 15 script pages with horizontal swipes or large previous/next buttons. Vertical scrolling remains available within long scripts.
4. Tap the page indicator to open a title list and jump directly to a page.
5. Use small, medium, or large script text. Remember the selected size.
6. On P15, show a primary action to enter Q&A. Earlier pages expose a confirmed early-Q&A action in the overflow menu.
7. Q&A retains an overflow action that returns to the saved script page and timer result.

## Script page

Each page displays:

- Page number and title
- Suggested duration
- A permanently visible speaker-note card when notes exist
- Large spoken paragraphs
- Current page / total page count
- Global countdown

Timer states remain silent: normal, yellow with 60 seconds left, red with 15 seconds left, and red count-up after the limit. The timer never advances pages automatically.

## Persistence and recovery

Persist the current page, timer start/pause data, configured duration, and font size in `localStorage`. After an interrupted active presentation, offer explicit choices to continue or restart. Restarting begins at P1 and clears the existing Q&A without another confirmation, as requested for the time-critical first version.

Request a screen wake lock while an active script is visible. Release it when paused, finished, or moved to Q&A. Unsupported wake lock must not block the presentation.

## Data isolation

Use explicit project boundaries:

```text
content/projects/
├── legal/
│   └── knowledge/
└── jugansin/
    ├── presentation/
    │   └── script.zh-Hant-TW.json
    └── knowledge/
```

The script JSON separates spoken `paragraphs` from `speakerNotes`. Legal knowledge and the new presentation must never be loaded into the same prompt. This change delivers only the presentation script UI; the new 「揪甘心」 Q&A knowledge will be supplied separately. Until then, existing Q&A behavior remains unchanged.

## Mobile interaction and accessibility

- Optimize for iPhone Chrome in portrait orientation, while retaining responsive behavior.
- Use `touch-action: pan-y` and require a decisive horizontal gesture before changing pages.
- Keep navigation targets at least 48 CSS pixels high.
- Use semantic buttons, dialog labels, focus behavior, and visible focus states.
- Keep the existing visual language: neutral paper/ground palette, strong typography, marker yellow, and tally red.

## Verification

- Validate all JSON and TypeScript types.
- Verify the 15 page order and content split.
- Test horizontal swipe versus vertical scroll.
- Test timer warning and overtime states.
- Test local recovery, restart, quick jump, font size, early Q&A, P15 transition, and return to script.
- Confirm legal knowledge generation is unchanged by the presentation JSON.
- Run lint, TypeScript, production build, and the mobile UI smoke test where credentials permit.
