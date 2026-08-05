# Handoff Procedure

Run this whenever we switch chats / hand off to a new session. Keep it lean. The
**pressure test (step 4) is mandatory — never skip it.**

## Steps
1. **Verify state** — `git status` (clean, or list what's uncommitted); confirm the latest commit; if code changed, build/spot-check it.
2. **Update the docs** — `HANDOFF.md` "⏩ Pick up here" (current state · active task + where its spec lives · every blocker + its workaround · the first concrete next step); `DECISIONS.md` (new decisions); `SOURCES.md` (new/pending sources); **project memory**.
3. **Commit + push** — only when the user approves.
4. **Pressure-test** — simulate a cold worker who has ONLY the repo docs + auto-loaded memory + the prompt. Run the checklist below; fix every failure and re-commit.
5. **Issue the handoff prompt** — from the template below, with real values.

## Pressure-test checklist (the cold-worker audit)
A fresh session, without this chat's transcript, must be able to:
- [ ] Orient — what the project is, the folder, the repo — from docs + memory alone.
- [ ] Find the **active task** with enough spec to start (files to touch, sources, method).
- [ ] Know every current **blocker and its workaround.**
- [ ] Know the **first concrete step.**

Red flags to hunt and fix before issuing the prompt:
- [ ] **Session-specific paths** (scratchpad UUIDs) — they won't exist for a new session. Replace with a rebuild-from-docs instruction.
- [ ] **Info that lives only in this chat** (verbatim feedback, decisions not logged) — move it into a doc.
- [ ] **Dead links or a stale commit hash** in the prompt.
- [ ] **Credentials** — state how the new worker's tools access needed keys; never require pasting a key into chat.
- [ ] **Git identity** persists in repo-local `.git/config` so commits attribute correctly.

## Handoff prompt template
```
Continuing "<PROJECT>" — <one-line what it is>. Work ONLY out of: <FOLDER>.

Orient first, in order: read <DOCS TO READ, IN ORDER>; load project memory.
Verify access: gh authed as <USER>; origin <REPO URL> (branch <BRANCH>); working
tree clean; latest commit <HASH>. Do NOT commit/push until I ask.
Give me a short summary of where we are, then wait.

ACTIVE TASK: <task> — spec in <doc/section>. Status/blocker: <blocker + workaround>.
HOW TO PROCEED: <first concrete step>.
CONSTRAINTS: <the project's non-negotiables>.
```
