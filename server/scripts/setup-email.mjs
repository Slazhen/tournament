#!/usr/bin/env node
/**
 * Sets up outgoing email: verifies the domain in SES and publishes the DKIM
 * records to Route 53.
 *
 * Nothing has ever been sent from this application. `MailFrom` was never passed
 * to the deployment, so `MAIL_FROM` was empty, `lib/mail.ts` never built an SES
 * client, and every reset link and club invitation came back `sent: false` —
 * which the interface showed as "here is the link" rather than as a failure.
 * Passing the address is one line of samconfig; this script is the other half,
 * the part AWS needs.
 *
 * Run it from your own machine with your own AWS credentials:
 *
 *   node scripts/setup-email.mjs
 *   node scripts/setup-email.mjs --request-production
 *
 * It is safe to run again: the identity is created only if missing and the DNS
 * records are upserted, so a second run just re-reports the state.
 *
 * `--request-production` asks AWS to take the account out of the SES sandbox.
 * That matters: in the sandbox SES will only deliver to addresses you have
 * verified one by one, so a club secretary you have never met gets nothing. The
 * request is reviewed by a person and usually answered within a day.
 */

import {
  SESv2Client,
  CreateEmailIdentityCommand,
  GetAccountCommand,
  GetEmailIdentityCommand,
  PutAccountDetailsCommand,
} from '@aws-sdk/client-sesv2'
import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
  ListHostedZonesByNameCommand,
} from '@aws-sdk/client-route-53'

const REGION = process.env.AWS_REGION ?? 'us-east-1'
const DOMAIN = process.env.MAIL_DOMAIN ?? 'myfootballtournament.com'
const SITE_URL = process.env.SITE_URL ?? `https://${DOMAIN}`
const requestProduction = process.argv.includes('--request-production')

const ses = new SESv2Client({ region: REGION })
// Route 53 is global; its endpoint lives in us-east-1 whatever the SES region.
const route53 = new Route53Client({ region: 'us-east-1' })

console.log(`Region: ${REGION}`)
console.log(`Domain: ${DOMAIN}\n`)

/* 1. The identity, and the DKIM tokens that prove the domain is yours. */

let identity
try {
  identity = await ses.send(new GetEmailIdentityCommand({ EmailIdentity: DOMAIN }))
  console.log('SES identity already exists.')
} catch (error) {
  if (error.name !== 'NotFoundException') throw error
  console.log('Creating the SES identity…')
  await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: DOMAIN }))
  identity = await ses.send(new GetEmailIdentityCommand({ EmailIdentity: DOMAIN }))
}

const tokens = identity.DkimAttributes?.Tokens ?? []
if (tokens.length === 0) {
  console.error('SES returned no DKIM tokens. Nothing to publish; check the identity by hand.')
  process.exit(1)
}

const records = tokens.map((token) => ({
  name: `${token}._domainkey.${DOMAIN}`,
  value: `${token}.dkim.amazonses.com`,
}))

/* 2. The hosted zone, and the three records in it. */

const zones = await route53.send(new ListHostedZonesByNameCommand({ DNSName: DOMAIN }))
// ListHostedZonesByName returns everything from the name onwards alphabetically,
// so the domain has to be matched rather than assumed to be first. A private
// zone of the same name is not the one the internet reads.
const zone = (zones.HostedZones ?? []).find(
  (candidate) => candidate.Name === `${DOMAIN}.` && !candidate.Config?.PrivateZone,
)

if (!zone) {
  console.log(`\nNo public Route 53 zone for ${DOMAIN}. Add these three CNAMEs wherever the DNS lives:\n`)
  for (const record of records) console.log(`  ${record.name}  CNAME  ${record.value}`)
} else {
  console.log(`\nHosted zone: ${zone.Id}`)
  await route53.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: zone.Id,
      ChangeBatch: {
        Comment: 'SES Easy DKIM for MFTournament',
        Changes: records.map((record) => ({
          // Upsert rather than create: running this twice must not fail, and a
          // re-created identity issues new tokens that have to replace the old.
          Action: 'UPSERT',
          ResourceRecordSet: {
            Name: record.name,
            Type: 'CNAME',
            TTL: 1800,
            ResourceRecords: [{ Value: record.value }],
          },
        })),
      },
    }),
  )
  console.log('DKIM records published:')
  for (const record of records) console.log(`  ${record.name} -> ${record.value}`)
}

/* 3. Where it stands now. */

const status = identity.DkimAttributes?.Status
const verified = identity.VerifiedForSendingStatus
console.log(`\nDKIM: ${status ?? 'unknown'}`)
console.log(`Verified for sending: ${verified ? 'yes' : 'not yet'}`)
if (!verified) {
  console.log('DNS takes a few minutes to an hour to propagate. Run this again to check.')
}

const account = await ses.send(new GetAccountCommand({}))
const production = account.ProductionAccessEnabled === true
console.log(`Sending enabled: ${account.SendingEnabled ? 'yes' : 'no'}`)
console.log(`Out of the sandbox: ${production ? 'yes' : 'no'}`)

if (!production && !requestProduction) {
  console.log(
    '\nIn the sandbox SES delivers only to addresses verified one by one, so an invitation\n' +
      'to a club secretary will not arrive. Ask AWS for production access with:\n' +
      '  node scripts/setup-email.mjs --request-production',
  )
}

if (!production && requestProduction) {
  console.log('\nRequesting production access…')
  try {
    await ses.send(
      new PutAccountDetailsCommand({
        MailType: 'TRANSACTIONAL',
        WebsiteURL: SITE_URL,
        UseCaseDescription:
          'MFTournament is a football league and tournament manager. It sends two ' +
          'transactional messages, both to people who asked for them: a password reset ' +
          'link requested by the account holder, and an invitation to run a club, sent ' +
          'by the league organiser to the coach or club secretary at an address the ' +
          'organiser typed in. There is no marketing, no list and no bulk sending. ' +
          'Bounces and complaints will be monitored in SES and the address removed.',
        ContactLanguage: 'EN',
        ProductionAccessEnabled: true,
      }),
    )
    console.log('Requested. AWS usually answers within a day, by email.')
  } catch (error) {
    console.error(`Could not request production access: ${error.message}`)
    console.error('If the account details are already set, ask through the SES console instead.')
  }
}
