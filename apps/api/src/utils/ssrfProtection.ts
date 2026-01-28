/**
 * SSRF (Server-Side Request Forgery) protection utilities
 * Blocks requests to internal/private IP ranges
 */

/**
 * Check if a host is a private/internal IP address
 */
export function isPrivateIP(host: string): boolean {
  if (!host) return true;

  // Remove port if present
  const hostname = host.split(":")[0].toLowerCase();

  // Block localhost variants
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0"
  ) {
    return true;
  }

  // Block AWS metadata service
  if (hostname === "169.254.169.254") {
    return true;
  }

  // Check if it's an IP address
  const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipRegex);
  if (!match) {
    // Not an IP, assume it's a domain name - allow it
    return false;
  }

  const parts = match.slice(1, 5).map(Number);

  // Validate IP range
  if (parts.some((p) => p > 255)) {
    return true; // Invalid IP, block it
  }

  // RFC 1918 private ranges
  // 10.0.0.0/8
  if (parts[0] === 10) {
    return true;
  }

  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }

  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) {
    return true;
  }

  // Link-local 169.254.0.0/16
  if (parts[0] === 169 && parts[1] === 254) {
    return true;
  }

  return false;
}

/**
 * Validate URL for SSRF protection
 * Returns true if URL is safe, false if it should be blocked
 */
export function isUrlSafe(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only allow http and https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    // Check hostname for private IPs
    if (isPrivateIP(parsed.hostname)) {
      return false;
    }

    return true;
  } catch (error) {
    // Invalid URL
    return false;
  }
}

