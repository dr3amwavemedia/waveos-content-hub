export function publicHttpsOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    const first = ipv4 ? Number(ipv4[1]) : -1;
    const second = ipv4 ? Number(ipv4[2]) : -1;
    const privateIp =
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      privateIp ||
      ["[::1]", "::1"].includes(host)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
