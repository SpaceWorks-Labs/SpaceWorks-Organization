import type { MemberMessageKind } from "./kinds";

export type EmailTemplateText = { subject: string; heading: string; body: string };
export type MessageTemplate = EmailTemplateText & { short: string };

/**
 * The platform's own wording for every kind, written with placeholders: what members get when an organisation has
 * not written its own, and what the editor starts from. Email bodies leave the pay link to the button; the short
 * text (SMS, WhatsApp session, Telegram, Slack, Discord, Mattermost) carries it inline.
 */
export const STANDARD_MESSAGES: Record<MemberMessageKind, MessageTemplate> = {
  "application-received": {
    subject: "Your application to {organisation}",
    heading: "Application received",
    body: "Hi {name}, thanks for applying for {plan} with {organisation}. Their team will review it and we will tell you the decision.",
    short: "{organisation}: thanks {name}, we have your application for {plan}. We will tell you the decision.",
  },
  "application-approved": {
    subject: "You're approved for {organisation}",
    heading: "You're approved",
    body: "Hi {name}, {organisation} approved your application for {plan}. Pay {amount} to start your membership.\n\n{paymentInstructions}",
    short: "{organisation}: {name}, you're approved for {plan}. Pay {amount} to start: {payLink}",
  },
  "application-declined": {
    subject: "Your application to {organisation}",
    heading: "Application not approved",
    body: "Hi {name}, {organisation} did not approve your application for {plan}.",
    short: "{organisation}: {name}, your application for {plan} was not approved.",
  },
  "payment-due": {
    subject: "Complete your {organisation} membership",
    heading: "One step left: payment",
    body: "Hi {name}, your {plan} membership starts once {amount} is paid.\n\n{paymentInstructions}",
    short: "{organisation}: {name}, your {plan} membership starts once {amount} is paid: {payLink}",
  },
  "payment-received": {
    subject: "Payment received by {organisation}",
    heading: "Payment received",
    body: "Hi {name}, {organisation} received your payment of {amount}.",
    short: "{organisation}: thanks {name}, we received your payment of {amount}.",
  },
  "membership-activated": {
    subject: "Welcome to {organisation}",
    heading: "Your membership has started",
    body: "Hi {name}, your {plan} membership with {organisation} is active until {validUntil}.",
    short: "Welcome to {organisation}, {name}. Your {plan} membership is active until {validUntil}.",
  },
  "membership-renewed": {
    subject: "{organisation} renewal confirmed",
    heading: "Renewal confirmed",
    body: "Hi {name}, your {plan} renewal is confirmed and runs until {validUntil}. Your card stays the same.",
    short: "{organisation}: {name}, your {plan} renewal is confirmed until {validUntil}.",
  },
  "renewal-due": {
    subject: "Renew your {organisation} membership",
    heading: "Time to renew",
    body: "Hi {name}, your {plan} membership is valid until {validUntil}. Renew now and the new year starts the day after.\n\n{paymentInstructions}",
    short: "{organisation}: {name}, your {plan} membership ends {validUntil}. Renew: {payLink}",
  },
  "renewal-today": {
    subject: "Your {organisation} membership ends today",
    heading: "Your membership ends today",
    body: "Hi {name}, your {plan} membership ends today, {validUntil}. Renew now to keep your card valid.\n\n{paymentInstructions}",
    short: "{organisation}: {name}, your {plan} membership ends today. Renew: {payLink}",
  },
  "grace-started": {
    subject: "Your {organisation} membership has ended",
    heading: "Your grace period has started",
    body: "Hi {name}, your {plan} membership ended on {validUntil}. You can still renew until {graceUntil} without losing your place.\n\n{paymentInstructions}",
    short: "{organisation}: {name}, your {plan} membership ended. Renew by {graceUntil}: {payLink}",
  },
  "grace-ending": {
    subject: "Last days to renew with {organisation}",
    heading: "Your grace period is ending",
    body: "Hi {name}, your grace period for {plan} ends on {graceUntil}. Renew before then to keep your membership.\n\n{paymentInstructions}",
    short: "{organisation}: {name}, last days to renew {plan}. Grace ends {graceUntil}: {payLink}",
  },
  lapsed: {
    subject: "Your {organisation} membership has ended",
    heading: "Your membership has ended",
    body: "Hi {name}, your {plan} membership ended on {validUntil}. Renew now to keep your card valid.\n\n{paymentInstructions}",
    short: "{organisation}: {name}, your {plan} membership has ended. Renew: {payLink}",
  },
  "payment-claim-pending": {
    subject: "{organisation} is still checking your payment",
    heading: "We're still checking your payment",
    body: "Hi {name}, {organisation} has not yet confirmed your payment of {amount}. Their team will confirm it and we will send your receipt.",
    short: "{organisation}: {name}, we're still checking your payment of {amount}. We will send your receipt once it is confirmed.",
  },
  "card-issued": {
    subject: "Your {organisation} membership card",
    heading: "Your membership card",
    body: "Hi {name}, your {plan} card from {organisation} is attached as a PDF. Print it on card stock or keep it on your phone.\n\nAnyone can scan the QR code on the front to check that your membership is current. Renewing keeps the same card.",
    short: "{organisation}: {name}, your {plan} card ({cardNumber}) is ready. Open your account to see it.",
  },
  "certificate-issued": {
    subject: "Your certificate from {organisation}",
    heading: "Your certificate",
    body: "Hi {name}, {organisation} has given you a certificate: {certificate}. It is attached as a PDF.\n\nAnyone can scan the QR code on it to check that it is genuine.",
    short: "{organisation}: {name}, your certificate {certificate} ({certificateNumber}) is ready. Open your account to see it.",
  },
  "refund-decided": {
    subject: "Refund from {organisation}",
    heading: "Your refund",
    body: "Hi {name}, {organisation} has decided your refund request for {plan}. See your account for the details.",
    short: "{organisation}: {name}, your refund request for {plan} has been decided. See your account for the details.",
  },
  "membership-revoked": {
    subject: "Your {organisation} membership",
    heading: "Membership revoked",
    body: "Hi {name}, {organisation} has revoked your {plan} membership.",
    short: "{organisation}: {name}, your {plan} membership was revoked.",
  },
  "membership-left": {
    subject: "You've left {organisation}",
    heading: "Membership ended",
    body: "Hi {name}, you ended your {plan} membership with {organisation} from your account. Payments already made stay on record.",
    short: "{organisation}: {name}, you ended your {plan} membership.",
  },
};

/** What each kind's email button says when the message has a pay link, and otherwise. */
export const STANDARD_ACTIONS: Partial<Record<MemberMessageKind, string>> = {
  "application-approved": "Pay now",
  "payment-due": "Pay now",
  "renewal-due": "Renew now",
  "renewal-today": "Renew now",
  "grace-started": "Renew now",
  "grace-ending": "Renew now",
  lapsed: "Renew now",
};
