import { Resend } from "resend";

// Only initialize Resend if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.FROM_EMAIL || "OpenDiff <noreply@opendiff.dev>";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5174";

interface SendInviteEmailParams {
  to: string;
  inviterName: string;
  orgName: string;
  token: string;
  role: string;
}

export async function sendInviteEmail({
  to,
  inviterName,
  orgName,
  token,
  role,
}: SendInviteEmailParams): Promise<{ success: boolean; error?: string }> {
  const inviteUrl = `${FRONTEND_URL}/invite/${token}`;

  // If Resend is not configured, log and return
  if (!resend) {
    console.log(`[Email] Resend not configured. Would send invite to ${to} for ${orgName}`);
    console.log(`[Email] Invite URL: ${inviteUrl}`);
    return { success: false, error: "Email service not configured" };
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `You've been invited to join ${orgName} on OpenDiff`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">OpenDiff</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="margin-top: 0;">You're invited!</h2>

    <p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on OpenDiff as a <strong>${role.toLowerCase()}</strong>.</p>

    <p>OpenDiff provides AI-powered code reviews for your pull requests, helping you ship better code faster.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${inviteUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Accept Invitation</a>
    </div>

    <p style="color: #6b7280; font-size: 14px;">This invitation link will expire in 7 days.</p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

    <p style="color: #6b7280; font-size: 12px;">If you didn't expect this invitation, you can safely ignore this email.</p>

    <p style="color: #6b7280; font-size: 12px;">Or copy this link: <a href="${inviteUrl}" style="color: #667eea;">${inviteUrl}</a></p>
  </div>
</body>
</html>
      `.trim(),
      text: `
${inviterName} has invited you to join ${orgName} on OpenDiff as a ${role.toLowerCase()}.

OpenDiff provides AI-powered code reviews for your pull requests, helping you ship better code faster.

Accept the invitation: ${inviteUrl}

This invitation link will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.
      `.trim(),
    });

    if (error) {
      console.error("Failed to send invite email:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to send invite email:", error);
    return { success: false, error: String(error) };
  }
}
