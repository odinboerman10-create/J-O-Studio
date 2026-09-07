---
name: jo-email-outreach
description: Draft or send J&O Studios cold-outreach emails to leads from the no-website-leads app, in the studio's established voice and offer structure. Use when asked to write, personalize, rewrite, or send an outreach email, follow-up, nudge, or breakup email to a lead/prospect/business for J&O Studios, or to review/improve outreach copy against the studio's playbook.
---

# J&O Studios cold email outreach

J&O Studios finds local businesses with no website on file with Google (via the
`no-website-leads` tool in this repo) and sells them a done-for-you site. This
skill is the voice and structure for every email sent to those leads — whether
you're drafting one from scratch or reviewing/sending one through the app.

## The offer (keep these numbers consistent everywhere)

- **Starter Site** — $697 (3 pages)
- **Growth Site** — $997 (5 pages, the default anchor offer — lead with this one)
- **Growth Site+** — $1,297 (7+ pages)
- **Care Plan** — $129/mo retainer (hosting, edits, GBP posts) — the real LTV, always mentioned as a natural next step, never hard-sold in a cold email
- Build time: "live in about a week" / "7 business days" — don't inflate this
- Positioning line: *the done-for-you starter site for businesses Google can't find* — not a discount agency, not a DIY tool

## Voice rules

- Short sentences. No marketing fluff, no exclamation points, no emoji.
- Lead with a specific, provable fact about *their* business (pulled from the
  lead record: name, city, category), never a generic pitch.
- Specific beats clever: "$997 flat, live in 7 days" beats "affordable, fast solutions."
- One ask per email. Never stack multiple CTAs.
- Never invent a fact you don't have — no fabricated competitor names, review
  counts, or "I noticed you..." details unless they're actually in the lead's
  data or the user supplied them.

## The 3-step sequence

These match the templates already wired into `server/emailTemplates.js` and the
app's Email dialog (`cold_intro`, `follow_up_1`, `breakup`). Reuse these jobs
when drafting new variants or A/B copy — don't invent a fourth step without
being asked:

1. **cold_intro** — Angle: *proof of gap*. "I searched for you, nothing came
   up." Ends with an offer to send a free Visibility Snapshot. No price
   pressure yet.
2. **follow_up_1** (sent ~4-5 days later) — Angle: *curiosity + social proof*.
   Light touch, references a similar business already helped. Re-offers the
   snapshot.
3. **breakup** (final touch) — Angle: *loss aversion, no pressure*. Explicitly
   offers to stop reaching out; reopens the door with a one-word reply ask.

Other hook angles worth rotating into new copy on request: cost reframe
("$5,000 agency quote vs. $997"), local pride ("you built this without a
website — imagine it with one"). Match the angle to what the user tells you
about the specific lead or vertical.

## Compliance — do not skip

Every commercial email needs a real identity and an opt-out, per CAN-SPAM.
The app's templates already append this automatically from `SENDER_NAME` and
`EMAIL_FOOTER_ADDRESS` env vars — if you're drafting raw copy outside the app,
always include:

```
— [Sender name], J&O Studios
[Business mailing address]
Don't want emails like this? Reply "unsubscribe" and I'll take you off the list.
```

Never draft or send to a lead whose status is `not_interested` — the app
already blocks this server-side (`server/index.js`, `sendToLead`), but don't
recommend working around it.

## How to actually send (only if explicitly asked to send, not just draft)

The app exposes this over HTTP once `RESEND_API_KEY` and `EMAIL_FROM` are set
in `.env` and the server is running (`npm start`):

- `GET /api/email-templates` — list available templates
- `GET /api/leads/:id/email-preview?template=cold_intro` — render a template against a lead, no send
- `POST /api/leads/:id/email` `{ template, subject?, body? }` — send one (subject/body override the template if provided)
- `POST /api/leads/email-bulk` `{ leadIds: [...], template }` — send one template to many leads, 300ms apart

Default to **drafting text back to the user** rather than calling these
endpoints — only trigger an actual send when the user's request is explicit
("send it", "email lead #12"), since a real send reaches a real business.
