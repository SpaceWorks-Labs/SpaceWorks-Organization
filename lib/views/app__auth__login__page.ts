import { connection } from "next/server";
import { isNewUserRegistrationEnabled } from "@/lib/instanceSettings";
import { loginPageMethods } from "@/lib/loginMethods";

export async function loadLoginView() {
  await connection();
  const [accountCreationEnabled, { passwordEnabled, passkeyEnabled, phoneEnabled, providers, singleSignOn, emailAvailable }] = await Promise.all([isNewUserRegistrationEnabled(), loginPageMethods()]);
  return { providers, singleSignOn, passwordEnabled, passkeyEnabled, phoneEnabled, accountCreationEnabled, emailAvailable };
}
