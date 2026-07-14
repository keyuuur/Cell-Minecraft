# CellCraft: Build a Living Cell
## Project Handoff and Decision Record

**Document purpose:** Transfer the current project context to a new ChatGPT Work / GPT Sol instance so it can continue product design, technical planning, and eventually prepare an implementation-ready Codex handoff.

**Current project status:** Concept and technology stack are selected. The first game direction is selected. The project is **not ready for full implementation yet** because several gameplay, educational, visual, and scoring decisions still need to be resolved.

---

# 1. Executive Summary

The project is a browser-based, Minecraft-inspired biology game for ninth-grade students. The first game will focus on **building and maintaining a functioning plant cell**.

The project should borrow the parts of Minecraft that fit the educational goal:

- First-person exploration
- A bounded voxel environment
- Gathering simplified biological resources
- Placing structures
- Constructing a functional system
- Repairing damage
- Responding to environmental changes
- Learning through visible cause and effect

The project should **not** attempt to reproduce the full scope of Minecraft. It should be a small, reliable, mission-based educational game that performs well on school iPads.

The first release should be a **single polished vertical slice** centered on one plant-cell mission.

---

# 2. Background and Existing Related Projects

The teacher previously planned or created local projects titled:

- Ecosystem Fieldwork
- Carrying Capacity
- Natural Selection

Those ideas remain potentially useful, but they are not currently selected as the first voxel game.

Current assessment of their fit:

| Project | Better-Fitting Genre | Voxel/Minecraft Fit |
|---|---|---:|
| Ecosystem Fieldwork | Exploration and field-research game | Strong |
| Carrying Capacity | Management and population simulation | Limited |
| Natural Selection | Generational simulation | Moderate |
| Build a Cell | Building and systems game | Very strong |

The selected direction is **Build a Cell** because construction, resource use, structure placement, and system functionality map naturally to Minecraft-style mechanics.

The other projects should not be deleted or merged into the first release. They may become future games or later modules after the voxel engine and classroom workflow are proven.

---

# 3. Working Title

**Current working title:** `CellCraft: Build a Living Cell`

This is not necessarily the final title.

Other future naming directions could include:

- CellCraft
- Cell Builder
- Voxel Cell Lab
- Build-a-Cell
- Living Cell Lab
- Cell Architect

---

# 4. Audience and Classroom Context

## Target students

- Ninth-grade Biology students
- Includes students with weak reading stamina
- Includes students with IEPs and 504 plans
- Includes students with limited English proficiency
- Future support may include Spanish and Pashto

## Primary device

- School-issued iPads
- Landscape orientation
- Typical classroom target viewport: approximately **1024 × 768**
- Browser deployment; no App Store installation
- Touch controls must be treated as a first-class requirement

## Secondary devices

- Desktop and laptop browsers for teacher testing and development
- Keyboard and mouse controls should be supported

## Classroom constraints

- Game must load through a normal web link or QR code
- School filtering and Vercel access need real-device testing
- No student account creation should be required for the first version
- Instructions must be brief and readable
- Essential information cannot depend on audio
- The game should recover from accidental reloads or temporary connection problems

---

# 5. Educational Purpose

The game should teach cell structures and functions through construction and system behavior rather than through a traditional quiz layer.

The central educational idea is:

> A cell is a coordinated system. Organelles are not decorations; each structure performs a function that affects the survival and operation of the cell.

Students should learn through:

- Correct construction
- Correct placement
- Functional activation
- Visible consequences
- Environmental challenges
- Corrective feedback
- Final performance reporting

## Likely first-release learning objectives

Students should be able to:

1. Distinguish important plant-cell structures from animal-cell-only or inappropriate structures.
2. Identify major plant-cell structures.
3. Connect each required structure to its biological function.
4. Place structures within the proper cellular context.
5. Understand that organelles work together as a system.
6. Recognize a basic homeostasis problem.
7. Restore cell function after a disruption.

## Candidate required structures

The recommended first-release set is:

1. Cell wall
2. Cell membrane
3. Cytoplasm
4. Nucleus
5. Ribosomes
6. Mitochondria
7. Chloroplasts
8. Central vacuole

Possible later structures:

- Rough endoplasmic reticulum
- Smooth endoplasmic reticulum
- Golgi apparatus
- Vesicles
- Cytoskeleton
- Peroxisomes

The first release should avoid including too many structures before the central loop is proven.

---

# 6. Locked Technology Stack

The following stack is settled unless a serious implementation problem is discovered.

| Layer | Selected Technology |
|---|---|
| 3D engine | **Babylon.js** |
| Language | **TypeScript** |
| Build tooling | **Vite** |
| Menus, HUD, assignment flow, results | **React** |
| Shared application state | **Zustand** |
| Local autosave | **IndexedDB** |
| Student score backend | **Google Apps Script + Google Sheets** |
| Hosting | **Vercel** |
| Primary rendering baseline | **WebGL 2** |
| Optional enhancement | WebGPU where supported |
| Primary device target | School iPad in landscape |
| Secondary target | Desktop browser |

## Stack boundaries

- **Babylon.js owns the real-time 3D scene and gameplay loop.**
- **React owns menus, HUD, instructions, assignment screens, settings, and results.**
- **Zustand exposes only the shared state needed between React and Babylon.**
- React should never create one component per voxel.
- Biology rules should remain separate from rendering code.
- Scoring should be deterministic and testable.
- The game must remain playable locally even if the score backend is unavailable.
- Phaser remains reserved for separate 2D games and should not be combined with Babylon.js without a specific need.

## Version policy

Do not hard-code a framework version in the product specification until implementation begins. At implementation time:

1. Verify current stable compatible versions.
2. Pin exact package versions.
3. Record them in `package.json` and the technical README.
4. Avoid unnecessary experimental dependencies.

---

# 7. Core Product Direction

## Selected game concept

The player enters a bounded microscopic construction environment and builds a functioning plant cell.

The game should feel Minecraft-inspired through:

- Movement through a voxel world
- A visible hotbar or inventory
- Gathering or earning resources
- Placing cell structures
- Repairing mistakes
- Watching systems activate
- Completing a mission through construction

## Recommended framing

A **microscopic cell-construction laboratory** containing:

- A cell construction chamber
- A clearly defined build zone
- Resource collection locations or stations
- A mission terminal
- Tutorial prompts
- Observation or diagnostic displays

The plant-cell build zone can be rectangular or rounded-rectangular, making the cell wall visually compatible with voxel construction.

## Bounded scope

The first release should use:

- One small map
- One plant-cell mission
- No infinite terrain
- No multiplayer
- No procedural open world
- No combat
- No unrelated survival systems
- No large crafting tree
- No student accounts
- No App Store build
- No photorealistic art
- No mathematically realistic molecular formulas

---

# 8. Proposed Student Flow

The current recommended flow is:

```text
Loading
→ Title screen
→ Student identification
→ Mission briefing
→ Controls tutorial
→ Enter construction environment
→ Gather or earn required materials
→ Build and activate cell structures
→ Complete a homeostasis challenge
→ Receive corrective feedback
→ View current assignment grade
→ Submit result
→ Continue playing or exit
```

## Reusable classroom workflow from prior game planning

The following patterns should likely carry over from the existing Cooking Macromolecules project:

- Student identification using first name + last initial
- A visible numerical **Current Assignment Grade**
- Early submission allowed
- Incomplete submissions still recorded for accountability
- Continue-playing option after submission
- Local fallback if online score submission fails
- Short assignment duration
- Teacher-readable results in Google Sheets

These patterns are recommended but should be explicitly confirmed for CellCraft.

---

# 9. Proposed Core Gameplay Loop

```text
Receive objective
→ Locate, collect, or earn required material
→ Unlock or assemble a structure
→ Place the structure
→ Activate or connect the structure
→ Observe the effect on cell status
→ Receive biological feedback
→ Advance to the next objective
```

Each structure must affect the simulation.

| Structure | Candidate Gameplay Function |
|---|---|
| Cell wall | Structural support and fixed outer boundary |
| Cell membrane | Controls movement into and out of the cell |
| Cytoplasm | Required internal environment for cell processes |
| Nucleus | Unlocks instructions and coordinates activities |
| Ribosomes | Produce proteins required for construction or repair |
| Mitochondria | Generate usable energy from available inputs |
| Chloroplasts | Produce glucose when sufficient light is available |
| Central vacuole | Stores water and supports internal pressure |

The exact simulation depth remains open. The first version should use understandable, simplified systems rather than an overly detailed biochemical simulation.

---

# 10. Proposed Mission Progression

The following progression is currently recommended but not fully locked.

## Stage 1: Establish the boundary

Possible tasks:

- Complete the cell wall
- Complete or activate the cell membrane
- Establish the cytoplasm volume

Learning focus:

- Plant cells have both a cell wall and a cell membrane.
- The wall supports the cell.
- The membrane regulates movement.

## Stage 2: Establish control

Possible tasks:

- Place the nucleus
- Activate cellular instructions

Learning focus:

- The nucleus contains genetic information.
- The nucleus helps direct cell activities.

## Stage 3: Produce proteins

Possible tasks:

- Place ribosomes
- Complete one simplified protein-production action

Learning focus:

- Ribosomes build proteins.

## Stage 4: Generate usable energy

Possible tasks:

- Place mitochondria
- Provide required simplified inputs

Learning focus:

- Mitochondria release usable energy from food.

## Stage 5: Capture light energy

Possible tasks:

- Place chloroplasts
- Position them where they receive light
- Activate photosynthesis

Learning focus:

- Chloroplasts use light energy to produce glucose.

## Stage 6: Maintain water and support

Possible tasks:

- Place the central vacuole
- Fill it with water
- Stabilize internal pressure

Learning focus:

- The central vacuole stores water.
- Water storage helps support a plant cell.

## Stage 7: Homeostasis challenge

Recommended first challenge:

> A dry external environment causes the cell to lose water.

Possible player responses:

- Detect falling water level
- Restore water intake
- Protect the membrane
- Refill or stabilize the central vacuole
- Return the cell to a stable state

Other candidate challenges:

- Hypotonic environment
- Hypertonic environment
- Energy shortage
- Reduced light
- Membrane damage
- Toxin exposure

The final challenge should test the interaction of several previously built systems.

---

# 11. Proposed World and Construction Model

## Recommended model

The player should not be asked to create every organelle one voxel at a time in the first version.

Recommended division:

- Students construct boundary and structural areas using blocks.
- Major organelles are placed as large voxel-style prefabs.
- Students may need to position, supply, activate, or connect organelles.
- Later versions can allow more detailed construction.

This keeps the project feasible while preserving meaningful building mechanics.

## Candidate world size

A possible internal cell chamber size is approximately:

- 32 × 32 × 20 blocks

This is not settled. It must be tested against:

- iPad performance
- Student navigation
- Visibility
- Build time
- Mission duration

## Camera perspective

Not yet settled:

- First-person
- Close third-person
- Toggle between both

Current recommendation: **first-person**, because it provides the strongest Minecraft-like experience and reduces the need for a player-character model.

---

# 12. Proposed Resources and Assembly

The resource system should avoid fake chemistry and unnecessary complexity.

## Candidate simplified resources

- Membrane material
- Structural material
- Protein components
- Genetic instructions
- Energy
- Water
- Pigment material
- Glucose
- Oxygen

## Possible acquisition methods

- Mine or harvest resource blocks
- Collect floating molecules
- Use laboratory stations
- Complete short environmental tasks
- Receive materials after demonstrating a concept
- Combine exploration with controlled station use

## Design constraint

Do not use simplified recipes that accidentally teach incorrect molecular formulas.

Resources should be described as educational categories or components, not exact chemical recipes unless scientifically accurate and instructionally appropriate.

---

# 13. Controls

## iPad requirements

Candidate controls:

- Left virtual joystick for movement
- Right-side drag area for camera control
- Large context-sensitive interact button
- Separate place button
- Separate remove/break button
- Large hotbar
- Objective button
- Pause/menu button
- Optional jump button only if needed
- Optional camera reset

The game should not depend on precise platforming or fast reactions.

## Desktop controls

Candidate controls:

- WASD for movement
- Mouse for camera
- Left click for remove/interact
- Right click for place
- Number keys for hotbar
- E for interact
- Escape for pause

Exact mappings should be configurable from a central input definition.

---

# 14. Feedback and Error Handling

Feedback should be:

- Immediate
- Short
- Specific
- Corrective
- Biologically meaningful
- Non-punitive when possible

## Candidate error behaviors

| Student Action | Candidate Response |
|---|---|
| Place chloroplast outside the cell | Reject placement and explain the correct context |
| Place nucleus outside the membrane | Reject placement |
| Omit mitochondria | Energy status remains low |
| Build inadequate vacuole | Water-storage requirement is not satisfied |
| Leave a membrane opening | Material leakage or instability occurs |
| Select inappropriate structure | Explain why it does not belong in a plant cell |

Example feedback:

> Place the chloroplast inside the cell. Chloroplasts capture light energy and help make glucose.

Avoid long paragraphs during active gameplay.

---

# 15. Scoring and Assignment Reporting

The scoring system is not yet settled.

## Candidate 100-point rubric

| Category | Candidate Points |
|---|---:|
| Cell boundary | 15 |
| Correct required structures | 30 |
| Correct placement | 15 |
| Structure activation | 15 |
| Homeostasis challenge | 15 |
| Completion and system stability | 10 |

Potential optional categories:

- Hint use
- Repair accuracy
- Efficient resource use
- Explanation or reflection

## Current recommendation

- Do not grade speed directly.
- Grade biological correctness and functional completion.
- Time may be used for pacing and session limits.
- Hints may be recorded, but deductions should be small or absent unless the teacher chooses otherwise.
- Accommodations should not produce unfair grade penalties.

## Proposed result display

```text
Current Assignment Grade: 86%
```

Possible breakdown:

- Completed structures
- Missing structures
- Placement errors corrected
- Functions demonstrated
- Homeostasis result
- Hints used
- Incomplete objectives

---

# 16. Hint System

A three-level hint system is recommended.

## Hint 1: Directional

> Review the cell boundary.

## Hint 2: Conceptual

> Plant cells have both a cell wall and a cell membrane.

## Hint 3: Explicit

> Place the cell membrane directly inside the cell wall.

Open decisions:

- Are hints requested by the student or triggered automatically?
- Is there a delay before hints become available?
- Do hints affect the grade?
- Are accommodations handled differently?
- Does the teacher have a setting controlling hint behavior?

---

# 17. Visual Direction

## Current recommended style

- Bright voxel art
- Scientific but playful
- Clear silhouettes
- Large, readable structures
- Slightly exaggerated organelle scale
- Soft lighting
- Clean laboratory interface
- High contrast
- Not dark or survival-horror themed
- Readable on a 10-inch iPad
- Color is not the only way to identify structures

## Possible visual framing

- Microscopic glowing environment
- Clean laboratory construction chamber
- Transparent or semi-transparent cell boundary
- Diagnostic panels embedded into the world
- Distinctive block textures for each biological category

A visual reference board and UI mockups should be created before final polish, but implementation should begin with simple placeholder assets.

---

# 18. Audio Direction

Audio is optional and secondary.

Candidate audio:

- Ambient laboratory or microscopic sound
- Placement confirmation
- Invalid-placement cue
- Warning cue
- Structure activation sound
- Completion sound

Requirements:

- No essential information conveyed only through sound
- Mute control
- Game remains fully usable with device audio off

---

# 19. Accessibility and Localization

Requirements:

- Large touch targets
- Large text
- Short instructions
- Minimal precision
- High contrast
- Do not rely only on color
- Pause available
- No required audio
- No rapid-reaction grading
- Autosave
- Reload recovery
- No student account required
- Centralized instructional strings
- Architecture prepared for later translation

Potential future languages:

- English
- Spanish
- Pashto

Read-aloud support may be considered later.

---

# 20. Proposed Technical Architecture

```text
src/
├── app/
│   ├── App.tsx
│   ├── routes/
│   └── screens/
├── game/
│   ├── engine/
│   ├── player/
│   ├── input/
│   ├── world/
│   ├── voxel/
│   ├── organelles/
│   ├── interactions/
│   ├── missions/
│   ├── simulation/
│   └── audio/
├── biology/
│   ├── definitions/
│   ├── rules/
│   ├── feedback/
│   └── scoring/
├── ui/
│   ├── hud/
│   ├── menus/
│   ├── tutorial/
│   └── results/
├── state/
├── persistence/
├── backend/
├── localization/
├── assets/
└── tests/
```

## Architecture rules

- Babylon.js controls the scene and real-time simulation.
- React controls the surrounding application UI.
- Do not represent every block with a React component.
- Do not use one Babylon mesh per block in a meaningful voxel world.
- Use chunk-based world data and meshing if free block construction is included.
- Store block data in efficient arrays.
- Render only visible faces.
- Use a texture atlas where appropriate.
- Use prefabs or instances for repeated non-terrain objects.
- Keep mission definitions data-driven.
- Keep biology content separate from graphics.
- Version save files.
- Keep backend submission optional during local development.
- Add development diagnostics and performance instrumentation.

---

# 21. Performance Requirements

Initial performance goals:

- Stable minimum of 30 FPS on the actual school iPad
- Prefer 60 FPS on modern desktop hardware
- Fast enough loading for normal classroom use
- Small bounded world
- Limited active chunks
- No mesh-per-block architecture
- Limited dynamic lights
- Shadows disabled or very limited initially
- No expensive post-processing in the first release
- Controlled particle counts
- Object pooling where useful
- Pause or reduce simulation when browser tab is backgrounded
- Avoid unnecessary React rerenders during gameplay

Performance must be tested on a real student iPad before the art and scope are expanded.

---

# 22. Autosave and Submission

## Candidate save data

- Save version
- Assignment ID
- Student first name
- Student last initial
- Current mission stage
- Completed objectives
- Placed structures
- Inventory/resources
- Hint usage
- Elapsed time
- Current score
- Final submission status

## Candidate submission payload

```ts
interface AssignmentSubmission {
  assignmentId: string;
  studentFirstName: string;
  studentLastInitial: string;
  score: number;
  completed: boolean;
  submittedEarly: boolean;
  elapsedSeconds: number;
  hintsUsed: number;
  objectivesCompleted: string[];
  objectivesMissing: string[];
  gameVersion: string;
  submittedAt: string;
}
```

## Reliability expectations

- IndexedDB autosave
- Recovery after reload
- Queue failed submissions
- Show clear submission status
- Allow retry
- Do not erase local work after a network failure
- Game remains playable without Google Apps Script during development

---

# 23. Testing Requirements

Codex should be instructed to implement and verify, not simply generate files.

## Automated tests

- Biology rule tests
- Scoring tests
- Mission progression tests
- Save/load tests
- Data migration tests
- Submission payload tests
- Submission failure and retry tests
- Input mapping tests where practical

## Manual testing

- iPad landscape layout
- Touch controls
- Browser reload recovery
- Backgrounding and returning to the app
- School network access
- Vercel deployment
- Google Apps Script submission
- Low-performance mode
- No-console-error pass
- Full assignment completion
- Early incomplete submission
- Continue-after-submit behavior

---

# 24. Recommended Implementation Phases

## Phase 0: Technical proof

Deliverables:

- Vite + TypeScript + React shell
- Babylon canvas
- Desktop movement
- Initial iPad touch controls
- Bounded voxel test room
- Place and remove test blocks
- Performance overlay
- Vercel deployment
- No biology content beyond placeholders

Exit criteria:

- Runs reliably on a real school iPad
- Touch controls are usable
- Architecture boundaries are clean
- No major performance issue

## Phase 1: Minimal cell-building vertical slice

Deliverables:

- One plant-cell construction chamber
- Cell wall
- Cell membrane
- Nucleus
- Mitochondrion
- Basic objective system
- Basic feedback
- Local autosave

Exit criteria:

- One short beginning-to-end mission is playable
- Structures affect a simple simulation state
- Reload recovery works

## Phase 2: Complete core organelle mission

Deliverables:

- Ribosomes
- Chloroplasts
- Central vacuole
- Cytoplasm rule
- Resource or assembly loop
- Activation rules
- Improved feedback
- Homeostasis challenge

## Phase 3: Classroom assignment layer

Deliverables:

- Student identification
- Timer or session pacing
- Scoring
- Current Assignment Grade
- Results breakdown
- Early submission
- Incomplete submission
- Continue playing

## Phase 4: Backend and resilience

Deliverables:

- Google Apps Script endpoint
- Google Sheets logging
- Submission retry queue
- Submission status UI
- Version tracking
- Offline/local fallback

## Phase 5: Polish and classroom testing

Deliverables:

- Art pass
- Audio pass
- Tutorial improvement
- Accessibility pass
- Localization preparation
- Performance optimization
- Teacher test mode
- Bug fixes from real classroom testing

---

# 25. Decisions Already Settled

The following should be treated as locked unless the user explicitly changes them:

1. The first voxel biology game will be **Build a Cell**.
2. The first release will focus on a **plant cell**.
3. The game will be browser-based and designed for school iPads.
4. The project will use Babylon.js, TypeScript, Vite, React, Zustand, IndexedDB, Google Apps Script/Sheets, and Vercel.
5. The world will be bounded rather than an infinite Minecraft clone.
6. The game will be mission-based and classroom-oriented.
7. Biology should be taught through construction and system behavior, not ordinary quiz interruptions.
8. Phaser remains reserved for separate 2D projects.
9. Performance on real school iPads is a hard constraint.
10. The final implementation should be developed in phases, beginning with a technical proof and then a vertical slice.

---

# 26. Recommendations That Are Not Yet Locked

These are strong current recommendations but still require confirmation:

1. Working title: **CellCraft: Build a Living Cell**
2. First-person perspective
3. Microscopic laboratory / construction-chamber framing
4. Major organelles as placeable voxel prefabs
5. Structural boundaries built with blocks
6. A 12–15 minute assignment
7. First name + last initial
8. Eight core plant-cell structures
9. Water-loss or drought as the final homeostasis challenge
10. No speed-based academic grading
11. Bright scientific voxel art
12. Early submission and incomplete accountability
13. Continue-playing option after submission
14. Three-level hint system
15. Numerical Current Assignment Grade

---

# 27. Remaining Product Questions

These should be resolved before a full implementation specification is handed to Codex.

## A. Learning scope

1. Which exact organelles are required in version one?
2. Are cytoplasm, cell wall, and cell membrane independently constructed or partly prebuilt?
3. How deep should organelle function simulation go?
4. Which misconceptions should the game explicitly target?
5. Should students compare plant and animal cells in the first release or later?
6. Is there any required alignment to a district standard, unit objective, quiz, or rubric?

## B. Game perspective and movement

1. First-person, third-person, or toggle?
2. Is jumping necessary?
3. Can the player fly in a construction mode?
4. Should there be fall damage? Current recommendation: no.
5. How much vertical navigation is appropriate on an iPad?
6. Should the player move freely inside the cell or build mostly from a platform around it?

## C. Construction model

1. Which structures are built block-by-block?
2. Which structures are placed as prefabs?
3. Can structures be moved after placement?
4. Can incorrect blocks be removed without penalty?
5. Are valid placements highlighted?
6. Does the student create the entire boundary or repair a partially completed cell?
7. How are interior and exterior placement rules communicated?

## D. Resource loop

1. How are materials obtained?
2. Is mining appropriate, or should collection use more biological language?
3. Should resources be finite?
4. Is there an inventory capacity?
5. Is there a crafting screen or direct assembly station?
6. Should gathering be educational, or mainly pacing?
7. How can the resource system avoid teaching inaccurate chemistry?

## E. Mission progression

1. What is the exact ordered objective sequence?
2. Are objectives linear or partially open?
3. Can students complete structures in different orders?
4. What unlocks the next stage?
5. What happens if the student becomes stuck?
6. Does the game include a tutorial mission before the graded mission?
7. Is there a sandbox after completion?

## F. Homeostasis challenge

1. Which challenge best matches the current curriculum?
2. Drought/hypertonic environment?
3. Hypotonic environment?
4. Energy shortage?
5. Reduced light?
6. Membrane damage?
7. Toxin exposure?
8. Should the challenge have one correct response or multiple valid solutions?

## G. Duration and pacing

1. Target assignment duration: 10, 12, 15, or 20 minutes?
2. Is there a visible countdown timer?
3. Does time expire automatically?
4. Can the teacher configure the duration?
5. Is there a pause?
6. Can students resume in a later class period?
7. Should the final challenge begin at a fixed time or after build completion?

## H. Scoring and grading

1. Exact 100-point rubric
2. How much each structure is worth
3. Whether placement and activation are scored separately
4. Whether corrections restore points
5. Whether hint use affects the score
6. Whether resource waste affects the score
7. Whether time affects the score
8. How incomplete submissions are graded
9. Whether the teacher can modify rubric weights
10. What details are written to Google Sheets

## I. Feedback

1. How much text should appear at once?
2. Should feedback be presented by a guide character, HUD, or lab system?
3. Should incorrect placement be blocked or allowed with consequences?
4. Does the game explain the correct answer immediately?
5. Should students review all feedback at the end?
6. Should there be a short reflection question?

## J. Student identification and submission

1. First name + last initial, student ID, or both?
2. Assignment code required?
3. Class period selection?
4. Teacher name or course code?
5. Duplicate submission handling?
6. Can a student overwrite an earlier submission?
7. What happens if two students share the same name and initial?
8. Should the game store a local anonymous session ID?

## K. Teacher tools

1. Teacher test mode?
2. Skip mission stages?
3. Force-complete objective?
4. Reset a student save?
5. View the scoring breakdown in-game?
6. Configure timer and rubric?
7. Export or filter Google Sheets results?
8. A diagnostics page for device and browser compatibility?

## L. Visual direction

1. Exact art style reference
2. Degree of resemblance to Minecraft
3. Texture resolution
4. Organelles represented literally, symbolically, or as industrial machines
5. Laboratory versus microscopic-organic environment
6. Player avatar needed?
7. Guide character or no guide character?
8. Color and shape identity for each organelle
9. UI layout for 1024 × 768

## M. Audio and accessibility

1. Is narration useful?
2. Is text-to-speech needed later?
3. Font size targets
4. Reduced-motion mode
5. Colorblind-safe identifiers
6. Language support for first release
7. Accommodation settings
8. Whether hints should be more available for selected students

## N. Technical details

1. Existing repository or new repository?
2. Monorepo or single application?
3. Coding conventions
4. Test framework
5. Formatting and linting tools
6. Browser support floor
7. Asset pipeline
8. Google Apps Script endpoint security
9. Deployment environment variables
10. Error logging and analytics policy
11. Whether any student data restrictions apply
12. Whether the school requires a privacy review

---

# 28. Additional Technical Questions for Codex Planning

Before implementation, the coding agent should explicitly evaluate:

1. Whether the game truly needs general-purpose voxel chunks or only a fixed grid construction chamber.
2. Whether a fixed grid with instanced or merged geometry would be simpler and faster than a reusable Minecraft-like chunk engine.
3. Whether organelle prefabs should be Babylon meshes, glTF assets, or generated voxel assemblies.
4. How Babylon and React lifecycle boundaries will be managed.
5. How Zustand subscriptions will avoid frame-loop overhead.
6. How save data migrations will be handled.
7. How deterministic scoring will be kept separate from presentation state.
8. How touch controls will behave when the browser scrolls or changes orientation.
9. How the game will handle iOS browser memory limits.
10. How the game will preserve progress when the tab is suspended.
11. How to run automated tests without requiring a real Babylon canvas for all biology logic.
12. How to mock the Google Apps Script endpoint during development.

---

# 29. Recommended Next Planning Sequence

The next GPT instance should not immediately build the entire game.

Recommended sequence:

1. Read this document.
2. Restate the locked decisions.
3. Identify contradictions, missing assumptions, and the highest-risk open questions.
4. Interview the user in small groups of related decisions.
5. Update this decision record after each resolved group.
6. Produce a concise final product specification.
7. Produce a technical architecture specification.
8. Produce an implementation plan with acceptance criteria.
9. Only then prepare the Codex implementation handoff.
10. Begin with Phase 0 technical proof, not the complete game.

Suggested decision order:

1. Learning objectives and required structures
2. Perspective and construction model
3. Core loop and resource acquisition
4. Mission sequence and homeostasis challenge
5. Duration, feedback, scoring, and hints
6. Student submission and teacher workflow
7. Art, UI, accessibility, and localization
8. Technical architecture and implementation phases

---

# 30. Instructions for the Next GPT Work / GPT Sol Instance

- Treat settled decisions as locked.
- Clearly label recommendations versus confirmed requirements.
- Do not silently invent major gameplay rules.
- Ask focused questions rather than presenting a huge questionnaire at once.
- Preserve classroom usability and iPad performance as first-order constraints.
- Prefer a small polished vertical slice over broad feature coverage.
- Avoid turning the game into a quiz with a voxel skin.
- Avoid scientifically inaccurate resource recipes.
- Use the teacher's existing classroom-game patterns where they fit.
- Maintain this file as a living decision record.
- Do not begin full implementation until the user approves the resolved product specification.
- When code work begins, use a read → plan → implement → test workflow.

---

# 31. Definition of “Ready for Codex”

The project will be ready for a serious Codex coding handoff when the following are defined:

- Exact learning objectives
- Exact required structures
- Exact mission flow
- Exact player perspective
- Exact construction interactions
- Exact resource system
- Exact homeostasis challenge
- Exact controls
- Exact assignment duration
- Exact scoring rubric
- Exact feedback and hint rules
- Exact submission data
- Exact visual target
- Technical architecture
- Save schema
- Backend contract
- Performance acceptance criteria
- Testing plan
- Phase 0 and Phase 1 acceptance criteria
- Explicit non-goals

Until those are resolved, limited prototypes and technical experiments are appropriate, but broad production implementation is premature.
