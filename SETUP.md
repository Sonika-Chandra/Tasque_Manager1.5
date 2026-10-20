# Setting up Google sign-in

Demo mode works straight away. To read **your own** Gmail and Google Classroom,
Google needs to know about the app first. It's free and takes about 10 minutes.
You only do this once.

> **Why can't I just type my email?** Google never lets a website read
> someone's mail from their address alone. You sign in with Google in a popup and
> tick what the app may read. Google then hands the page a key that works for
> about an hour (an *access token*). The Gemini key can't do this: it only talks
> to Gemini.

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in.
2. At the top, click the project picker → **New project**. Name it `Tasque` → **Create**.
3. Make sure the new project is selected in the picker.

## 2. Turn on the two APIs

1. Menu → **APIs & Services** → **Library**.
2. Search **Gmail API** → open it → **Enable**.
3. Search **Google Classroom API** → open it → **Enable**.

If you skip this, Tasque shows: *"This API isn't turned on in your Google Cloud project."*

## 3. Set up the consent screen

This is the screen people see in the sign-in popup.

1. Menu → **APIs & Services** → **OAuth consent screen** (newer consoles call it **Google Auth Platform**).
2. User type: **External** → Create. Fill in the app name (`Tasque`), your email as support and developer contact.
3. **Scopes** (or **Data access**) → **Add or remove scopes** and add:
   - `.../auth/gmail.readonly`
   - `.../auth/classroom.courses.readonly`
   - `.../auth/classroom.coursework.me.readonly`
   - `.../auth/classroom.announcements.readonly`
4. **Test users** (or **Audience**) → **Add users** → add the email(s) you'll sign in with.
5. Leave the app in **Testing**. Only the test users can sign in, which is what you want for a portfolio project.

> Gmail read access is a *restricted* scope. In Testing mode that's fine. Publishing
> the app for everyone would need a Google security review, which isn't worth it here.

## 4. Create the Client ID

1. Menu → **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized JavaScript origins** → add every address you'll open Tasque from:
   - `http://localhost:8000`
   - your GitHub Pages address, e.g. `https://sonika-chandra.github.io` (just the origin: no path, no slash at the end)
4. **Create**, then copy the **Client ID** (it ends in `.apps.googleusercontent.com`).
   You don't need the client secret: a browser app never uses one.

## 5. Put the Client ID into Tasque

1. Run Tasque (`python -m http.server 8000`, then open <http://localhost:8000>).
2. On the login page click **Set up Google sign-in**, paste the Client ID, **Save**.
3. Type your email, click **Sign in with Google**, pick the account, tick the boxes, **Continue**.

You'll see a warning that *"Google hasn't verified this app"*. That's normal for
an app in Testing: click **Continue**.

The Client ID isn't a secret (it's visible to anyone using the page), so it's
fine that it's stored in the browser. It's not in the code so that each person
who forks the repo uses their own.

## School and college accounts

Many schools only allow apps their IT team has approved. If yours does, you'll see
one of these:

| What you see | What it means |
|---|---|
| *"Your school's Google admin blocks this app"* (`admin_policy_enforced`) | Your school blocks outside apps. |
| *"Access was not allowed"* (`access_denied`) | Either you pressed Cancel, or the school blocks it. |
| *"Google refused access"* (error 403 after signing in) | The school allows sign-in but not Gmail/Classroom access for this app. |

What you can do:

- **Ask IT** to allow the app. They need your Client ID (Admin console → Security → API controls → App access control).
- **Use a personal Gmail** to test the mail side. Classroom works with personal accounts too if a teacher adds you to a class (or you create a test class yourself at classroom.google.com and join it from a second account).
- **Use Demo mode** to show the project. It's the same app, with sample data.

## Troubleshooting

| Problem | Fix |
|---|---|
| Popup says `redirect_uri_mismatch` or `origin_mismatch` | The address in the browser isn't in **Authorized JavaScript origins**. Add it exactly (including `http://` and the port). |
| Popup closes straight away | The browser blocked it. Allow popups for the site. |
| *"Your Google sign-in has expired"* | Tokens last about an hour. Press **Reconnect**. |
| Classroom shows nothing | You may only be a *teacher* in your classes, or have no active classes. |
| `access_denied` and you're not a test user | Add your email under **Test users** (step 3.4). |
