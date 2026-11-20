import { handlers } from "@/lib/auth";
import { gateDisabledMethod } from "@/lib/authMethods/gate";

type Handler = (request: never) => Promise<Response> | Response;
const gated = (handler: Handler) => async (request: Request) => (await gateDisabledMethod(request)) ?? handler(request as never);

export const GET = gated(handlers.GET);
export const POST = gated(handlers.POST);
