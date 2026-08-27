import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { MAIL_FROM, SITE_URL } from './env.js'

/**
 * Outgoing email.
 *
 * There is exactly one message the product sends, and it is the one that must
 * not go missing: the link that gets somebody back into their account. If SES
 * is not configured yet, this says so rather than throwing — a super admin can
 * hand the same link over by other means, and a reset request must never fail
 * because of the mail server.
 */

const ses = MAIL_FROM ? new SESv2Client({}) : null

export type MailResult = { sent: boolean; reason?: string }

/**
 * Makes a name safe to put in an HTML email.
 *
 * A club's name is typed by a person and lands inside the markup below. Without
 * this, naming a club with a fragment of HTML would let that markup — a link,
 * say — be delivered from this product's own verified address.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** A subject line is one line: a name with newlines in it could add headers. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}


export async function sendPasswordReset(to: string, link: string): Promise<MailResult> {
  if (!ses || !MAIL_FROM) return { sent: false, reason: 'email is not configured' }

  const text = [
    'Someone asked to reset the password for your MFTournament account.',
    '',
    'Open this link to choose a new one:',
    link,
    '',
    'The link works once and expires in an hour.',
    'If this was not you, ignore this message — nothing has changed.',
    '',
    SITE_URL,
  ].join('\n')

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.55;color:#0B1120">
      <p>Someone asked to reset the password for your MFTournament account.</p>
      <p>
        <a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#4F46E5;color:#fff;text-decoration:none;font-weight:600">
          Choose a new password
        </a>
      </p>
      <p style="color:#475569;font-size:14px">The link works once and expires in an hour.</p>
      <p style="color:#475569;font-size:14px">If this was not you, ignore this message — nothing has changed.</p>
      <p style="color:#94A3B8;font-size:12px">${SITE_URL}</p>
    </div>`

  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: MAIL_FROM,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: 'Reset your MFTournament password' },
            Body: { Text: { Data: text }, Html: { Data: html } },
          },
        },
      }),
    )
    return { sent: true }
  } catch (error) {
    // In the SES sandbox this fails for any address that is not verified. The
    // caller still answers the request normally: whether an email exists is not
    // something an unauthenticated visitor gets to learn.
    console.error('Password reset email failed', error)
    return { sent: false, reason: (error as Error).message }
  }
}

/** The invitation to run a club. */
export async function sendTeamInvite(
  to: string,
  teamName: string,
  link: string,
  tournamentName?: string,
): Promise<MailResult> {
  if (!ses || !MAIL_FROM) return { sent: false, reason: 'email is not configured' }

  // An invitation issued from inside a competition also enters the club in it.
  // Saying so in the email matters: the coach opening the link is agreeing to
  // play, not only to keep a squad list up to date.
  const entering = tournamentName
    ? `${teamName} will be entered in ${tournamentName} as soon as you do.`
    : ''

  const text = [
    `You have been invited to run ${teamName} on MFTournament.`,
    ...(entering ? ['', entering] : []),
    '',
    'Open this link to take it over:',
    link,
    '',
    'You will be able to edit the squad, keep the crest up to date and enter',
    'the club into competitions. The link works once.',
    '',
    SITE_URL,
  ].join('\n')

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.55;color:#0B1120">
      <p>You have been invited to run <strong>${escapeHtml(teamName)}</strong> on MFTournament.</p>
      ${entering ? `<p>${escapeHtml(entering)}</p>` : ''}
      <p>
        <a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#4F46E5;color:#fff;text-decoration:none;font-weight:600">
          Take over the club
        </a>
      </p>
      <p style="color:#475569;font-size:14px">
        You will be able to edit the squad, keep the crest up to date and enter the club into
        competitions. The link works once.
      </p>
      <p style="color:#94A3B8;font-size:12px">${SITE_URL}</p>
    </div>`

  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: MAIL_FROM,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: oneLine(`You have been invited to run ${teamName}`) },
            Body: { Text: { Data: text }, Html: { Data: html } },
          },
        },
      }),
    )
    return { sent: true }
  } catch (error) {
    console.error('Team invitation email failed', error)
    return { sent: false, reason: (error as Error).message }
  }
}
