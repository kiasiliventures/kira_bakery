export type DeliveryErrorCode =
  | "DELIVERY_PROVIDER_NOT_CONFIGURED"
  | "DELIVERY_PROVIDER_FAILED"
  | "DELIVERY_STORE_NOT_FOUND"
  | "DELIVERY_PRICING_NOT_FOUND"
  | "DELIVERY_PLACE_NOT_FOUND"
  | "DELIVERY_DISTANCE_UNAVAILABLE"
  | "DELIVERY_OUT_OF_RANGE"
  | "DELIVERY_BRACKET_NOT_FOUND"
  | "DELIVERY_INVALID_REQUEST";

export class DeliveryError extends Error {
  code: DeliveryErrorCode;
  status: number;
  publicMessage: string;

  constructor(code: DeliveryErrorCode, publicMessage: string, status = 400) {
    super(publicMessage);
    this.name = "DeliveryError";
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

export function isDeliveryError(error: unknown): error is DeliveryError {
  return error instanceof DeliveryError;
}
