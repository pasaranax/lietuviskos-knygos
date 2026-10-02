---
name: lithuanian-storybook
description: Create or continue original Lithuanian graded fiction, process existing Lithuanian books for the shared reader, and generate or repair Gemini narration by character with contextual emotions. Covers A2 language planning, Russian Frank-method annotations, reader integration and chapter delivery.
---

# Lithuanian storybook

This project skill owns book creation, source-book processing, annotations, narration and reader delivery. For original fiction, create engaging adult stories with deliberately controlled language: a simple language level does not require childish characters or simplistic conflicts. Default to Lithuanian A2 and Russian explanations for new fiction; preserve existing source books. Honor the user's level, scope and authorized stage.

## Start or resume

Read the book catalog and canonical book/planning state relevant to the request. Reuse the shared reader; do not create per-book HTML readers. Determine whether the request is for a concept, pilot, revision, continuation, source-book import, narration or reader work. Do the requested stage without generating the entire book prematurely. Do not ask again for already-authorized work.

For a new book, choose reversible defaults for missing details and state them briefly. Ask only about choices that materially change the experience and cannot be inferred. Do not treat an example premise as mandatory. Keep plots and learner-specific vocabulary out of this reusable skill.

Load only the references needed for the current stage:

- [language-and-reader.md](references/language-and-reader.md): language budgets, chapter length, stress marks, contextual Russian translations and full dictionary/grammar notes. Read before drafting or annotating text.
- [reader-delivery.md](references/reader-delivery.md): project structure, JSON contract, reader architecture, checks, publishing scope and chapter delivery. Read before integrating or delivering a book/chapter, or modifying the reader.
- [import-existing-book.md](references/import-existing-book.md): metadata, PDF text/cover extraction and source chapters. Read for existing-book imports; do not use the original-fiction planning loop to rewrite a source book.
- [gemini-narration.md](references/gemini-narration.md): persistent casting, contextual performance, synthesis, loudness, cached audio repair and sentence cuts. Read before voice work.

The fiction/world/genre rules below apply to original writing. Source imports and audio-only repairs preserve accepted text and use their relevant references.

## Everyday language and a recognizable world

Every story must primarily rehearse useful everyday Lithuanian: home, work, food, shopping, neighbors, transport, appointments, messages, requests, disagreements, and relationships. Revisit these situations for story reasons, with recurring phrases whose meaning changes naturally with context. A scene must advance character or events, not merely demonstrate a shopping dialogue.

Keep the world close to real contemporary life. Science fiction is limited to the near future; fantasy is limited to urban fantasy within an otherwise recognizable real world. Exclude distant space civilizations, epic fantasy worlds, invented races, and jargon-heavy systems under this brief. Speculative elements must be understandable through ordinary actions and must not displace the everyday lexical core.

## Optional setting and story modules

Select modules only from the user's current brief. No genre is enabled by default, and a past book's genre does not become a preference for future books. Read only selected files:

Setting: use contemporary reality by default (no extra file), or select one of:

- [Near-future science fiction](settings/near-future.md): familiar life with a limited technological change.
- [Urban fantasy](settings/urban-fantasy.md): familiar city life with a limited fantastic element.

Story and tone: select only what the current brief calls for:

- [Detective / Детектив](genres/detective.md): investigation and fair-play deductions; not mysticism.
- [Drama and everyday life](genres/drama.md): relationships, competing needs, and personal change.
- [Romance](genres/romance.md): developing intimacy and consequential relationship choices.
- [Comedy](genres/comedy.md): character-driven humor, escalation, and comic payoffs.

Modules are composable: near future plus drama need not contain a crime, suspects, or a reveal; romance plus comedy can share one storyline. Record each selected module's role in the brief: setting, central conflict, relationship arc, or tone. Apply its requirements only to that role. If modules pull in different directions, prioritize the user's intended experience and main story arc; do not force every module into an independent subplot. A trip or unexpected trouble can occur without a separate adventure module. Unlisted genres must still respect the everyday-language and recognizable-world requirements; do not expand the module catalog speculatively.

## Book state

Keep one canonical author dossier per book in the repository at `author-plans/<book-id>.md`, not in a temporary directory. Read it before continuing and update it after each accepted chapter. Keep `author-plans` excluded from the published site build and out of the reader/catalog; a public Git repository still exposes these files, and a raw local HTTP server may serve them directly. This is spoiler separation, not access control. The dossier contains:

- Brief: premise, tone, reader level, scope, protagonist's desire and personal stakes.
- Story arc: starting situation, central tension, character development, intended ending, timeline, and relevant world rules.
- Chapter map: goal, obstacle, decision, consequence, information revealed, and vocabulary targets.
- Language ledger: assumed/confirmed vocabulary, introduced forms, actual recurrence, and uncertainties.
- Continuity: accepted facts, character knowledge, unresolved threads, promises, and current revision state. Add genre-specific records only when required by selected modules.

Keep the dossier focused on the book's content and learning targets, not the agent's workflow. After each accepted chapter, reconcile it with the canonical text: distinguish established events from planned ones, update character knowledge and vocabulary recurrence, and resolve contradictions. Replace outdated planning state instead of accumulating old versions or a work log; Git preserves history.

Do not put agent instructions, local paths, commands, test or deployment reports, or cover-generation history in the dossier. Workflow rules belong in this skill and its references, not in the story plan.

This is planning metadata, not a second copy of the translated book. The user is the reader and wants to discover the story through reading. Keep the ending, causes of unexplained events, hidden motives, future turns, and clue payoffs out of chat, progress updates, filenames, covers, tooltips, and delivery summaries. Do not automatically open or offer a link to the author dossier. If a later explicit request asks for spoilers, provide only the requested scope. Resume from the dossier and canonical chapter text, not recollection alone.

When asked for a premise, give only the starting situation, protagonist's immediate concern, and opening disturbance, like a short back-cover blurb. Do not outline later chapters or explain what the story will turn out to mean. Designing the ending before prose is author work; it is not a reason to reveal it to the reader. A premise-only request does not require drafting a full chapter or finalizing a whole-book dossier.

## Writing loop

1. Design the ending and causal chapter outline before drafting prose. For a pilot, a compact whole-story skeleton is enough.
2. Draft one chapter within its lexical and grammatical budget. Prefer scenes, specific choices, conflicting desires, dialogue, and consequences over explanatory lectures.
3. Review story logic and reader knowledge. Repair the prose, not merely the outline.
4. Review Lithuanian and Russian in context. Stress-mark verified source chunks, then segment and annotate using the reader contract.
5. Validate the actual delivered text and inspect it in the reader. Update the dossier with actual vocabulary and narrative developments.
6. For a completed chapter, generate and verify its narration using the established cast, then deliver it according to [reader-delivery.md](references/reader-delivery.md) and the user's current scope. A draft-only, local-only or skill-only request keeps that limit.

A pilot normally contains 700–900 Lithuanian words, a concrete situation that makes the protagonist matter, a meaningful action or decision, and a small payoff that establishes a reason to continue. That reason may be a relationship, ambition, journey, comic predicament, or question, according to the brief. These are adjustable editorial defaults, not CEFR standards. A short-story request may instead complete the whole arc.

Review scene goals, character agency, causal continuity, and whether the ending fulfills the opening's promise. Establish consequential limitations before relying on them. An ending-enabling workaround needs earlier setup and a believable cost; revise the premise if it contradicts a hard deadline or other established constraint. Keep translations and notes within the narrative knowledge available at that moment.

## Narration

Use Gemini TTS for new narration in this project. Keep one persistent voice per character plus a separate narrator; reuse accepted voices across chapters. The agent determines each line's emotional delivery from its context, while preserving the voice's age, timbre and normal pace. Author insertions inside dialogue belong to the narrator.

Read [gemini-narration.md](references/gemini-narration.md) before voice casting, synthesis or audio repairs. It defines the role plan, separate speech instructions, caching, loudness, sentence cuts and reader verification. Store book-specific casting and performance choices in `author-plans/<book-id>-voices.json`, not in this reusable skill.

## Causal and dialogue review

Before treating a draft or revision as finished, read the prose without the dossier. Check the consequential actions through **desire → reason to act now → action → result**. The reader must be able to infer these links from the scene; a motive written only in the plan does not repair the text. Everyday transitions can remain implicit when they are clear.

- A request for help needs a believable practical reason: a real load, limited time, occupied hands, needed knowledge, or another concrete benefit. If the purpose is company, hospitality, or a private conversation, let the character invite or ask for that. Do not invent helplessness or a pointless errand just to bring people together.
- Follow through on stated intentions. If a character says they are going somewhere, buying something, returning an object, or doing a job, show the relevant outcome, an obstacle, or an understandable change of plan. When a pretext or lie is intentional, give the reader evidence appropriate to the scene; do not let an accidental contradiction become unexplained characterization.
- Check who has important objects, who moves between places and why, elapsed time, and what each character knows. Reconcile established facts and open commitments in the book dossier after a revision; also review affected later scenes. Track what matters to choices or comprehension, not every routine gesture.
- Establish a new place through the entering character's experience: where it is, how they enter, and the layout or scale needed to understand later actions. An extraordinary feature needs an observable contrast and a plausible reaction. Keep explanations within the current scene's knowledge and avoid a tour of irrelevant lore.
- At the start of dialogue, after a pause or an intervening action, and when a third person joins, make the speaker clear with a name, a reporting clause, or a meaningful action next to the speech. Clear alternating exchanges do not need a tag on every line. Attribute speakers in an embedded story separately from the people reading it.
- Prefer simple actions that reveal attention, hesitation, an obstacle, or a decision. Keep hands and objects consistent with those actions. Avoid repetitive nodding, smiling, looking, and decorative gestures that identify a speaker but add no scene information. A2 permits short action sentences and ordinary reporting verbs; modest extra length is preferable to ambiguous speakers.

Repair weak links in the prose before validating language, annotations, and narration. A checklist or a corrected outline alone is not a repair.

## Delivery

Report the artifact, editorial findings, unresolved language uncertainty, and what was actually verified. Never equate valid JSON, an agent's confidence, or vocabulary-list coverage with certified A2 or guaranteed reader enjoyment. The pilot's reader feedback calibrates subsequent chapters; if the user authorized only the pilot, stop after delivering it. Skill-only requests produce the skill first.
