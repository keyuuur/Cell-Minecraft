# AGENTS.md

## Purpose
- This folder contains Keyur's teacher-facing coding projects, classroom apps, school operations notes, Gmail/calendar workflows, gradebook context, and teacher-planning artifacts.
- Before editing a child project, read this file, `KEYUR_WORKFLOW.md`, and the nearest child-project `AGENTS.md` if one exists.
- Child-project instructions win when they are more specific. Current user instructions and higher-priority system/developer rules always win.

## Required reading
- Read `KEYUR_WORKFLOW.md` for general Codex operating style.
- Follow its coordinator-mediated helper-agent policy when using role-based helpers.
- For classroom app projects, read the local README, handoff, deployment notes, tests, and any local `AGENTS.md` before changing files.
- For `Teacher Context`, inspect the exact planning, gradebook, Gmail, or calendar source named by the task before summarizing or acting.
- For Gmail, calendar, gradebook, or outreach work, verify the exact source thread/event/file/student row before drafting or recommending action.

## Environment
- Existing Google Apps Script projects must stay Apps Script compatible unless Keyur explicitly asks for a migration.
- Do not add npm packages, build tools, external frameworks, accounts, databases, or deployment platforms to an Apps Script project unless the local project already uses them or Keyur explicitly asks.
- HTML files in Apps Script projects should stay clean raw text so they can be copied into Apps Script.
- Projects that already use Vite, React, TypeScript, Next.js, Vercel, CLASP, or another stack should follow their local instructions.
- Do not print, commit, or expose OAuth files, token/cache files, credentials, private student data, or machine-local config.

## Teacher and student safety
- Treat school, student, family, IEP/504/EL, gradebook, HR, payroll, account-security, and finance information as sensitive.
- Codex may inspect, summarize, and draft when scoped, but must get explicit approval before sending emails, deleting drafts, changing labels, scheduling events, modifying student/family-facing records, or publishing/sharing files externally.
- Verify names, dates, recipients, grade facts, attachments, labels, calendar times, and source files from the live source before relying on them.
- Prefer read-only or draft-only outputs until Keyur approves an external-facing action.
- Use minimum necessary detail. Do not copy sensitive data into new files unless the task requires it.

## UI priorities
- Student-facing classroom apps are iPad-first unless a local project says otherwise.
- Keep interfaces simple and clear for 9th grade classroom use.
- Use large tap targets, short instructions, obvious feedback, readable contrast, and forgiving flows.
- Avoid hover-only controls for student workflows.
- For teacher dashboards, optimize for classroom speed: quick scanning, clear state, and low chance of accidental public display of private student information.

## Classroom-game helper roles
- For normal classroom-game development, Codex may summon whichever helper roles fit the task. When Keyur says `swarm mode`, Codex must use role-based helpers and produce a coordinator-mediated synthesis through the main thread.
- Small or narrow tasks may use a reduced role subset, but swarm mode cannot skip role-based review entirely. Follow `KEYUR_WORKFLOW.md` for model choice, risk posture, and coordinator-mediated roundtable behavior.

### Helper-model routing

- Use `gpt-5.3-codex-spark` only for fast, bounded, text-only coding iterations with clear scope and objective checks: small fixes, focused tests, mechanical refactors, and narrow code review. Choose it when latency matters more than broad capability.
- Use `gpt-5.6-terra` as the minimum general-purpose helper model for normal coding, investigation, multi-file work, and tasks needing stronger context or tool use.
- Use `gpt-5.6-sol` only when Keyur or a project rule authorizes higher-model work: broad ambiguity, complex architecture, high-risk reasoning, or high-fanout swarm review.
- Never select Luna for these local helper workflows.
- Preserve an explicit user model request. If Spark is unavailable, use Terra and report the fallback and the actual model used.
- Model choice never grants helper, write, deployment, external-action, or approval authority.
- `Coordinator / Producer`: owns scope, sequencing, final synthesis, and the shared brief.
- `Learning Objective + Content Reviewer`: checks the classroom learning goal, science/content accuracy, and misconception coverage.
- `Classroom Fit Reviewer`: checks iPad-first use, class-period timing, teacher setup, student friction, and replay practicality.
- `Game Loop Designer`: owns player verbs, round structure, progression, scoring, failure states, and replay value.
- `Student UX / HUD Designer`: owns screens, prompts, feedback, menus, readability, and touch-friendly flow.
- `Visual / Asset Direction Lead`: owns theme, visual consistency, asset needs, and avoiding decoration that does not support gameplay.
- `Gameplay / Frontend Engineer`: owns implementation feasibility, state, mechanics, UI integration, and stack compatibility.
- `Playtest / QA Engineer`: owns browser testing, device checks, bug discovery, confusing moments, and completion flow.
- `Skeptical Reviewer`: challenges whether the result is actually a game, not just a decorated quiz, and flags weak evidence.
- `Deployment / Classroom Ops Reviewer`: joins when deploys, Vercel, Apps Script, Google Sheets, sharing, or score/accountability flows are involved.
- Default swarm patterns:
  - Discovery/design: Coordinator, Learning Objective + Content Reviewer, Classroom Fit Reviewer, Game Loop Designer, Student UX / HUD Designer, and Skeptical Reviewer.
  - Build: Coordinator, Gameplay / Frontend Engineer, Student UX / HUD Designer, Playtest / QA Engineer, plus Visual / Asset Direction Lead or Deployment / Classroom Ops Reviewer when relevant.
  - Release/readiness: Coordinator, Playtest / QA Engineer, Classroom Fit Reviewer, Deployment / Classroom Ops Reviewer, Skeptical Reviewer, and Learning Objective + Content Reviewer.

## Durable orchestration memory
- The Coordinator / Producer must apply the durable-memory protocol in `KEYUR_WORKFLOW.md` when a classroom project materially spans phases or sessions, uses role-based helpers, locks a learning/design/architecture/safety decision, or has a release, deployment, recovery, data, or device-verification gate.
- Use `docs/handoffs/PROJECT_CONTEXT.md` for stable decisions and `docs/handoffs/CURRENT_STATUS.md` for current verified posture unless the child project already has an established durable handoff. Never create a second competing authority merely to match the default filenames.
- Before assigning helpers, the coordinator reads relevant durable memory, checks it against live Git/source/test state, and gives each role only the decisions and constraints that improve that role's work. Helpers flag contradictions and handoff-worthy findings; the coordinator decides what is durable and writes the update.
- The shared blank templates live under `Teacher Coding Projects/docs/handoff-templates/` when this workspace is available. Portable child repositories may follow the complete file contract in `KEYUR_WORKFLOW.md` when the shared templates are absent.
- Project-specific child instructions may extend or tighten the protocol. Small one-session tasks without durable consequences should not accumulate handoff files.

## Project notes
- Classroom games and labs should prioritize reliability, classroom safety, and easy testing over fancy animation.
- If a project collects student names, periods, groups, or scores, keep private teacher views separate from student/projector views.
- Projector or public displays must not show student names or sensitive details unless the local project explicitly requires it and Keyur approves that behavior.
- Preserve existing function names, sheet tab names, deployment names, and data columns unless changing them is required and explicitly scoped.
- When changing where data goes or who receives it, stop and ask first.

## Verification
- For classroom apps, run available local checks and inspect the UI when practical.
- For Apps Script projects, verify the local source still matches Apps Script constraints and follow any local CLASP/deployment instructions.
- For Gmail/calendar/gradebook work, cite the exact source checked and say what was not changed.
- For docs-only changes, verify the changed docs read correctly and no unrelated files were added.

## Completion report
At the end of teacher-project work, give:
1. A plain-English explanation of what changed and why, or what was inspected if read-only.
2. What was verified, including tests/checks or exact source evidence.
3. A concrete checklist for what Keyur should test or review next.
4. Optional follow-up improvements noticed but not done.
