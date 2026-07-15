import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy — WaveOS" },
      { name: "description", content: "How WaveOS and Dream Wave Media handle your data." },
    ],
  }),
});

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-foreground">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Effective July 15, 2026.</p>
      <div className="prose prose-invert mt-8 space-y-4 text-sm leading-relaxed">
        <p>WaveOS is operated by Dream Wave Media on behalf of its clients. Client workspaces contain content, media, and connected social accounts you or Dream Wave Media provide.</p>
        <h2 className="text-lg font-semibold">What we collect</h2>
        <p>Account details (name, email), workspace content (posts, media, captions), and metadata from connected social platforms for the purpose of publishing and reporting.</p>
        <h2 className="text-lg font-semibold">How we use it</h2>
        <p>Solely to operate the platform on your behalf: scheduling, publishing, and pulling performance analytics.</p>
        <h2 className="text-lg font-semibold">Data sharing</h2>
        <p>We share content with the social platforms you connect through our publishing partner, Ayrshare. We never sell your data.</p>
        <h2 className="text-lg font-semibold">Retention & deletion</h2>
        <p>Your data lives in your workspace until removed. Request full deletion at any time — email privacy@dreamwavemedia.co.</p>
      </div>
    </div>
  );
}
