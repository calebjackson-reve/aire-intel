import { BRAND, type SlideSpec, type AgentBrand } from "./types";
import { HERO_FONT, BODY_FONT } from "./fonts";

/**
 * Satori-compatible template trees (flexbox only, no CSS grid/filter/blend).
 * Each returns a full-bleed node sized by {w,h}. Photo passed as a data URI.
 */

interface Ctx {
  w: number;
  h: number;
  photoUri?: string;
  agent: AgentBrand;
}

const eyebrowStyle = {
  fontFamily: BODY_FONT,
  fontSize: 26,
  letterSpacing: 6,
  color: BRAND.coral,
  textTransform: "uppercase" as const,
};

function coralRule(width = 90) {
  return { display: "flex", width, height: 4, backgroundColor: BRAND.coral };
}

function frame(w: number, h: number, children: React.ReactNode, extra: Record<string, unknown> = {}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: w,
        height: h,
        backgroundColor: BRAND.black,
        position: "relative",
        ...extra,
      }}
    >
      {children}
    </div>
  );
}

function justListedCover(spec: SlideSpec, ctx: Ctx) {
  return frame(ctx.w, ctx.h, [
    ctx.photoUri ? (
      <img
        key="photo"
        src={ctx.photoUri}
        width={ctx.w}
        height={ctx.h}
        style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
      />
    ) : null,
    <div
      key="scrim"
      style={{
        display: "flex",
        position: "absolute",
        bottom: 0,
        left: 0,
        width: ctx.w,
        height: Math.round(ctx.h * 0.6),
        background: "linear-gradient(to top, rgba(15,16,17,0.95), rgba(15,16,17,0))",
      }}
    />,
    <div
      key="content"
      style={{
        display: "flex",
        flexDirection: "column",
        position: "absolute",
        left: 72,
        right: 72,
        bottom: 90,
        gap: 18,
      }}
    >
      {spec.eyebrow ? <div style={eyebrowStyle}>{spec.eyebrow}</div> : null}
      <div style={coralRule()} />
      <div style={{ fontFamily: HERO_FONT, fontSize: 96, lineHeight: 1.02, color: BRAND.white }}>
        {spec.hero}
      </div>
      {spec.meta ? (
        <div style={{ fontFamily: BODY_FONT, fontSize: 34, color: BRAND.muted }}>{spec.meta}</div>
      ) : null}
    </div>,
  ]);
}

function statSlide(spec: SlideSpec, ctx: Ctx) {
  return frame(ctx.w, ctx.h, (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: ctx.w,
        height: ctx.h,
        gap: 24,
      }}
    >
      <div style={coralRule(70)} />
      <div style={{ fontFamily: HERO_FONT, fontSize: 200, lineHeight: 1, color: BRAND.white }}>
        {spec.stat?.value ?? spec.hero}
      </div>
      <div
        style={{
          fontFamily: BODY_FONT,
          fontSize: 30,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: BRAND.muted,
        }}
      >
        {spec.stat?.label ?? spec.meta}
      </div>
    </div>
  ));
}

function photoFeature(spec: SlideSpec, ctx: Ctx) {
  const photoH = Math.round(ctx.h * 0.62);
  return frame(ctx.w, ctx.h, [
    ctx.photoUri ? (
      <img key="photo" src={ctx.photoUri} width={ctx.w} height={photoH} style={{ objectFit: "cover" }} />
    ) : (
      <div key="photo" style={{ display: "flex", width: ctx.w, height: photoH, backgroundColor: "#1a1c1e" }} />
    ),
    <div
      key="content"
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "56px 72px",
        gap: 20,
        justifyContent: "center",
      }}
    >
      {spec.eyebrow ? <div style={eyebrowStyle}>{spec.eyebrow}</div> : null}
      {spec.hero ? (
        <div style={{ fontFamily: HERO_FONT, fontSize: 60, lineHeight: 1.05, color: BRAND.white }}>
          {spec.hero}
        </div>
      ) : null}
      {spec.body ? (
        <div style={{ fontFamily: BODY_FONT, fontSize: 30, lineHeight: 1.4, color: BRAND.muted }}>
          {spec.body}
        </div>
      ) : null}
    </div>,
  ]);
}

function quoteSlide(spec: SlideSpec, ctx: Ctx) {
  return frame(ctx.w, ctx.h, (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: ctx.w,
        height: ctx.h,
        padding: "120px 80px",
        justifyContent: "center",
        gap: 28,
      }}
    >
      <div style={{ fontFamily: HERO_FONT, fontSize: 160, lineHeight: 0.6, color: BRAND.coral }}>“</div>
      <div style={{ fontFamily: HERO_FONT, fontSize: 64, lineHeight: 1.12, color: BRAND.white }}>
        {spec.hero}
      </div>
      {spec.meta ? (
        <div
          style={{
            fontFamily: BODY_FONT,
            fontSize: 26,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: BRAND.muted,
          }}
        >
          {spec.meta}
        </div>
      ) : null}
    </div>
  ));
}

function ctaSlide(spec: SlideSpec, ctx: Ctx) {
  return frame(ctx.w, ctx.h, (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: ctx.w,
        height: ctx.h,
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
      }}
    >
      {spec.hero ? (
        <div style={{ fontFamily: HERO_FONT, fontSize: 70, color: BRAND.white, textAlign: "center" }}>
          {spec.hero}
        </div>
      ) : null}
      <div style={coralRule(80)} />
      <div style={{ fontFamily: BODY_FONT, fontSize: 32, color: BRAND.white }}>{ctx.agent.name}</div>
      <div style={{ fontFamily: BODY_FONT, fontSize: 26, color: BRAND.muted }}>
        {`${ctx.agent.brokerage}${ctx.agent.phone ? ` · ${ctx.agent.phone}` : ""}`}
      </div>
      {ctx.agent.handle ? (
        <div style={{ fontFamily: BODY_FONT, fontSize: 24, color: BRAND.coral }}>{ctx.agent.handle}</div>
      ) : null}
    </div>
  ));
}

export function renderSlideTree(spec: SlideSpec, ctx: Ctx): React.ReactNode {
  switch (spec.layoutVariant) {
    case "just_listed_cover":
      return justListedCover(spec, ctx);
    case "stat":
      return statSlide(spec, ctx);
    case "photo_feature":
      return photoFeature(spec, ctx);
    case "quote":
      return quoteSlide(spec, ctx);
    case "cta":
      return ctaSlide(spec, ctx);
    default:
      return photoFeature(spec, ctx);
  }
}
