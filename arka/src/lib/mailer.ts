import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Transactional email.
 *
 * Talks to Resend over plain HTTP rather than pulling in an SDK — it is one
 * endpoint, and this way swapping to Postmark or SES is a change to one
 * function.
 *
 * Without credentials it logs the message to the server console instead of
 * throwing. That keeps local development working (you copy the reset link out
 * of the terminal) and, more importantly, means a misconfigured production
 * deploy fails loudly in the logs rather than silently swallowing a password
 * reset the user is waiting for.
 */

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendMail(mail: Mail): Promise<boolean> {
  const config = env();

  if (!config.RESEND_API_KEY) {
    /**
     * In production the console is not a mailbox.
     *
     * Every message this sends is one a user is actively waiting on: the link
     * that confirms their address, or the only way back into an account
     * whose password they have forgotten. Printing those to a log the user
     * cannot read locks them out permanently while the app reports success.
     */
    if (config.isProduction) {
      throw new Error(
        "Refusing to send: RESEND_API_KEY is not set in production. Password " +
          "resets and email verification have no way to reach the user.",
      );
    }

    logger.warn("auth", "Email is not configured — printing the message instead", {
      to: mail.to,
      subject: mail.subject,
    });
    console.log(`\n─── email to ${mail.to} ───\n${mail.subject}\n\n${mail.text}\n───\n`);
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });

    if (!response.ok) {
      logger.error("auth", "Email provider rejected the message", {
        to: mail.to,
        status: response.status,
        body: (await response.text()).slice(0, 300),
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("auth", "Could not reach the email provider", {
      to: mail.to,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Names the grant when there is one, because verification is a step between a
 * user and their first video and the mail should say what the step is worth.
 * The grant is a runtime setting and currently zero, so this reads correctly
 * either way rather than promising credits that will never arrive.
 */
export function verifyEmailEmail(name: string, url: string, credits: number): Mail {
  const firstName = name.split(" ")[0] || "there";

  // The grant is a runtime setting and is currently zero, so the mail has to
  // read correctly either way rather than promising credits nobody will get.
  const granted = credits > 0;

  return {
    to: "",
    subject: granted
      ? "Confirm your email and collect your free credits"
      : "Confirm your email address",
    text: [
      `Hi ${firstName},`,
      "",
      granted
        ? `Confirm this address and we'll add ${credits} free credits to your Arka account:`
        : "Confirm this address to finish setting up your Arka account:",
      "",
      url,
      "",
      "The link is good for 24 hours.",
      "",
      "If you did not sign up for Arka, you can ignore this email.",
      "",
      "— Arka",
    ].join("\n"),
  };
}

/** Plain-text wins here: reset emails must survive every client. */
export function resetPasswordEmail(name: string, url: string): Mail {
  const firstName = name.split(" ")[0] || "there";

  return {
    to: "",
    subject: "Reset your Arka password",
    text: [
      `Hi ${firstName},`,
      "",
      "Someone asked to reset the password on your Arka account. Open this link to set a new one:",
      "",
      url,
      "",
      "The link is good for one hour and can only be used once.",
      "",
      "If this was not you, you can ignore this email — your password has not changed.",
      "",
      "— Arka",
    ].join("\n"),
  };
}
