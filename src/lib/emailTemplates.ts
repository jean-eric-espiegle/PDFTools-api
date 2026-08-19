/**
 * Shared HTML/text builder for every transactional email this app sends.
 * Deliberately table-based with inline styles rather than a <style> block
 * or flexbox/grid — Outlook desktop's rendering engine (Word) ignores most
 * modern CSS, and table+inline-style is still the only layout technique
 * that's reliably consistent across Gmail/Apple Mail/Outlook/mobile clients.
 *
 * Colors and the "P" mark mirror the landing page's design system
 * (site/index.html) for brand consistency — same paper/ink/registration-red
 * palette, same sharp 4px radius, same wordmark treatment. Not loading the
 * actual Sora/Public Sans/IBM Plex Mono webfonts here: most email clients
 * block external font loading in HTML mail, so this falls back to safe
 * system-font stacks that read as the same restrained, technical register.
 */

const COLOR = {
  bg: "#faf8f4",
  surface: "#ffffff",
  border: "#e7e2d9",
  ink: "#18140f",
  inkMuted: "#6b6459",
  inkFaint: "#9b9384",
  accent: "#c43b24",
  accentInk: "#fff8f3",
  codeBg: "#f2efe8",
};

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

export interface EmailContent {
  /** Hidden preview text shown next to the subject in an inbox list. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** Mutually exclusive with `code` in practice, but not enforced — caller's choice. */
  cta?: { label: string; url: string };
  /** Large monospace display for 2FA codes. */
  code?: string;
  footerNote: string;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEmail(content: EmailContent): { html: string; text: string } {
  const text = [
    content.heading,
    "",
    ...content.paragraphs,
    ...(content.cta ? ["", `${content.cta.label}: ${content.cta.url}`] : []),
    ...(content.code ? ["", `Code: ${content.code}`] : []),
    "",
    content.footerNote,
  ].join("\n");

  const paragraphsHtml = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${COLOR.inkMuted};">${escapeHtml(p)}</p>`
    )
    .join("");

  const ctaHtml = content.cta
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0;">
        <tr><td style="background-color:${COLOR.accent};border-radius:4px;">
          <a href="${content.cta.url}" style="display:inline-block;padding:12px 26px;font-family:${SANS};font-size:15px;font-weight:600;color:${COLOR.accentInk};text-decoration:none;">${escapeHtml(content.cta.label)}</a>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${COLOR.inkFaint};word-break:break-all;">Or paste this link into your browser: <a href="${content.cta.url}" style="color:${COLOR.accent};">${content.cta.url}</a></p>
    `
    : "";

  const codeHtml = content.code
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0;width:100%;">
        <tr><td style="background-color:${COLOR.codeBg};border:1px solid ${COLOR.border};border-radius:4px;padding:18px 24px;text-align:center;">
          <span style="font-family:${MONO};font-size:28px;font-weight:700;letter-spacing:7px;color:${COLOR.ink};">${escapeHtml(content.code)}</span>
        </td></tr>
      </table>
    `
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${COLOR.bg};">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR.bg};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:4px;">
    <tr><td style="padding:24px 32px;border-bottom:1px solid ${COLOR.border};">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:22px;height:22px;border:1.5px solid ${COLOR.accent};border-radius:3px;text-align:center;font-family:${MONO};font-size:12px;font-weight:700;color:${COLOR.accent};line-height:21px;">P</td>
        <td style="padding-left:8px;font-family:${SANS};font-size:15px;font-weight:700;color:${COLOR.ink};">PDF Toolkit API</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:32px;">
      <h1 style="margin:0 0 16px;font-family:${SANS};font-size:20px;line-height:1.3;font-weight:700;color:${COLOR.ink};">${escapeHtml(content.heading)}</h1>
      ${paragraphsHtml}
      ${ctaHtml}
      ${codeHtml}
    </td></tr>
    <tr><td style="padding:18px 32px;border-top:1px solid ${COLOR.border};">
      <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.5;color:${COLOR.inkFaint};">${escapeHtml(content.footerNote)}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  return { html, text };
}
