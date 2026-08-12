export type InferenceTimings = {
  requestId?: string;
  routeMs?: number;
  authMs?: number;
  modelLookupMs?: number;
  inputValidationMs?: number;
  modalHttpMs?: number;
  modalEndpointMs?: number;
  modalQueueMs?: number;
  workerMs?: number;
  modelLoadMs?: number;
  modelInvokeMs?: number;
  containerSetupMs?: number;
  cacheHit?: boolean;
  browserE2eMs?: number;
};

export function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
