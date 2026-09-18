import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getContractSigningLink } from "@/lib/contracts.functions";
import { errorMessage } from "@/lib/error-message";

const SIGNWELL_EMBED_SCRIPT = "https://static.signwell.com/assets/embedded.js";

type SignWellEmbedEvent = { id?: string; url?: string; declineReason?: string };

type SignWellEmbedInstance = {
  open: () => void;
};

type SignWellEmbedConstructor = new (options: {
  url: string;
  redirectionUrl?: string;
  declineRedirectionUrl?: string;
  allowRedirect?: boolean;
  iframeRedirect?: boolean;
  showHeader?: boolean;
  allowDownload?: boolean;
  signatureDefaultName?: boolean;
  events?: {
    completed?: (event: SignWellEmbedEvent) => void;
    declined?: (event: SignWellEmbedEvent) => void;
    error?: (event: unknown) => void;
  };
}) => SignWellEmbedInstance;

declare global {
  interface Window {
    SignWellEmbed?: SignWellEmbedConstructor;
  }
}

let signWellScriptPromise: Promise<SignWellEmbedConstructor> | null = null;

function loadSignWellEmbed(): Promise<SignWellEmbedConstructor> {
  if (window.SignWellEmbed) return Promise.resolve(window.SignWellEmbed);
  if (signWellScriptPromise) return signWellScriptPromise;

  const loading = new Promise<SignWellEmbedConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SIGNWELL_EMBED_SCRIPT}"]`,
    );
    const script = existing ?? document.createElement("script");

    const finish = () => {
      if (window.SignWellEmbed) resolve(window.SignWellEmbed);
      else reject(new Error("SignWell's secure signing window could not be loaded."));
    };
    const fail = () => reject(new Error("SignWell's secure signing window could not be loaded."));

    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", fail, { once: true });
    if (!existing) {
      script.src = SIGNWELL_EMBED_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    signWellScriptPromise = null;
    throw error;
  });

  signWellScriptPromise = loading;
  return loading;
}

export function ContractSignButton({
  contractId,
  label = "Sign contract",
  className,
}: {
  contractId: string;
  label?: string;
  className?: string;
}) {
  const getLink = useServerFn(getContractSigningLink);
  const signing = useMutation({
    mutationFn: async () => {
      const [link, SignWellEmbed] = await Promise.all([
        getLink({ data: { contractId } }),
        loadSignWellEmbed(),
      ]);
      return { ...link, SignWellEmbed };
    },
  });

  const openSigning = () => {
    signing.mutate(undefined, {
      onSuccess: ({ url, returnUrl, SignWellEmbed }) => {
        // SignWell's embedded URLs are iframe credentials. Opening one as a
        // normal browser page makes SignWell reject it as invalid/outdated.
        // Use the provider's supported embed client and return to WaveOS after
        // completion or decline.
        const signingWindow = new SignWellEmbed({
          url,
          redirectionUrl: returnUrl,
          declineRedirectionUrl: returnUrl,
          allowRedirect: true,
          iframeRedirect: false,
          showHeader: true,
          allowDownload: true,
          signatureDefaultName: true,
          events: {
            completed: () => window.location.assign(returnUrl),
            declined: () => window.location.assign(returnUrl),
            error: () => toast.error("SignWell could not display this contract."),
          },
        });
        signingWindow.open();
      },
      onError: (error) => {
        toast.error(errorMessage(error, "Could not open SignWell."));
      },
    });
  };

  return (
    <button type="button" onClick={openSigning} disabled={signing.isPending} className={className}>
      {signing.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ExternalLink className="h-4 w-4" />
      )}
      {signing.isPending ? "Opening SignWell…" : label}
    </button>
  );
}
