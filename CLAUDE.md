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

**A round can be held back, and what that means is decided on the server.**
An organiser draws a whole season at once and does not always want it read that
far ahead. `hiddenRounds` on the season names the league rounds being kept back,
by the number the fixtures store — from zero; a hand-built playoff round carries
`hidden` on the round record itself, because that one is a record and a league
round is only a number. `server/src/lib/rounds.ts` is the single place that turns
either into an answer: every public route projects the season through
`toPublicTournament`, and a withheld fixture leaves the API as
`{ hidden: true, round?, isPlayoff?, playoffRound?, division?, groupIndex? }` —
no clubs, no date, no kick-off, and no id, since ids of hand-built rounds have
been assembled out of a club id and a fixture nobody may read has no page to be
opened at. The count survives, which is what lets the public page draw the round
as that many TBA rows rather than as a round that does not exist.

A played fixture is published whatever the flag says. The table, the scorers and
the club pages are all counted in the browser from the matches in that answer, so
a withheld result would not read as "not announced" — it would read as a league
table that is quietly wrong. For the same reason the projection *strips* a stored
`hidden`: `POST /admin/tournaments` passes its body through, so one can be
written onto a fixture today, and the pages read that field as the server's word.

`/manager/overview` projects it too, and not by accident. That route answers any
club with an entry in the competition — an application the organiser turned down
included — so a club could otherwise apply to a league it does not play in and
read every round it is holding back. What a club still sees whole is *its own*
fixture in a hidden round: it has to know when it plays, and a season where a
club cannot see its own next game is one nobody can name a teamsheet for.

`playoffBrackets` is no longer sent by either projection. Nothing writes it and
no screen reads it, and on the records that still carry one it names the pairings
by club and date — exactly what the fixtures beside it have just had taken off.

Two things this does not do. It is not a secret: `/public/*` answers carry
`cache-control: max-age=60` and the Lambda's own cache is per container, so a
round hidden after the draw went out stays readable for a minute or two. And a
`groups_with_divisions` season from before its round numbers were fixed regroups
its fixtures into display rounds that are not the numbers in the record, so the
control is not offered there at all — the repair tool puts such a season back in
step first.

The write is a list, so it is never written back whole:
`PUT /admin/tournaments/:id/rounds/:round/visibility` appends under a
`NOT contains` condition and removes by a checked index, `hiddenRounds` is in
`TOURNAMENT_PATCH_FORBIDDEN`, and hiding a round the season does not have is
refused — nothing would ever take such a number off the list again, since the
toggle is only drawn for rounds that have fixtures.

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

**A scheme is not a setting, and the create screen asks them in that order.**
`SCHEMES` is three: a league, groups and finals, and a straight knockout. Legs,
what happens after the league, how many clubs the finals take and how the groups
are cut are all settings *about* the scheme already chosen, and `formatFor` is
the one place that turns a scheme and its settings into a stored `format`.

`FORMAT_OPTIONS` was the whole of that question before, as eight cards on one
screen — "League" and "League, home and away" are one scheme with the legs
changed, and three more cards were the same league again with a different
finish. Eight combinations offered before a single club has been picked is not a
decision anybody can make, and the settings for whichever card was chosen sat
three sections further down, under the logo, the clubs and the schedule, in two
coloured boxes that looked like nothing else in the application.

`mode` is untouched by all of this. The screen is a way of choosing one, not a
new way of storing it, so every season in the database reads exactly as it did
and `schemeOf` is the way back — which of the three a stored format is, and how
it finishes. `FORMAT_OPTIONS` stays for now because it is what names a stored
format in the Format column of the club and player pages, and what the settings
screen still picks from; that screen is the next one to move.

`swiss_elimination` is off the create screen. Its generator never was a Swiss
system: it played a round robin and then built a bracket from the order the
clubs were entered rather than from the table, with a placeholder comment saying
so, and an odd count put a club up against itself. No season in production uses
it.

**A grouped season runs one, two or three playoff brackets, and they are named
after the medals.** `groups_with_divisions` took the top two of every group into
"Division 1" and the next two into "Division 2", written separately into the
generator, the Regenerate playoffs button, the organiser's group table and the
public one — four copies of one rule, and a season that wanted a different cut
had nowhere to say so. `qualifiersPerGroup`, `secondDivisionPerGroup` and
`thirdDivisionPerGroup` on `groupsWithDivisionsConfig` are that rule now: each
takes that many places from every group's table, running on from the bracket
above, and a bracket set to nobody ends the list. All three absent means two and
two, so every season drawn before the setting existed reads exactly as it did.

`playoffTiers` in `utils/standings.ts` is the one place that reads them, and it
also *names* them, because the name depends on how many there are. One bracket
ranks nothing, so it is "Playoffs" and the clubs through it are marked green and
called qualified. Two or three rank against each other, so they are the Gold,
Silver and Bronze playoffs, marked in the medal colours. Nothing else decides
that: a screen asks for `tier.name`, `tier.badge` and `tier.mark` and prints
them, `tierAtPlace` answers which bracket a row of a group table belongs to, and
`division` on a fixture is the tier's 1-based position and nothing more. The
three medal colours were one shared yellow wash while they only meant first,
second and third on a league table; they are three distinguishable colours now,
because three rows a reader cannot tell apart say nothing about which bracket a
club is going to.

What the cut decides is how many *slots* a bracket has, and not who is in them.
`generatePlayoffBrackets` uses only the length of the list it is handed and
fills every pairing with `seed-1`, `winner-2` and the like, which nothing in the
repository resolves — so a generated bracket is a set of empty slots the
organiser fills in from the table by hand. That is as true of
`league_playoff`'s "Draw the bracket" as it is here, and it is worth knowing
before reading either as a real seeding.

The settings screen could not save any of the group settings at all until this.
`sameFormat` compared mode, legs, qualifiers and preset and nothing else, so
every change to `groupsWithDivisionsConfig` read as "unchanged" and the button
stayed disabled; it compares the group stage and the brackets now. A change to
the brackets alone is its own plan, `rebuild_playoffs`: the group fixtures and
their results are kept and only the brackets are redrawn, because rebuilding the
whole season — the only plan this used to have for it — is not a price a change
to the finals should cost. The draft the screen holds carries `groups` through
untouched for the same reason: it is who is in which group, and a save that
dropped it would empty every group table.

Both fixture lists draw their playoff sections by walking the divisions actually
present in `matches`, not by asking for division 1 and division 2 by name. A
season configured down to one bracket whose second bracket's fixtures are still
in the record keeps a section for them: the matches exist, and a section missing
from the page is a match nobody can open.

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

`assertManagesTeam` is two rules and not one. A club's own managers are always
in. The organizer who owns the club is in **only while nobody has taken it
on** — `isClaimedTeam` is where that line sits. Most clubs have no manager and
never will, and a competition whose squads only a coach can fill in is one the
organizer cannot run; but the invitation offers the coach "the squad, the crest
and entering competitions", and a promise the person who issued it can
overwrite is not one. What the organizer keeps on a claimed club is everything
the *competition* owns: entering it (`PUT /admin/tournaments/:t/squads/:teamId`),
the teamsheet, the result, removing it from the season, deleting the club, and
who its managers are. What they lose is the club record and the squad.

Three things had to move with that line, each of them a way round it or a way
to get stuck behind it. `POST /admin/teams/:id/managers/me` refuses a club that
already has a manager, and so does the signed-in branch of `POST /auth/claim`
when the claimer is the club's own organizer — otherwise the organizer writes
themselves an invitation, opens it, and is a manager of a club that was no
longer theirs to edit. `POST /admin/teams` picks its body from `TEAM_FIELDS`
the way the `PATCH` does, because a create that could name `managerUserIds` was
a club its own creator could neither edit nor unlink. And deleting an account
unlinks the clubs it ran, because an id is the whole record of the link: a club
whose only manager has been deleted is one that manager cannot sign in to and
the organizer is refused — which is also why the club screen now removes any
manager, not only the reader themselves.

Two things a competition's organizer used to be able to do for a club that now
has a manager have no admin route to replace them: applying it to *another*
organizer's competition (`POST /manager/entries` is the club's own act) and
uploading its crest or squad photo. Both are deliberate; neither is missed by
anything on screen today.

Entering a club in a competition is not on either list alone, because the record
written is the competition's and the players named are the club's. It has two
routes, `PUT /manager/tournaments/:t/squad` guarded by `assertManagesTeam` and
`PUT /admin/tournaments/:t/squads/:teamId` guarded by
`assertCanAccessOrganizer` — the same arrangement as the teamsheet, and for the
same reason: most clubs have no manager, and a competition whose entries only a
coach can fill in is one the organiser cannot run. The organiser's route ignores
`squadsLocked`, which is the deadline they set for the managers.

The organiser writes an entry from two screens, because the question is asked
from both ends: the competition's settings, club by club, and the club's own
page, which carries a column per competition the club plays in and a tick per
player. Both land on that one route, and both are shown for a club whose
manager has taken it on — the entry belongs to the competition, and that is
exactly what the organiser keeps. The tick is drawn from the record and moves
only once the server has agreed (`setSquad` in `src/store.ts`, the same
arrangement as `setLineup`), so a save that failed cannot leave a screen
claiming somebody is registered.

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

**A club with a manager is in the pool unless it says otherwise.**
`isInClubPool` in `server/src/lib/pool.ts` is the one place that decides: at
least one manager, and `hiddenFromPool` not set. Both halves matter. The manager
is who answers the invitation — a club nobody has taken on has nobody to answer
for it, and the league that owns the record would be offering a club it may only
be storing — and the flag is the club's own way out, written by the people who
may edit it.

It replaced an opt-in, `discoverable`, and it is a new field rather than that one
read the other way round. The club form sent `discoverable` on every save, so
`false` sits on records whose managers never decided anything; reading that as
"hide me" would take clubs out of the pool on the strength of a box they never
saw. The old field is left where it is, read by nothing, and absent from
`TEAM_FIELDS` so nothing can write it either. The opt-in itself failed for the
ordinary reason: almost nobody found the box, so the pool was empty and the
organiser who opened it never opened it again.

Hiding does not reach a competition the club is already in. Those organisers see
it through its accepted entry, which the pool check is not consulted for, and the
invitation route lets an organiser ask again a club that has accepted for them
before — next season is asked for in exactly the league the club has just left
the pool from.

`GET /admin/clubs/directory` returns the pool, the caller's own clubs left out,
projected through `toDirectoryClub`: a crest, a name, the squad size and who to
ask. Who to ask is a person where the club has a manager and the owning league on
a record from before the pool existed, and it is never an email address — an
organiser who wants the club invites it through the API, and the club decides
whether to answer. That listing is now most of the clubs in the system rather
than the handful that had opted in, which is why the accounts scan behind it
takes a `ProjectionExpression`: it ran on a rare route and now runs on a common
one, and the rest of that row is a password hash.

**Taking a club out of the pool is the whole transaction.** `shortlistedTeamIds`
on the *organizer* record — a club belongs to somebody else and has no business
carrying a list of the leagues eyeing it — written by `POST` and `DELETE
/admin/clubs/shortlist`, appended under a `NOT contains` condition and removed by
a checked index like every other list here, and capped, because `/admin/teams`
reads it on every admin request and every id on it costs a read.

It is a permission and not a bookmark. A club in the pool has said it may be
taken; the organiser who adds it may enter it in their competitions, name its
teamsheets and register its squad, with nothing to send and nobody to wait for.
So `assertEnterableTeams` consults the list, `/admin/teams` returns the club in
full through `toVisitingTeam` — the squad included, because a club that can be
put in a season is a club whose eleven has to be named — and the team pickers on
both the create and the settings screens offer any club marked `visiting`.

What the organiser does not get is the club: `managerUserIds` and every date of
birth stay behind the projection, `assertManagesTeam` refuses every write, and
`visiting` is what the screens read to draw no editing controls. The club's own
answer is the hide button, and it is the only one — which is why the manager's
page says in as many words that other organisers can enter this club in their
competitions, rather than implying an invitation that no longer exists.

Pool membership is checked again when a club is entered in a competition, and on
the way out only for a club this organiser is not already playing. A club taken
from the pool has no entry, so what records that it is playing here is the
season's `teamIds` together with this organiser's list — both halves, because an
id in a season that is nobody's pick is exactly the arbitrary id the entry check
refuses. A club that hides itself, or whose last manager leaves, therefore joins
no new season of this organiser's and keeps arriving for the ones it is already
in: that record is the only thing giving it a name in the table, a squad on the
teamsheet and a tick in the picker, and without it the next save of the team list
would drop it from the season along with its played matches. A club on the list
that plays in none of their competitions disappears the moment it hides, which is
what hiding is for. `enterable` on the projection is the API's answer to "may
this be put in a competition", worked out with the same rule the write is refused
by, and it is what the pickers read: the browser cannot see the pool, and a tick
that saves into a refusal is worse than no tick.

The same asymmetry is why `DELETE /admin/clubs/shortlist/:teamId` refuses while
the club is playing in one of this organiser's competitions. A club taken from
the pool has no entry, so the list is the only record that it is theirs to work
with, and removing it mid-season would take the club off every screen that names
it. Taking it out of the competition is done on the competition, which shows what
that costs the fixtures first.

A club that has agreed once never has to agree again: the accepted entry is read
across all of this organiser's seasons, so next season is the same clubs as last
time without asking, and a club that has since left the pool can still be carried
over by the league it already plays in.

The invitation route is still there and no screen calls it any more. Entries
remain the other direction — a club applying to a competition it found, and the
clubs that agreed before the pool existed — and `/admin/teams` still resolves
them, so nothing written under the old rules stops working.

That list is also why `PATCH /admin/organizers/:id` finally has an
`ORGANIZER_FIELDS` whitelist. It passed its body through for as long as the
record held nothing but display; the moment it held a field that decides which
clubs an organiser may enter, passing the body through was a way to put any id
on that list, unrecorded and uncapped — and now it is not a bookmark that would
have bought, but a permission.

**An invitation is a question, and only the club answers it.** `POST
/admin/tournaments/:id/invitations` writes an entry with status `invited` and
stops; `PATCH /manager/tournaments/:t/entry`, guarded by `assertManagesTeam`, is
the club accepting or refusing. The organiser's own decide route refuses
`accepted` on an `invited` row (`organiserMayDecide`), or asking would be a
formality — the person who wrote the invitation would accept it in the next
request. A club invited to a competition it turns out to want anyway may press
apply: `POST /manager/entries` treats an existing `invited` row as an acceptance
rather than writing `pending` over the organiser's decision.

The three ways of saying no are three statuses because the wrong one is a hole.
`declined` is the organiser turning down an application and may be reversed —
it was their answer. `refused` is the club turning down an invitation and may
not be. `withdrawn` is the organiser taking back an offer nobody had answered.
`organiserMayDecide` is a whitelist of transitions rather than a rule about the
current status, and it is a whitelist because the first version was not: it
refused `accepted` on a `refused` row and left `refused -> declined` open, so
one extra request laundered the club's refusal into a decision of the
organiser's own and the acceptance came free. `pending` and `declined` are
theirs to answer either way; `invited` and `accepted` they may only take back;
`refused` and `withdrawn` are ends, and asking again means issuing another
invitation for the club to answer. Turning an `accepted` entry down does not
remove the club from `teamIds`, so it is refused while the club is still in the
season — the teams list is written on the settings screen, which shows what
changing it costs the fixtures first.

Every write to an entry is conditional on the status the caller read, because
both sides write this row and an organiser withdrawing at the moment the club
accepted used to mark it declined while the club sat in `teamIds`.

**A club can play in a league that does not own it, so `/admin/teams` returns
it.** Marked `visiting: true` and projected through `toVisitingTeam` — a named
list, like every other projection here, because these records are schemaless and
a field added to `TEAM_FIELDS` next year would otherwise reach every organiser
the club visits on the day it is written. The squad comes with it, hidden
players included: this organiser names the teamsheets and enters the club in the
competition, and a player they cannot see is a player who cannot be fielded.
What does not come is the club as a club — `managerUserIds`, and every player's
date of birth. `visiting` is what the screens read to know they may not edit it
(`canEditClub`, `clubIsMineToEdit` on `TeamPage`), because the API refuses those
writes and a control that saves into a refusal is worse than no control.

What opens that record is the club being on this organiser's list from the pool,
or having agreed to play for them — an entry marked `accepted`, in any of their
seasons — and never its id appearing in `teamIds`. That last part is what
matters: `POST /admin/tournaments` and `PATCH /admin/tournaments/:id` pass their
bodies through, so an organiser could type any club id in the system into their
own season, and once `/admin/teams` resolved those ids that would have handed
over the club's squad. `assertEnterableTeams` refuses to *add* a club this
organiser neither owns, nor has on their list, nor has ever had agree to play —
ids already in the season are left alone, because some of them predate entries
and refusing them would leave a live season nobody can save. The design problem
underneath is that a tournament has never had a `TEAM_FIELDS` of its own; this
closes the field that names other people's records and does not pay the debt.

Still open, and older than any of this: `matches` is passed through by the same
two routes. `assertClubsAreInTournament` guards the playoff-round and match
routes, but a `matches` array written whole can still name a club that is not in
`teamIds` — which puts a club nobody asked in the organiser's fixture list and,
through `sideOfTeam`, offers its manager a teamsheet in a competition it has
nothing to do with. It leaks no record, and the registration rules stop most of
what could be written; fixing it means checking every fixture in a body the draw
generators and the repair tools legitimately send whole.

**Deleting takes the entries with it.** A competition and a club both do it now
(`deleteEntriesForTournament`, `deleteEntriesForTeam`). An entry is keyed by its
tournament, so a row left behind is an invitation on the club's page that it can
neither accept nor dismiss, or an application from a club whose name nothing can
resolve. For the same reason the club's answer route reads the tournament
*after* its decline branch: refusing a dead invitation has to work.

**An organiser is invited the same way a club is, and the two tokens share a
table.** An organiser's login used to exist only if the super admin typed a
password into the create form and read it out: two people knowing it, and the
one who chose it not the one who has to remember it. `POST
/admin/organizers/:id/invites` is the other half — the record is created first
and the person who will run it is invited to the *login*, exactly as a club
exists before its coach is invited. Nothing is created at the claim, so an
invitation nobody answers leaves an organiser the super admin can still edit,
invite again or delete, rather than a token holding the only copy of what was
typed.

Both kinds of invitation live in the invites table, so every item carries a
`kind` and every read names the kind it expects (`server/src/lib/invites.ts`).
That field is the whole guard: a token spendable at the other's claim route
would be an invitation to keep a squad list up to date opening an account that
runs a league. `kind` is absent on every invitation written before it existed
and all of those are club invitations, which is what a missing one reads as.
`readInvite` also asks the expiry the way round that fails closed — `NaN <
Date.now()` is false, so a malformed date read as valid forever.

Three things differ from a club's. The address is not optional: a club link is
passed on by hand over WhatsApp, this one opens an account that can run
competitions, and binding it to the address it was sent to is what stops a link
going astray becoming an account on somebody else's email. Issuing a second
invitation takes the first away, and so does creating that organiser's login by
hand through `POST /admin/accounts` — otherwise inviting somebody and then
changing your mind leaves a live door for a fortnight, and whoever holds it
opens a second organizer account that the create route's own duplicate check
never saw. And there is no signed-in branch at the claim: an account has one
role and one `organizerId`, so turning an existing one into an organiser would
silently drop whatever it already was. An address already spoken for is refused
at the invitation, where the super admin can still do something about it.

The preview, `GET /auth/organizer-invites/:token`, is under `/auth/` and not
`/public/` although it needs no session. Everything under `/public/` is answered
with `cache-control: max-age=60`: the invitee's email address would sit in every
shared cache on the way, and the route would keep answering for a minute after
the invitation was cancelled or spent.

**"Is this address taken" is a different question from "who signs in here".**
`findUserByEmail` filters on `isActive`, which is how access is revoked — the
row keeps its address. `emailIsTaken` in `routes/auth.ts` does not, and it is
what the organiser invitation and its claim both ask, because the address there
is taken from the organiser record rather than typed: the commonest way to reach
that check is pressing Invite on an organiser whose login was switched off, and
a check that cannot see it hands the account straight back. It also carries no
`FilterExpression`, so its `Limit: 1` is honest — with one, DynamoDB reads a
page and filters afterwards, and a second row on `email-index` can make the
query answer nothing at all. Nothing yet stops two rows sharing an address; that
debt is older than this and is not paid here.

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

**A match is written as a match.** `PATCH /admin/tournaments/:t/matches/:m`
exists so that editing one fixture does not send the competition's whole
`matches` array back from whatever copy the browser is holding. The organiser's
match screen did exactly that until it was changed: every save there — a venue,
a statistic, a video link — rewrote every fixture in the season, so a score
typed on another screen and a teamsheet a club's manager had just named were
both undone by somebody correcting a spelling. `undefined` cannot travel through
JSON, so a field emptied on that screen is sent as `null`, which is why a score
is read with `typeof === 'number'` and never with `!== undefined`.

The season page did the same thing for longer, and that is the bug the organiser
reported as "updating the score destroys the match". Its score, date and playoff
pairing fields wrote `matches` whole from the copy the page loaded, so typing a
result overwrote every fixture in the season with an older version of itself —
the goals and cards entered on the match screen, and the teamsheets a club's own
manager had named, on matches nobody was editing. Every per-fixture edit on that
page now goes through the match route (`saveMatch`/`setScore` in
`TournamentPage.tsx`), and the bulk helpers — the same date for a round, the same
times for every round — save only the fixtures whose kick-off actually moved, one
request each. What legitimately still writes `matches` whole is a rebuild: the
draw generators, and the repair tools behind the details block.

**A fixture has two homes, and both are written one fixture at a time.** The
draw and the generated brackets are in `matches`; a round the organiser builds
by hand — every round of `progressive_elimination` — lives inside
`format.customPlayoffConfig.playoffRounds`. `locateMatch` in
`server/src/lib/matches.ts` finds a match in either and returns the document path
to write it at, so the match `PATCH` and both lineup routes reach a playoff
fixture; `allMatches` and `applyMatchUpdate` in `src/utils/matches.ts` are the
same idea on the site. Before that they reached only `matches`, which is why the
organiser's match screen answered "Match not found" for every playoff tie and
their goals, cards and teamsheets had nowhere to be entered at all.

Two homes for one kind of record is a design problem and this does not fix it —
moving them is a migration of live data. What it does mean is that `format` now
holds records other people write, so the rounds have their own routes
(`POST`/`PATCH`/`DELETE /admin/tournaments/:id/playoff-rounds[/:index]`) and no
screen sends a whole `format` back to rename a round. `PATCH
/admin/tournaments/:id` still accepts `format`, because creating a competition
and regenerating its draw legitimately replace it; anything routine that reaches
for it is a bug.

`locateMatch` refuses when two fixtures carry the same id rather than writing to
the first. They exist: the ids of progressive rounds are built from the round
number and the position in it, and deleting a round renumbers nothing.
`server/scripts/find-duplicate-match-ids.mjs` finds them.

**An index is not an identity.** A round is edited and deleted by its position
in `playoffRounds`, and that position came from a list the browser read earlier —
a round deleted in another tab shifts every round after it up by one. So the
request carries `expectedRoundNumber` and `expectedName`, the server checks them
against the round it finds there, and the write repeats the check as a condition.
A guard built from the record the same request just read asserts nothing.

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
the same reason `managerUserIds` is. The player routes each touch one player
under a condition (`addPlayer` and `updatePlayer` in `repos.ts`), and they are
the only way in.

**A player leaves the squad; the record does not leave the database.** `DELETE
/admin/teams/:id/players/:playerId` archives — it writes `archivedAt` and
nothing else — and `POST /admin/teams/:id/players/:playerId/restore` clears it.
There is no way to remove the element at all, and `teams.removePlayer` is gone
with it. The element is the only place a player's name lives: every goal, card
and teamsheet in the system names a player by id and by nothing else, so
deleting it left all of that exactly where it was and made it anonymous —
"Former player" in the scorer table, "Unknown player" on the match page, and
nothing anywhere to put the name back. That is what was reported as "deleting a
player deletes everything he did".

`lib/players.ts` is the one place that answers who is still on the books.
`activePlayerIds` is what `registeredPlayerIds` and `squadPlayerIds` both start
from, so an archived player is in no entry and may be named in nothing new;
`allPlayerIds` is what `refusedByRegistration` is given instead, so somebody
naming a player the club has archived is told to reload rather than having the
id dropped out of their teamsheet in silence. What an archived player keeps is
every teamsheet he is already on — `nameableInMatch` unions the stored sheet,
and always did.

The screens have to make the same union or the server's permission means
nothing: the write stores the ids the caller sent, so a teamsheet picker drawn
from the registration alone sends a list with the archived player missing from
it and the appearance is gone. `playersForPicking` is that union on the site,
and both teamsheet screens read it — the organiser's match page and the club's
own. Neither did, which is why narrowing an entry already made an appearance
vanish from those screens before archiving existed, while the record beside
them still held it.

The public projection sends `archived: true` and not the date, the same
arrangement as a date of birth and the age that goes out in its place: that a
player has left is what a squad list needs to know, when he left is the club's
own business. `isArchived` in `src/utils/squads.ts` reads either shape. A
former player is off the club's own squad list and stays in a competition tab
wherever he actually played in it, which is the union `squadInTournament`
already made — a name in that season's scorer table and not in the list beside
it is a visitor looking for somebody who is demonstrably there.

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

**A shirt number can belong to one match.** A teamsheet stores `numbers` beside
`starting` — a map of player id to the number that player wore in *this* match,
holding only what somebody deliberately changed. Absent means the number on the
club record, which is what every teamsheet written before the field meant and
still means, so nothing had to be migrated and an old sheet reads unchanged. The
other half of that choice is real and deliberate: renumbering a squad in June
moves the number shown on every sheet nobody overrode, and only an override is
pinned to the match. `numberInMatch` in `src/utils/players.ts` is the one place
that answers "what did he wear", and `playersNamedInMatch` hands a player out
with that number already on them, because every caller of it is inside one
match.

It rides on the teamsheet write rather than having a route of its own: same
author, same side, same conditional write, so the two cannot disagree.
`pickNumbers` cuts the map to the players actually named — a number belongs to
somebody on the sheet — and the side is written whole, which means a save that
sends no numbers *clears* them rather than leaving them alone. That is why the
repository method takes them as a required argument: a caller who forgets is a
type error and not a teamsheet quietly losing its numbers. Only `starting` is
covered; nothing edits `substitutes` today, and a number sent for one is dropped.

Two players in the same shirt is not refused. A teamsheet is filled in after the
whistle as often as before it, and a save refused over a duplicate would refuse
the record of what actually happened; both screens mark the clash instead.

The one way round all of this is the one CLAUDE.md already names: `matches` is
passed through whole by `POST /admin/tournaments` and `PATCH
/admin/tournaments/:id`, so an organiser can write a `numbers` map of any shape
by that route with none of the validation above running. It is the same debt as
the rest of that paragraph and this does not pay it.

Writes that reach the database are recorded by `lib/audit.ts`. A failed audit
write never fails the request that caused it.

**The site's URLs carry no `/admin`.** There is one sign-in address, `/login`,
for organisers, club managers and the super admin alike. The organiser's screens
are `/dashboard`, `/tournaments`, `/teams`, `/players/:id`, `/calendar`,
`/organizers` and `/changes`; a club manager's are `/my-club`. The one address
that keeps a prefix is the readable form of a competition,
`/tournaments/:orgSlug/:tournamentSlug`, because `/:orgSlug/:tournamentSlug` is
the public page. Everything that used to sit under `/admin` redirects
(`LegacyAdminRoute` in `src/main.tsx`), and the API's own routes are untouched —
`/admin/*` there is the server's namespace, not a URL anybody types.

**The organiser's own address is a page.** `/homebush_futsal` — the first
segment of every public competition link — is `PublicOrganizerPage`, the index
route under `/:orgSlug`, reading `GET /public/by-slug/:organizerSlug`. It
existed as an address long before it existed as a page and answered with a
blank screen. Two things follow. Any one-segment address now lands there, so
the page has to answer 404 itself for a slug that names nobody. And a static
route ranks above `/:orgSlug`, so an organiser whose name slugifies to
`teams`, `login`, `start`, `dashboard`, `tournaments`, `calendar`,
`organizers`, `changes`, `join`, `join-organizer`, `public`, `admin` or `my-club`
would have an
unreachable page — nothing refuses such a name yet.

**There is no self-serve sign-up, and the landing page says so.** An
organiser's account is opened by hand. The call to action a visitor sees used
to be "Start a tournament" pointing at `/login`, which is a door with nothing
behind it for somebody who has never been here: no way in, and nothing on the
screen saying how to get one. It is `/start` now — `StartPage.tsx`, what the
product does and the address to write to, `mft@slazhen.com`. The signed-in
branches of that button are unchanged, because an organiser can create a
competition and a coach has a club to go to. When sign-up does exist, this page
is what it replaces.

**A cached list has a reader-dependent age.** `lib/cache.ts` keeps table reads
in the Lambda's memory, and `invalidate` after a write clears only the
container that ran it: every other warm one serves its copy for the rest of the
TTL. A visitor reading a table a minute after it changed does not care; the
organiser who has just created something and is looking at the screen that
should show it does, and reported it as "my tournaments are not linked to my
organiser" a minute before they were. So a signed-in read passes `adminRead`
(`ADMIN_CACHE_SECONDS`, zero by default: through to DynamoDB), and the two
places where a stale list is a wrong decision rather than a slow screen — what
deleting an organiser would take with it, and the deletion — pass `liveRead`,
which ignores the setting. A fresh load is stored under the same key with the
full TTL, so it warms the copy the public reads instead of dropping it. Public
routes pass nothing and are unchanged: they are the traffic this cache exists
for. The GSI behind `listByOrganizer` is still eventually consistent, so
something created in the last second can be missing whatever the cache does.

**Being signed in is not a role.** Every organiser route is wrapped in
`<ProtectedRoute requireOrganizer>`, which admits an `organizer` or the super
admin and sends anybody else to `landingPathFor(user)`. Without it a club
manager who followed a link or a bookmark was shown the organiser's panel
counting zero competitions and zero clubs — the server refused the data, so the
screens were empty rather than leaky, but a manager should not learn they exist.
A failed check redirects; it never renders an explanation, and never renders a
page with a `<Navigate>` inside it, which is what the old "Access Denied" screen
did.

**Whether somebody runs a club is a question about the role**, `isTeamManager`,
not about `user.teamIds`: the account's list and the clubs' `managerUserIds` are
written one after the other and can disagree, and a manager whose list came back
empty was offered the organiser's screens instead of their own.

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

**An own goal counts for one side and is scored by a player of the other.**
`goal.team` is the side the goal counted for — the score is worked out from that
field and nothing else — so for an own goal the scorer named on it plays for the
opposite squad. `scorerSide` in `src/utils/matches.ts` is the single place that
flip lives: the organiser's scorer picker offers the other team's players, the
public timeline resolves the name against that squad while still drawing the
event on the bank of the side that got the goal, and `playerRecords` credits the
appearance to the scorer's own club. The picker used to offer only the team the
goal counted for, so the player who actually put it in could not be named at all;
organisers left the field empty, and the public match page — which hides goals
with nobody named, because a half-filled row is a row still being typed — then
dropped the event entirely. Own goals are the exception to that filter now, and
show as "Own goal" with no name. An own goal has no assist: the field is not
offered for one, and a value left on an older record is ignored rather than
credited. Goals recorded before this rule store a scorer from the side the goal
counted for, so the name lookup falls back to the other squad rather than
printing "Unknown player" over a player who is in the match.

**A goal can be a minute and nothing else.** The goals a result counts that
nobody has named are derived from the score and have no record of their own, so
there is nowhere on one to write a minute. Where somebody remembers when a goal
was scored but not who scored it, the goal is written out as a record with an
empty `playerId` - "Unknown" wherever events are listed, and in its place on the
timeline - and the derived row it replaces disappears on its own, because
`recordedFor` counts it like any other. `assertScorerOrCounted` in
`server/src/lib/goals.ts` is the one rule both goal routes ask: a goal with
nobody on it may only be one the result already counts, never one that raises the
score, because a goal the result does not count and nobody can name is not a goal
anybody has a record of - a wrong result is corrected on the scoreboard. It
carries no assist either, dropped in `readGoal` the way an own goal's already
was, since `playerRecords` credits an assist whatever the scorer is.

All three of the people who may write a result enter it the same way, from the
row that says the goal is unknown: the super admin and the competition's
organiser on the match screen, the club's own manager on `/my-club` - whose
route refuses a goal the score has no room for and never writes a score at all,
so the rule holds there by construction. What follows for the screens is that an
empty `playerId` no longer means "own goal": which of the two it is comes from
the type, and a page that reads the field alone prints the wrong word.

**A card is an event, and the totals are counted from it.** `match.cards` holds
one row per booking — player, side, minute, and `yellow`, `second_yellow` or
`red` — and the Yellow Cards and Red Cards rows of the match statistics table
are derived from that list by `cardTotals`, not typed in beside it. The
statistics record used to carry its own `yellowCards` and `redCards`; they were
never once filled in, and a total stored beside the events it comes from is a
second answer waiting to disagree with the first. A second yellow counts in both
columns, because the player was booked and the side finished a man down.
Bookings feed nothing else: `playerRecords` does not read them, so a card cannot
move an appearance or a table position.

**A goal the score already counts does not move it.** Most results here are
entered as a score on the season page and nothing else, so the difference
between the score and the goals recorded for a side is the goals nobody has
named a scorer for. They are derived, never stored — `unattributed` in
`server/src/lib/goals.ts`, `unattributedGoals` in `src/utils/matches.ts` — and
drawn as "Unknown" with a dash for the minute on the public match page, the
organiser's screen and the club's. Writing them out as empty rows would have
meant migrating every match ever played, deciding which of the empty ones a
corrected score should delete, and keeping them out of every tally that walks
`goals`.

So the rule is one sentence in three parts. Naming one of those goals changes
nothing about the result. A goal the score has no room for raises it by one,
which is what entering a match from an empty scoresheet has always done.
Deleting one never lowers it: what the match loses is the name, and the goal
goes back to being unattributed — a wrong result is corrected on the scoreboard,
where it was typed. `scoreAfterAdding` and `scoreAfterMoving` are the two places
that decide, and the second exists because the first was used for corrections
too: on a fixture holding more goals for a side than the score counts — which is
exactly what lowering a score whose scorers were already named leaves behind —
it found no room, read a spelling fix as a new goal and put the result back up.
For a club's manager that was a way to move a league table one edit at a time.

The recount this replaced went the other way: it wrote the score as the number
of events, so an organiser who named one scorer of a 2-0 got a 1-0. The score
remains a field of its own, edited on the scoreboard at the top of the match
screen. The Statistics tab shows Goals as a number and no longer offers a second
field for it.

**An event is entered against the teamsheet, and written once.** The scorer,
the assist and the booked player are picked from `lineups` for that side —
`playersNamedInMatch` in `src/utils/squads.ts`, with shirt numbers — and not
from the competition's registration: the person typing has the sheet in front
of them, and a picker holding forty registered names is how the wrong one is
chosen. An own goal takes the other side's sheet, the same flip `scorerSide`
makes everywhere else. An empty picker therefore means a sheet nobody has
filled in, and the screen says so and links to the Line-ups tab rather than
falling back to the whole squad — falling back is how the sheet stays empty.
Anyone already named on the event stays in the list whatever the sheet says, or
correcting a teamsheet in April would silently empty the field naming a scorer
from March. Naming a scorer does not add them to the sheet: the teamsheet is a
record somebody makes deliberately, and `playerRecords` already credits an
appearance to anyone with a goal.

`src/components/MatchEvents.tsx` is that screen, and its rule is that nothing
reaches the API until a form is submitted. Every field on the old one saved on
change: a new goal was created empty with minute 0, sorted itself to the top of
a list that was sorted in place — on the record this page was holding — and then
jumped as soon as the minute was typed, while each select raced the last. The
add form fills a whole goal in, one write adds it and recounts the score, and an
existing event is corrected in the same fields behind Edit and Save. The goal's
ordinal is derived from the sorted list rather than read from the stored
`goalNumber`, which stayed as it was when an earlier goal was deleted; nothing
writes that field any more. The type is three chips beside the scorer, not the
fourth select in a row of four, because organisers were not finding Penalty at
all.

`cards` is still in `MATCH_FIELDS` and travels whole, so for a booking the
teamsheet rule is the screen's and not the server's: a hand-made request can
credit a card to anybody's player id. `goals` is not, any more — see below.

**A goal has two authors, and only one of them may move the score.** A club's
own manager names the scorers of the goals their side's result counts:
`POST`/`PATCH`/`DELETE /manager/tournaments/:t/matches/:m/goals[/:id]`, mirrored
by the organiser's `/admin/…` routes, and `goals` left `MATCH_FIELDS` when they
arrived — the same move `lineups` made, for the same reason. A list two people
write is never written whole.

Five things narrow the club's half, and each of them is the club's own part of a
record the competition owns. The side comes from the fixture (`sideOfTeam`),
never from the request. A goal is refused once that side's goals add up to the
score, so the manager is naming goals and not scoring them; the correction route
never writes the score at all. Only a goal marked `enteredBy: 'club'` on their
own side may be corrected or deleted — what the organiser wrote stays theirs, and
`enteredBy` is a side rather than an account id because a goal travels whole to
every visitor of the public page. The scorer and the assist are checked against
`nameableInMatch`, the teamsheet rule, on the server this time: a goal is an
appearance and a place in the scorer table, so naming somebody else's player
would be writing into a squad the manager has nothing to do with. And an own goal
counting for this club was put in by a player they may not name, so it is stored
as an own goal with nobody on it — which is how the public page has always drawn
one whose scorer is unknown.

The minute is optional on a goal and required on a card. A coach filling in last
month's scoresheet remembers who scored and not when, and a required minute is
answered by typing a number at random — which sorts the timeline wrongly and
cannot afterwards be told from a real one. `byMinute` puts an untimed event at
the end rather than before the kick-off.

Every one of these writes asserts what the route read, not what the repository
read a moment later: `expectationOf` carries the length of the stored list and
both halves of the score into the condition (`scoreGuard`), and the club's writes
also assert the club still on that side (`sideGuard`) and `enteredBy`. Without the
first, two saves whose reads overlap both pass and a side ends up with more goals
than its result counts. Without the second, a knockout redraw — which rewrites
`homeTeamId` on an existing fixture — lets a goal land on a match the club has
just been swapped out of, which is the trap `setLineup` already guards against. A
score stored as something other than a number is asserted as present rather than
as absent: `null` sits in these records, and `attribute_not_exists` against a
stored NULL is a condition that can never be true — it would have refused every
goal on that match forever.

**The table is derived in one place too.** `src/utils/standings.ts` holds the
tally, the group split and the elimination set; the season page and the match
page both read it. They used to be about to hold a copy each, which is two
answers to "who is third" waiting to disagree. A grouped competition has no one
table, so `leagueTable` is not asked for one — `groupTables` returns a table per
group and the season page draws them separately. `tableForMatch` is the match
page's view of it: the group a fixture belongs to where there is one, nothing at
all for a straight knockout, where every club has played the same single game
and the bracket is the standing.

"One place" was aspirational for a long time. The organiser's own season page
worked the table out itself — three copies of "three points for a win" inside
`TournamentPage.tsx` — and four more places counted a club's points for a season
beside its name on the club and player pages. Seven answers to one question, and
they did not agree: the admin table counted a bye as a played game, and a season
could not be given rules of its own while each of the seven had its own copy of
them. All seven read `standings.ts` now.

**The rules of the table belong to the season, not to the application.**
`format.scoring` and `format.tiebreakers` are that: what a win is worth, whether
the finals give points at all, and what separates two clubs level. **Absence is
itself a rule.** A season carrying neither — which is every season in the
database before this — is worked out exactly as this application worked it out in
September 2026: three points for a win, one for a draw, every playoff match
counted, and the table separated by goal difference and then by goals scored.
`tableRules` is the one place that answers it and the only place the legacy
values are written down.

That is not a transition to be finished later. A published table is a record
people have already read, and a default changed here must never move one. So
nothing is migrated into carrying these fields, the create screen writes them
into the seasons it creates, and an old season takes new rules only when its
organiser opens the settings and chooses them. Two rules therefore run in
production at once, deliberately: the Homebush season keeps giving points for the
knockout rounds of its progressive scheme until it ends, and a season created
after this does not.

`format` is one of the few things the API passes through whole, so `tableRules`
reads both fields defensively and falls back to the legacy answer for anything it
cannot read — a `win` that is not a number, a tiebreaker nobody has heard of.

Two details in the ordering are worth knowing. Head-to-head is not a comparison
between two rows: the clubs level on points are re-tallied over the matches among
themselves alone, and the mini-table splits them — which is the only shape that
answers the question for three clubs or five. And clubs that criterion cannot
separate fall through to the next one rather than being ordered by it, so clubs
that have never met do not quietly rank by who was entered first.

**A fixture naming the same club on both sides is a bye and gives nobody
anything.** `countRows` skips it. Without that the two lookups are one row and it
is handed a played game, a win and a defeat at once — which is what the admin
table did, and the public one still did until this.

Still open, and named rather than quietly fixed: `sortTeamsByStandings` in
`schedule.ts` is a second answer to "who is first". It sorts for playoff seeding
and has its own order (points, goal difference, goals scored, head-to-head,
disciplinary points), and it is deliberately not routed through `standings.ts` —
doing that would change the seeding of seasons already under way.

**A knockout tie is not always one match, and not always settled by the score.**
`src/utils/ties.ts` is the one place that answers who went through. Three shapes
of the same question: one match won on the day, two legs added together, and
either of those settled on penalties. It used to be two comparisons written out
separately — one in the bracket that advances winners, one in the set of clubs
the table strikes through — and they already disagreed about a draw: the bracket
advanced nobody and the table struck out nobody, which is right for a league and
is a cup tie nobody can finish.

`shootout` on a match is the penalties, `{ home, away }`. **Kicks, not goals:**
nothing derived from the score reads it, so it moves no table, no goal
difference and no scorer tally, and `countRows` never sees it. What it decides
is who goes through. Absent means the tie did not go to penalties, which is
every tie in the database. `null` takes one off again, the same convention as
every other clearable field here.

`tie` — `{ id, leg }` on both fixtures — is what makes two matches one tie. The
second leg reverses the sides and the aggregate is counted from the first leg's
home side, so nothing reads either fixture on its own to decide the winner. Away
goals decide nothing: a tie level after both legs goes to penalties, and the
shootout is read from the last leg that has one rather than from a fixed leg,
because an organiser filling in an old sheet may have put it on either.

`placeInTie` in `schedule.ts` is why the side matters more than the field: a
club on the home side of a tie plays the first leg at home and the second away,
so writing `homeTeamId` alone would enter it in one leg and leave the other
holding somebody else.

**The third-place match is one match whatever the rest of the bracket is.** A
tie played twice to spread the home advantage is one thing; a third-place match
played twice is two more fixtures nobody turns up to. It carries
`isThirdPlace`, sits in the final round at the index the advancement formula
never targets — both semi-finals feed index zero — and `isElimination: false`,
because losing it puts out nobody who was not already out. `eliminatedTeams`
skips it for that reason.

**A shootout is validated wherever a fixture can be written, which is four
routes and not one.** `server/src/lib/shootout.ts` holds it, and the first
version of this change did exactly what CLAUDE.md warns about two paragraphs
up: the check went on the match `PATCH` and on the playoff-round `POST`, while
`POST /admin/tournaments` and `PATCH /admin/tournaments/:id` — which pass their
bodies through and are what the draw generators and the repair tools use — wrote
whatever they were given. `assertShootoutsInBody` walks both homes of a fixture,
`matches` and `format.customPlayoffConfig.playoffRounds[].matches`, and it is
called on both. `readShootout` returns the pair rather than approving it in
place, because a record that is attested and then stored as it arrived keeps
whatever else was sitting on it.

`tie` and `isThirdPlace` are deliberately absent from `MATCH_FIELDS`: they are
structure, written once by the generator, not something a match edit should
move. The consequence worth knowing is that there is no route to repair a wrong
`tie` on its own — only rewriting `matches` whole — which is the same old debt
and not a new one.

**A league that ends in a knockout awards no medals.** Gold, silver and bronze
on the top three rows are a claim about who finished first, second and third,
and a season whose finals decide that has not decided it in the table. So
`playoffCut` in `src/utils/standings.ts` answers who goes through, and the
public table marks all of them in green and nobody above anybody else; the
medals stay only where the table is the whole competition. Its answer is the
drawn bracket wherever there is one — those are the clubs that actually
qualified, whatever the format was configured to take — and the top of the
table as it stands before that, which is a projection and is worded as one.
`progressive_elimination` gets nothing: everybody carries on from the round
robin, so marking every row would say nothing.

**The public match page is five tabs, and every one of them is always there.**
`PublicMatchPage.tsx`: Events, Video, Line-ups, Stats, Table, with the tab in
`?tab=` so a link opens where it was sent. A tab that appears only when its data
exists teaches a visitor nothing about what is missing and moves the tabs beside
it from match to match, so an empty one says what is not filled in yet. The
scoreboard above them is the public club header applied twice
(`components/MatchScoreboard.tsx`), each half painted in that club's crest
colour — both gradients run dark towards the seam so the score is readable
whatever the two clubs wear.

`allMatches()` in the same file is what every one of these reads. A tournament's
knockout rounds live inside `format.customPlayoffConfig.playoffRounds`, not in
`matches`, so anything that reads `tournament.matches` directly stops at the
league phase — that is what hid every playoff goal from the scorer list and made
a link to a playoff match answer "Match not found".

**The public club page shows one squad per competition.** `PublicTeamPage` has a
tab for the club as a whole and one for each competition it plays in, kept in
`?tab=<tournamentId>`, and the links that lead there carry it — `publicTeamUrl`
in `src/utils/teams.ts`, used by the tables, the fixture list, the champion line
and the match scoreboard. A name clicked in a league table is a question about
that league's squad, not about everybody the club has ever signed.

What that tab lists is the entry plus anyone who actually played in that
competition (`squadInTournament`), for the same reason `nameableInMatch` unions
the two on the server: an entry narrowed in April would otherwise drop a player
the same page's own scorer table still credits with a March goal. Appearances,
goals and assists are recounted over that competition's matches alone, because a
squad shown for one season beside totals from every season reads as a claim
about that season and is not. A club absent from `squads` in an open competition
has everybody registered, so the tab says so rather than showing a list that
looks like a selection nobody made.

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
- **A crest and a photograph are compressed differently.** `getCompressionOptions`
  in `src/utils/imageCompression.ts` gave the team photo the crest's settings —
  400px, 300 KB — and a squad photo at 400px is a picture in which nobody can be
  told apart. Photographs go through `photo` (2000px) and `profile` (1200px);
  `server/scripts/optimize-images.mjs` has the same trap, because a team photo
  sits under the same key prefix as the crest.
- **A competition has a colour too, and it has two sources.** The public season
  header is painted the way a club's header is — `SeasonHeader` in
  `PublicTournamentPage.tsx`, `competitionColor` in `utils/crest.ts`. It reads
  `themeColor`, the colour the organiser picked in the season's settings, and
  falls back to `logoColor`, read from the logo when it was uploaded exactly as
  a crest is measured below. The two are separate fields on purpose: uploading
  a new logo re-reads `logoColor`, and a colour somebody chose deliberately must
  survive that. Every season that predates this has neither, so its header is
  the fallback blue until the logo is uploaded again or a colour is picked.
- **A crest is measured while the browser still holds the file.** The public
  club header is painted in `team.crestColor`, read from the image at upload
  time by `readCrestAppearance` in `src/utils/crest.ts` and saved beside
  `logo`. It cannot be read later: the image bucket answers without CORS
  headers, so a canvas that has drawn a published crest refuses its pixels, and
  the API never sees the bytes either — crests go to S3 through a presigned
  POST. The distribution in front of the bucket does now answer with
  `Access-Control-Allow-Origin: *` (`ImagesCorsPolicy` in `template.yaml`),
  because the Instagram poster below has to export a canvas it has drawn these
  crests onto. That does not move the measurement back: the bucket itself is
  not part of this stack and still answers without the header, so any URL that
  has not been through `cdnUrl` — a dev build with no `VITE_IMAGE_CDN_URL`, an
  address drawn straight from a record — is as unreadable as it ever was, and a
  colour read while the file is in hand costs nothing and cannot fail. Every
  club whose crest predates this has no colour and falls back to
  `colors[0]`, which is what the header used before and is wrong for about half
  of them: nobody returns to the colour picker after changing a crest.
- **A colour is checked by the API, not by the browser that computed it.**
  `colors` went unvalidated for a long time and is printed into a `background`
  shorthand, which accepts `url(...)` — a club manager could have made every
  visitor to a public match fetch an address of their choosing. Nothing but one
  or two `#rrggbb` values is accepted now, and the pages set `backgroundColor`
  rather than `background`. Both halves matter: the validation stops it being
  stored, the property stops it being honoured.

  Neither half was finished the first time, and both misses are the same
  mistake in two shapes. The check lived inside the club `PATCH` alone, so a
  club *created* with `colors: ["url(…)"]` kept the value — nothing re-checks a
  field a later PATCH does not mention. And the organiser's own page still
  printed `colors[0]` through the shorthand. So the checks live in
  `server/src/lib/colours.ts` (`assertTeamColours`, `assertCompetitionColours`)
  and run on every route that writes such a record, create included, with
  `server/tests/colours.test.ts` over them; a page that prints a stored colour
  passes it through `headerColor` first, which returns a colour or the fallback
  and nothing else. **A validation that runs on the update and not on the
  create has not been done.**
- **The season is also a set of pictures.** `src/utils/instagramPost.ts` draws
  three posters, each 1080x1350 in the season's colour with its logo, the clubs'
  crests and the application's mark on it: the table, a round
  (`renderFixturesPost` — one line per fixture, the score where it has been
  played and the kick-off where it has not, one layout for both, because what
  changes between the announcement and the result is only what stands in the
  middle of the line), and a match (`renderMatchPost` — the plate with the
  score on it, and under it every goal and booking on the side it belongs to,
  the busiest matches cut short with a line counting what did not fit).
  `PostButton` is
  the one button behind all three: above each table, on each round's card
  (`RoundCard`'s `action`, beside its title rather than inside it — a button
  inside a button is neither), and on the line of facts under a match's
  scoreboard. Instagram accepts nothing from a web page, so what a button
  produces is a file to download or hand to the phone's share sheet.

  They are drawn on a canvas rather than photographed off the page: ten columns
  of small type built for a browser window read as nothing in a feed, so a
  poster is a different layout of the same records. `drawChrome` and
  `finishPost` are the half that is the same on all three — three headers
  written out separately would be three different headers within a month — and
  what goes on them still comes from where the pages get it: the rows from
  `utils/standings.ts`, the events from `timeline` in `PublicMatchPage.tsx`,
  which the Events panel and the poster both read so that a goal nobody has
  named cannot appear on one and not the other. A round the organiser is
  holding back is offered no button at all: its fixtures arrive with no clubs on
  them, and the poster would be a column of TBA.

  Two things hold it up. Every image on it is loaded with `crossOrigin`, which
  is what the CORS header above is for, and a crest that will not load is drawn
  as the club's initial on the club's own colour — one refused image has to cost
  one badge and not the whole poster.

  The header alone was not enough, and the reason is worth keeping. The page
  draws every crest first with a plain `<img>`, and the browser then answers the
  canvas's `crossOrigin` request out of that cached copy — which carries no
  `Access-Control-Allow-Origin`, because the request that filled the cache asked
  for none. The check fails and the image does not load at all, while a `fetch`
  of the same address succeeds: measured on the deployed site, every crest and
  the competition's own logo were missing from the poster with the CORS header
  live and correct. `forCanvas` in `instagramPost.ts` therefore appends a query
  string to every http(s) address the canvas loads, which costs nothing — the
  distribution forwards no query string, so the edge answers from the same
  cached object — and only keeps the two answers apart in the browser's cache. And what a row is marked as — the medals,
  the green of a qualifying place — is `standingMark` in
  `PublicTournamentPage.tsx`, read by the table and by the poster alike: two
  answers to who is on the podium would disagree the first time either of them
  was changed. The application's own mark is markup in `src/utils/logoMark.ts`
  rather than JSX for the same reason — `LogoMark` renders it in the page and
  the canvas needs it as an image.

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

## What the site actually spends its time on

Measured from a browser in Sydney, September 2026, so that the next person
guesses less than the last one did.

The static side is not the problem. HTML, JavaScript and CSS come from
CloudFront edge hits in 30-50 ms, brotli-compressed, and the entry bundle is
98 KB with a page chunk on top of it. Everything that feels slow is the API.

**A cold Lambda answered in ten to eleven seconds.** That is what somebody
arriving after a quiet period waits before the first data appears, and it is
the whole of the "the site is slow" complaint. Four requests fired at once on a
cold API are four containers starting, not one, which is why what a page asks
for and what it does not ask for both matter. `MemorySize` and the source-map
pair in `server/template.yaml` are set the way they are for this reason; the
number to check before changing them again is Init Duration in a CloudWatch
REPORT line.

**A warm request costs 270-330 ms and almost all of it is distance.** The API
and the image bucket are in us-east-1 and the audience is in Australia. No
amount of code makes that number smaller: only CloudFront in front of the
public routes, or moving the stack to ap-southeast-2, does. So the thing worth
counting on a page is round trips, not bytes - the slug and season routes
return the tournament, its teams, its seasons and the organiser in one answer
for exactly this reason, and a page that needs a second dependent request
should have the first one carry what it needs instead.

**Scanning the tournaments table is not where the time goes.** It reads every
match of every season, which sounds expensive and measured at 40-280 ms over
the network baseline. Projecting the scan is also not available: `toSummary`
derives `status` from the matches, so a summary needs them. Leave it alone
until the table is much bigger than it is.

**Nothing the admin store holds may be fetched on a public page.** A public
address is a different branch of the router and never mounts the admin shell,
so both `applyScope` and `setCurrentOrganizer` check `ADMIN_ROUTES` before
loading the clubs and the competitions. Without that check a signed-in
organiser reading a public page made three API calls where the page needed
one, and on a cold API paid for three containers.

**The images were the whole of the incognito complaint.** A crest fetched
straight from S3 in us-east-1 measured between 250 and 1100 ms from Sydney, and
a public organiser page draws thirty-two of them. They carry a year of
`immutable`, so a second visit costs nothing and only a first one — an incognito
window, or anybody arriving for the first time — pays: 1.6 MB over 32 requests,
2.7 seconds of wall clock even in parallel, because the S3 REST endpoint speaks
HTTP/1.1 and the browser opens six connections to a host.

Measured again once both were done: 32 images, 1617 KB and 2.7 s of wall clock
became 760 KB and 0.55 s. Note which half did what. Halving the bytes moved the
clock by 10% - the cost was 32 round trips over six HTTP/1.1 connections to
us-east-1, not the payload. The edge is what took the five-fold cut, and it is
also HTTP/2, so the six-connection ceiling is gone with it. Bytes were the cheap
half of this and the distribution was the real one.

Two things were wrong and both are fixed. The bucket now has `ImagesCdn` in
front of it, and the site swaps the host in as it draws an image —
`cdnUrl` in `src/utils/images.ts`, applied at every `src=` that comes from a
record. The swap is deliberately not in the records: everything in DynamoDB
still names the bucket, so `S3_PUBLIC_BASE_URL`, the presigned upload and the
delete route are all untouched, the keys from the browser-side era are covered
without migrating anything, and turning the distribution off again is one
environment variable (`VITE_IMAGE_CDN_URL`, set in Amplify) on the site. A new
`<img src={team.logo}>` written later is not wrong, it just quietly pays the old
price.

And the weight was in seven images, not spread across them: the ones keyed
`<32 hex>` rather than `logo-<timestamp>` averaged 177 KB against 15 KB for
everything uploaded since the browser started compressing, and ran to 337 KB for
a crest drawn at 40 pixels. `optimize-images.mjs` had left them alone because it
runs at 1200px for the whole bucket — a club's team photo lives under the same
prefix as its crest and nothing in the key tells them apart. It now asks
DynamoDB which keys are somebody's `logo` and shrinks those to 400, so the
photographs it was protecting keep their size.

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
  in `server/src` and fails on a bare reserved word. It reads any template
  literal that *looks* like an expression too, because the goal writes assemble
  theirs in pieces and pass a variable: a check that only sees a literal at the
  key had those three writes to live match records outside it.
- **A league round is stored from zero, a playoff round from one.**
  `generateRoundRobinSchedule` numbers its rounds from zero and every generator
  since has followed it; `roundNumber` on a hand-built playoff round is
  `existingRounds.length + 1`. The fixture list adds the one, so anything that
  prints `match.round` raw is a round behind what the same fixture is called on
  the season page. `roundLabel` in `src/utils/matches.ts` is the only place that
  knows which of the two it is holding.
- **Both halves of `lineups` are optional**, and `src/types.ts` says so. The two
  sides are written separately, so a reader that dereferences `lineups.away`
  because `lineups` exists will throw on a match only one manager has named.
  `setLineup` creates both sides empty for that reason; the type is the backstop.
- **A hook cannot be written below the early return.** `TeamsPage` and
  `TournamentsPage` return "No Organizer Selected" before their body runs, and
  `OrganizersPage` returns "Access Denied", so everything computed after that
  point is plain code and not `useMemo` or `useEffect`. A hook added there
  renders a different number of hooks the moment an organizer is selected, and
  React throws rather than re-rendering.
- **A screen outside `ADMIN_ROUTES` loads the clubs and competitions itself.**
  The regexp covers `/admin`, `/teams`, `/tournaments`, `/players` and
  `/calendar` and nothing else, so `/organizers` — which now lists what each
  organizer runs — calls `loadTeams` and `loadTournaments` from its own effect,
  the same way `TeamsPage` and `TournamentsPage` do. It also has to know when
  they have arrived: counts rendered from an empty store read as "0
  competitions, 0 clubs", which is a wrong answer rather than a missing one.
- **A list loaded once at mount is not loaded for the session that starts at
  the sign-in screen.** The shell asked `isSignedIn()` in a mount effect and
  loaded the organizers from it. Somebody arriving on `/login` holds no token
  then, and signing in navigates within the app, so the shell never mounts
  again and that list stayed empty for the whole session. Every organiser
  screen resolves its own organizer out of it, so a freshly created organizer
  account was told to "select an organizer first" on every one of them until
  they reloaded the page - and the super admin never saw it, because
  `superAdmin` passes the same guard without the list. `applyScope` loads it
  too now, into an empty list only, and `loadOrganizers` carries the in-flight
  guard the club and competition loads already had. The general shape: a
  mount-time read of the session answers a question that changes after mount.

- **Deleting an image no longer takes it off the internet at once.** The object
  goes from the bucket, but `ImagesCdn` has it at an edge and nothing
  invalidates that, so it stays fetchable at the CDN host for up to the cache
  policy's day. `ImagesCachePolicy` exists to bound it to a day rather than the
  year the objects themselves claim; if that ever has to be immediate, the fix is
  `cloudfront:CreateInvalidation` on the delete route and not a shorter TTL.
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

  It happened again in `tournamentService.getById`, and worse: it sent a
  signed-in viewer to `/admin/tournaments/:id`, which is not merely narrower but
  a 403 unless the viewer administers that organiser. Every caller was a public
  page, so the "next match" link and the "View" button on a club page answered
  "not found" for a club manager on every competition, and for an organiser on
  every competition but their own — while a signed-out visitor read the same
  page fine. It is `getPublicById` now, public for everyone. When a method is
  there to be read by visitors, say so in its name: `getAll` and `getById` are
  the names that get called from a public page by mistake.
