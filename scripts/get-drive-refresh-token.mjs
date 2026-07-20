// One-shot OAuth consent flow that prints a Drive refresh token. It lives
// outside src/ on purpose: it is NOT part of the app (see
// specs/drive-connection/design.md §9). Run it once with:
//   node scripts/get-drive-refresh-token.mjs
import 'dotenv/config'
import { createServer } from 'node:http'

import { auth } from '@googleapis/drive'

// Repeated here because this plain .mjs is not compiled by tsc and cannot import
// the .ts source. Source of truth: src/lib/drive.ts (driveScope).
const driveScope = 'https://www.googleapis.com/auth/drive'

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET

if (!clientId || !clientSecret) {
  console.error(
    'Missing GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET in .env. ' +
      'Complete steps 6-7 of specs/drive-connection/design.md §10 first.',
  )
  process.exit(1)
}

const port = 5555
const redirectUri = `http://localhost:${port}`

const oauth = new auth.OAuth2({ clientId, clientSecret, redirectUri })

// `access_type: 'offline'` is what makes Google return a refresh token;
// `prompt: 'consent'` forces a fresh one even if consent was granted before.
const authorizeUrl = oauth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [driveScope],
})

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, redirectUri)
    const code = url.searchParams.get('code')
    if (!code) {
      response.statusCode = 400
      response.end('Missing authorization code. You can close this tab and retry.')
      return
    }

    const { tokens } = await oauth.getToken(code)
    response.end('Refresh token obtained. You can close this tab and return to the terminal.')

    if (!tokens.refresh_token) {
      console.error(
        'No refresh token was returned. Revoke access at ' +
          'https://myaccount.google.com/permissions and run this again.',
      )
      process.exitCode = 1
    } else {
      console.log(`\nGOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}\n`)
      console.log('Paste it into .env (see step 8 of specs/drive-connection/design.md §10).')
    }
  } catch (error) {
    console.error('Failed to exchange the authorization code:', error)
    process.exitCode = 1
  } finally {
    server.close()
  }
})

server.listen(port, () => {
  console.log('Open this URL in the browser of the Google account you want to use:\n')
  console.log(`${authorizeUrl}\n`)
})
