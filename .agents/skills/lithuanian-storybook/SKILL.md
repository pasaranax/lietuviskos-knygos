---
name: lithuanian-storybook
description: Create or continue Lithuanian graded fiction, process existing Lithuanian books for the shared reader, and generate or repair Gemini narration by character. Covers A2 language planning, Russian Frank-method annotations, reader integration and chapter delivery.
---

# Lithuanian storybook

Create engaging adult fiction with controlled language, or process existing books without rewriting their source. Default new fiction to Lithuanian A2 with Russian explanations. Honor the user's language level, canon, spoiler boundary and authorized stage: concept, pilot, draft, revision, continuation, import, narration or reader work. Reuse the shared reader rather than making per-book HTML readers. Read the relevant catalog, canonical text and author dossier before continuing.

## Guidance and scope

Reader feedback and directorial wishes describe the desired experience. Infer their purpose and retain authorial judgment; illustrative incidents, wording, numbers and emotional comparisons do not automatically become laws. Explicit task limits and established canon remain binding. When saving feedback, preserve its scope and distinguish a requirement from an example or editorial suggestion. Update existing guidance instead of accumulating overlapping prohibitions. Book-specific preferences belong in the book's dossier.

For a new book, choose reversible defaults for minor missing details. Ask only when an unresolved choice materially changes the experience, scope or cost. Do not generate beyond the requested stage. Existing-book imports and audio-only repairs preserve accepted text; fiction guidance is not permission to rewrite it.

Read the references relevant to the current work:

- [language-and-reader.md](references/language-and-reader.md): A2 budgets, short chapters, stress marks, phrase segmentation, contextual Russian translation and full local dictionary/grammar notes. Read before drafting or annotating.
- [reader-delivery.md](references/reader-delivery.md): project structure, JSON contract, reader checks and publishing. Read before integration, delivery or reader changes.
- [import-existing-book.md](references/import-existing-book.md): source metadata, PDF text and cover extraction. Read for imports.
- [gemini-narration.md](references/gemini-narration.md): persistent casting, performance, synthesis, caching, loudness and verified audio cuts. Read before voice work.
- [narrative-design.md](references/narrative-design.md): contrasting external fiction and ways to examine its dramatic choices. Use when invention keeps returning to familiar patterns.

## Language, world and optional genres

Useful everyday Lithuanian is the lexical core: home, work, transport, messages, food, appointments, requests, disagreements and relationships. Vocabulary and constructions may recur naturally; earlier characters and events may return with consequences. This does not require reenacting their scenes. Choose the story before fitting vocabulary practice to it.

Keep the world recognizable through ordinary life. Near-future science fiction and fantasy within familiar contemporary life are supported; distant space civilizations, epic fantasy worlds, invented races and jargon-heavy systems are excluded under the learning brief. A fictional European country, countryside or travelling life is compatible with this purpose. Speculative elements should be understandable through ordinary actions without replacing the everyday lexical core.

Text in Lithuanian does not require every character to be Lithuanian. In a fictional European setting, use the full range of European names, including Lithuanian ones, with consistent Lithuanian inflection and Russian rendering. Preserve established names and the book's actual setting.

Select setting and genre modules only from the current brief; a previous book's genre is not a default for the next:

- [Near future](settings/near-future.md): familiar life affected by technology.
- [Fantasy in everyday life](settings/urban-fantasy.md): recognizable life with a fantastic element.
- [Detective / Детектив](genres/detective.md): investigation, with fair-play deduction when that form is chosen.
- [Drama](genres/drama.md): relationships and competing needs.
- [Romance](genres/romance.md): intimacy and consequential relationship choices.
- [Comedy](genres/comedy.md): character-driven humor and comic tension.

Modules offer relevant craft guidance, not obligatory subplot or pilot templates. Record their role in the brief and apply them to that role. Unlisted genres can be used within the language and world brief; no extra module is required for a journey or unexpected trouble.

## Canonical book state and spoilers

Keep one author dossier at `author-plans/<book-id>.md`. It contains the brief, world rules, intended arc, current chapter planning, language ledger, accepted events, character knowledge and unresolved threads. Use the detail the book needs; a chapter map is planning support rather than a form every scene must fill. Distinguish established events from proposed ones, reconcile the dossier after accepted chapters or revisions, and replace obsolete plans instead of accumulating a work log. Keep workflow instructions, commands and deployment reports outside the dossier.

The canonical reviewed reader text is `books/<book-id>.json`; private draft candidates may precede it. The dossier is planning metadata, not a second translation. Keep `author-plans` excluded from the site build and reader/catalog. Public Git and raw local servers can still expose these files; this separation is not access control.

The user is the reader. Keep future events, hidden causes, motives, endings and clue payoffs out of chat, progress updates, public metadata, covers and tooltips. Do not automatically open or link the dossier. A premise request gets the starting situation and opening disturbance, not a later chapter outline. A recap stays within the chapters the reader has authorized. Explicit spoiler requests apply only to their requested scope.

## Episode design and prose review

Before writing a new episode or substantially rewriting one, consider genuinely different constructions when the first idea resembles earlier work. There is no required number of sketches. Look beyond changing props: who initiates the encounter, whose goal drives it, how information emerges, what resists the characters and which choices matter. Practical service steps need not dictate the dramatic sequence. A pilot needs a reason to continue appropriate to the story, not a prescribed word count, miniature completed conflict or mandatory payoff.

Borrowing and adapting plot turns, conflict structures and event sequences from external fiction is allowed. Read useful scenes in context, then rebuild circumstances and causal links around this book's people, stakes and world. Absolute novelty is not required. Compare the adapted episode with this book's previous episodes and any explicitly named prior-book comparison in its dossier. A borrowed technique is an available choice, not a new formula.

The writer agent must create and save a compact causal skeleton in the book's author dossier before writing prose from it; review and repair it for logic, continuity and intelligibility. Preserve the saved skeleton, aligned with the accepted chapters, as the source of earlier-book context for the reader's teacher agent. It is the writer's pre-prose design, not a summary reconstructed from finished prose or excerpts retroactively extracted from a broader author plan. For existing books without such a saved skeleton, use clearly identified prose-derived summaries. Load this earlier context only on demand and restrict it to already-read chapters without hidden causes or future payoffs. Relevant questions include what each person wants, why they act now, how this encounter arises, which ordinary alternatives exist, and what the decision costs or changes. These are diagnostic questions, not a compulsory scene order. Account for competing goals and urgency: payment or something useful to do while waiting does not alone justify delaying an existing commitment. An ordinary or desperate problem can warrant specialist help without a magical cause; it may also be unsolvable. Do not manufacture helplessness or grant a convenient new power to repair a weak premise.

Use `compound-writing:cw-draft` for drafting and `compound-writing:cw-dev-edit` plus `compound-writing:cw-reader` for the expanded prose, reading their instructions before applying them. Additional writing skills are optional according to the problem. Complete the causal and reader reviews and repair the actual text before paying for narration. A sound outline is not evidence that its links survived expansion or received enough space.

Read the prose as a first-time reader without the dossier. The scene should support consequential actions through motivated behavior, details, reactions and results. Check the information needed to follow the present action: important objects and their provenance, movement, elapsed time, speaker identity, character knowledge, stated intentions and affected later scenes. Leave ordinary transitions implicit when clear. Preserve deliberate mystery about hidden causes without obscuring what is happening now.

Show what the reader needs to understand through the narrative. Do not restate facts already evident, add needless explanatory questions, or make characters recite world rules. Direct explanation is useful when a character genuinely needs it and it serves the encounter. Keep unused mechanics in the dossier. A consequential message must convey enough meaning to support the resulting choice.

Compare new and earlier episodes by their dramatic construction and emotional progression, including repeated gestures and chapter endings. Summaries stripped of names and props can reveal a reused skeleton. If repetition is unintentional, change the construction rather than only its decoration. Service routines and intentional motifs can recur; motifs should develop or change meaning. Recurring words need no recurring context.

## Adult stakes, rhythm and wonder

Simple language does not require childish conflicts. Choose stakes and intensity appropriate to the story. Characters may fail, hurt each other, lose something important or face deliberate cruelty; earned consequences should affect later choices rather than vanish through an easy reset. Suspense should follow coherent goals, opportunities and knowledge, not arbitrary stupidity. Natural profanity and threats are available when the voice and situation warrant them, with register explained in Russian notes. No quota of danger, losses or profanity is needed.

Use connected sentences and naturally developed dialogue with clear clauses, familiar vocabulary and ordinary conjunctions. Vary sentence length for rhythm; brief replies can carry a specific beat, but chains of miniature sentences should not be the default. Avoid both artificial fragmentation and padding or tangled syntax added to make sentences longer. Short tooltips support the prose without determining its sentence length. Humor comes from character, situation and differing reactions rather than stock quips or laughter announcing a joke. Speaker tags and actions should aid clarity, not supply repetitive decorative gestures.

When magic acts consequentially, let the reader perceive its action, the concrete change and an appropriate reaction. Connect the sensory expression to this person, object and event instead of repeating the same glow or dust. Its scale and duration follow canon and purpose; neither a temporary patch nor a small visual flourish is the default result. Visible details do not grant new powers or erase costs. Establish limitations before relying on them, while leaving the mechanism unexplained where the book calls for mystery.

Orient the reader in extraordinary spaces when needed through movement, scale or a relation to the ordinary exterior. An impossible interior should remain imaginable in its established container without a repeated doorway explanation at every visit. Check additional requirements in the current book's dossier; they do not become requirements for other books.

Give books, including books inside the fiction, distinctive and inviting titles. Single words and names are possible. Consider alternatives when a title sounds interchangeable with existing ones; avoid a repeated title formula. A title need not summarize a client's problem or spell. Keep it accessible and free of spoilers, and preserve accepted titles unless revision is authorized.

## Length, narration and delivery

Preserve short beginner reading sessions using the book's recorded range and the language reference. Chapter length and episode extent are separate choices: develop an episode across natural chapter boundaries when needed, without automatically adding chapters, lengthening them or fixing a chapter count per customer. Consider removing, rearranging or changing material as well as expanding it. Chapters can follow overlapping threads or stop before an encounter resolves; a delivery batch does not define the arc.

After story review, check Lithuanian forms and stress in context, then segment and annotate under the reader contract. Validate and inspect the actual deliverable, update accepted book state, and narrate within the authorized scope. Connected passages can be reviewed together before synthesis and publication; do not lock the next chapter behind deployment of the previous one.

Use Gemini TTS and a persistent voice per character plus a narrator. Use the engine’s emotional acting capabilities, especially in direct speech. Determine audible emotion and intensity from character and scene while preserving identity and an intelligible natural baseline pace; restraint is a local performance choice, not a global ceiling. Author insertions inside dialogue belong to the narrator. Avoid fast voices or directions that accelerate speech; do not prescribe slow speech universally or regenerate accepted recordings solely for this guidance. Book-specific casting belongs in `author-plans/<book-id>-voices.json`. Reuse accepted audio and cached speech where valid, and verify actual spoken boundaries when recutting.

Follow the requested scope: draft-only, text-only, local-only and skill-only work stays there; complete chapter delivery otherwise includes narration and authorized publication as defined in the delivery reference. Stop at an authorized pilot rather than automatically expanding the book. Report the artifact and meaningful findings with the verification actually performed; structural validity and word-list coverage alone do not establish language readiness or reader enjoyment.
