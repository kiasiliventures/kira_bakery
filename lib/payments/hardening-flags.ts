import "server-only";

function isEnabled(value: string | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isMarch20PaymentHardeningMuted() {
  return isEnabled(process.env.MUTE_MARCH20_PAYMENT_SECURITY_HARDENING);
}
