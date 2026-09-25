// Structured data. Rendered as a plain <script> tag so it lands in the HTML
// Google actually parses — `<` is escaped because a stray "</script>" inside
// any string would close the tag early.
export default function JsonLd({ id, data }: { id: string; data: object }) {
  return (
    <script
      type="application/ld+json"
      id={id}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
