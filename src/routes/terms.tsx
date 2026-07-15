import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms of Service — WaveOS" },
      { name: "description", content: "Terms of service for WaveOS, a Dream Wave Media platform." },
    ],
  }),
});

function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-foreground">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Effective July 15, 2026.</p>
      <div className="prose prose-invert mt-8 space-y-4 text-sm leading-relaxed">
        <p>WaveOS is an invitation-only platform for active clients of Dream Wave Media. By signing in you agree to these terms and our privacy policy.</p>
        <h2 className="text-lg font-semibold">Acceptable use</h2>
        <p>You must own or have the right to publish any content uploaded to your workspace. You will not use WaveOS to spam, deceive, or violate any social platform's terms.</p>
        <h2 className="text-lg font-semibold">Content ownership</h2>
        <p>You own your content. Dream Wave Media receives a limited license to store, transform, and publish it on your behalf.</p>
        <h2 className="text-lg font-semibold">Service availability</h2>
        <p>We work hard to keep WaveOS available, but occasional maintenance and third-party outages may occur.</p>
        <h2 className="text-lg font-semibold">Termination</h2>
        <p>Either party may end the engagement per your service agreement with Dream Wave Media. On termination we will export your data on request.</p>
      </div>
    </div>
  );
}
