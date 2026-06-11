// Meta Messenger Platform — send messages and fetch profiles via Graph API.
// Caleb's Page Access Token is used for all calls.

const GRAPH = "https://graph.facebook.com/v19.0";

function token(): string {
  const t = process.env.META_PAGE_ACCESS_TOKEN;
  if (!t) throw new Error("META_PAGE_ACCESS_TOKEN not set");
  return t;
}

export interface MessengerProfile {
  psid: string;
  name: string;
  firstName: string;
  lastName: string;
}

/** Fetch the display name of a Messenger sender by their Page-Scoped ID. */
export async function getMessengerProfile(psid: string): Promise<MessengerProfile> {
  const res = await fetch(
    `${GRAPH}/${psid}?fields=name,first_name,last_name&access_token=${token()}`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Meta profile fetch failed: ${JSON.stringify(data)}`);
  return {
    psid,
    name: data.name ?? "Facebook User",
    firstName: data.first_name ?? "",
    lastName: data.last_name ?? "",
  };
}

/** Send a text message to a Messenger user by their Page-Scoped ID. */
export async function sendMessengerMessage(
  psid: string,
  text: string,
): Promise<{ messageId: string }> {
  const res = await fetch(`${GRAPH}/me/messages?access_token=${token()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: psid },
      message: { text: text.slice(0, 2000) }, // Messenger 2000-char limit
      messaging_type: "RESPONSE",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Messenger send failed: ${JSON.stringify(data)}`);
  return { messageId: data.message_id };
}
