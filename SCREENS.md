# KEYSTONE — Screen-by-Screen Design Spec

Every screen in the product, described for design tools (Google Stitch, Figma
AI, v0). Each entry is a self-contained prompt: paste the **Global Style
Brief** below first, then the screen's description.

---

## GLOBAL STYLE BRIEF (paste into every prompt)

> Design a screen for KEYSTONE, a premium enterprise fitness SaaS ("the
> operating system for gyms"). **Dark theme by default**: near-black canvas
> `#0C0C0D`, cards on slightly lighter surfaces `#161618`, hairline borders
> `#2F2F34`. Brand accent is **Signal Red `#DC2440`** (light mode `#C8102E`) —
> used ONLY for: the one primary action per screen, live/active states,
> progress fills, and achievements. Everything else is warm neutral grey.
> Typography: **Hanken Grotesk** — extrabold tight-tracked titles, regular
> 14px body, and tiny 10px monospace UPPERCASE letter-spaced section labels
> (the product's signature). All numbers tabular. Buttons: squared corners
> (8px radius), bold, UPPERCASE, letter-spaced; red fill for primary, thin
> grey outline for secondary. Cards: 16px radius, 16px padding, subtle border,
> almost no shadow. Icons: Lucide line icons only (1.75px stroke), never emoji.
> Three AI "engines" have muted accent hues used only to colour-code data:
> Hearth/nutrition = ember orange, Forge/training = steel blue, Anchor/
> retention = deep sea green. Status colours: green positive, amber caution,
> deep red critical. The mood: precise, strong, calm — Equinox/Whoop energy,
> never a toy or a crypto dashboard.

**Two surfaces:**
- **Member panel** (`/app/*`) — mobile-first, max width 672px, feels like a
  phone app. Chrome: sticky top bar (KEYSTONE wordmark left, theme toggle +
  "Exit" right) and a fixed bottom tab bar with 5 tabs: Today (Home icon),
  Diet (UtensilsCrossed), Train (Dumbbell), Coach (MessageCircle), More
  (LayoutGrid). Active tab is red with a 2px red indicator bar above the icon.
- **Coach console** (everything else) — desktop-first, max width 1152px.
  Chrome: sticky header with wordmark + "COACH CONSOLE" sublabel, theme
  toggle, sign-out; below it a row of pill tabs: Overview · Members ·
  Requests · Approvals · Retention · Library (active = filled dark pill).

---

# PUBLIC

## 1. Landing — `/`

**Purpose:** the front door; first impression for enterprise buyers. Two
audiences get two doors.

**Layout (single column, centered, max 768px):**
1. Keystone monogram (red wedge mark, 40px) top-left; theme toggle top-right.
2. Small red mono eyebrow: "KEYSTONE".
3. Display headline (48px extrabold): "The operating system for gyms that
   keep members for life."
4. One-paragraph subhead naming the three AI coaches — Hearth, Forge,
   Anchor — "with a real coach in the loop."
5. Three small engine chips in a row: "Hearth · Nutrition" (ember),
   "Forge · Training" (steel), "Anchor · Retention" (sea) — each with its
   Lucide icon (Flame / Hammer / Anchor).
6. Two side-by-side door cards:
   - **"I'm a member"** — description, red primary button "OPEN MY PANEL →",
     tiny mono demo credentials line underneath.
   - **"I'm a coach or owner"** — description, outlined button "OPEN THE
     CONSOLE →", demo credentials line.
7. Footer hairline + mono caption: "Built on one member brain ·
   Coach-approved by design".

Cards lift 2px on hover. Content animates in with a staggered rise.

## 2. Style guide — `/design` (internal)

A living reference page rendering the real components in sections: brand
marks, colour swatches, type scale, buttons, badges, alerts, loading
skeletons, empty/error states, progress ring/bars, tabs/fields/modal,
calendars & heatmaps, iconography. Not a customer screen — design last.

---

# COACH CONSOLE (desktop)

## 3. Coach login — `/login`

**Purpose:** staff sign-in. Minimal and confident.

**Layout:** centered card (max 400px) on the dark canvas. Wordmark + "Coach
console" sublabel above. Title "Coach sign in". Two fields (Email, Password),
full-width red primary button "SIGN IN". Error state: calm red alert strip
above the button. No sign-up link (gyms are provisioned).

## 4. Overview — `/dashboard`

**Purpose:** the gym's morning glance — health of the whole operation.

**Layout:**
1. Title "Gym overview".
2. Stat card row (3): **Members** (total), **Active** (count),
   **Avg streak** (days) — big tabular numbers, mono labels.
3. Tier distribution chips (BRONZE/SILVER/GOLD/PLATINUM counts).
4. Queue shortcut cards: pending plans, pending messages, at-risk members —
   each with a count and a link into its screen.
5. **"Recurring engine work"** card: description + secondary button
   "RUN ENGINE JOBS" with a result summary line after running (e.g.
   "metabolic: 5 · churn: 5 · rituals: 20").
6. **"WhatsApp simulator"** card (demo tool): text input + "SEND AS MEMBER"
   button, response shown beneath.

## 5. Members — `/members`

**Purpose:** roster with the signals that matter.

**Layout:** title "Members", search-less simple list (table-like rows in a
card): each row = name (bold) + phone (mono, grey), goal, tier chip, streak
(Flame icon + number, red), churn RiskBadge (LOW green / MEDIUM amber /
HIGH ember / CRITICAL red), row links to detail. Row hover = surface lift.

## 6. Member detail ("the brain") — `/members/[id]`

**Purpose:** everything the gym knows about one member; where the coach acts.

**Layout:**
1. Breadcrumb "← Members". Name (24px extrabold) + tier chip + streak
   (Flame, red) + churn RiskBadge on one line; phone · goal in grey below.
2. **Consistency card**: "CONSISTENCY · LAST 12 WEEKS" label + red-intensity
   GitHub-style heatmap (rows = weekdays, columns = weeks; deepest red =
   trained, mid = checked in, light = logged) + "29 active days" mono counter.
3. **"Generate with AI"** card: two buttons — "DRAFT DIET PLAN" (green fill)
   and "DRAFT TRAINING PLAN" (steel fill) — plus flash confirmation line.
4. **Metabolic twin** card: TDEE number with confidence, and whether it's
   measured from the member's own logs or a population formula.
5. **Memories** list: kind chips (CONSTRAINT/INJURY/MOTIVATION) + text.
6. **Notes**, **Milestones** (Trophy icon rows), **Upcoming events**.
7. **Plans** list: type + status chips (DRAFT/PENDING/APPROVED/ACTIVE),
   rationale line, created date; opens the plan review.

## 7. Requests queue — `/requests`

**Purpose:** members waiting on a decision — the coach's inbox for the day.

**Layout:** title + queue list. Each request card: member name, "REQUESTED"
status chip (red dot pulsing = live), forDay, requested kinds (DIET/TRAINING
chips), AI suggestion line. Clicking expands a **detail panel**:
- Member header: goal · tier · streak (Flame icon).
- Today's check-in answers with readiness band (GREEN/AMBER/RED chip).
- Weight sparkline (last 90 days, thin line chart).
- Memories, previous plans.
- Action row: "GENERATE WORKOUT" / "GENERATE DIET" (engine-hued buttons),
  then plan cards appear with a decision-trace count, then red "APPROVE"
  (primary) and ghost "DECLINE (REST DAY)" with a note field.
Live updates: new requests slide in.

## 8. Approvals — `/approvals`

**Purpose:** the human gate — nothing reaches a member unapproved.

**Layout:** two labelled sections:
1. **"Plans awaiting approval (n)"** — each card: member, plan type chip,
   rationale, expandable full plan body, decision-trace panel ("WHY THE AI
   DID THIS" — Brain icon, rows of decisions each with a kind icon and an
   INFO/APPLIED/ENFORCED/BLOCKED severity chip), an **AI revision chat**
   (coach types "make it vegetarian, cheaper" → AI redrafts inline), and
   buttons: red "APPROVE", ghost "REJECT".
2. **"Messages awaiting approval (n)"** — outbound nudges: recipient, text,
   approve/reject buttons.
Empty state: "Nothing waiting — inbox zero" with a calm icon.

## 9. Retention — `/retention`

**Purpose:** who is about to quietly leave, and what to do about it.

**Layout:**
1. **"Reach out now (n)"** — at-risk list: member name, churn RiskBadge,
   days quiet, top churn reasons as small chips, suggested action text,
   button to draft an outreach message.
2. **"Cross-gym learning (n)"** — anonymised pattern cards from the network
   ("members who miss 2 Mondays in a row churn 3× more") with k-anonymity
   note in mono.

## 10. Library — `/library`

**Purpose:** the curated movement library + rehab protocols.

**Layout:** searchable/filterable grid of movement cards: name, pattern +
equipment + level chips, coaching cues list (Check icon rows), common
mistakes (X icon rows), contraindications (AlertTriangle + regions),
regression/progression ladder (ArrowDown "easier: …" / ArrowUp "harder: …").
Rehab protocol cards below: staged progressions with "cleared when" criteria
and red-flag lines (Flag icon, "refer out").

---

# MEMBER PANEL (mobile-first)

## 11. Member login — `/app/login`

**Purpose:** the member's door; warm, not corporate.

**Layout:** centered on canvas, max 400px. Wordmark. Display title "Your
training, your coach." Two fields: Phone, Password. Full-width red primary
"SIGN IN". Link: "New here? Create your account". Error strip on failure.

## 12. Register — `/app/register`

**Purpose:** self-serve joining with a gym code.

**Layout:** title "Let's get you started." Four fields: Name, Phone,
Password, Gym code (mono input). Red primary "CREATE ACCOUNT" full-width.
Sub-line: what happens next ("your AI coach will ask a few questions").

## 13. AI onboarding — `/app/onboarding`

**Purpose:** conversational intake — 19 questions, one at a time, builds the
member's long-term memory.

**Layout:** chat screen. Sticky header: "Getting to know you" + thin red
progress bar with mono "12/19". Message thread: coach bubbles left (surface
grey), member bubbles right (red fill, white text). Typing indicator (three
pulsing dots). Input bar pinned at bottom: text field + red send button.
Completion state: CheckCircle icon (green), "That's everything — your coach
is ready", red button to enter the app.

## 14. Today — `/app` (home tab)

**Purpose:** the daily loop's home; answers "what do I do next?"

**Layout (top to bottom):**
1. Greeting: "Good evening," + first name (24px extrabold). Chips row:
   streak (Flame icon + "26 day streak", red subtle chip), tier chip,
   unread-messages chip (red) if any.
2. **Week strip**: 7 small day cells (letter, date number, activity dot),
   today ringed in red.
3. **Stage card** — exactly one of:
   - CHECKIN: "Start with your check-in" + steel button "CHECK IN FOR TODAY".
   - REQUEST: "Check-in done ✓(icon)" + readiness summary + green button
     "GENERATE TODAY'S PLAN".
   - WAITING: "With your coach now" — pulsing live dot, rotating status
     text, plus a **warm-up card**: routine name, total minutes, tickable
     step rows (name, duration, cue) with Done buttons.
   - RESTDAY: Moon icon, "Your coach has called today a rest day" + note.
   - READY: green confirmation strip "Your coach approved today's plan."
4. **Two plan glance cards** side by side: "EAT TODAY" (kcal number,
   protein, link "See today's meals →") and "TRAIN TODAY" (focus name,
   exercise count · intensity, link "Start session →").
5. **"YOUR DAY"** — the ordered schedule: rows with mono time (07:00),
   kind icon (Scale/UtensilsCrossed/Dumbbell), title, detail, and either a
   green check (done, row dimmed + struck) or ghost "DONE" button. The next
   task carries a red "NEXT" chip and red border.
6. **"TODAY'S CHECK-INS"** — ritual rows with Done buttons.
7. **"QUICK LOG"** card: weight input + red "LOG" button; four status chips
   (Weight/Food/Workout/Sleep) filled green when logged.
8. **"YOUR THREE COACHES"** — three tap cards: Flame/Hammer/Anchor icons in
   engine hues, names + domains.
9. Two footer link cards: Gym & membership (Building2), Messages (Mail).

## 15. Daily check-in — `/app/checkin`

**Purpose:** 60-second morning questionnaire that shapes the day's plan.

**Layout:** greeting screen first (ClipboardCheck icon, "Good to see you",
streak chip, red "CHECK IN" button — this records attendance). Then one
question at a time: big question text, progress "n/15" mono, answer control
per type — 1–5 scale as five big tap targets, number pad input for weight,
choice chips, free text. Back link. Completion screen: readiness result —
big band chip (GREEN/AMBER/RED), summary sentence, suggested plan kinds,
red button "ASK FOR TODAY'S PLAN".

## 16. Diet — `/app/diet`

**Purpose:** the day's nutrition, live macros, and Hearth on tap.

**Layout:**
1. Title "Your nutrition" + "Protocol: mini-cut" subtitle.
2. **Target card**: "TODAY'S TARGET" label; coupling chip when linked to
   training ("(Link2 icon) tuned for a moderate training day", steel);
   kcal display number (36px); two MacroBars (Calories consumed/target in
   green, Protein in steel); carbs/fat mono line.
3. Two quick-help tap cards: "Craving SOS" (Candy icon, red) and "Eating
   out" (UtensilsCrossed) — both open the Hearth chat pre-seeded.
4. **"TODAY'S MEALS"** — meal cards: name, bullet item list, "ATE IT"
   toggle (fills green when eaten, card dims), "Swap this meal" text link.
5. **"YOUR WEEK"** — row of small day tiles (day, kcal, intensity) showing
   calorie coupling across the week.
6. **"SHOPPING LIST"** — chip cloud of grocery items.
7. **"LOG WHAT YOU ATE"** — free-text input ("2 rotis, dal, salad") + green
   "LOG"; logged items listed below with parsed kcal in grey.
No-plan state: friendly card + "ASK THE NUTRITION COACH" button.

## 17. Training — `/app/training`

**Purpose:** today's session, exercise coaching, and the week.

**Layout:**
1. Title "Your training" + protocol/days subtitle.
2. Deload banner when active (AlertTriangle, red text "Deload week").
3. **Session card**: focus name (20px bold), "Thu · moderate intensity ·
   n exercises", set counter "0/2" mono. Exercise rows: name, sets×reps,
   RPE chip, "DONE" button per exercise (goes green check). Tapping an
   exercise expands **coaching detail**: cues (Check rows), common mistakes
   (X rows), easier/harder ladder.
4. Rest-day state: Moon icon card, "Rest day", recovery suggestion,
   "I want to train anyway" → asks Forge.
5. **Rehab strip** when injuries exist: current stage, exercises,
   red-flag line (Flag icon).
6. **"THIS WEEK"** — 7 day tiles: day, focus, intensity; today highlighted.

## 18. AI Coach chat — `/app/coach`

**Purpose:** talk to any of the three engines; actions happen from chat.

**Layout:**
1. **Agent switcher**: three tab cards (Flame Hearth · Hammer Forge ·
   Anchor Anchor) — active card bordered, inactive dimmed. Tagline line
   under ("Meals, macros, cravings, eating out").
2. Empty thread state: agent icon, name · domain, "Knows your plan, your
   history and what you've told it before. Ask anything."
3. Thread: member bubbles right (red), agent bubbles left (surface); agent
   bubbles can carry an **action receipt** footer — mono green rows with
   Check icons ("Noted the chocolate craving", "Flagged to your coach:
   pain during squat").
4. Escalation notice row when a human is looped in.
5. Input bar pinned above the tab bar: text field + red send.

## 19. Progress — `/app/progress`

**Purpose:** the honest numbers — weight, metabolism, consistency, wins.

**Layout:**
1. Title "Your progress" / "The numbers, honestly."
2. **Weight card**: current (36px tabular) + change chip (−3.7kg, green
   when toward goal), "Started at 84kg", 6-month sparkline.
3. **Metabolism card** (green-tinted): TDEE number + "Measured from YOUR
   own logged data over 30 days (87% confidence) — a generic calculator
   would have said 2,410." Or the not-enough-data encouragement state.
4. **"LAST 12 WEEKS"** — red-intensity consistency heatmap + active-day
   count.
5. Two stat tiles: streak (Flame + number) and longest streak.
6. **Tier ladder**: current tier + perks (Check rows), next tier + what
   unlocks it.
7. **Milestones**: Trophy rows ("4kg down since starting").
8. Engagement line (member-safe wording: "strong / slipping / at risk").

## 20. Measurements — `/app/measurements`

**Purpose:** body measurements beyond weight.

**Layout:** title; **entry card** with 7 labelled number inputs (Weight kg,
Waist cm, Chest, Arm, Hip, Thigh, Body-fat %) + optional note + red "SAVE";
**"SINCE YOU STARTED"** delta chips per field (−4.5cm waist, green);
history list of dated entry cards showing only the fields recorded.

## 21. Calendar — `/app/calendar`

**Purpose:** every day you showed up, as a month.

**Layout:** title "Calendar" / "Every day you showed up." Month navigation
row: "← Earlier" / "July 2026" (bold) / "Later →". **Month grid** in a card:
S–S weekday header; day cells coloured by intensity — deep red = trained,
30% red = checked in, grey = logged something, dim = nothing; today ringed.
Legend row beneath. Tapping a day opens a **day detail card**: date, rows
with icons (Check "Checked in", Dumbbell "Trained", Scale "Weighed 80.4kg").
Two stat tiles: Active days, Sessions (red number).

## 22. History — `/app/history`

**Purpose:** everything you've been given, and how you felt.

**Layout:** two filter pills "Plans (7)" / "Check-ins (12)". Plans list:
cards with DIET/TRAINING chip, date · status mono, rationale; expanding
shows the full plan body (meals with items, or week with exercises).
Check-ins list: date, readiness band chip, summary line, weight (Scale icon).

## 23. Me / "What your coach knows" — `/app/me`

**Purpose:** transparency + control over the member's AI memory.

**Layout:** title "You" / "Everything your coach knows — and you control."
Sections:
1. **"WHAT YOUR COACH REMEMBERS"** — memory rows: kind chip (CONSTRAINT /
   INJURY / MOTIVATION / PREFERENCE), text, and a "forget" ghost action per
   row (the control promise).
2. **"PROGRAMMED AROUND"** — active injuries/constraints currently shaping
   plans.
3. **"COMING UP"** — events (Hyrox, wedding) with dates.
4. **"YOUR NOTES"** — free notes the member has sent.

## 24. Gym & membership — `/app/gym`

**Purpose:** the practical stuff — classes, fees, policies.

**Layout:** gym name header. **"MEMBERSHIP"** card: status chip, renewal
date, tier + perks. **"CLASS TIMETABLE"** — day-grouped class rows (name,
day, time in mono). **"GOOD TO KNOW"** — policy Q&A rows (opening hours,
freeze policy, guest passes).

## 25. Inbox — `/app/inbox`

**Purpose:** messages from the coach and gym.

**Layout:** title "Messages" / "From your coach and your gym." Message
cards: sender context, body text, timestamp mono; unread = red dot + bolder
surface; read = dimmed. Empty state: Mail icon, "Nothing yet — your coach's
nudges and wins land here."

## 26. Settings — `/app/settings`

**Purpose:** profile + preferences, calm and boring on purpose.

**Layout:** stacked cards:
1. **Profile**: Name, Goal inputs + "SAVE PROFILE"; mono line "Signed in as
   +91… — ask your gym to change this."
2. **Preferred training time**: chip row of times (06:00…20:00), selected =
   dark fill; caption "Your plan is laid out around this."
3. **Training for an event?**: event name + date inputs + save.
4. **Change password**: current + new fields, ghost "UPDATE PASSWORD".
5. Full-width ghost "SIGN OUT".
Green "Saved." flash strip on success.

## 27. More hub — `/app/more`

**Purpose:** one predictable place for everything outside the daily loop.

**Layout:** name header + streak/tier chips. Three labelled sections of
navigation rows — each row: icon in a rounded square well (grey), bold
label, grey hint, ChevronRight:
- **PROGRESS**: Progress (TrendingUp), Measurements (Ruler), Calendar
  (CalendarDays), History (History icon).
- **YOU**: What your coach knows (Brain), Settings (Settings).
- **YOUR GYM**: Gym & membership (Building2), Messages (Mail, red unread
  badge count).

---

## SHARED STATES (design once, reuse everywhere)

- **Loading**: skeleton cards matching the real layout, shimmering; never a
  spinner-on-blank.
- **Empty**: dashed-border well, icon in a circle, one warm sentence, one
  action button.
- **Error**: red-subtle card — what happened, "nothing was lost", RETRY
  button. Never a stack trace.
- **Success**: toast pill bottom-center (green check + text), or for earned
  moments a celebration card (green circle check, "12-day streak — longest
  yet"). No confetti.
- **Modal**: bottom sheet on mobile, centered 512px card on desktop; scrim,
  X close, footer buttons right-aligned (ghost cancel + red confirm).
