/**
 * A send a channel did not accept. `retryable` is true for outages and throttling (the queue tries again); false
 * when the address can never be reached or our credentials are refused (the next channel is tried). The message is
 * safe to show and store: it never carries a secret, a number or an address.
 */
export class ChannelError extends Error {
  override name = "ChannelError";
  constructor(message: string, readonly retryable: boolean, readonly status?: number) {
    super(message);
  }
}
