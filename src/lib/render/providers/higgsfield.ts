/** Higgsfield AI video/image generation client. */

const BASE = "https://api.higgsfield.ai";

function apiKey(): string | undefined {
  return process.env.HIGGSFIELD_API_KEY;
}

export const higgsfield = {
  configured(): boolean {
    return Boolean(apiKey());
  },

  async generate(prompt: string, opts?: { style?: string; aspectRatio?: string }): Promise<{ generationId: string }> {
    const key = apiKey();
    if (!key) throw new Error("HIGGSFIELD_API_KEY not set");

    const res = await fetch(`${BASE}/v1/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        prompt,
        style: opts?.style ?? "cinematic",
        aspect_ratio: opts?.aspectRatio ?? "9:16",
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Higgsfield generate failed ${res.status}: ${err}`);
    }

    const data = (await res.json()) as { id?: string; generation_id?: string };
    const generationId = data.id ?? data.generation_id;
    if (!generationId) throw new Error("Higgsfield returned no generation ID");
    return { generationId };
  },

  async poll(generationId: string): Promise<{ state: "pending" | "processing" | "done" | "failed"; url?: string }> {
    const key = apiKey();
    if (!key) throw new Error("HIGGSFIELD_API_KEY not set");

    const res = await fetch(`${BASE}/v1/generate/${generationId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!res.ok) throw new Error(`Higgsfield poll failed ${res.status}`);

    const data = (await res.json()) as {
      status?: string;
      state?: string;
      url?: string;
      output_url?: string;
      video_url?: string;
    };

    const state = (data.status ?? data.state ?? "pending") as string;
    const url = data.url ?? data.output_url ?? data.video_url;

    if (state === "completed" || state === "done" || state === "succeeded") {
      return { state: "done", url };
    }
    if (state === "failed" || state === "error") {
      return { state: "failed" };
    }
    if (state === "processing" || state === "running") {
      return { state: "processing" };
    }
    return { state: "pending" };
  },
};
