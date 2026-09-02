# Product Discovery Doctrine

## Purpose

This doctrine defines how Praxis should help one person turn incomplete
product intent into progressively clearer product meaning without replacing the
subject, circumstances, or desired progress with a plausible invention.

It informs What's Next and future discovery-oriented Harnesses. It is not a
mandatory user workflow, a fixed Node taxonomy, or an implementation plan.

## Combined foundation

Praxis uses several product-design lenses together because none is a
complete anti-drift mechanism by itself.

- **First-principles discipline** separates supported facts, assumptions, and
  the fundamental reason a direction matters. It anchors the `why`, but cannot
  discover unstated user circumstances by deduction alone.
- **Jobs to Be Done** keeps the desired progress attached to the person and the
  circumstances in which that progress matters.
- **Why-How Laddering** controls movement between abstract meaning and concrete
  possibilities. Moving down one level must remain a `how` of the same parent;
  it is not permission to substitute a more familiar example.
- **Opportunity Solution Trees** require each possibility to trace to a parent
  opportunity and desired outcome. An orphaned solution is a distraction even
  when it sounds useful in isolation.
- **Double Diamond and design thinking** distinguish understanding and defining
  the problem from developing and testing solutions. Concrete output must not
  imply that discovery has already reached delivery.

## The Semantic Anchor

Each bounded discovery line maintains one effective Semantic Anchor. It is
derived from user statements, accepted Nodes, selected Resources, and explicit
corrections.

The Anchor records:

- **Subject:** what product, experience, capability, or situation is being
  created or changed;
- **Actor and circumstances:** who is trying to make progress, from what
  current situation, and under which relevant conditions;
- **Desired progress:** what the user most wants to become possible now;
- **Current product stage:** whether the line is discovering a direction,
  defining a product boundary, developing a possibility, or validating one;
- **Protected facts:** explicit meaning that later generations must not replace;
- **Unknowns:** material information that has not been supplied and cannot be
  safely inferred; and
- **Evidence:** the exact user statement, Node, or Resource supporting each
  retained fact.

An Unknown remains unknown. The Agent may propose several honest discovery
directions despite an Unknown, but it must not silently turn a generic example
into a user fact.

## Semantic movement

Every generation or revision declares one relative movement:

- **Up with Why:** expose a deeper motivation, pain, or product principle;
- **Down with How:** make the current meaning one useful level more concrete;
- **Across with Alternatives:** offer materially different ways to address the
  same parent opportunity; or
- **Stay and Refine:** improve the current meaning without changing its role or
  relative resolution.

Movement changes resolution or framing. It does not change the Subject, Actor,
circumstances, or Current product stage unless the user explicitly supplies or
accepts that change.

Analogy may inspire internal reasoning, but an analogy cannot become Candidate
content unless the user selected that domain as the real subject.

## Drift gate

Before returning a Candidate, the Harness checks five questions:

1. **Same subject:** Is this still about the selected product or situation?
2. **Same circumstances:** Does it preserve the known actor, starting state,
   and product stage?
3. **Same desired progress:** Does it help the user make the progress expressed
   by the current Anchor?
4. **Traceable parent:** Can the Agent state how this Candidate serves its
   parent opportunity or accepted origin?
5. **One-level movement:** Is the change an understandable Why, How,
   Alternative, or Refine step rather than an unexplained jump?

A Candidate that fails a gate is not repaired with more prose. The Agent either
returns a smaller supported possibility or asks one bounded clarification.

## Clarification boundary

Clarification is required when a requested semantic movement depends on a
material Unknown.

The question should identify the missing decision and offer two or three
concrete consequences. It should not ask the user to write a product brief or
know product-design terminology.

For example, when the user asks for a quickly testable version but has not named
the validation subject:

- use Praxis to shape and build Praxis itself;
- apply the direction to an existing software project; or
- create a domain-neutral interaction prototype.

The Harness recommends one only when the existing Anchor provides evidence for
that recommendation.

## Calibration from the first real What's Next Session

### Initial Explore

The initial idea named an AI-intensive project-management system, task
decomposition, heuristic guidance, continued execution, and GitHub integration.
The Agent returned five starting-value directions that remained within those
explicit subjects. The result was broadly aligned even though the user had not
yet identified the first value to pursue.

### First Refine

The user corrected Task Decomposition from generating smaller executable tasks
to controlling how much Context one person must understand at once. The Agent
correctly exposed a more fundamental product principle. The semantic movement
was upward with Why. Its broader scope was valid but should have been disclosed.

### Second Refine

The user asked for a quickly testable example. The Agent moved downward with How
but substituted an existing application's login feature and absorbed GitHub
Issue creation from a sibling direction. The structure of the ten-minute loop
was useful, but the content failed Same subject, Same circumstances, and
Traceable parent.

The correct response was not to invent a more concrete example. It was to ask
which real subject should carry the validation or, when supported by Context,
use Praxis's own creation as the dogfooding case.

## Harness adoption boundary

The always-loaded Harness should remain compact. It needs only to:

- construct or update the Semantic Anchor;
- label material Unknowns instead of filling them;
- select one semantic movement;
- apply the five-question Drift gate; and
- clarify when a requested movement lacks a supported subject or circumstance.

Detailed method explanations, examples, and evaluation evidence remain in this
document rather than expanding every Agent prompt.

## References

- [Aristotle's Logic — Stanford Encyclopedia of Philosophy](https://plato.stanford.edu/entries/aristotle-logic/)
- [Jobs to Be Done Theory — Christensen Institute](https://www.christenseninstitute.org/theory/jobs-to-be-done/)
- [Why-How Laddering — Interaction Design Foundation](https://ixdf.org/literature/topics/why-how-laddering)
- [Opportunity Solution Trees — Product Talk](https://www.producttalk.org/opportunity-solution-trees/)
- [The Origin of Opportunity Solution Trees — Product Talk](https://www.producttalk.org/opportunity-solution-tree-origin/)
- [The Double Diamond — Design Council](https://www.designcouncil.org.uk/resources/the-double-diamond/)
- [The Design Thinking Process — IDEO](https://designthinking.ideo.com/process)
