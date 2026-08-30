// The hero object: an abstract disco ball. Overlapping blue and red circles,
// offset a few px, create a chroma-fringe rim (blue left, red right); soft
// blurred color blobs float inside on a near-black field; the whole thing hangs
// from a thin 2px line. Pure CSS — no exported raster, scales with the viewport.
// Decorative, so aria-hidden.

export default function DiscoBall() {
  return (
    <div className="bx-disco" aria-hidden="true">
      <span className="bx-disco__line" />
      <div className="bx-disco__rim bx-disco__rim--blue" />
      <div className="bx-disco__rim bx-disco__rim--red" />
      <div className="bx-disco__field">
        <span className="bx-disco__blob bx-disco__blob--blue" />
        <span className="bx-disco__blob bx-disco__blob--red" />
        <span className="bx-disco__blob bx-disco__blob--green" />
      </div>
    </div>
  );
}
