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

Every story must primarily rehearse useful everyday Lithuanian: home, work, food, shopping, neighbors, transport, appointments, messages, requests, disagreements, and relationships. Repeat useful words and constructions across independently motivated scenes. Familiar characters, places and unresolved events can return; earlier choices should have later consequences when the story calls for them. This continuity does not require reenacting the earlier episode. Vocabulary recurrence is not a reason to repeat a dramatic construction, emotional progression or character gesture. A scene must advance character or events, not merely demonstrate a shopping dialogue.

Keep the world close to real contemporary life. Science fiction is limited to the near future; fantasy is limited to urban fantasy within an otherwise recognizable real world. Exclude distant space civilizations, epic fantasy worlds, invented races, and jargon-heavy systems under this brief. Speculative elements must be understandable through ordinary actions and must not displace the everyday lexical core.

## Names and cultural setting

The language of the text does not determine the nationality of every character. In an alternative world or fictional country inspired by Europe, draw naturally from the full range of European names, including Lithuanian ones. Do not impose a nationality quota, introduce characters merely to diversify names, or rename established people. Use consistent Lithuanian grammatical forms and Russian rendering; preserve the fictional setting instead of treating it as present-day Lithuania.

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

## Visible magic and extraordinary spaces

When a story includes magic, make consequential magical actions observable while they happen. Show a concrete, visually pleasing change in light, movement, material or space, and let the affected character notice or react. A later discovery of the finished result alone should not carry the scene's entire sense of wonder. Connect the image to the particular book, person or object; vary it between scenes instead of giving every spell the same dust or glow. Keep the prose concrete and accessible at the established language level. These sensory details express existing magic; they do not grant new powers, remove its limits or erase consequences.

For an extraordinary interior, periodically restore its relation to the ordinary exterior through an entering character's movement, a doorway, a visible street or a brief location phrase. At meaningful transitions and domestic actions, the reader should still picture the large room inside its small vehicle or other established container. Use these reminders where orientation is needed, without repeating the same explanation at every mention. Apply this principle to later chapters as well as the introduction. Review both visible action and spatial orientation before narration; keep unrevealed effects out of reader-facing discussion.

For `keliaujanti-biblioteka` (Mobilioji biblioteka), the reader requires at least one visually observable magical moment in **every chapter**, including later chapters. An impossible interior or an unfolding magical message can satisfy the rule when the reader actually sees the extraordinary detail in the scene; a promise that magic will happen later cannot. Track chapter coverage in the author dossier and complete this check before narration. This per-chapter minimum is specific to this book, not a default for unrelated fiction.

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

## Adult conflict, tension, and consequences

Keep original fiction adult in its conflicts and emotional consequences while controlling the language level. Apply the intensity appropriate to the current brief; a suspenseful story needs credible pressure, not a quota of deaths or catastrophes in every chapter.

- Give consequential scenes a concrete desire, an active obstacle, and something the protagonist can lose. Escalate through choices, opposed interests, time pressure, or information the reader understands. A threat must affect what characters do; suspense cannot depend on arbitrary stupidity or facts withheld only to manufacture a surprise.
- Let protagonists fail, make damaging mistakes, and suffer losses. Do not protect them because they are central characters. Lost money, damaged property, injury, broken trust, lost opportunities, and death can carry real weight when earned by the story. Show the aftermath and let it change later choices. Avoid a convenient refund, instant reconciliation, miraculous restoration, or other reset that erases the price of the scene.
- Allow antagonists to be cruel, manipulative, selfish, or vindictive. Give them motives, resources, and agency; they need not become reasonable when the protagonist explains the rules. Their actions and any retreat must follow from what they want, what they risk, and the established situation. Do not soften deliberate harm into a harmless misunderstanding just to secure a comfortable ending.
- Build sharp turns and confrontations from earlier setup. Make the spatial action, available objects, character knowledge, and opportunity to intervene clear enough that the reader can follow why harm occurs. Use moments of relief without dissolving unresolved danger or cancelling its consequences.
- Allow natural Lithuanian profanity, insults, and threats when they fit the character and situation. Simple A2 syntax can express anger and menace; do not force polite substitutes. Explain unfamiliar coarse words and their register in Russian notes. Choose force and frequency by voice and dramatic purpose, rather than putting a curse in every line.
- Earn humor through character, situation, and differing reactions. Avoid stock domestic quips and laughter used to tell the reader that a weak joke was funny. A failed joke may itself work through an unimpressed response, awkward silence, or the speaker's embarrassment and self-reproach. Use those reactions when they reveal the characters, not as a replacement formula for every joke.

Record meaningful losses and their continuing effects in the book dossier. Before narration, review whether the pressure is credible, the protagonist pays a real price where the scene calls for one, harmful characters act coherently, and any comic reaction is earned. Repair weak scenes in the actual prose.

## Connected prose and natural dialogue

For newly written chapters, use graceful, developed sentences with a natural literary rhythm. Do not build narration or dialogue from chains of very short, isolated sentences: this sounds mechanical and AI-like. Keep related actions, observations and reasons within a connected sentence, using ordinary Lithuanian conjunctions such as `ir`, `bet`, `o`, `nes`, `todėl`, `kai` and `jei` where their meaning fits.

Let a character express a complete thought in a naturally connected utterance instead of dividing it into abrupt miniature sentences. Vary sentence length for rhythm; brief replies or a short sentence may serve a specific emotion or dramatic beat, but must not become the default style. Preserve the established A2 level through familiar vocabulary, clear clauses and accessible grammar, not artificial sentence fragmentation. Avoid padding and tangled constructions added merely to make sentences longer. Review both narration and dialogue for this rhythm before narration.

Apply this style to new chapters and newly drafted passages. Do not rewrite accepted chapters or regenerate their audio solely to enforce it.

## Book titles

Give each original book, including a fictional book read inside the story, a distinctive title that creates curiosity and sounds like something a person would choose to read. A single word or a character's name is valid; length and poetic phrasing are not quality requirements. Before choosing, consider alternatives with different forms and compare them with existing titles. Avoid interchangeable wistful place metaphors and repeated profession-plus-season or similar formulas. Ground the title in the book's own identity without reducing it to a description of the customer's problem or magical effect. Keep Lithuanian accessible at the established level and preserve the spoiler boundary. Apply this guidance to new titles and authorized revisions; do not silently rename books in accepted text.

## Skeleton, reader clarity, and variation

Keep creative freedom within established canon, the agreed language level and explicit reader requirements. Treat suggested incidents, example lines and comparisons as clues to the desired experience unless the user explicitly makes them mandatory; do not copy their surface form into the story. Invent circumstances, choices, reactions and images that fit these particular people.

Before committing to a new episode or a substantial rewrite, explore several genuinely different scene concepts, usually three to five brief sketches. Vary what the participants want, what resists them, the decision and its cost; changing names, props, location or body posture does not create a new concept. Choose for character specificity, interest and fit with the ongoing story. Design the scene before fitting vocabulary recurrence to it, then adapt its expression to the language budget. These sketches are private author work, not spoilers to send to the reader.

For the chosen concept, write a compact causal skeleton: what each person wants, the trigger for this encounter, the ordinary alternatives, the reason to seek this particular specialist, the protagonist's decision, the time/cost agreement, and the consequence. Review and repair that skeleton for logic, continuity and reader comprehension before adding prose. This is an author step, not an instruction to reveal the outline or future turns to the reader.

After expanding it into prose, review the actual text again without the author dossier. Check both whether causal links survived expansion and whether there is enough concrete action, dialogue and explanation to make events understandable. A correct skeleton and elegant sentences do not establish that the scene explains itself. The reader is learning Lithuanian: important connections should be visible without reconstructing unstated facts or needing a Russian explanation afterwards. Clarify requests and consequential messages through their actual wording or a concrete summary and response; a bare 'she read the request' is insufficient when the request motivates the scene. Explain world rules when they help the reader understand the current action or choice, rather than listing every established restriction. Keep unused mechanics in the dossier until needed. Preserve deliberate mystery about hidden causes without obscuring what is happening now.

Compare new episodes with the already written ones for conflict, encounter, choices, source of resistance, type of sacrifice, emotional progression, start of reading, magical expression and result. Summarize the new scene and its closest predecessor without names or concrete props: if the same summary fits both, reconsider the concept rather than polishing its surface. Review recurring gestures by their function too; a new reason for the same familiar emotional cue may still produce déjà vu. Routine service steps can recur, but should not dictate every episode's order or dramatic focus. Intentional motifs need development or a changed meaning; useful repeated language needs no repeated scene.

For specialist or magical help, test ordinary solutions first. Establish why this person's actual need warrants the specialist's time; avoid manufacturing helplessness or a chain of arbitrary barriers to workers, transport or temporary workarounds. Serious everyday conflicts, relationships, bereavement and desperate requests can matter without a magical cause. A request need not be solvable. Preserve each book's powers and limits, and let lasting changes demonstrate magic's value where the brief calls for them rather than defaulting every effect to a temporary patch. Do not invent a new power merely to fix a weak premise. Read book-specific service, payment, sacrifice and postal rules in its canonical dossier; for `keliaujanti-biblioteka`, use `author-plans/keliaujanti-biblioteka.md`.

## Writing loop

1. Explore distinct concepts before settling on the ending and causal chapter outline. For a pilot, a compact whole-story skeleton is enough. Preserve room for character-driven discoveries during drafting; revise the outline and continuity when they improve the story.
2. Review the new passage's causal skeleton for logic, continuity, reader clarity, ordinary alternatives, time and meaningful variation; repair it before expansion.
3. Use `compound-writing:cw-draft` to draft one chapter within its lexical and grammatical budget, adding Lithuanian stress marks yourself as you write. Verify doubtful forms with dictionaries and accentuation rules; no automatic stress service is needed. Prefer scenes, specific choices, conflicting desires, dialogue, and consequences over explanatory lectures.
4. Use `compound-writing:cw-dev-edit` and `compound-writing:cw-reader` to review the expanded prose for story logic, reader knowledge, sufficient explanation, tension, consequences, variation and dialogue reactions. Read their instructions before applying them. For suspense or consequential character setbacks, consider `compound-writing:cw-hitchcock` and `compound-writing:cw-vonnegut`. Repair the prose, not merely the outline, before narration.
5. Review Lithuanian and Russian in context. Check both stress position and syllable accent (priegaidė) against the actual meaning and grammatical form, following [language-and-reader.md](references/language-and-reader.md), then segment and annotate using the reader contract.
6. Validate the actual delivered text and inspect it in the reader. Update the dossier with actual vocabulary and narrative developments.
7. For a completed chapter, generate and verify its narration using the established cast, then deliver it according to [reader-delivery.md](references/reader-delivery.md) and the user's current scope. A draft-only, local-only or skill-only request keeps that limit.

A pilot normally contains 700–900 Lithuanian words, a concrete situation that makes the protagonist matter, a meaningful action or decision, and a small payoff that establishes a reason to continue. That reason may be a relationship, ambition, journey, comic predicament, or question, according to the brief. These are adjustable editorial defaults, not CEFR standards. A short-story request may instead complete the whole arc.

Review scene goals, character agency, causal continuity, and whether the ending fulfills the opening's promise. Establish consequential limitations before relying on them. An ending-enabling workaround needs earlier setup and a believable cost; revise the premise if it contradicts a hard deadline or other established constraint. Keep translations and notes within the narrative knowledge available at that moment.

## Narration

Use Gemini TTS for new narration in this project. Keep one persistent voice per character plus a separate narrator; reuse accepted voices across chapters. The agent determines each line's emotional delivery from its context, while preserving the voice's age, timbre and normal pace. Author insertions inside dialogue belong to the narrator. This is educational audio: use a natural, clearly articulated pace that lets the learner follow the written text and understand the speech. Avoid fast voices and prompt directions that encourage faster delivery. Do not instruct every voice to speak slowly; preserve each character's natural baseline, including a slow or measured pace when it fits that character. Apply this rule to future narration without regenerating accepted audio merely to enforce it.

Read [gemini-narration.md](references/gemini-narration.md) before voice casting, synthesis or audio repairs. It defines the role plan, separate speech instructions, caching, loudness, sentence cuts and reader verification. Store book-specific casting and performance choices in `author-plans/<book-id>-voices.json`, not in this reusable skill.

## Causal and dialogue review

Before treating a draft or revision as finished, read the prose without the dossier. Check the consequential actions through **desire → reason to act now → action → result**. The reader must be able to infer these links from the scene; a motive written only in the plan does not repair the text. Everyday transitions can remain implicit when they are clear.

- A request for help needs a believable practical reason: a real load, limited time, occupied hands, needed knowledge, or another concrete benefit. If the purpose is company, hospitality, or a private conversation, let the character invite or ask for that. Do not invent helplessness or a pointless errand just to bring people together.
- Follow through on stated intentions. If a character says they are going somewhere, buying something, returning an object, or doing a job, show the relevant outcome, an obstacle, or an understandable change of plan. When a pretext or lie is intentional, give the reader evidence appropriate to the scene; do not let an accidental contradiction become unexplained characterization.
- Check who has important objects, who moves between places and why, elapsed time, and what each character knows. Reconcile established facts and open commitments in the book dossier after a revision; also review affected later scenes. Track what matters to choices or comprehension, not every routine gesture.
- Establish a new place through the entering character's experience: where it is, how they enter, and the layout or scale needed to understand later actions. An extraordinary feature needs an observable contrast and a plausible reaction. Keep explanations within the current scene's knowledge and avoid a tour of irrelevant lore.
- At the start of dialogue, after a pause or an intervening action, and when a third person joins, make the speaker clear with a name, a reporting clause, or a meaningful action next to the speech. Clear alternating exchanges do not need a tag on every line. Attribute speakers in an embedded story separately from the people reading it.
- Prefer simple actions that reveal attention, hesitation, an obstacle, or a decision. Keep hands and objects consistent with those actions. Avoid repetitive nodding, smiling, looking, and decorative gestures that identify a speaker but add no scene information. Use ordinary reporting verbs and integrate related actions into connected prose; clarity about the speaker matters more than brevity.

Repair weak links in the prose before validating language, annotations, and narration. A checklist or a corrected outline alone is not a repair.

## Delivery

Report the artifact, editorial findings, unresolved language uncertainty, and what was actually verified. Never equate valid JSON, an agent's confidence, or vocabulary-list coverage with certified A2 or guaranteed reader enjoyment. The pilot's reader feedback calibrates subsequent chapters; if the user authorized only the pilot, stop after delivering it. Skill-only requests produce the skill first.
