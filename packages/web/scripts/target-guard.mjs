export function isLocalValidationUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const ipv4MappedDottedLoopback = /^::ffff:127(?:\.\d{1,3}){3}$/.test(hostname);
    const ipv4MappedHexLoopback = hostname.match(/^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/);
    const ipv4MappedHexFirstHextet = ipv4MappedHexLoopback
      ? Number.parseInt(ipv4MappedHexLoopback[1], 16)
      : Number.NaN;
    return (
      hostname === "localhost" ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname) ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "::" ||
      hostname === "0:0:0:0:0:0:0:0" ||
      ipv4MappedDottedLoopback ||
      (Number.isFinite(ipv4MappedHexFirstHextet) &&
        ipv4MappedHexFirstHextet >= 0x7f00 &&
        ipv4MappedHexFirstHextet <= 0x7fff)
    );
  } catch {
    return false;
  }
}

export function assertRemoteOnlyValidationTargets({ skipDevServer, urls, errorMessage }) {
  if (skipDevServer && urls.some(isLocalValidationUrl)) {
    throw new Error(errorMessage);
  }
}
