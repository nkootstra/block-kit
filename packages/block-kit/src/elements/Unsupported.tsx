/** Visible placeholder for a type this library doesn't render, so gaps are obvious in previews. */
export function Unsupported({ type }: { type: unknown }) {
  return (
    <span className="sbk-unsupported" title="Not rendered yet">
      {typeof type === "string" ? type : null}
    </span>
  );
}
