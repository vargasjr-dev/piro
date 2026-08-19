export class ModalDispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModalDispatchError";
  }
}

export async function parseModalDispatchResponse(
  response: Response,
): Promise<{ functionCallId: string }> {
  if (!response.ok) {
    throw new ModalDispatchError(
      `Modal trigger returned HTTP ${response.status}.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ModalDispatchError("Modal trigger returned invalid JSON.");
  }

  const functionCallId =
    payload && typeof payload === "object" && "functionCallId" in payload
      ? (payload as { functionCallId?: unknown }).functionCallId
      : null;
  if (
    typeof functionCallId !== "string" ||
    functionCallId.trim().length === 0
  ) {
    throw new ModalDispatchError(
      "Modal trigger response did not include a valid functionCallId.",
    );
  }

  return { functionCallId: functionCallId.trim() };
}
