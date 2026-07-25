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
  | "plasticity"
  | "initializeFastState"
  | "attentionWindow"
  | "fastAdaptation"
  | "bindFastState"
  | "predictNext"
  | "persistencePolicy"
  | "consolidate"
  | "chunkText";

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
    subtitle: "A proposed 256M-parameter runtime layout split across INT4 base tensors, BF16 fast overlays, and BF16 dynamic state.",
  },
  loadWeights: {
    title: "LoadWeights",
    subtitle: "Reads the model manifest and logical component objects from R2, reconstructs mixed-precision tensors, and prepares runtime weights for inference.",
  },
  saveWeights: {
    title: "SaveWeights",
    subtitle: "Writes session fast-state checkpoints or consolidated durable snapshots to versioned R2 objects without rewriting unchanged base components.",
  },
  plasticity: {
    title: "PlasticityController",
    subtitle: "Coordinates prediction error and eligibility without treating every fast update as a durable model revision.",
  },
  initializeFastState: {
    title: "InitializeFastState",
    subtitle: "Creates the session’s mutable BF16 fast-weight state from durable weights without loading short-term history into the model revision.",
  },
  attentionWindow: {
    title: "GetAttentionWindow",
    subtitle: "Reads the bounded recent-history window used by local attention; its value is tunable rather than an unlimited transcript.",
  },
  fastAdaptation: {
    title: "FastAdaptation",
    subtitle: "Updates the active fast-weight state from observed text and next-token prediction before later chunks are processed.",
  },
  bindFastState: {
    title: "BindFastState",
    subtitle: "Combines durable weights with the current session fast state to produce the runtime parameter view used by inference.",
  },
  predictNext: {
    title: "PredictNextToken",
    subtitle: "Produces a causal text prediction so the observed stream can supervise fast adaptation.",
  },
  persistencePolicy: {
    title: "WeightPersistencePolicy",
    subtitle: "Chooses whether fast state stays in runtime memory, receives a session checkpoint, or is consolidated into durable model weights.",
  },
  consolidate: {
    title: "ConsolidateWeights",
    subtitle: "Moves validated, replay-safe evidence from fast state into the slower durable weight substrate.",
  },
  chunkText: {
    title: "ChunkText",
    subtitle: "Groups the text stream into causal adaptation chunks while preserving token order.",
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
    <svg viewBox="0 0 1280 760" className="mx-auto block h-auto w-full min-w-[900px]" role="img" aria-label="Piro LoadWeights R2 manifest and mixed precision component loading flow">
      <defs>
        <marker id="load-weights-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(125 211 252 / 0.72)" /></marker>
      </defs>
      <text x="36" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">LOADWEIGHTS · R2 MANIFEST + LOGICAL COMPONENTS → RUNTIME OBJECT</text>
      <text x="36" y="76" fill="rgb(253 230 138 / 0.72)" fontSize="15">At 256M parameters, the manifest can point to a few component objects; physical sharding remains optional.</text>
      <Box x={28} y={190} width={236} height={150} title="R2 bucket" detail="piro-kb / models/{modelId}/weights/" tone="orange" />
      <path d="M264 265H306" fill="none" stroke="rgb(125 211 252 / 0.72)" strokeWidth="2" markerEnd="url(#load-weights-arrow)" />
      <Box x={306} y={190} width={236} height={150} title="manifest.json" detail="revision · 256M params · object index" tone="blue" />
      <path d="M542 265H584" fill="none" stroke="rgb(125 211 252 / 0.72)" strokeWidth="2" markerEnd="url(#load-weights-arrow)" />
      <Box x={584} y={138} width={260} height={108} title="base.safetensors" detail="~230M INT4 values + BF16 scales" tone="blue" />
      <Box x={584} y={278} width={260} height={108} title="overlay.safetensors" detail="~20M BF16 fast plastic tensors" tone="violet" />
      <Box x={584} y={418} width={260} height={108} title="state.safetensors" detail="~6M BF16 dynamic state + traces" tone="orange" />
      <path d="M844 192H900V265H936" fill="none" stroke="rgb(125 211 252 / 0.72)" strokeWidth="2" markerEnd="url(#load-weights-arrow)" />
      <path d="M844 332H900V265H936" fill="none" stroke="rgb(125 211 252 / 0.72)" strokeWidth="2" markerEnd="url(#load-weights-arrow)" />
      <path d="M844 472H900V265H936" fill="none" stroke="rgb(125 211 252 / 0.72)" strokeWidth="2" markerEnd="url(#load-weights-arrow)" />
      <Box x={936} y={190} width={300} height={150} title="Decode + dequantize" detail="INT4 → BF16 compute tensors; attach BF16 overlays" tone="blue" />
      <path d="M1086 340V420" fill="none" stroke="rgb(125 211 252 / 0.72)" strokeWidth="2" markerEnd="url(#load-weights-arrow)" />
      <Box x={936} y={420} width={300} height={150} title="runtime weights" detail="base + overlay + BF16 state" tone="green" />
      <text x="28" y="660" fill="rgb(253 230 138 / 0.62)" fontSize="13">R2 guidance: use one PUT below roughly 100 MB; use multipart above that or when resumability and parallel transfer matter. Multipart parts are not model shards.</text>
    </svg>
  );
}

function SaveWeightsDiagram() {
  return (
    <svg viewBox="0 0 1280 820" className="mx-auto block h-auto w-full min-w-[900px]" role="img" aria-label="Piro SaveWeights overlay update and R2 snapshot publication flow">
      <defs>
        <marker id="save-weights-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(253 186 116 / 0.76)" /></marker>
      </defs>
      <text x="36" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">SAVEWEIGHTS · CHANGED GROUPS → VERSIONED R2 OBJECTS</text>
      <text x="36" y="76" fill="rgb(253 230 138 / 0.72)" fontSize="15">Plasticity updates overlays frequently; durable INT4 base components change only during explicit consolidation or retraining.</text>
      <Box x={28} y={166} width={230} height={150} title="changed groups" detail="BF16 fast overlay + BF16 traces" tone="green" />
      <path d="M258 241H304" fill="none" stroke="rgb(253 186 116 / 0.76)" strokeWidth="2" markerEnd="url(#save-weights-arrow)" />
      <Box x={304} y={166} width={230} height={150} title="delta / overlay encode" detail="sparse changed tensors + scales" tone="violet" />
      <path d="M534 241H580" fill="none" stroke="rgb(253 186 116 / 0.76)" strokeWidth="2" markerEnd="url(#save-weights-arrow)" />
      <Box x={580} y={166} width={230} height={150} title="new revision" detail="manifest + checksum + parent" tone="blue" />
      <path d="M810 241H856" fill="none" stroke="rgb(253 186 116 / 0.76)" strokeWidth="2" markerEnd="url(#save-weights-arrow)" />
      <Box x={856} y={166} width={230} height={150} title="R2 temporary objects" detail="models/{modelId}/weights/revisions/{r}/" tone="orange" />
      <path d="M1086 241H1132" fill="none" stroke="rgb(253 186 116 / 0.76)" strokeWidth="2" markerEnd="url(#save-weights-arrow)" />
      <Box x={1132} y={166} width={120} height={150} title="publish" detail="manifest pointer" tone="orange" />
      <Box x={28} y={454} width={230} height={150} title="fast update" detail="read next inference immediately" tone="green" />
      <Box x={304} y={454} width={230} height={150} title="durable consolidation" detail="merge overlay into base later" tone="orange" />
      <path d="M534 529H650V365H650" fill="none" stroke="rgb(253 186 116 / 0.76)" strokeWidth="2" markerEnd="url(#save-weights-arrow)" />
      <Box x={650} y={454} width={260} height={150} title="LoadWeights()" detail="next inference follows current pointer" tone="blue" />
      <text x="28" y="700" fill="rgb(253 230 138 / 0.62)" fontSize="13">If only the overlay changed, SaveWeights writes the overlay object and manifest, not the ~230M-parameter base object.</text>
    </svg>
  );
}

function WeightsDiagram() {
  return (
    <svg viewBox="0 0 1280 860" className="mx-auto block h-auto w-full min-w-[900px]" role="img" aria-label="Piro 256 million parameter mixed precision weight layout">
      <defs>
        <marker id="weights-schema-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="rgb(251 191 36 / 0.72)" /></marker>
      </defs>
      <text x="36" y="42" fill="rgb(251 191 36 / 0.48)" fontSize="12" letterSpacing="2">WEIGHTS · PROPOSED 256M PARAMETER LAYOUT</text>
      <text x="36" y="76" fill="rgb(253 230 138 / 0.72)" fontSize="15">At this size, use a manifest plus a few logical component objects; do not require one physical shard per tensor group.</text>
      <Box x={36} y={170} width={260} height={166} title="~256M parameters" detail="manifest tracks counts, dtype, shape, object key, and ownership" tone="green" />
      <path d="M296 253H350" fill="none" stroke="rgb(251 191 36 / 0.72)" strokeWidth="2" markerEnd="url(#weights-schema-arrow)" />
      <Box x={350} y={120} width={360} height={150} title="INT4 base · ~230M" detail="frozen after pretraining; 4-bit values + per-group BF16 scales" tone="blue" />
      <Box x={350} y={320} width={360} height={150} title="BF16 fast overlay · ~20M" detail="plastic low-rank / sparse deltas updated online" tone="violet" />
      <Box x={350} y={520} width={360} height={150} title="BF16 state + heads · ~6M" detail="dynamic recurrent, normalization, output, and eligibility tensors" tone="orange" />
      <path d="M710 195H770V253H824" fill="none" stroke="rgb(251 191 36 / 0.72)" strokeWidth="2" markerEnd="url(#weights-schema-arrow)" />
      <path d="M710 395H770V253H824" fill="none" stroke="rgb(251 191 36 / 0.72)" strokeWidth="2" markerEnd="url(#weights-schema-arrow)" />
      <path d="M710 595H770V253H824" fill="none" stroke="rgb(251 191 36 / 0.72)" strokeWidth="2" markerEnd="url(#weights-schema-arrow)" />
      <Box x={824} y={170} width={410} height={166} title="method ownership" detail="attention projections · state update · embedding · output · plasticity" tone="orange" />
      <Box x={824} y={390} width={410} height={166} title="logical objects" detail="base.safetensors · overlay.safetensors · state.safetensors" tone="orange" />
      <Box x={824} y={610} width={410} height={166} title="optional physical sharding" detail="multipart upload or extra shards for larger / resumable transfers" tone="blue" />
      <text x="36" y="800" fill="rgb(253 230 138 / 0.62)" fontSize="13">Rough storage: 230M × 0.5 bytes + 20M × 1 byte + 6M × 2 bytes ≈ 167 MB before scales, metadata, and optimizer state.</text>
    </svg>
  );
}

const methodDetails: Record<Exclude<DiagramKind, "observation" | "embedding" | "output" | "weights">, { input: string; output: string; relation: string; tone: "green" | "blue" | "orange" | "violet" }> = {
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
  loadWeights: { input: "R2 manifest + INT4/BF16/BF16 components", output: "runtime weights", relation: "reads, decodes, combines, and returns the mixed-precision parameter object", tone: "blue" },
  saveWeights: { input: "changed overlays + revision", output: "versioned R2 snapshot", relation: "writes only the changed representation and publishes a new manifest pointer", tone: "blue" },
  plasticity: { input: "state + history + current input", output: "fast-state update signals", relation: "coordinates local prediction credit and identifies evidence for persistence", tone: "orange" },
  initializeFastState: { input: "durableWeights + sessionId", output: "fastState", relation: "starts or restores mutable session-local weight state", tone: "violet" },
  attentionWindow: { input: "durableWeights.attention", output: "attentionWindow", relation: "returns the bounded number of recent history slots local attention may inspect", tone: "blue" },
  fastAdaptation: { input: "fastState + observedChunk + prediction + runtimeWeights", output: "updated fastState", relation: "applies the inner-loop next-token learning update before later chunks run", tone: "orange" },
  bindFastState: { input: "durableWeights + fastState", output: "runtimeWeights", relation: "binds mutable session state to the stable parameter substrate", tone: "violet" },
  predictNext: { input: "observedChunk + state + runtimeWeights", output: "prediction", relation: "produces the causal target used by fast adaptation", tone: "green" },
  persistencePolicy: { input: "fastState + session evidence", output: "none / session-checkpoint / consolidate", relation: "selects a persistence boundary instead of writing every update", tone: "orange" },
  consolidate: { input: "durableWeights + fastState + validated evidence", output: "updated durableWeights", relation: "merges stable evidence into the slow substrate while leaving transient state separate", tone: "blue" },
  chunkText: { input: "text", output: "ordered chunks", relation: "creates causal mini-batches for text adaptation", tone: "green" },
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
      <Arrow d="M780 291H908" marker={detail.tone === "blue" ? "blue" : detail.tone === "orange" ? "orange" : detail.tone === "violet" ? "violet" : "gold"} color={detail.tone === "blue" ? "rgb(125 211 252 / 0.72)" : detail.tone === "orange" ? "rgb(253 186 116 / 0.76)" : detail.tone === "violet" ? "rgb(192 132 252 / 0.72)" : undefined} />
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
      {line(<>    if modelWidth % headCount != 0:</>)}
      {line(<>        return Error("attention width is not divisible by head count")</>)}
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
      {line(<>    if Shape(readGateₖ) != Shape(contextₖ):</>)}
      {line(<>        return Error("read gate cannot be applied to context")</>)}
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
      {line(<>    revision: integer,</>)}
      {line(<>    parameterCount: 256_000_000,</>)}
      {line(<>    architecture: {"{"} modelWidth, headCount, stateWidth, inputWidth, contextWidth {"}"},</>)}
      {line(<>    storage: {"{"}</>)}
      {line(<>        provider: R2, bucket: "piro-kb", prefix: "models/&#123;modelId&#125;/weights/"</>)}
      {line(<>    {"}"},</>)}
      {line(<>    base: {"{"} format: INT4, parameters: 230_000_000, object: "base.safetensors", scales: BF16 {"}"},</>)}
      {line(<>    fastOverlay: {"{"} format: BF16, parameters: 20_000_000, object: "overlay.safetensors", sparseOrLowRank: true {"}"},</>)}
      {line(<>    dynamicState: {"{"} format: BF16, parameters: 6_000_000, object: "state.safetensors", eligibility, normalization, heads {"}"}</>)}
      {line(<>{"}"}</>)}
      {line(<>Linear tensor convention: W = [outDim, inDim], b = [outDim]</>)}
      {line(<>The manifest also stores dtype, shape, object key, optional byte range, scale, and owner method</>)}
    </>,
    loadWeights: <>
      {line(<>{call("LoadWeights", "loadWeights")}():</>)}
      {line(<>    manifest = R2Get("models/&#123;modelId&#125;/weights/current/manifest.json")</>)}
      {line(<>    for each component in manifest.components:</>)}
      {line(<>        bytes = R2Get(component.key, component.byteRange)</>)}
      {line(<>        if Hash(bytes) != component.checksum:</>)}
      {line(<>            return Error("weight object checksum mismatch")</>)}
      {line(<>        tensor = Decode(bytes, component.format, component.shape, component.scales)</>)}
      {line(<>        if tensor is missing or shape is incompatible:</>)}
      {line(<>            return Error("weight object cannot reconstruct declared tensor")</>)}
      {line(<>        runtime[component.owner][component.name] = ToBF16ComputeTensor(tensor)</>)}
      {line(<>    return AttachFastOverlay(runtime)</>)}
    </>,
    saveWeights: <>
      {line(<>{call("SaveWeights", "saveWeights")}weights:</>)}
      {line(<>    changed = DiffAgainstLoadedManifest(weights)</>)}
      {line(<>    if changed is empty:</>)}
      {line(<>        return NoOp("nothing changed")</>)}
      {line(<>    revision = ReadCurrentRevision() + 1</>)}
      {line(<>    for each group in changed:</>)}
      {line(<>        if group.owner == "plasticity.fastOverlay":</>)}
      {line(<>            component = Encode(group, format = BF16, scales = BF16)</>)}
      {line(<>        else if group.owner == "durable.base":</>)}
      {line(<>            component = Quantize(group, format = INT4, scales = BF16)</>)}
      {line(<>        else:</>)}
      {line(<>            component = Encode(group, format = BF16)</>)}
      {line(<>        R2Put("models/&#123;modelId&#125;/weights/revisions/&#123;revision&#125;/" + component.name, component.bytes)</>)}
      {line(<>    manifest = BuildManifest(revision, changed, parentRevision)</>)}
      {line(<>    R2Put("models/&#123;modelId&#125;/weights/revisions/&#123;revision&#125;/manifest.json", manifest)</>)}
      {line(<>    R2Put("models/&#123;modelId&#125;/weights/current/manifest.json", manifest)</>)}
      {line(<>    return revision</>)}
    </>,

    plasticity: <>
      {line(<>{call("PlasticityController", "plasticity")}</>)}
      {line(<>    fastState,</>)}
      {line(<>    observedChunk,</>)}
      {line(<>    prediction</>)}
      {line(<>):</>)}
      {line(<>    surprise = PredictionError(prediction, observedChunk.nextToken)</>)}
      {line(<>    eligibility = UpdateEligibility(fastState, observedChunk)</>)}
      {line(<>    return LocalCredit(surprise, eligibility)</>)}
    </>,
    initializeFastState: <>
      {line(<>{call("InitializeFastState", "initializeFastState")}</>)}
      {line(<>    durableWeights,</>)}
      {line(<>    sessionId</>)}
      {line(<>):</>)}
      {line(<>    if session checkpoint exists:</>)}
      {line(<>        return DecodeSessionFastState(sessionId)</>)}
      {line(<>    return ZeroLike(durableWeights.plasticGroups, format = BF16)</>)}
    </>,
    attentionWindow: <>
      {line(<>{call("GetAttentionWindow", "attentionWindow")}durableWeights)</>)}
      {line(<>    return durableWeights.attention.localWindow</>)}
    </>,
    fastAdaptation: <>
      {line(<>{call("FastAdaptation", "fastAdaptation")}</>)}
      {line(<>    fastState,</>)}
      {line(<>    observedChunk,</>)}
      {line(<>    prediction,</>)}
      {line(<>    runtimeWeights</>)}
      {line(<>):</>)}
      {line(<>    target = observedChunk.nextToken</>)}
      {line(<>    loss = CrossEntropy(prediction, target)</>)}
      {line(<>    update = Gradient(loss, fastState)</>)}
      {line(<>    return fastState - runtimeWeights.fastLearningRate · update</>)}
    </>,
    bindFastState: <>
      {line(<>{call("BindFastState", "bindFastState")}</>)}
      {line(<>    durableWeights,</>)}
      {line(<>    fastState</>)}
      {line(<>):</>)}
      {line(<>    return RuntimeWeights(durableWeights, fastState)</>)}
    </>,
    predictNext: <>
      {line(<>{call("PredictNextToken", "predictNext")}</>)}
      {line(<>    observedChunk,</>)}
      {line(<>    state,</>)}
      {line(<>    runtimeWeights</>)}
      {line(<>):</>)}
      {line(<>    return TextHead(Forward(observedChunk, state, runtimeWeights))</>)}
    </>,
    persistencePolicy: <>
      {line(<>{call("WeightPersistencePolicy", "persistencePolicy")}</>)}
      {line(<>    fastState,</>)}
      {line(<>    sessionEvidence</>)}
      {line(<>):</>)}
      {line(<>    if DurableEvidenceReady(sessionEvidence, fastState):</>)}
      {line(<>        return {"{"} mode: "consolidate" {"}"}</>)}
      {line(<>    if SessionCheckpointDue(sessionEvidence):</>)}
      {line(<>        return {"{"} mode: "session-checkpoint" {"}"}</>)}
      {line(<>    return {"{"} mode: "none" {"}"}</>)}
    </>,
    consolidate: <>
      {line(<>{call("ConsolidateWeights", "consolidate")}</>)}
      {line(<>    durableWeights,</>)}
      {line(<>    fastState</>)}
      {line(<>):</>)}
      {line(<>    candidate = MergeStableEvidence(durableWeights, fastState)</>)}
      {line(<>    if ReplayRegression(candidate) fails:</>)}
      {line(<>        return durableWeights</>)}
      {line(<>    return candidate</>)}
    </>,
    chunkText: <>
      {line(<>{call("ChunkText", "chunkText")}text):</>)}
      {line(<>    return OrderedChunks(text, adaptationBatchSize)</>)}
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
  weights: { doing: "Defines a proposed 256M-parameter runtime object: about 230M INT4 base parameters, 20M BF16 fast-overlay parameters, and 6M BF16 dynamic state, with every tensor assigned to an owning method and logical object.", why: "The model needs a concrete mixed-precision storage contract so compression, online adaptation, and runtime reconstruction are reviewable rather than hidden inside one blob." },
  loadWeights: { doing: "Reads models/{modelId}/weights/current/manifest.json from the piro-kb R2 bucket, follows its logical base, overlay, and state objects, checks checksums and shapes, dequantizes base tensors for BF16 compute, and attaches fast overlays.", why: "A 256M mixed-precision model fits comfortably below R2's single-upload and per-object limits; the manifest still gives us revision and ownership semantics without forcing physical sharding." },
  saveWeights: { doing: "Diffs the active runtime object against the loaded manifest, encodes changed fast overlays as BF16, encodes dynamic state as BF16, re-quantizes durable base changes as INT4 only during consolidation, and publishes a versioned R2 manifest. Multipart upload is available for large or resumable component transfers.", why: "Plasticity should not rewrite the ~230M-parameter base object on every interaction; R2's storage capacity is not the constraint here, while write volume and operation cost are." },
  plasticity: { doing: "Compares later input against unresolved earlier predictions, multiplies prediction error by novelty and eligibility, updates selected BF16 overlay groups, and periodically moves stable evidence into durable base weights.", why: "Human-like learning can assign credit from future consequences and local surprise without requiring one global reward function for every interaction." },
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
          {kind !== "observation" && kind !== "embedding" && kind !== "output" && kind !== "weights" && kind !== "loadWeights" && kind !== "saveWeights" && kind !== "plasticity" && <MethodDiagram kind={kind} />}
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
