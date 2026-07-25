# Piro 20K Persistent Personalization Benchmark

## Purpose

The current associative-recall benchmark is useful as a low-level memory diagnostic, but it is not yet a test of personal intelligence. A random key/value episode can be solved as a lookup table: the values have no semantic relationship to one another, and the query does not require the model to infer an owner's policy, priorities, or way of thinking.

This benchmark is the first honest test of Piro's product thesis:

> Two identical models should become different owners' models through different interaction streams, then retain those differences in their own parameters after history and runtime state are removed.

The benchmark is designed for the current **20,047-parameter Ashfall CTM-10x** model. It measures relational personalization, not generic language ability.

## What the benchmark must test

A successful model must learn reusable relationships such as:

- hard constraints versus soft preferences;
- priorities and tradeoffs;
- exceptions to general rules;
- temporal conditions;
- workflow order;
- preferences that transfer to new objects and situations;
- corrections that refine an existing rule rather than replacing the whole model.

The answer to an evaluation prompt must not be a value copied from the teaching stream. It must require applying learned relations to a new combination of known concepts.

## Dataset concept: owner policy worlds

Each synthetic owner is generated from a small **policy graph**, not a bag of independent facts.

A policy world contains:

- **entities:** foods, activities, tools, destinations, tasks, people, and resources;
- **attributes:** ingredients, cost, time, effort, risk, urgency, category, and availability;
- **relations:** contains, substitutes-for, requires, conflicts-with, enables, precedes, and preferred-over;
- **policy rules:** choose, avoid, rank, defer, ask-first, or perform-next;
- **priorities:** an ordered or weighted preference hierarchy;
- **exceptions:** conditions under which the normal rule changes;
- **corrections:** owner feedback that clarifies scope, severity, or an exception.

The same semantic primitives appear across owners, but their policies differ. For example:

```text
Owner A:
  health constraint > speed > cost
  avoid dairy proteins, including casein and whey
  when time is short, choose the fastest safe option

Owner B:
  cost > speed
  dairy is acceptable
  when time is short, choose the cheapest option unless a deadline is urgent
```

The evaluation should ask about novel combinations such as a whey protein bar versus a hummus wrap before a meeting. Neither complete answer should appear in the teaching stream. The model must compose the learned constraint, priority, and situation.

## Teaching stream

Each owner receives a deterministic stream of 32–64 interaction episodes. An episode contains:

1. a situation;
2. two to four candidate actions or choices;
3. the owner's selected action;
4. an optional natural-language-style correction or explanation;
5. a consequence or follow-up that makes the rule relational.

Examples of teaching interactions:

```text
Situation: lunch before a meeting in 20 minutes.
Options: cheese sandwich | hummus wrap.
Owner choice: hummus wrap.
Correction: dairy proteins are not safe, even when the food looks vegetarian.
```

```text
Situation: a non-urgent errand with a cheap route and a fast route.
Options: cheap route | fast route.
Owner choice: cheap route.
Explanation: save time only when the deadline makes it important.
```

The stream should include positive examples, negative examples, corrections, and at least a few explicit exceptions. The model must not receive a serialized owner profile. It must infer the policy from interactions.

## Relational evaluation set

Each owner receives a held-out evaluation set with four probe families:

### 1. Novel combination

Known entities and known relations are recombined into a situation never seen during teaching.

### 2. Paraphrase and surface variation

The same semantic situation is expressed with a new template, ordering, or wording. This prevents memorizing exact strings.

### 3. Counterfactual owner pair

The same situation is shown to two owners whose policies conflict. A correct system must produce different owner-consistent choices.

### 4. Multi-hop policy reasoning

The answer requires at least two learned relations, for example:

```text
item contains ingredient
ingredient violates hard constraint
hard constraint outranks convenience
therefore reject item
```

The evaluation set must be split by **composition**, not just by random rows. Exact situations, complete answer strings, and complete relation chains must not leak from training into evaluation.

## Representation requirements

The current `memory_embedding` hashes whole observations. That is appropriate for testing a state boundary, but it destroys the shared structure required for relational generalization: `casein`, `whey`, `dairy`, and `unsafe` cannot share learnable coordinates if each complete sentence is independently hashed.

The new benchmark therefore needs a compositional representation with reusable coordinates for:

- entity identity;
- entity category;
- relation type;
- attribute value;
- polarity;
- priority or strength;
- temporal condition;
- rule scope;
- exception markers.

Surface text can remain readable for inspection, but the research input must preserve semantic factors. A whole-sentence hash must not be the only path into the model.

The first implementation may use a compact controlled vocabulary and structured packets rather than unrestricted tokenized English. That is intentional: at 20K parameters, we are testing whether Piro learns an owner's relational policy, not pretending to test broad language fluency.

## Evaluation conditions

Every owner is evaluated under the following conditions:

1. **Untouched:** the initial checkpoint, no owner interactions.
2. **History-only:** the initial checkpoint with the owner stream supplied as runtime context.
3. **Personalized:** owner updates applied, with history removed before evaluation.
4. **Restarted personalized:** owner updates applied, parameters saved, process terminated, weights reloaded, history removed, then evaluated.
5. **Reset control:** runtime state cleared and no owner weights applied.
6. **After-new-learning:** a second policy set is learned, then both old and new policies are tested.

The history-only condition prevents us from claiming weight-based personalization when the model is merely using a long prompt. The reset control separates durable parameters from transient working state.

## Metrics

### Primary metrics

- **Relational policy accuracy:** accuracy on held-out multi-hop and novel-combination probes.
- **Personalization gain:** personalized score minus untouched score.
- **Owner divergence:** accuracy on paired probes where two owners should choose different actions.
- **Restart retention:** restarted-personalized score divided by pre-restart personalized score.
- **Forgetting budget:** loss on validated old policies after learning a new policy set.

### Initial 20K greenlight target

These are first-pass research targets, not permanent product claims:

- at least **70%** accuracy on four-choice relational probes, versus a 25% random baseline;
- at least **20 percentage points** of personalization gain over the untouched checkpoint;
- at least **80%** accuracy on conflicting-owner paired probes;
- at least **90%** restart retention;
- no more than **10%** relative regression on previously validated policies after new learning.

A result is not considered a North Star pass if it only improves on direct recall, exact phrase matching, or prompts that reveal the owner's answer.

## What the 20K result would prove

A successful 20K run would not prove that Piro is a capable general chatbot. It would prove something more foundational and more relevant:

- a small CTM can infer an owner's policy from interaction;
- that policy transfers to novel relational situations;
- two identical initial models can become measurably different owners' models;
- the difference lives in independently persisted parameters;
- the learned behavior survives history removal and restart;
- continual learning can add policy without destroying prior policy beyond a bounded budget.

Only after this mechanism is demonstrated should Piro scale to the ~2M personalization research model, then to a 10M bounded-chat model, and eventually to the 256M product-scale target.

## What remains diagnostic, not headline

The existing associative-recall benchmark should remain as a low-level diagnostic for:

- state boundaries;
- delayed recall;
- reset semantics;
- serialization;
- runtime correctness.

It should not be presented as evidence that Piro has personal intelligence. A model that succeeds only at random key/value retrieval has demonstrated a memory primitive, not an owner's mind.
