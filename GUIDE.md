# Tasque: a tour of the code

Read the files in this order. Each section says what the file does, the one
idea worth learning from it, and where to look.

## 1. The big picture

```
login page ──(Google popup)──► access token ──► app page
                                                  │
         Gmail API + Classroom API  ◄─────────────┤ 1. load
         Gemini (or keyword rules)  ◄─────────────┤ 2. group
         js/core/priority.js        ◄─────────────┤ 3. arrange (planner order + same-day clubs)
         lotus + cards              ◄─────────────┤ 4. render
         toast / Notification       ◄─────────────┘ 5. notify (every 3 min)
```

There is **no server**. The browser talks to Google directly. This keeps the
project simple, but it means the Google token only lasts about an hour and
notifications only work while the tab is open.

## 2. `js/core/`: the logic (no browser needed)

These files have no `document` or `fetch` in them, so Node can test them.

- **`dates.js`**: `findDateInText()` turns "this Friday 4pm" or "24 Oct" into a `Date`.
  The trick is `nearestFuture()`: "24 Oct" in December means *next* October.
  Also note that `new Date('2026-10-24')` is **UTC midnight**, which is the day before
  in some timezones. That's why we build dates with `new Date(year, month - 1, day)`.
- **`priority.js`**: `arrange()` is the heart of the app. Every item gets a
  **key date** (`eventDate ?? due`). Items are put into sections (Today, Tomorrow…),
  sorted, and then neighbours with the same `dayKey()` are clubbed into one cluster.
  Because the list is sorted *first*, clubbing is just "is this the same day as
  the previous one?".
- **`rules.js`**: the fallback when there's no Gemini key. Keyword lists, first match wins.
- **`store.js`**: everything Tasque remembers, saved per account in `localStorage`.
  `markSeen(ids)` returns the ids it has never seen, which is how "new" is detected.

## 3. `js/sources/`: getting the data

- **`google.js`**: sign-in with Google Identity Services. `initTokenClient()` opens
  the popup; the callback gets an `access_token`. **Scopes** decide what the token can
  read; we ask only for `.readonly` ones. People can untick boxes in the popup, so we
  check `hasGrantedAllScopes()` and remember what we actually got.
  `googleGet()` turns HTTP errors into messages a person understands (401 = expired,
  403 = API off or school block).
- **`gmail.js`**: Gmail's list call only returns ids, so we fetch each message's
  headers with `format=metadata`. Twenty requests run at the same time with `Promise.all`.
- **`classroom.js`**: for each class: coursework, announcements and *your* submissions.
  `Promise.allSettled` means one broken class doesn't hide the others.
  Classroom gives due dates in **UTC** pieces, hence `Date.UTC(...)`.
- **Read more** (`fetchMailBody` in `gmail.js`): `format=full` returns the email as a
  *tree* of parts (plain text, HTML, attachments). `findPart()` searches it depth-first
  (a recursive function), and the text is **base64url**, decoded with `atob` + `TextDecoder`
  so accents and emoji survive. HTML-only emails go through `DOMParser`, which reads HTML
  *without running it*. Classroom needs none of this: its API already gives the full text.
- **`demo.js`**: sample data dated *relative to today*, so the demo never goes stale.

## 4. `js/ai/gemini.js`: asking for JSON

The prompt describes the exact JSON shape we want, and
`responseMimeType: 'application/json'` makes Gemini reply with JSON only. We still
check everything that comes back (`ACTIONS.includes(...)`, priority 1–3) because a
model can return anything. Items are numbered (`n`) so the answer can be matched
back to them. Results are saved, so only **new** items are ever sent again.
503 "overloaded" errors are retried after 0.8 s, 1.6 s and 3.2 s.

## 5. `js/ui/lotus.js`: the lotus

- The centre is at `x = -70`, so it sits **off the left edge**. Only the right half shows.
- Petal `i` is at angle `(i - shown) × 24°`. The selected petal is at 0° (pointing right).
- Turning = changing `index`. Each animation frame moves `shown` 20% of the way toward
  `index` (an *ease-out*), then redraws.
- Labels stay upright because the label group is **moved** with `translate(x, y)`
  (worked out with `cos` and `sin`), not rotated.
- Petals fade out as they swing past about 55°, so the edge looks like the flower
  turning out of view.

## 5b. Default categories (`js/core/categories.js`)

One list used by the demo, the offline rules and the Gemini prompt, so all three agree.
The lotus always shows these seven; extra categories Gemini invents only appear
while they have items.

## 5c. Sender check (`js/core/trust.js`)

The "From" line of an email is just text the sender typed, so it can be faked.
When Gmail receives an email it checks with the sender's domain whether that
server was allowed to send for it (SPF), whether the email carries the domain's
signature (DKIM), and what the domain says to do if those fail (DMARC). Gmail
writes the result in the `Authentication-Results` header. `authVerdict()` reads it,
and `senderTrust()` combines it with the domain. Note `endsWith('.rvce.edu.in')`
rather than `endsWith('rvce.edu.in')`: the dot stops `fakervce.edu.in` from passing.

## 6. `js/app.js`: wiring it together

`load()` → `group()` → `findNew()` → `render()`. One click listener on the list
handles every card button (*event delegation*), using `data-act` and `data-id`.
`esc()` escapes anything from an email before it goes into `innerHTML`, because
email subjects are written by strangers.

## 7. Things to try

1. Add a "Snooze until tomorrow" button that hides an item until the next day.
2. Make the lotus wrap around (after History, go back to All).
3. Show a count of unread emails on the Mail petal.
4. Add a filter for "only Important".
