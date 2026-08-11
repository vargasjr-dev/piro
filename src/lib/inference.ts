/**
 * Code-owned endpoint for all Piro-trained model inference.
 *
 * Model rows identify weights and architecture; infrastructure routing belongs
 * here so deploying a new inference app cannot leave stale per-model URLs.
 */
export const PIRO_INFERENCE_ENDPOINT =
  "https://dvargasfuertes--piro-inference-infer.modal.run";
