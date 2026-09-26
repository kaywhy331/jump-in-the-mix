// A JSON-LD data block. It is not executed, so the page's script nonce does not apply; "<" is
// escaped so page markup can never be closed from inside the data.
export function StructuredData({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
