# Thirdmark interface direction

The interface should make corroboration feel like a threshold being reached, not like a dashboard full of exposed records. The emotional beat is “I was not the only one,” and the only dramatic transition is the unlock.

## Tokens

- Ink: `#152128`
- Paper: `#F4F1E8`
- Signal: `#C94F3D`
- Quiet line: `#B8B6AD`
- Confirmed: `#3D6B5B`

Display typography uses a restrained grotesk with a narrow, numeric-friendly face for amounts and dates. Body text uses a readable sans-serif. The type scale is 12 / 14 / 16 / 20 / 28 / 44px. Corners stay square or minimally rounded; the interface is not a dark-mode neon treatment.

## Layout

```text
+----------------------------------------------------------------+
| THIRDMARK                         PREPROD / OPEN WORKSPACE     |
+----------------------------------------------------------------+
|                                                                |
|  [step marker] Find the company                                |
|                                                                |
|  Company name or registry search       Privacy inspector       |
|  +------------------------------+     +---------------------+ |
|  |                              |     | Public: one opaque   | |
|  | autocomplete result          |     | blob + commitments   | |
|  +------------------------------+     | Private: subject +   | |
|                                       | report + history     | |
|  [continue]                           +---------------------+ |
|                                                                |
+----------------------------------------------------------------+
```

The signature element is the “sealed tally”: three quiet vertical marks inside a square, with the third mark changing from signal red to confirmed green only when the threshold predicate is true. Before unlock it never encodes a numeric count.

The first viewport is a landing page, not the filing form. It gives a judge the
problem, the three-step threshold rule, the public/private boundary, evidence links,
and the residual privacy limit before the user enters the workspace. The workspace is
opened deliberately through “Open the filing workspace” or the clearly labelled
synthetic subject path.

## Screen sequence

0. Landing page: explain the problem, threshold, public/private boundary, evidence links, and safe synthetic-subject rule before opening the workflow.
1. Find the company: search and select a canonical registry result, or choose the labelled synthetic-only subject; never ask the user to type a live registration number.
2. File: show amount overdue, days late, and invoice reference beside a live public/private inspector.
3. Sealed: state plainly that nothing is visible until two independent suppliers file too; show no sub-threshold count.
4. Unlocked: orchestrate the third-mark transition, then reveal only the three authorized records.
5. Dossier: make the signed JSON artifact and independent verification path the final action.

All error states use an action-oriented sentence, keep raw contract errors out of the UI, and preserve the user’s local form state. The UI must remain keyboard navigable, support reduced motion, and avoid layout shift.
