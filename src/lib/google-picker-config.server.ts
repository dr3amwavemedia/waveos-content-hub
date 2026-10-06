export function googlePickerConfig() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() ?? "";
  const appId = process.env.GOOGLE_DRIVE_APP_ID?.trim() ?? "";
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim() ?? "";

  return {
    clientId,
    appId,
    apiKey,
    clientIdValid: /\.apps\.googleusercontent\.com$/.test(clientId),
    appIdValid: /^\d+$/.test(appId),
    apiKeyValid: /^AIza[0-9A-Za-z_-]{20,}$/.test(apiKey),
  };
}

