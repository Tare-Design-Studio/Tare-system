# What's New

A plain-language summary of the changes made to the system, written for the team
using it rather than for developers.

_Updated 2 August 2026._

---

## 1. Email corrected

Usha's login email was spelled `s.usha1086@gmail.com`. It is now
`s.usha1068@gmail.com`. She logs in with the corrected address.

## 2. Site locations are set from a Google Maps link

You no longer type latitude and longitude by hand. Open the location in Google
Maps, copy the link from the address bar, and paste it into the project. The
coordinates fill in automatically.

You then choose how large the check-in area around that point should be —
100 m, 200 m, 500 m or 1 km.

> **One thing to know:** short links (the `maps.app.goo.gl/…` kind you get from
> the Share button) do not contain coordinates. Open the place in Maps first,
> then copy the longer link from the browser address bar. The app tells you this
> if you paste a short one.

## 3. Multiple offices — Mysore and Bangalore

The system used to know about one office. It now supports as many as you need.

Add each office under **Settings → Office locations**: give it a name, paste its
Maps link, pick the check-in radius. When someone checks in, the app works out
**which office they are actually standing in** and records that. Nobody picks
their office from a list — that would let someone check in at an office they are
not at.

If someone checks in away from every office, that is not treated as an error.
It is recorded as remote or on site, and their check-in still counts.

Closing an office does not erase history: **Deactivate** takes it out of
check-in matching but keeps every past attendance record readable.

## 4. Every team member can see all projects

All 19 team members can now see every project by default.

If you want a specific person restricted to certain kinds of work — only
residential, say — you can set that under **Settings → Access matrix → Project
categories**. Leaving someone's categories empty means they see everything,
which is what everyone starts with.

## 5. Attendance: who is in today

Each member's home screen now shows a **Who's in today** board: everyone in the
studio with a coloured dot.

- **Green** — at work right now
- **Amber** — came in and has left for the day
- **Blue** — on approved leave
- **Red** — not checked in yet

Where more than one office is in use, the board also shows which office each
person is at. Members see who is present and where; they do not see anyone
else's GPS position or hours worked — that stays with the owner.

## 6. Leave requests

Members have a **Leave** card showing days remaining, days pending and days
taken. They pick the type (casual, sick, earned, comp off, unpaid), the dates
and a reason. Single-day requests can be marked as a half day.

Pending requests are visible to the member, who can withdraw one before it is
decided. Requests waiting on a decision appear on the **Team** page for whoever
approves leave.

> Nobody can approve their own leave request — the system blocks it.

## 7. Voice messages in broadcasts

Broadcasts can now be recorded as voice notes instead of typed. Press record,
speak, send. An optional caption can go with it.

Recording **stops itself at 60 seconds**, which keeps messages short and on
point as asked. The limit is enforced by the system as well as the recorder, so
it cannot be worked around.

## 8. Overtime

The working day is set to **9:30 am – 6:00 pm** with 15 minutes of grace before
someone is marked late. Both are adjustable under **Settings → Workspace**.

Any minutes worked past 6:00 pm are counted as overtime. Overtime shows on the
member's own profile and on the owner's view of that member, with a monthly
total.

Overtime is calculated by the system from the actual check-out time. It cannot
be edited by hand — not by members, and not by the owner. This is deliberate:
it is what makes the number trustworthy.

## 9. Client feedback after each stage

When a stage of work is completed — slab finished, for example — the customer
sees a short feedback box on their portal page for that stage: a 1–5 rating and
an optional comment.

Feedback is tied to that customer and that stage, and it can be updated if they
change their mind. One rating per customer per stage.

## 10 & 11. Judging team members on your own KPIs

Performance scoring is now yours to set, under **Settings → Performance
scoring**.

You control:

- **How much each pillar counts** — Efficiency, Quality, Delivery, and
  optionally Client rating. These must add up to 100%.
- **The scoring rules** — points earned per completed item, and points lost per
  error, per revision, and per day of delay.

Changes apply immediately to everyone's score. The defaults reproduce exactly
the scores you had before, so nothing moves until you decide to move it.

> **What is deliberately not editable:** the raw counts — tasks completed,
> errors, revisions, delay days — are measured by the system from actual work.
> You set how they are weighed; nobody can type in a better number for
> themselves. Without that split, the scores would not mean anything.

## 12. Recording which part of a drawing you did

Tasks can now be tagged with the part of the drawing work they represent:

- Design
- Detailing
- Technical
- Checked & signed

Members set this on their own tasks. A monthly breakdown per person is available
so you can see who is doing which kind of work.

## 13. Search in projects

The Projects page has a search box. It matches on project name, project type,
and the names of team members assigned to the project.

## 14. Shorter passwords

The 12-character minimum was the main complaint. Passwords are now **6
characters** minimum, as agreed.

---

## Two things that need you

**1. Confirm the office locations.** The system currently holds one saved office
at coordinates `12.301284, 77.627762`. That point is about 70 km south of
Bangalore, so it is either the Mysore office or an error — it cannot be
Bangalore. Until it is confirmed, it appears as *"Main office (confirm
location)"*.

Please go to **Settings → Office locations** and, for each real office:
paste its Google Maps link, name it (*Mysore*, *Bangalore*), and set the radius.
Rename or deactivate the placeholder once the real ones are in.

Until this is done, office check-ins will be recorded as "not at a registered
office", and lateness will be measured against the wrong place.

**2. Password minimum on the login provider.** The app now accepts 6-character
passwords everywhere. The login service enforces its own minimum separately; if
it is still set higher than 6, it needs changing in its dashboard or short
passwords will still be refused at sign-up.
