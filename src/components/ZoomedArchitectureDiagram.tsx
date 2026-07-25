"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

type DiagramKind =
  | "observation"
  | "embedding"
  | "initialize"
  | "attention"
  | "buildMemorySlots"
  | "summarizeSynchronization"
  | "getAttentionShape"
  | "queryProjection"
  | "keyProjection"
  | "valueProjection"
  | "relativeTimeBias"
  | "synchronizationBias"
  | "outputProjection"
  | "readGate"
  | "delta"
  | "residual"
  | "history"
  | "output"
  | "shouldHalt"
  | "weights"
  | "loadWeights"
  | "saveWeights"
  | "plasticity";

const details: Record<DiagramKind, { title: string; subtitle: string }> = {
  observation: {
    title: "Observation",
    subtitle: "The current multimodal input presented to Piro’s stateful model. PiroInput is the implementation-level data object behind this boundary.",
  },
  embedding: {
    title: "Embed",
    subtitle: "The transformation from Observation into the model’s numerical input signal.",
  },
  initialize: {
    title: "InitializeOrRetrieveState",
    subtitle: "The method that produces h₀ from the embedded input and internal weights.",
  },
  attention: {
    title: "Attention",
    subtitle: "The method that retrieves relevant history using content similarity, relative time, and CTM synchronization before gating the result into contextₖ.",
  },
  buildMemorySlots: {
    title: "BuildMemorySlots",
    subtitle: "Builds timestamped memory records from historical states and inputs so Attention has explicit retrieval candidates.",
  },
  summarizeSynchronization: {
    title: "SummarizeSynchronization",
    subtitle: "Compresses CTM synchronization signals into features that help form the current retrieval query.",
  },
  getAttentionShape: {
    title: "GetAttentionShape",
    subtitle: "Reads the configured attention width and head count, then derives d_head for scaled dot-product scores.",
  },
  queryProjection: {
    title: "QueryProjection",
    subtitle: "Projects the current state, input, and synchronization features into retrieval-query space.",
  },
  keyProjection: {
    title: "KeyProjection",
    subtitle: "Projects each memory slot into the key space used for content similarity matching.",
  },
  valueProjection: {
    title: "ValueProjection",
    subtitle: "Projects each memory slot into the value space returned by retrieval.",
  },
  relativeTimeBias: {
    title: "RelativeTimeBias",
    subtitle: "Turns each memory slot’s explicit age into an additive retrieval-score adjustment.",
  },
  synchronizationBias: {
    title: "SynchronizationBias",
    subtitle: "Turns compatibility between the current state and each memory slot into an auxiliary retrieval score.",
  },
  outputProjection: {
    title: "OutputProjection",
    subtitle: "Normalizes retrieval scores, combines the selected values, and maps the memory read into recurrent context space.",
  },
  readGate: {
    title: "ReadGate",
    subtitle: "Controls how strongly retrieved context is allowed to influence the next recurrent state update.",
  },
  delta: {
    title: "ComputeStateDelta",
    subtitle: "The method that computes the candidate state change deltaₖ from the current tick inputs.",
  },
  residual: {
    title: "ApplyGatedStateUpdate",
    subtitle: "The method that computes hₖ + gateₖ · deltaₖ and produces hₖ₊₁.",
  },
  history: {
    title: "UpdateHistory",
    subtitle: "The method that records the new state as the next temporal context.",
  },
  output: {
    title: "OutputHead",
    subtitle: "The readout method that runs after the recurrent loop exits and produces outputₖ from hₖ₊₁.",
  },
  shouldHalt: {
    title: "ShouldHalt",
    subtitle: "The control method that chooses whether to continue the recurrent loop or exit.",
  },
  weights: {
    title: "Weights",
    subtitle: "A typed runtime object whose tensor groups belong to the methods that consume or update them.",
  },
  loadWeights: {
    title: "LoadWeights",
    subtitle: "Reads one committed weight snapshot, validates its schema and tensor shapes, then reconstructs the runtime weights object.",
  },
  saveWeights: {
    title: "SaveWeights",
    subtitle: "Validates and serializes updated weights into an immutable snapshot, then atomically publishes it for the next inference.",
  },
  plasticity: {
    title: "PlasticityController",
    subtitle: "The model-internal method that derives learning signals from the completed state and persists the weight update without returning a value.",
  },
};

function Box({
  x,
  y,
  width,
  height,
  title,
  detail,
  tone = "green",
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  detail?: string;
  tone?: "green" | "blue" | "violet" | "orange";
}) {
  const colors = {
    green: { fill: "rgb(21 42 34 / 0.9)", stroke: "rgb(110 231 183 / 0.68)" },
    blue: { fill: "rgb(23 35 43 / 0.9)", stroke: "rgb(125 211 252 / 0.68)" },
    violet: { fill: "rgb(44 25 43 / 0.9)", stroke: "rgb(192 132 252 / 0.68)" },
    orange: { fill: "rgb(57 39 24 / 0.9)", stroke: "rgb(253 186 116 / 0.72)" },
  }[tone];

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx="20" fill={colors.fill} stroke={colors.stroke} strokeWidth="2" />
      <text x={x + 18} y={y + 34} fill="#fff7ed" fontSize="17" fontWeight="650">{title}</text>
      {detail && <text x={x + 18} y={y + 62} fill="rgb(253 230 138 / 0.72)" fontSize="12">{detail}</text>}
    </g>
  );
}

function Arrow({
  d,
  color = "rgb(251 191 36 / 0.72)",
  dashed = false,
  marker = "gold",
}: {
  d: string;
  color?: string;
  dashed?: boolean;
  marker?: "gold" | "blue" | "orange" | "violet" | "green";
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeDasharray={dashed ? "8 7" : undefined}
      markerEnd={`url(#zoom-arrow-${marker})`}
    />
  );
}

function ObservationDiagram() {
  return (
    <svg viewBox="0 0 1200 860" className="mx-auto block h-auto w-full min-w-[760px]" role="img" aria-label="Observation stateful multimodal input API">
      <defs>
        <marker id="zoom-arrow-gold" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
        <marker id="zoom-arrow-blue" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
        <marker id="zoom-arrow-orange" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
        <marker id="zoom-arrow-violet" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(192 132 252 / 0.72)" /></marker>
        <marker id="zoom-arrow-green" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(110 231 183 / 0.72)" /></marker>
      </defs>

      <text x="36" y="38" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">STATEFUL OBSERVATION REQUEST</text>
      <text x="36" y="72" fill="rgb(253 230 138 / 0.72)" fontSize="15">A session selects Piro’s persistent runtime; this request describes the current turn.</text>

      <rect x="36" y="116" width="1128" height="492" rx="28" fill="rgb(16 12 10 / 0.55)" stroke="rgb(251 191 36 / 0.2)" strokeWidth="2" strokeDasharray="8 8" />
      <text x="64" y="152" fill="rgb(251 191 36 / 0.64)" fontSize="12" letterSpacing="2">REQUEST BODY · JSON-LIKE API SHAPE</text>

      <rect x="64" y="182" width="816" height="388" rx="24" fill="rgb(23 35 43 / 0.18)" stroke="rgb(125 211 252 / 0.62)" strokeWidth="2" strokeDasharray="8 7" />
      <text x="92" y="218" fill="rgb(125 211 252 / 0.9)" fontSize="20" fontWeight="650">parts</text>
      <text x="168" y="218" fill="rgb(125 211 252 / 0.55)" fontSize="13">array of multimodal input items</text>

      <Box x={92} y={246} width={224} height={90} title="Text" detail="the user’s current turn" tone="green" />
      <Box x={348} y={246} width={224} height={90} title="Image" detail="photo · screenshot · frame" tone="violet" />
      <Box x={604} y={246} width={224} height={90} title="Audio" detail="speech · sound · recording" tone="blue" />
      <Box x={92} y={366} width={224} height={90} title="Video" detail="short temporal evidence" tone="orange" />
      <Box x={348} y={366} width={224} height={90} title="File / document" detail="PDF · code · structured data" tone="blue" />
      <Box x={604} y={366} width={224} height={90} title="Environment event" detail="browser · game · sensor" tone="orange" />
      <Box x={348} y={486} width={224} height={64} title="Tool result" detail="fresh output from an action" tone="violet" />

      <Box x={920} y={286} width={208} height={124} title="metadata" detail="mime · timestamp · source" tone="green" />
      <text x="920" y="438" fill="rgb(110 231 183 / 0.62)" fontSize="13">request-level context</text>

      <Arrow d="M472 570V654" marker="blue" color="rgb(125 211 252 / 0.72)" />
      <Arrow d="M1024 410V520H728V654" marker="green" color="rgb(110 231 183 / 0.72)" />
      <text x="472" y="632" fill="rgb(125 211 252 / 0.66)" fontSize="13" textAnchor="middle">parts</text>
      <text x="840" y="508" fill="rgb(110 231 183 / 0.66)" fontSize="13" textAnchor="middle">metadata</text>

      <Box x={450} y={654} width={300} height={96} title="Observation" detail="normalized PiroInput packet" tone="orange" />
      <text x="600" y="800" fill="rgb(251 191 36 / 0.62)" fontSize="13" textAnchor="middle">the single input object consumed by the model for this turn</text>
    </svg>
  );
}

function EmbeddingDiagram() {
  return (
    <svg viewBox="0 0 1200 900" className="mx-auto block h-auto w-full min-w-[760px]" role="img" aria-label="Observation to CTM input embedding architecture">
      <defs>
        <marker id="zoom-arrow-gold" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
        <marker id="zoom-arrow-blue" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
        <marker id="zoom-arrow-orange" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
        <marker id="zoom-arrow-violet" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(192 132 252 / 0.72)" /></marker>
        <marker id="zoom-arrow-green" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(110 231 183 / 0.72)" /></marker>
      </defs>

      <text x="36" y="38" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">OBSERVATION → CTM INPUT SIGNAL</text>
      <text x="36" y="72" fill="rgb(253 230 138 / 0.72)" fontSize="15">Embedding is the translation layer from the multimodal API object into neural state dynamics.</text>

      <Box x={36} y={146} width={260} height={120} title="Observation" detail="normalized PiroInput packet" tone="orange" />
      <Arrow d="M296 206H380" marker="gold" />
      <text x="338" y="190" fill="rgb(251 191 36 / 0.62)" fontSize="12" textAnchor="middle">split by type</text>

      <rect x="380" y="108" width="438" height="540" rx="28" fill="rgb(23 35 43 / 0.18)" stroke="rgb(125 211 252 / 0.62)" strokeWidth="2" strokeDasharray="8 7" />
      <text x="410" y="146" fill="rgb(125 211 252 / 0.9)" fontSize="20" fontWeight="650">Modality-specific encoders</text>
      <text x="410" y="174" fill="rgb(125 211 252 / 0.55)" fontSize="13">Each input type gets the frontend it needs.</text>

      <Box x={410} y={202} width={180} height={76} title="Text encoder" detail="tokens → vectors" tone="green" />
      <Box x={608} y={202} width={180} height={76} title="Image encoder" detail="pixels → features" tone="violet" />
      <Box x={410} y={302} width={180} height={76} title="Audio encoder" detail="waveform → features" tone="blue" />
      <Box x={608} y={302} width={180} height={76} title="Video encoder" detail="visual + time" tone="orange" />
      <Box x={410} y={402} width={180} height={76} title="File encoder" detail="document / code" tone="blue" />
      <Box x={608} y={402} width={180} height={76} title="Environment encoder" detail="events → features" tone="orange" />
      <Box x={410} y={502} width={180} height={76} title="Tool-result encoder" detail="structured output" tone="violet" />
      <Box x={608} y={502} width={180} height={76} title="Metadata encoder" detail="time · source · order" tone="green" />

      <Arrow d="M599 648V704" marker="blue" color="rgb(125 211 252 / 0.72)" />
      <Arrow d="M599 704H884" marker="gold" />
      <text x="599" y="684" fill="rgb(125 211 252 / 0.66)" fontSize="13" textAnchor="middle">align modality features</text>

      <Box x={884} y={650} width={280} height={112} title="Shared Piro representation" detail="aligned multimodal vectors + markers" tone="green" />
      <Arrow d="M1024 762V820" marker="orange" color="rgb(253 186 116 / 0.76)" />
      <Box x={884} y={820} width={280} height={72} title="CTM input signal" detail="numerical currents / features" tone="orange" />

      <text x="36" y="744" fill="rgb(253 230 138 / 0.62)" fontSize="13">The output preserves modality boundaries, ordering, timing, and provenance so the CTM can reason over the whole turn.</text>
    </svg>
  );
}

function OutputDiagram() {
  return (
    <svg viewBox="0 0 1100 620" className="mx-auto block h-auto w-full min-w-[720px]" role="img" aria-label="Piro output architecture">
      <defs>
        <marker id="zoom-arrow-gold" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
        <marker id="zoom-arrow-blue" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
        <marker id="zoom-arrow-orange" markerWidth="10" height="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
      </defs>
      <text x="36" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">STATEFUL CTM → OUTPUT</text>
      <text x="36" y="76" fill="rgb(253 230 138 / 0.72)" fontSize="15">One internal model state can drive several output interfaces.</text>
      <Box x={48} y={224} width={230} height={118} title="Stateful CTM" detail="shared internal activity" tone="green" />
      <Arrow d="M278 283H430" marker="gold" />
      <Box x={430} y={224} width={230} height={118} title="Output" detail="select and format a response" tone="orange" />
      <Arrow d="M660 283H820" marker="orange" color="rgb(253 186 116 / 0.76)" />
      <rect x="820" y="150" width="230" height="300" rx="24" fill="rgb(23 35 43 / 0.18)" stroke="rgb(125 211 252 / 0.62)" strokeWidth="2" strokeDasharray="8 7" />
      <text x="850" y="188" fill="rgb(125 211 252 / 0.9)" fontSize="18" fontWeight="650">Output forms</text>
      <Box x={850} y={214} width={170} height={62} title="Text" detail="tokens" tone="green" />
      <Box x={850} y={294} width={170} height={62} title="Tool" detail="structured call" tone="violet" />
      <Box x={850} y={374} width={170} height={62} title="Environment" detail="external action" tone="blue" />
      <text x="48" y="520" fill="rgb(253 230 138 / 0.62)" fontSize="13">The output head is an interface boundary, not a second reasoning core.</text>
    </svg>
  );
}

function LoadWeightsDiagram() {
  return (
    <svg viewBox="0 0 1200 620" className="mx-auto block h-auto w-full min-w-[820px]" role="img" aria-label="Piro LoadWeights validation and reconstruction flow">
      <defs>
        <marker id="load-weights-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.72)" /></marker>
      </defs>
      <text x="36" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">LOADWEIGHTS · SNAPSHOT → RUNTIME OBJECT</text>
      <text x="36" y="76" fill="rgb(253 230 138 / 0.72)" fontSize="15">LoadWeights never exposes a partial or unvalidated parameter set to inference.</text>
      <Box x={28} y={220} width={200} height={142} title="Committed snapshot" detail="bytes + revision + checksum" tone="orange" />
      <path d="M228 291H270" fill="none" stroke="rgb(125 211 252 / 0.72)" strokeWidth="2" markerEnd="url(#load-weights-arrow)" />
      <Box x={270} y={220} width={200} height={142} title="Read + parse" detail="canonical serialized envelope" tone="blue" />
      <path d="M470 291H512" fill="none" stroke="rgb(125 211 252 / 0.72)" strokeWidth="2" markerEnd="url(#load-weights-arrow)" />
      <Box x={512} y={220} width={200} height={142} title="Validate" detail="schema · shapes · finite values" tone="blue" />
      <path d="M712 291H754" fill="none" stroke="rgb(125 211 252 / 0.72)" strokeWidth="2" markerEnd="url(#load-weights-arrow)" />
      <Box x={754} y={220} width={200} height={142} title="Reconstruct" detail="typed tensors + group ownership" tone="blue" />
      <path d="M954 291H996" fill="none" stroke="rgb(125 211 252 / 0.72)" strokeWidth="2" markerEnd="url(#load-weights-arrow)" />
      <Box x={996} y={220} width={176} height={142} title="weights" detail="safe inference inputs" tone="green" />
      <text x="28" y="500" fill="rgb(253 230 138 / 0.62)" fontSize="13">Invalid schema, shape mismatch, checksum failure, or non-finite tensor values fail before the inference loop starts.</text>
    </svg>
  );
}

function SaveWeightsDiagram() {
  return (
    <svg viewBox="0 0 1200 680" className="mx-auto block h-auto w-full min-w-[820px]" role="img" aria-label="Piro SaveWeights serialization and atomic publication flow">
      <defs>
        <marker id="save-weights-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
      </defs>
      <text x="36" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">SAVEWEIGHTS · RUNTIME OBJECT → COMMITTED SNAPSHOT</text>
      <text x="36" y="76" fill="rgb(253 230 138 / 0.72)" fontSize="15">SaveWeights makes the update visible atomically: the next load sees the old snapshot or the new one, never a half-written file.</text>
      <Box x={28} y={214} width={190} height={150} title="active weights" detail="updated tensor groups" tone="green" />
      <path d="M218 289H258" fill="none" stroke="rgb(253 186 116 / 0.76)" strokeWidth="2" markerEnd="url(#save-weights-arrow)" />
      <Box x={258} y={214} width={190} height={150} title="Validate" detail="schema + shapes + finiteness" tone="blue" />
      <path d="M448 289H488" fill="none" stroke="rgb(253 186 116 / 0.76)" strokeWidth="2" markerEnd="url(#save-weights-arrow)" />
      <Box x={488} y={214} width={190} height={150} title="Canonicalize" detail="stable field order + checksum" tone="blue" />
      <path d="M678 289H718" fill="none" stroke="rgb(253 186 116 / 0.76)" strokeWidth="2" markerEnd="url(#save-weights-arrow)" />
      <Box x={718} y={214} width={190} height={150} title="Write temporary" detail="new revision + fsync" tone="orange" />
      <path d="M908 289H948" fill="none" stroke="rgb(253 186 116 / 0.76)" strokeWidth="2" markerEnd="url(#save-weights-arrow)" />
      <Box x={948} y={214} width={224} height={150} title="Atomic publish" detail="rename snapshot + advance current" tone="orange" />
      <path d="M1060 364V462H1080" fill="none" stroke="rgb(253 186 116 / 0.76)" strokeWidth="2" markerEnd="url(#save-weights-arrow)" />
      <Box x={894} y={462} width={278} height={112} title="next LoadWeights()" detail="reads the newly committed revision" tone="green" />
      <text x="28" y="540" fill="rgb(253 230 138 / 0.62)" fontSize="13">A failed validation or write leaves the previous committed revision active.</text>
    </svg>
  );
}

function WeightsDiagram() {
  return (
    <svg viewBox="0 0 1200 760" className="mx-auto block h-auto w-full min-w-[820px]" role="img" aria-label="Piro runtime weights schema and method ownership">
      <defs>
        <marker id="weights-schema-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
      </defs>
      <text x="36" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">WEIGHTS · TYPED GROUPS + METHOD OWNERSHIP</text>
      <text x="36" y="76" fill="rgb(253 230 138 / 0.72)" fontSize="15">Weights are a structured parameter object, not one flat blob: each group owns the tensors consumed by related methods.</text>
      <Box x={42} y={258} width={250} height={190} title="weights" detail="revision + architecture + tensor groups" tone="green" />
      <path d="M292 332H350" fill="none" stroke="rgb(251 191 36 / 0.72)" strokeWidth="2" markerEnd="url(#weights-schema-arrow)" />
      <Box x={350} y={142} width={340} height={166} title="attention" detail="modelWidth · headCount · Query/Key/Value · time/sync bias · readGate · outputProjection" tone="blue" />
      <Box x={350} y={364} width={340} height={166} title="state" detail="initialization · delta · update gate · recurrent state transforms" tone="violet" />
      <path d="M292 374H322V447H350" fill="none" stroke="rgb(251 191 36 / 0.72)" strokeWidth="2" markerEnd="url(#weights-schema-arrow)" />
      <path d="M292 374H322V225H350" fill="none" stroke="rgb(251 191 36 / 0.72)" strokeWidth="2" markerEnd="url(#weights-schema-arrow)" />
      <Box x={760} y={142} width={340} height={166} title="embedding + output" detail="Embed encoders and OutputHead readout tensors" tone="orange" />
      <Box x={760} y={364} width={340} height={166} title="plasticity" detail="fast/durable parameters + optimizer or eligibility state" tone="orange" />
      <path d="M690 225H730V225H760" fill="none" stroke="rgb(251 191 36 / 0.72)" strokeWidth="2" markerEnd="url(#weights-schema-arrow)" />
      <path d="M690 447H730V447H760" fill="none" stroke="rgb(251 191 36 / 0.72)" strokeWidth="2" markerEnd="url(#weights-schema-arrow)" />
      <text x="42" y="650" fill="rgb(253 230 138 / 0.62)" fontSize="13">For a linear transform, W has shape [outDim, inDim] and b has shape [outDim]; every consumer validates its boundary shape.</text>
    </svg>
  );
}

const methodDetails: Record<Exclude<DiagramKind, "observation" | "embedding" | "output" | "weights">, { input: string; output: string; relation: string; tone: "green" | "blue" | "orange" }> = {
  initialize: { input: "x + weights", output: "h₀", relation: "starts or retrieves the state for this input", tone: "blue" },
  attention: { input: "hₖ + historyₖ + x + k + weights", output: "contextₖ", relation: "retrieves relevant memory and gates it into the recurrent context", tone: "green" },
  buildMemorySlots: { input: "historyₖ + k", output: "memoryₖ", relation: "turns timestamped history entries into retrievable slots", tone: "green" },
  summarizeSynchronization: { input: "hₖ + historyₖ + weights", output: "syncFeaturesₖ", relation: "compresses CTM synchronization into query-side features", tone: "green" },
  getAttentionShape: { input: "weights", output: "modelWidth + headCount + d_head", relation: "derives the score-scaling dimension from attention configuration", tone: "blue" },
  queryProjection: { input: "hₖ + x + syncFeaturesₖ + weights", output: "queryₖ", relation: "maps the current situation into retrieval-query space", tone: "green" },
  keyProjection: { input: "memoryₖ + weights", output: "keysₖ", relation: "maps each memory slot into comparable key space", tone: "green" },
  valueProjection: { input: "memoryₖ + weights", output: "valuesₖ", relation: "maps each memory slot into returned information space", tone: "green" },
  relativeTimeBias: { input: "memoryₖ.age + weights", output: "timeBiasₖ", relation: "adjusts retrieval scores using explicit memory age", tone: "green" },
  synchronizationBias: { input: "hₖ + memoryₖ + weights", output: "syncBiasₖ", relation: "adjusts retrieval scores using dynamical compatibility", tone: "green" },
  outputProjection: { input: "contentScoresₖ + timeBiasₖ + syncBiasₖ + valuesₖ + weights", output: "contextₖ", relation: "normalizes retrieval scores, combines values, and projects the memory read into context space", tone: "green" },
  readGate: { input: "hₖ + x + contextₖ + weights", output: "readGateₖ", relation: "computes a feature-wise memory admission gate", tone: "green" },
  delta: { input: "hₖ + x + contextₖ + historyₖ + weights", output: "deltaₖ", relation: "computes the candidate state change", tone: "green" },
  residual: { input: "hₖ + deltaₖ + weights", output: "hₖ₊₁", relation: "computes hₖ + gateₖ · deltaₖ", tone: "green" },
  history: { input: "historyₖ + hₖ₊₁ + x + k", output: "historyₖ₊₁", relation: "records state, input, and tick metadata", tone: "blue" },
  shouldHalt: { input: "hₖ₊₁ + k + budget", output: "continue / exit", relation: "controls the recurrent loop or returns outputₖ", tone: "orange" },
  loadWeights: { input: "committed snapshot + schema", output: "validated runtime weights", relation: "reads, verifies, and reconstructs the parameter object used by inference", tone: "blue" },
  saveWeights: { input: "validated runtime weights", output: "committed snapshot", relation: "serializes a revision and atomically publishes it for the next inference", tone: "blue" },
  plasticity: { input: "hₖ₊₁", output: "persisted weight update", relation: "derives learning signals, updates active weights, and saves them without returning a value", tone: "orange" },
};

function MethodDiagram({ kind }: { kind: Exclude<DiagramKind, "observation" | "embedding" | "output" | "weights"> }) {
  const detail = methodDetails[kind];
  return (
    <svg viewBox="0 0 1200 620" className="mx-auto block h-auto w-full min-w-[760px]" role="img" aria-label={`${details[kind].title} method architecture`}>
      <defs>
        <marker id="zoom-arrow-gold" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
        <marker id="zoom-arrow-blue" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.7)" /></marker>
        <marker id="zoom-arrow-orange" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
      </defs>
      <text x="36" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">METHOD INVOCATION · EXPLICIT ARGUMENTS</text>
      <text x="36" y="76" fill="rgb(253 230 138 / 0.72)" fontSize="15">The incoming signals are the arguments; the outgoing signal is the method result.</text>
      <Box x={52} y={222} width={300} height={138} title="Arguments" detail={detail.input} tone="violet" />
      <Arrow d="M352 291H480" marker="gold" />
      <Box x={480} y={198} width={300} height={186} title={details[kind].title} detail={detail.relation} tone={detail.tone} />
      <Arrow d="M780 291H908" marker={detail.tone === "blue" ? "blue" : detail.tone === "orange" ? "orange" : "gold"} color={detail.tone === "blue" ? "rgb(125 211 252 / 0.72)" : detail.tone === "orange" ? "rgb(253 186 116 / 0.76)" : undefined} />
      <Box x={908} y={222} width={240} height={138} title="Result" detail={detail.output} tone={detail.tone} />
      <text x="52" y="520" fill="rgb(253 230 138 / 0.62)" fontSize="13">This is a zoomed-in contract view, not a claim that the implementation has one literal function per box.</text>
    </svg>
  );
}

function ObservationApiReference() {
  return (
    <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-2xl border border-orange-300/25 bg-orange-300/[0.05] p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-200/70">Proposed request contract</p>
        <p className="mt-2 text-sm leading-6 text-amber-200/65">
          The session identifies which persistent state to continue. The body is only the new observation for this turn.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-amber-900/30 bg-[#0b0908] p-4 text-[11px] leading-6 text-amber-100/80"><code>{`POST /v1/sessions/{session_id}/observe

{
  "parts": [
    { "type": "text", "text": "What is happening here?" },
    { "type": "image", "uri": "blob://...", "mime_type": "image/png" }
  ],
  "metadata": {
    "source": "ios",
    "captured_at": "2026-07-22T12:00:00Z"
  }
}`}</code></pre>
      </section>

      <section className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.05] p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-200/70">Accepted parts</p>
        <div className="mt-4 space-y-3 text-sm text-amber-100/80">
          <div><code className="text-emerald-200">text</code><span className="ml-3 text-amber-200/55">typed user input</span></div>
          <div><code className="text-fuchsia-200">image</code><span className="ml-3 text-amber-200/55">photo, screenshot, camera frame</span></div>
          <div><code className="text-sky-200">audio</code><span className="ml-3 text-amber-200/55">speech or sound recording</span></div>
          <div><code className="text-orange-200">video</code><span className="ml-3 text-amber-200/55">short temporal visual input</span></div>
          <div><code className="text-sky-200">file</code><span className="ml-3 text-amber-200/55">PDF, code, or document</span></div>
          <div><code className="text-amber-200">json</code><span className="ml-3 text-amber-200/55">structured environment data</span></div>
        </div>
      </section>
    </div>
  );
}

function PseudocodeView({ kind }: { kind: DiagramKind }) {
  const line = (children: ReactNode, className = "") => <div className={`whitespace-pre ${className}`}>{children}</div>;
  const variable = (children: string) => <span className="text-sky-200/90">{children}</span>;
  const methodLink = (label: string, slug: string) => <Link href={`/docs/architecture/${slug}`} className="text-emerald-300 underline decoration-emerald-500/40 underline-offset-4 transition hover:text-emerald-100">{label}</Link>;
  const keyword = (children: string) => <span className="text-orange-300">{children}</span>;
  const call = (label: string, slug: string) => <>{methodLink(label, slug)}(</>;
  const snippets: Record<DiagramKind, ReactNode> = {
    observation: line(<><span className="text-violet-300">PiroInput</span> = Observation()</>),
    embedding: line(<>{variable("x")} = {methodLink("Embed", "embedding")}(<Link href="/docs/architecture/observation" className="text-violet-300 underline decoration-violet-500/40 underline-offset-4">PiroInput</Link>)</>),
    initialize: line(<>{variable("h₀")} = {methodLink("InitializeOrRetrieveState", "initialize")}(x, weights)</>),
    attention: <>
      {line(<>{call("Attention", "attention")}</>)}
      {line(<>    hₖ,</>)}
      {line(<>    historyₖ,</>)}
      {line(<>    x,</>)}
      {line(<>    k,</>)}
      {line(<>    weights</>)}
      {line(<>):</>)}
      {line(<>    {variable("memoryₖ")} = {call("BuildMemorySlots", "buildMemorySlots")}</>)}
      {line(<>        historyₖ,</>)}
      {line(<>        k</>)}
      {line(<>    )</>)}
      {line(<>    {variable("syncFeaturesₖ")} = {call("SummarizeSynchronization", "summarizeSynchronization")}</>)}
      {line(<>        hₖ,</>)}
      {line(<>        historyₖ,</>)}
      {line(<>        weights</>)}
      {line(<>    )</>)}
      {line(<>    {variable("attentionShape")} = {call("GetAttentionShape", "getAttentionShape")}weights)</>)}
      {line(<>    {variable("d_head")} = attentionShape.d_head</>)}
      {line(<>    {variable("queryₖ")} = {call("QueryProjection", "queryProjection")}</>)}
      {line(<>        Normalize(Concatenate(hₖ, x, syncFeaturesₖ)),</>)}
      {line(<>        weights</>)}
      {line(<>    )</>)}
      {line(<>    {variable("keysₖ")} = {call("KeyProjection", "keyProjection")}</>)}
      {line(<>        memoryₖ,</>)}
      {line(<>        weights</>)}
      {line(<>    )</>)}
      {line(<>    {variable("valuesₖ")} = {call("ValueProjection", "valueProjection")}</>)}
      {line(<>        memoryₖ,</>)}
      {line(<>        weights</>)}
      {line(<>    )</>)}
      {line(<>    {variable("contentScoresₖ")} = queryₖ · keysₖᵀ / sqrt(d_head)</>)}
      {line(<>    {variable("timeBiasₖ")} = {call("RelativeTimeBias", "relativeTimeBias")}</>)}
      {line(<>        memoryₖ.age,</>)}
      {line(<>        weights</>)}
      {line(<>    )</>)}
      {line(<>    {variable("syncBiasₖ")} = {call("SynchronizationBias", "synchronizationBias")}</>)}
      {line(<>        hₖ,</>)}
      {line(<>        memoryₖ,</>)}
      {line(<>        weights</>)}
      {line(<>    )</>)}
      {line(<>    {variable("contextₖ")} = {call("OutputProjection", "outputProjection")}</>)}
      {line(<>        contentScoresₖ,</>)}
      {line(<>        timeBiasₖ,</>)}
      {line(<>        syncBiasₖ,</>)}
      {line(<>        valuesₖ,</>)}
      {line(<>        weights</>)}
      {line(<>    )</>)}
      {line(<>    {variable("readGateₖ")} = {call("ReadGate", "readGate")}</>)}
      {line(<>        hₖ,</>)}
      {line(<>        x,</>)}
      {line(<>        contextₖ,</>)}
      {line(<>        weights</>)}
      {line(<>    ))</>)}
      {line(<>    return readGateₖ ⊙ contextₖ</>)}
    </>,
    buildMemorySlots: <>
      {line(<>{call("BuildMemorySlots", "buildMemorySlots")}</>)}
      {line(<>    historyₖ,</>)}
      {line(<>    k</>)}
      {line(<>):</>)}
      {line(<>    memoryₖ = []</>)}
      {line(<>    for each entryₜ in historyₖ:</>)}
      {line(<>        slotₜ = {"{"}</>)}
      {line(<>            content: Concatenate(entryₜ.state, entryₜ.input),</>)}
      {line(<>            createdAt: entryₜ.tick,</>)}
      {line(<>            age: k - entryₜ.tick</>)}
      {line(<>        {"}"}</>)}
      {line(<>        memoryₖ.append(slotₜ)</>)}
      {line(<>    return memoryₖ</>)}
    </>,
    summarizeSynchronization: <>
      {line(<>{call("SummarizeSynchronization", "summarizeSynchronization")}</>)}
      {line(<>    hₖ,</>)}
      {line(<>    historyₖ,</>)}
      {line(<>    weights</>)}
      {line(<>):</>)}
      {line(<>    syncMatrixₖ = CorrelationMatrix(historyₖ.states)</>)}
      {line(<>    return SyncFeatureProjection(syncMatrixₖ, hₖ, weights)</>)}
    </>,
    getAttentionShape: <>
      {line(<>{call("GetAttentionShape", "getAttentionShape")}weights):</>)}
      {line(<>    modelWidth = weights.attention.modelWidth</>)}
      {line(<>    headCount = weights.attention.headCount</>)}
      {line(<>    assert modelWidth % headCount == 0</>)}
      {line(<>    d_head = modelWidth / headCount</>)}
      {line(<>    return modelWidth, headCount, d_head</>)}
    </>,
    queryProjection: line(<>{call("QueryProjection", "queryProjection")}queryInput, weights):</>),
    keyProjection: line(<>{call("KeyProjection", "keyProjection")}memoryₖ, weights):</>),
    valueProjection: line(<>{call("ValueProjection", "valueProjection")}memoryₖ, weights):</>),
    relativeTimeBias: line(<>{call("RelativeTimeBias", "relativeTimeBias")}age, weights):</>),
    synchronizationBias: line(<>{call("SynchronizationBias", "synchronizationBias")}hₖ, memoryₖ, weights):</>),
    outputProjection: <>
      {line(<>{call("OutputProjection", "outputProjection")}</>)}
      {line(<>    contentScoresₖ,</>)}
      {line(<>    timeBiasₖ,</>)}
      {line(<>    syncBiasₖ,</>)}
      {line(<>    valuesₖ,</>)}
      {line(<>    weights</>)}
      {line(<>):</>)}
      {line(<>    retrievalScoresₖ = contentScoresₖ + timeBiasₖ + syncBiasₖ</>)}
      {line(<>    retrievalWeightsₖ = softmax(retrievalScoresₖ)</>)}
      {line(<>    retrievedₖ = retrievalWeightsₖ · valuesₖ</>)}
      {line(<>    contextₖ = retrievedₖ · weights.attention.outputProjection.W</>)}
      {line(<>        + weights.attention.outputProjection.b</>)}
      {line(<>    return contextₖ</>)}
    </>,
    readGate: <>
      {line(<>{call("ReadGate", "readGate")}</>)}
      {line(<>    hₖ,</>)}
      {line(<>    x,</>)}
      {line(<>    contextₖ,</>)}
      {line(<>    weights</>)}
      {line(<>):</>)}
      {line(<>    gateInputₖ = Normalize(Concatenate(hₖ, x, contextₖ))</>)}
      {line(<>    gateLogitsₖ = gateInputₖ · weights.attention.readGate.W</>)}
      {line(<>        + weights.attention.readGate.b</>)}
      {line(<>    readGateₖ = sigmoid(gateLogitsₖ)</>)}
      {line(<>    assert Shape(readGateₖ) == Shape(contextₖ)</>)}
      {line(<>    return readGateₖ</>)}
    </>,
    delta: <>
      {line(<>{variable("deltaₖ")} = {call("ComputeStateDelta", "delta")}</>)}
      {line(<>    hₖ,</>)}
      {line(<>    x,</>)}
      {line(<>    contextₖ,</>)}
      {line(<>    historyₖ,</>)}
      {line(<>    weights</>)}
      {line(<>))</>)}
    </>,
    residual: line(<>{variable("hₖ₊₁")} = {call("ApplyGatedStateUpdate", "residual")}hₖ, gateₖ, deltaₖ)</>),
    history: <>
      {line(<>{variable("historyₖ₊₁")} = {call("UpdateHistory", "history")}</>)}
      {line(<>    historyₖ,</>)}
      {line(<>    hₖ₊₁,</>)}
      {line(<>    x,</>)}
      {line(<>    k</>)}
      {line(<>))</>)}
    </>,
    output: line(<>{variable("outputₖ")} = {call("OutputHead", "output")}hₖ₊₁)</>),
    shouldHalt: line(<>{keyword("if")} {call("ShouldHalt", "shouldHalt")}hₖ₊₁, k):</>),
    weights: <>
      {line(<>{variable("weights")} = {"{"}</>)}
      {line(<>    formatVersion: 1,</>)}
      {line(<>    revision: integer,</>)}
      {line(<>    architecture: {"{"}</>)}
      {line(<>        modelWidth, headCount, stateWidth, inputWidth, contextWidth</>)}
      {line(<>    {"}"},</>)}
      {line(<>    embedding: {"{"}</>)}
      {line(<>        encoder: {"{"} W, b, modalityTables {"}"},</>)}
      {line(<>    {"}"},</>)}
      {line(<>    attention: {"{"}</>)}
      {line(<>        modelWidth, headCount,</>)}
      {line(<>        queryProjection: {"{"} W, b {"}"},</>)}
      {line(<>        keyProjection: {"{"} W, b {"}"},</>)}
      {line(<>        valueProjection: {"{"} W, b {"}"},</>)}
      {line(<>        relativeTimeBias: {"{"} W, b {"}"},</>)}
      {line(<>        synchronizationBias: {"{"} W, b {"}"},</>)}
      {line(<>        readGate: {"{"} W, b {"}"},</>)}
      {line(<>        outputProjection: {"{"} W, b {"}"}</>)}
      {line(<>    {"}"},</>)}
      {line(<>    state: {"{"} initialization, delta, updateGate, outputHead {"}"},</>)}
      {line(<>    plasticity: {"{"} fast, durable, eligibility, optimizer {"}"}</>)}
      {line(<>{"}"}</>)}
      {line(<>For each linear layer: W = [outDim, inDim], b = [outDim]</>)}
      {line(<>For each tensor: dtype, shape, and finite numeric values are required</>)}
    </>,
    loadWeights: <>
      {line(<>{call("LoadWeights", "loadWeights")}():</>)}
      {line(<>    snapshot = ReadCommittedSnapshot("weights/current")</>)}
      {line(<>    assert snapshot.formatVersion == 1</>)}
      {line(<>    assert VerifyChecksum(snapshot.payload, snapshot.checksum)</>)}
      {line(<>    parsed = ParseCanonical(snapshot.payload)</>)}
      {line(<>    ValidateWeightSchema(parsed)</>)}
      {line(<>    ValidateTensorShapes(parsed, parsed.architecture)</>)}
      {line(<>    assert AllFiniteTensors(parsed)</>)}
      {line(<>    weights = ReconstructRuntimeWeights(parsed)</>)}
      {line(<>    return weights</>)}
    </>,
    saveWeights: <>
      {line(<>{call("SaveWeights", "saveWeights")}weights:</>)}
      {line(<>    ValidateWeightSchema(weights)</>)}
      {line(<>    ValidateTensorShapes(weights, weights.architecture)</>)}
      {line(<>    assert AllFiniteTensors(weights)</>)}
      {line(<>    nextRevision = ReadCurrentRevision() + 1</>)}
      {line(<>    payload = SerializeCanonical(weights)</>)}
      {line(<>    checksum = Hash(payload)</>)}
      {line(<>    snapshot = {"{"} formatVersion: 1, nextRevision, payload, checksum {"}"}</>)}
      {line(<>    WriteAndFsyncTemporary(snapshot)</>)}
      {line(<>    AtomicRenameTemporaryToRevision(nextRevision)</>)}
      {line(<>    AdvanceCurrentPointer(nextRevision)</>)}
      {line(<>    return nothing</>)}
    </>,

    plasticity: <>
      {line(<>{call("PlasticityController", "plasticity")}hₖ₊₁):</>)}
      {line(<>    predictionₖ = derive prediction from hₖ₊₁</>)}
      {line(<>    valueₖ = derive value from hₖ₊₁</>)}
      {line(<>    creditₖ = assign credit using historyₖ and hₖ₊₁</>)}
      {line(<>    weights = update plastic weights using predictionₖ, valueₖ, and creditₖ</>)}
      {line(<>    {call("SaveWeights", "saveWeights")}weights)</>)}
      {line(<>    return nothing</>)}
    </>,
  };
  return <div className="overflow-x-auto rounded-xl border border-amber-900/20 bg-[#0b0908] px-4 py-5 sm:px-6" role="region" aria-label={`${details[kind].title} pseudocode`}><code className="block min-w-[40ch] font-mono text-sm leading-6 text-amber-100/85 sm:min-w-[42rem] sm:text-[0.95rem]">{snippets[kind]}</code></div>;
}
const explanations: Partial<Record<DiagramKind, { doing: string; why: string }>> = {
  attention: { doing: "Builds a query from the current recurrent situation, scores timestamped memory slots with content similarity plus temporal and synchronization biases, then gates the retrieved context.", why: "Piro needs a real memory read: synchronization describes dynamical compatibility, while content keys and values retrieve what a prior state represented." },
  buildMemorySlots: { doing: "Converts each history entry into a memory slot containing state/input content, its write tick, and age = current tick − write tick.", why: "Attention needs explicit candidates and explicit temporal provenance; age should not appear as an unexplained property of memory." },
  summarizeSynchronization: { doing: "Summarizes CTM synchronization signals from the current state and historical trajectory into query-side features.", why: "CTM dynamics should influence retrieval without replacing semantic content matching." },
  getAttentionShape: { doing: "Reads modelWidth and headCount from weights.attention, verifies divisibility, and derives d_head = modelWidth / headCount.", why: "Scaled dot-product attention must know each head’s dimensionality, so the source of d_head is explicit and reviewable." },
  queryProjection: { doing: "Normalizes the current state, input, and synchronization features, then projects them with Wq into query space.", why: "The query represents what the current thought is looking for in memory." },
  keyProjection: { doing: "Projects each memory slot with Wk into the space compared against the current query.", why: "Keys make historical states searchable by learned content similarity." },
  valueProjection: { doing: "Projects each memory slot with Wv into the information returned after retrieval weights are computed.", why: "Keys decide which memory wins; values determine what information comes back." },
  relativeTimeBias: { doing: "Maps each explicit memory age to an additive retrieval-score bias.", why: "Recency can matter, but it should adjust content retrieval rather than silently replace it." },
  synchronizationBias: { doing: "Scores compatibility between the current recurrent state and each candidate memory slot.", why: "The same content can have different relevance depending on the current dynamical regime." },
  outputProjection: { doing: "Combines content, temporal, and synchronization scores, normalizes them into retrieval weights, uses those weights to combine value vectors, and projects the result into CTM context space.", why: "OutputProjection owns the complete boundary from retrieval evidence to contextₖ, so Attention does not need to carry retrievalWeightsₖ and retrievedₖ as separate intermediate outputs." },
  readGate: { doing: "Normalizes the current state, input, and retrieved context, projects them into gate logits with the learned read-gate weights, applies sigmoid, and returns one gate value per context feature.", why: "A memory read should help without automatically overwriting the current thought; the gate must have the same shape as contextₖ so the final elementwise multiplication is well-defined." },
  delta: { doing: "Combines the current state, input, context, history, and weights into deltaₖ.", why: "Separating the candidate change from the residual update makes the state transition auditable." },
  residual: { doing: "Applies the learned gate to deltaₖ and adds it to hₖ to produce hₖ₊₁.", why: "The recurrent state needs a controlled update rather than an unconditional replacement." },
  history: { doing: "Appends the new state together with x and tick k so future retrieval can recover content and age.", why: "History is both the state trajectory and the source of Attention’s timestamped memory slots." },
  output: { doing: "Reads the final recurrent state into the externally returned output.", why: "The outside world needs a stable output boundary after the internal loop halts." },
  shouldHalt: { doing: "Evaluates the current state and tick against the continuation budget and decides whether the loop exits.", why: "Adaptive computation lets Piro spend more recurrent steps when the state has not converged." },
  weights: { doing: "Defines a typed runtime object with architecture metadata plus grouped tensors for embedding, attention, recurrent state/output, and plasticity.", why: "Grouping parameters by the methods that own them makes tensor provenance and shape contracts reviewable instead of hiding everything inside an opaque blob." },
  loadWeights: { doing: "Reads the committed snapshot, verifies its format and checksum, parses the canonical payload, validates required groups, shapes, and finite values, then reconstructs the runtime weights object.", why: "Inference must never start from a partial, corrupt, incompatible, or half-written parameter set; failure happens before the recurrent loop." },
  saveWeights: { doing: "Validates the active runtime weights, serializes them in a canonical field order, computes a checksum, writes and syncs a temporary snapshot, then atomically publishes its revision.", why: "Plasticity only affects the next inference when the complete update crosses a durable atomic boundary; a failed write must leave the previous committed revision readable." },
  plasticity: { doing: "Derives prediction, value, eligibility, and credit internally from hₖ₊₁, updates active plastic weights, and saves them without returning a value.", why: "Learning belongs to the stateful controller that owns the weight mutation and must complete before the next inference loads parameters." },
};
function MethodExplanation({ kind }: { kind: DiagramKind }) {
  const explanation = explanations[kind];
  if (!explanation) return null;
  return <section className="mt-8 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.04] p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70">What it does</p><p className="mt-3 text-sm leading-7 text-amber-100/75">{explanation.doing}</p></div><div className="rounded-2xl border border-orange-300/20 bg-orange-300/[0.04] p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-200/70">Why it exists</p><p className="mt-3 text-sm leading-7 text-amber-100/75">{explanation.why}</p></div></section>;
}
export default function ZoomedArchitectureDiagram({ kind }: { kind: DiagramKind }) {
  const detail = details[kind];
  const [view, setView] = useState<"pseudocode" | "diagram">("pseudocode");

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-300/70">Architecture detail</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-amber-50 md:text-4xl">{detail.title}</h1>
          <p className="mt-3 text-base leading-7 text-amber-200/65">{detail.subtitle}</p>
        </div>
        <Link href="/docs/architecture" className="shrink-0 text-sm text-orange-300 transition hover:text-orange-100">← Full model</Link>
      </div>

      <div className="mt-8 flex items-center gap-1 border-b border-amber-900/30" role="tablist" aria-label={`${detail.title} views`}>
        <button
          type="button"
          role="tab"
          aria-selected={view === "pseudocode"}
          onClick={() => setView("pseudocode")}
          className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${view === "pseudocode" ? "border-orange-300 text-amber-50" : "border-transparent text-amber-400/50 hover:text-amber-100"}`}
        >
          Pseudocode
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "diagram"}
          onClick={() => setView("diagram")}
          className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${view === "diagram" ? "border-orange-300 text-amber-50" : "border-transparent text-amber-400/50 hover:text-amber-100"}`}
        >
          Diagram
        </button>
      </div>

      {view === "pseudocode" ? (
        <div className="mt-8">
          <PseudocodeView kind={kind} />
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-amber-900/25 bg-[#100c0a] p-3 sm:p-6">
          {kind === "observation" && <ObservationDiagram />}
          {kind === "embedding" && <EmbeddingDiagram />}
          {kind !== "observation" && kind !== "embedding" && kind !== "output" && kind !== "weights" && kind !== "loadWeights" && kind !== "saveWeights" && <MethodDiagram kind={kind} />}
          {kind === "output" && <OutputDiagram />}
          {kind === "weights" && <WeightsDiagram />}
          {kind === "loadWeights" && <LoadWeightsDiagram />}
          {kind === "saveWeights" && <SaveWeightsDiagram />}
        </div>
      )}

      <MethodExplanation kind={kind} />

      {kind === "observation" && <ObservationApiReference />}
    </>
  );
}
