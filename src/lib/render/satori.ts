import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { SATORI_FONTS } from "./fonts";
import { renderSlideTree } from "./templates";
import type { SlideSpec, AgentBrand } from "./types";

export interface RenderCtx {
  w: number;
  h: number;
  photoUri?: string;
  agent: AgentBrand;
}

/** Render one slide spec to a PNG buffer (Satori SVG -> resvg PNG). */
export async function renderSlidePng(spec: SlideSpec, ctx: RenderCtx): Promise<Buffer> {
  const tree = renderSlideTree(spec, ctx);
  const svg = await satori(tree as React.ReactNode, {
    width: ctx.w,
    height: ctx.h,
    fonts: SATORI_FONTS,
  });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: ctx.w } });
  return Buffer.from(resvg.render().asPng());
}
