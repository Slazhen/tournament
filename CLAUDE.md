# MFTournament

A football league and tournament manager: organisers run competitions, clubs are
run by their own managers, and the public sees tables, fixtures and scorers at
`myfootballtournament.com`.

This file is what a new contributor — human or agent — should read first. It is
about how this codebase is built and why, not about what to build next.

## Shape of the thing

Two halves in one repository.

**The site** — React 19 + TypeScript + Vite + Tailwind 4, zustand for admin
state, react-router 7. Deployed by AWS Amplify, which builds from `main` on
push. Routes are code-split with `React.lazy` through the `lazyPage()` helper in
`src/main.tsx`.

**The API** — `server/`, an AWS SAM application: one HTTP API in front of one
Lambda ("lambdalith"), DynamoDB behind it, S3 for images. `server/src/handler.ts`
is the only entry point; it builds a tiny router (`lib/router.ts`) and hands the
request to one of the route modules.

The single most important rule in the repository:

> **The browser gets no AWS credentials, ever.** Every read and write goes
> through the API, which holds its permissions in the Lambda execution role.
> Images are uploaded with a presigned POST the API mints; the client never
> chooses an S3 key. The app once held IAM keys in the bundle and compared
> password hashes in React — every trace of that is gone and must stay gone.

## Where things live

```
src/
  lib/api.ts        the only place that talks to the API; holds the bearer token
  lib/data.ts       typed service objects per resource (teams, tournaments, clubs…)
  lib/auth.ts       sign in, password reset, invitations, roles
  store.ts          zustand store for the organiser's admin screens
  utils/            pure logic: fixtures, standings, seasons, squads, slugs, formats
  pages/            one file per screen; Public* and New* are the unauthenticated ones
  components/icons.tsx   the whole icon set — this project uses no emoji anywhere
server/src/
  handler.ts        entry point, CORS, error mapping
  lib/              env, ddb, router, http, auth, sessions, passwords, mail, audit, cache
  repos.ts          DynamoDB access for organisers, teams, tournaments
  repos-clubs.ts    invitations, manager links, competition entries
  routes/           public.ts, auth.ts, admin.ts, uploads.ts, clubs.ts
```

## Domain decisions worth knowing before changing anything

**Seasons are not a separate entity.** A competition run again next year is the
next season of the same competition. Every season carries the same `seriesId`
and the grouping falls out of that — there is no "competition" record, because
it would own no field a season does not already have. `src/utils/seasons.ts`
holds `seriesKey`, `seasonLabel`, `championOf` and friends. Cross-season
aggregate statistics were considered and deliberately rejected.

**A club is global; its participation is not.** A `Team` is the club — name,
crest, colours, squad — and belongs to whoever runs it. Its participation in one
competition is separate: `tournament.teamIds` for who is in, `tournament.squads`
for which of that club's players are registered. `src/utils/squads.ts` decides
this for the site and `server/src/lib/lineups.ts` for the API, and the two must
agree — the server cannot take the browser's word for who may play.

**What an absent entry means is the organiser's choice.** `squadsStrict` off,
which is the default and what every competition did before the field existed, a
club absent from `squads` has its whole squad registered and anyone it signs
later joins automatically. On, that club has *nobody* registered, and an entry is
the exact list it was saved as. The distinction only exists in the empty case,
which is why "everyone is ticked" is stored as no entry at all in an open
competition and as the list itself in a strict one (`chooseSquad` in
`server/src/lib/squads.ts` is the one place that decides).

Turning the flag on therefore cannot be a plain field write: on a season already
under way it would empty every teamsheet picker at once. `PUT
/admin/tournaments/:id/squad-mode` enters every club as it stands first, with a
conditional write per club so a manager saving in the same second is not
overwritten, and does it again after the flag is written — a manager pressing
"everyone" in the gap would otherwise be stored as an absent entry that the new
rule reads as nobody. `squads` and `squadsStrict` are both refused by the
tournament `PATCH` for this reason.

**A player's date of birth is never public.** `toPublicTeam` in
`routes/public.ts` strips it and puts an `age` in its place, worked out on the
server, so no public page ever holds the date and none of them has to do the
arithmetic. Whether the age goes out at all is the club's decision and not each
player's — `team.hidePlayerAges`, set once for the squad — because a manager who
does not want the squad's ages published does not want one of them published.
Absent means shown, which is what every club did before the flag existed.

`/public/players/:id` returns the player *from the projected squad*, not the
stored record beside it: returning the stored one is exactly how `isPublic` was
undone once before, and it would put the date of birth back on the wire the
projection had just taken off.

**A private season has no public address.** The public routes refuse it, so a
link built for it answers "not found" — including for the organiser who runs it.
Anything that offers to open a competition decides the destination itself: the
public table when it is published, the admin page when the person reading runs
it, and a plain line saying why there is nothing to click otherwise
(`linkFor` in `MyClubPage.tsx`). The address by id, `/public/tournaments/:id`,
always resolves, so a missing organiser name costs a readable URL and not the
link.

**A squad list can contain a hole.** `null` sits in `players` in records from
the browser-side era, and `POST /admin/tournaments` still passes its body
through, so one can be written today. Every public projection filters them out
before it touches a player, because these routes fan out across clubs: a single
null once meant 500 for every visitor of every page that named that club.

**Formats live in `src/utils/formats.ts` and `fixtures.ts`.** One of them is not
generic: `progressive_elimination` reproduces a real organiser's system — a
single round robin, then survivors paired by table position each week with the
leader resting on an odd count and the bottom pair playing to go out. When
touching playoff config, carry `format.customPlayoffConfig.preset` through every
rebuild of that object, or editing a round silently reverts the format.

**Roles.** `super_admin`, `organizer`, `team_manager`. Login is an email address
and nothing else — usernames survive as labels on old accounts and open no door.
There should always be two super admins: the role has nobody above it to reset
its password.

## Authorization

Three questions, three helpers in `server/src/lib/auth.ts`. Use them; do not
hand-roll the comparison.

- `assertSuperAdmin(user)` — accounts, organisers, the audit log.
- `assertCanAccessOrganizer(user, organizerId)` — anything a competition owns:
  fixtures, results, tournament settings, deleting a club.
- `assertManagesTeam(user, team)` — anything a club owns: its name, crest,
  colours, squad, images.

Entering a club in a competition is not on either list alone, because the record
written is the competition's and the players named are the club's. It has two
routes, `PUT /manager/tournaments/:t/squad` guarded by `assertManagesTeam` and
`PUT /admin/tournaments/:t/squads/:teamId` guarded by
`assertCanAccessOrganizer` — the same arrangement as the teamsheet, and for the
same reason: most clubs have no manager, and a competition whose entries only a
coach can fill in is one the organiser cannot run. The organiser's route ignores
`squadsLocked`, which is the deadline they set for the managers.

A club's own player screen, `/my-club/players/:id`, reads `/manager/overview`
rather than a route of its own: the squad is already in that answer, and a
second endpoint would be a second permission check to get wrong. The
organiser's `/players/:id` is a different page reading the organiser's store,
and a coach has no organizer to read.

`assertCanAccessOrganizer` rejects a missing id on purpose. A team manager has no
`organizerId`, so `user.organizerId !== thing.organizerId` written by hand is
`undefined !== undefined`, which is `false` — an inline comparison lets them
through. That bug has been written here twice.

Two things are deliberately closed to a club's own manager: deleting the club
(it may sit in someone else's league) and writing `managerUserIds` (who runs a
club is decided by invitation, and a manager who could write it could hand the
club away or remove the others). Invitations are the organiser's to issue.

**An entry is written by both sides.** A club's application to a competition is
one item that the club writes when it applies and the organiser writes when it
decides, and `putEntry` replaces the whole item. It therefore takes the status
the caller read and makes the write conditional on it: without that, a manager
pressing "apply again" as the organiser pressed "accept" put the row back to
`pending` while the club was already in `teamIds`, and the acceptance was gone.
A refused club may apply again — the decision it replaces is carried onto the new
row as `previousNote` and `previousDecidedAt` — but a pending application is
returned rather than rewritten, so every repeat costs the organiser one
deliberate answer.

**An invitation can carry a competition.** A link issued from a tournament's
settings screen holds its `tournamentId`, and claiming it both hands over the
club and enters it — the organiser inviting a coach mid-setup has already
decided the club is playing. The token is the authority for that write, so the
new manager's own permissions are not consulted; what is re-checked at claim
time is that the club and the competition still share an organiser, because a
super admin can move a club and invitations are not torn up when they do. The
entry never fails the claim: the club changing hands is what the person came
for, and a competition deleted in the meantime must not cost them the
invitation, the account and the session together.

**A list is never written back whole.** `managerUserIds`, an account's
`teamIds` and a tournament's `teamIds` all had a read, a filter or a concat, and
a write of the result — and each lost data to an ordinary second writer. The
worst of them restored a manager the organiser had just removed, which is a
permission, not a display. Append with `list_append` under a `NOT contains`
condition (`tournaments.addTeam`), remove by index with the index checked in the
same request (`unlinkManagerFromTeam`, and `updatePlayer` before it). The same
applies to spending an invitation: `consumeInvite` deletes conditionally and
treats only a successful delete as having spent it, or "works once" holds only
for people who are not in a hurry.

**A manager link is granted by ownership and honoured by identity.** An
organizer may take their own club under management — `POST
/admin/teams/:id/managers/me`, which is the invitation they used to have to
write to themselves — and from then on `managesTeam` lets them in because their
id sits in `managerUserIds`, not because they own the club. So the link has to
be dropped when the club moves to another organizer, or the previous owner keeps
editing a squad inside somebody else's league: `unlinkOwnerManagers` does it, and
it runs before the move so that a failure leaves the move to be repeated. An
invited coach has no `organizerId` and is never touched by it.

**`/manager/overview` answers as the club, not as the account.** A competition
the caller does not organize comes back projected — their own matches whole,
everybody else's reduced to the score, `squads` cut to their own clubs — because
a club playing in a rival's private league must not be a way to read that league.
The projection is a whitelist at every level (`toClubTournament` in
`routes/clubs.ts`): these records are schemaless and `PATCH` writes what it is
given, so a field added later must not travel by default. The same route decides
which clubs are the caller's from `managerUserIds`, not from the `teamIds` on
their account: the two are written one after the other and can disagree.

**A squad is only written one player at a time.** `PATCH /admin/teams/:id`
cannot write `players` — the field is absent from `TEAM_FIELDS` on purpose, for
the same reason `managerUserIds` is. The three player routes each touch one
player under a condition (`addPlayer`, `updatePlayer`, `removePlayer` in
`repos.ts`), and they are the only way in.

**A teamsheet has two authors.** Who played for a club in one match is written
by the organiser, for either side, and by that club's own manager, for their own
side only — `PUT /admin/tournaments/:t/matches/:m/lineup` and the matching
`/manager/...` route, both landing in `tournaments.setLineup`. Which side a
caller may write is derived from the fixture by `sideOfTeam`, never taken from
the request: the club id is the only thing the permission was checked against,
so letting the caller name the side would let them name their opponent's eleven.
The write covers one side of one match and is conditional on the match id *and*
on that club still being on that side — saving a result in the previous round of
a knockout rewrites `homeTeamId` of an existing fixture, so the id alone would
let a teamsheet land on a match the club is no longer in. There is deliberately
no deadline: a teamsheet is filled in after the whistle as often as before it,
and appearances exist nowhere else. `lineups` is therefore absent from the
fields the match `PATCH` accepts, because that route writes the match from the
browser's copy and would undo whichever manager saved last.

**Who may be named is the registration plus whoever is already on the sheet.**
`nameableInMatch` unions the two, because an entry can be narrowed after a match
has been played and the appearances of everyone dropped exist nowhere but that
teamsheet — without the union, the next save of that match, by somebody who only
wanted to add a substitute, would file it without them. A requested player who
belongs to the club but is not nameable is *refused*, not filtered: that is
somebody looking at a screen that has gone stale, and silence would cost them
the record. An id belonging to no club at all is still dropped quietly, since
that is a hand-made request rather than a mistake anyone can make on screen.

Writes that reach the database are recorded by `lib/audit.ts`. A failed audit
write never fails the request that caused it.

## Statistics, and the data behind them

Everything a visitor reads about a player is derived, never stored: there is no
per-player total anywhere in the database. `src/utils/matches.ts` is the only
place that derives it, and the tournament, team and player pages all read it, so
the three of them cannot disagree.

Two different sources, filled in by different people at different times:

- **Goals and assists** come from `match.goals`. An own goal is left out of the
  scorer's tally.
- **Appearances** come from `match.lineups[side].starting`, plus anyone credited
  with a goal or an assist in that match. There is nothing else that records
  that a player was on the pitch — a competition whose lineups nobody fills in
  has no appearances to show, and inferring them from the squad list would
  credit a match to everyone who was injured that week.

`allMatches()` in the same file is what every one of these reads. A tournament's
knockout rounds live inside `format.customPlayoffConfig.playoffRounds`, not in
`matches`, so anything that reads `tournament.matches` directly stops at the
league phase — that is what hid every playoff goal from the scorer list and made
a link to a playoff match answer "Match not found".

**Player ids from before the API exist in old goal records.** The browser-side
app generated nine-character ids (`n1m0kxpe8`); the API generates 32 hex
characters. Goals recorded in the first era point at players whose records never
made it into DynamoDB — the Homebush 2025 season has 59 such goals against five
ids that exist in no club. Nothing can resolve them to a name, so a table built
by walking the clubs' squads showed nothing at all. Statistics are therefore
derived from the goals and matched to a squad for the name, never the other way
round: a row whose player cannot be found still counts, under "Former player".

## Conventions

- Comments explain **why**, in prose, and are worth the space when the reason is
  not obvious from the code. Do not narrate what the next line does.
- British-flavoured English in user-facing copy. Sentences, not labels shouted in
  caps.
- **No emoji anywhere** — in the UI, in copy, or in commits. `components/icons.tsx`
  is the icon set; add to it rather than reaching for a character.
- `PATCH` bodies are picked from a named list of fields, never passed through.
  The records are schemaless, so anything not named gets persisted.
- Player edits touch one player, not the whole squad — two edits made seconds
  apart used to overwrite each other. The body is picked from `PLAYER_FIELDS`
  like every other `PATCH`; it used to be passed through.
- **`null` clears a field, `undefined` does not exist.** `JSON.stringify` drops
  an undefined value, so a key left out of the body means "unchanged" — which is
  why emptying a shirt number on screen used to leave the old number in the
  record. A player update sends `null` to clear, `teams.updatePlayer` deletes
  the key rather than storing a null, and `addPlayer` drops them (a new player
  has nothing to clear). `isPublic` is the exception: absent means public, so
  the route refuses anything but a boolean there rather than letting a null
  publish somebody who asked not to be.
- A `PATCH` that would change nothing is refused. It is not free: the write
  rewrites the record from the copy read at the start of the same request, so
  it can undo a save somebody else made in between.
- **The table is sorted deterministically.** `sortTeamsByStandings` used to end
  in a coin toss, so a season nobody had played — where every club ties on every
  criterion — dealt out different positions on every render.
- Anything derived from match results treats a score as played only when it is
  `typeof === 'number'`. `!== undefined` counts an unplayed fixture and produces
  `NaN` in the table.

## Running and shipping

`./deploy.sh "what changed"` is the only way this goes out. It type-checks the
site, builds it, refuses to ship a bundle containing anything that looks like a
credential, runs the API tests, builds the API, **loads the built Lambda bundle
to prove it starts**, deploys it, then commits and pushes so Amplify builds.

`SKIP_API=1` and `SKIP_PUSH=1` skip parts of it when you know why.

The commit takes the whole working tree, so it takes whatever else is in it. An
unfinished change from a second session has ridden along in somebody else's
commit twice, both times reaching production. So the script now prints the tree
and asks before it runs anything, and checks the same list again at the commit —
the checks and the API deploy take minutes, and the tree can change underneath
them. A shell with no terminal to ask at (an agent's, a background run) is
refused until it says so deliberately: `DEPLOY_ALL=1`, or `ONLY="src server"` to
commit a named part of the tree.

An agent working in this folder over the remote-device bridge cannot delete
files, so a `git status` or `git diff` from there leaves a `.git/index.lock` it
cannot clear, and the next commit dies on it. Read with
`GIT_OPTIONAL_LOCKS=0 git --no-optional-locks …` from that side; the script
clears a lock nobody is holding.

The smoke step exists because of an outage: a CommonJS dependency called
`require` inside an ES-module bundle, the function threw the instant Lambda
loaded it, and every route — public pages and login alike — answered with API
Gateway's own "Internal Server Error". Type-checking and unit tests both passed,
because neither of them ever imports the bundle. `server/template.yaml` now gives
the bundle a real `require` through an esbuild banner, and `scripts/smoke-init.mjs`
refuses to let a bundle that will not load reach production.

Useful scripts, run with your own AWS credentials:

- `server/scripts/list-users.mjs` — every account, its role and its state.
- `server/scripts/set-password.mjs` — set a password directly and kill sessions.

## Traps

- **Adding an import** to a file whose first imports are a multi-line `{ … }`
  block: insert after the closing `} from '…'`, not after the last line starting
  with `import`. Getting this wrong produces a syntax error in the middle of the
  import list, and it has happened repeatedly.
- **A new required environment variable** must be added to `server/tests/setup-env.ts`
  as well as `template.yaml`. `lib/env.ts` reads its configuration at import time
  and throws when something is missing, so a forgotten one fails every test — and,
  if it reaches production, every request.
- **A hand-written DynamoDB expression aliases every attribute name**, the way
  `buildUpdate` already does for the ones it generates. `token` is one of
  DynamoDB's reserved words, so `ConditionExpression: 'attribute_exists(token)'`
  in `consumeInvite` was a ValidationException on every call — every attempt to
  take up an invitation answered 500, and no club could change hands for as long
  as it was deployed. The list is long and full of ordinary words: `name`,
  `status`, `format`, `owner`, `value`, `date`, `size`, `token`. Nothing else in
  the pipeline sees it — `tsc` does not look inside a string, the tests mock
  `repos.js` above the DynamoDB call, and `smoke-init` only proves the bundle
  loads — so `server/tests/expressions.test.ts` reads every literal `…Expression`
  in `server/src` and fails on a bare reserved word.
- **Both halves of `lineups` are optional**, and `src/types.ts` says so. The two
  sides are written separately, so a reader that dereferences `lineups.away`
  because `lineups` exists will throw on a match only one manager has named.
  `setLineup` creates both sides empty for that reason; the type is the backstop.
- **Content-hashed chunks 404 after a deploy** for anyone holding the old
  `index.html`. `lazyPage()` reloads once, guarded by `sessionStorage`.
- **CORS is answered in application code**, not in the template, so a new HTTP
  method has to be added to `access-control-allow-methods` in `lib/http.ts` or the
  browser's preflight kills the feature while the API works perfectly.
- **Public routes project their output.** `toPublicTeam` in `routes/public.ts`
  drops `managerUserIds` and players marked `isPublic: false`. A new public route
  that returns a stored record whole undoes that.
- **A page a visitor can reach never calls a service method that branches on
  `isSignedIn()`.** `organizerService.getAll` follows a signed-in user to
  `/admin/organizers`, which returns what that user administers: all of them for
  a super admin, one for an organiser, none for a club manager. The landing page
  used it and told a signed-in club manager there were "five public tournaments
  from zero organisers" — the count came from a public route and the directory
  from an admin one. Public pages read `getAllPublic`; the branching methods
  belong to the admin screens.
