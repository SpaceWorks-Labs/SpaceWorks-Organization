import type { LoginMethod } from "@/lib/loginMethodsCore";

/**
 * Whether a method's module is installed. Passkeys and phone codes are accepted names (LOGIN_METHODS and the
 * switches) but their method modules are not installed yet, so both resolve to unavailable. The module that adds one
 * changes its answer here.
 */
export function methodModuleInstalled(method: Extract<LoginMethod, "passkey" | "phone">): boolean {
  const installed: Record<typeof method, boolean> = { passkey: true, phone: true };
  return installed[method];
}
