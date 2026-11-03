import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { usesDirectSupabaseOAuth } from "@/lib/auth-oauth-origin";

type GoogleSignInOptions = {
  redirectTo: string;
  loginHint?: string;
};

export async function signInWithGoogle({ redirectTo, loginHint }: GoogleSignInOptions) {
  if (usesDirectSupabaseOAuth(window.location.origin)) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account",
          ...(loginHint ? { login_hint: loginHint } : {}),
        },
      },
    });

    return {
      redirected: Boolean(data.url && !error),
      tokens: undefined,
      error,
    };
  }

  return lovable.auth.signInWithOAuth("google", {
    redirect_uri: redirectTo,
    extraParams: {
      prompt: "select_account",
      ...(loginHint ? { login_hint: loginHint } : {}),
    },
  });
}
