-- Replace the long boilerplate advance email with a short "go advance the show"
-- pointer to the /hub band portal. The portal now carries everything the giant
-- email did (schedule, input needs, RSVP count, full venue/logistics) plus a new
-- Pay card, so the email just links there. This resets the live is_default
-- advance_templates row to match DEFAULT_ADVANCE_SUBJECT / DEFAULT_ADVANCE_BODY
-- in lib/advance-email.ts (that constant only seeds a fresh DB; existing dev/prod
-- rows were already seeded with the old long body and need this update).
--
-- Pay text is intentionally NOT in the email anymore — it lives on the portal
-- (DEFAULT_PAY_MARKDOWN, overridable per-show via show_advances.vars.pay).
update advance_templates
set subject = 'the BIRDHAUS advance — {{lineup}}, {{show_date}}',
    body = $body$Hi all,

{{intro}}

I've put everything you need for this show in one place — your advance portal. No login, no reply-all, and it's the fastest way to get me what I need back.

**In the portal, please:**

- upload your **stage plot / input list**
- confirm the **schedule** (load-in / soundcheck / doors / set times)
- send me your **payment info** (Venmo or other method)
- message me with any questions or changes

> **[Open your advance portal →]({{hub_url}})** — it's got the schedule, gear/input needs, full venue + logistics (address, parking, backline, WiFi, day-of contact), the door/pay deal, and the current RSVP count, all in one spot. (For the lineup + crew — please don't post it publicly.)

{{soundcheck_notes}}

Can't wait for this one — get me the stuff above whenever you can, and reach out with anything at all.

alex // the birdhaus
$body$,
    updated_at = now()
where is_default;
