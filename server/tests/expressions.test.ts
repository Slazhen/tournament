import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Every attribute name written into a DynamoDB expression by hand, checked
 * against DynamoDB's reserved words.
 *
 * A reserved word used as a bare attribute name is a ValidationException at run
 * time, which this API turns into a 500 with nothing in the response to explain
 * it. `attribute_exists(token)` in `consumeInvite` did exactly that: `token` is
 * reserved, so every attempt to take up an invitation failed for as long as it
 * was deployed, and nobody could take over a club.
 *
 * Nothing else in the pipeline can catch this. `tsc` does not look inside a
 * string, the tests below it mock `repos.js` above the DynamoDB call, and
 * `scripts/smoke-init.mjs` only proves the bundle loads. So this reads the
 * source instead of running it: it costs nothing, needs no AWS, and covers the
 * expressions no test ever executes.
 *
 * `buildUpdate` in `lib/ddb.ts` aliases every name it generates. This is the
 * same rule for the expressions written by hand.
 */

/**
 * https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ReservedWords.html
 *
 * Copied rather than depended on: it is a fixed list that changes about never,
 * and a test that guards the deploy should not need a package to do it.
 */
const RESERVED = new Set(
  `ABORT ABSOLUTE ACTION ADD AFTER AGENT AGGREGATE ALL ALLOCATE ALTER ANALYZE AND ANY ARCHIVE ARE
   ARRAY AS ASC ASCII ASENSITIVE ASSERTION ASYMMETRIC AT ATOMIC ATTACH ATTRIBUTE AUTH AUTHORIZATION
   AUTHORIZE AUTO AVG BACK BACKUP BASE BATCH BEFORE BEGIN BETWEEN BIGINT BINARY BIT BLOB BLOCK
   BOOLEAN BOTH BREADTH BUCKET BULK BY BYTE CALL CALLED CALLING CAPACITY CASCADE CASCADED CASE CAST
   CATALOG CHAR CHARACTER CHECK CLASS CLOB CLOSE CLUSTER CLUSTERED CLUSTERING CLUSTERS COALESCE
   COLLATE COLLATION COLLECTION COLUMN COLUMNS COMBINE COMMENT COMMIT COMPACT COMPILE COMPRESS
   CONDITION CONFLICT CONNECT CONNECTION CONSISTENCY CONSISTENT CONSTRAINT CONSTRAINTS CONSTRUCTOR
   CONSUMED CONTINUE CONVERT COPY CORRESPONDING COUNT COUNTER CREATE CROSS CUBE CURRENT CURSOR CYCLE
   DATA DATABASE DATE DATETIME DAY DEALLOCATE DEC DECIMAL DECLARE DEFAULT DEFERRABLE DEFERRED DEFINE
   DEFINED DEFINITION DELETE DELIMITED DEPTH DEREF DESC DESCRIBE DESCRIPTOR DETACH DETERMINISTIC
   DIAGNOSTICS DIRECTORIES DISABLE DISCONNECT DISTINCT DISTRIBUTE DO DOMAIN DOUBLE DROP DUMP DURATION
   DYNAMIC EACH ELEMENT ELSE ELSEIF EMPTY ENABLE END EQUAL EQUALS ERROR ESCAPE ESCAPED EVAL EVALUATE
   EXCEEDED EXCEPT EXCEPTION EXCEPTIONS EXCLUSIVE EXEC EXECUTE EXISTS EXIT EXPLAIN EXPLODE EXPORT
   EXPRESSION EXTENDED EXTERNAL EXTRACT FAIL FALSE FAMILY FETCH FIELDS FILE FILTER FILTERING FINAL
   FINISH FIRST FIXED FLATTERN FLOAT FOR FORCE FOREIGN FORMAT FORWARD FOUND FREE FROM FULL FUNCTION
   FUNCTIONS GENERAL GENERATE GET GLOB GLOBAL GO GOTO GRANT GREATER GROUP GROUPING HANDLER HASH HAVE
   HAVING HEAP HIDDEN HOLD HOUR IDENTIFIED IDENTITY IF IGNORE IMMEDIATE IMPORT IN INCLUDING INCLUSIVE
   INCREMENT INCREMENTAL INDEX INDEXED INDEXES INDICATOR INFINITE INITIALLY INLINE INNER INNTER INOUT
   INPUT INSENSITIVE INSERT INSTEAD INT INTEGER INTERSECT INTERVAL INTO INVALIDATE IS ISOLATION ITEM
   ITEMS ITERATE JOIN KEY KEYS LAG LANGUAGE LARGE LAST LATERAL LEAD LEADING LEAVE LEFT LENGTH LESS
   LEVEL LIKE LIMIT LIMITED LINES LIST LOAD LOCAL LOCALTIME LOCALTIMESTAMP LOCATION LOCATOR LOCK
   LOCKS LOG LOGED LONG LOOP LOWER MAP MATCH MATERIALIZED MAX MAXLEN MEMBER MERGE METHOD METRICS MIN
   MINUS MINUTE MISSING MOD MODE MODIFIES MODIFY MODULE MONTH MULTI MULTISET NAME NAMES NATIONAL
   NATURAL NCHAR NCLOB NEW NEXT NO NONE NOT NULL NULLIF NUMBER NUMERIC OBJECT OF OFFLINE OFFSET OLD
   ON ONLINE ONLY OPAQUE OPEN OPERATOR OPTION OR ORDER ORDINALITY OTHER OTHERS OUT OUTER OUTPUT OVER
   OVERLAPS OVERRIDE OWNER PAD PARALLEL PARAMETER PARAMETERS PARTIAL PARTITION PARTITIONED PARTITIONS
   PATH PERCENT PERCENTILE PERMISSION PERMISSIONS PIPE PIPELINED PLAN POOL POSITION PRECISION PREPARE
   PRESERVE PRIMARY PRIOR PRIVATE PRIVILEGES PROCEDURE PROCESSED PROJECT PROJECTION PROPERTY
   PROVISIONING PUBLIC PUT QUERY QUIT QUORUM RAISE RANDOM RANGE RANK RAW READ READS REAL REBUILD
   RECORD RECURSIVE REDUCE REF REFERENCE REFERENCES REFERENCING REGEXP REGION REINDEX RELATIVE
   RELEASE REMAINDER RENAME REPEAT REPLACE REQUEST RESET RESIGNAL RESOURCE RESPONSE RESTORE RESTRICT
   RESULT RETURN RETURNING RETURNS REVERSE REVOKE RIGHT ROLE ROLES ROLLBACK ROLLUP ROUTINE ROW ROWS
   RULE RULES SAMPLE SATISFIES SAVE SAVEPOINT SCAN SCHEMA SCOPE SCROLL SEARCH SECOND SECTION SEGMENT
   SEGMENTS SELECT SELF SEMI SENSITIVE SEPARATE SEQUENCE SERIALIZABLE SESSION SET SETS SHARD SHARE
   SHARED SHORT SHOW SIGNAL SIMILAR SIZE SKEWED SMALLINT SNAPSHOT SOME SOURCE SPACE SPACES SPARSE
   SPECIFIC SPECIFICTYPE SPLIT SQL SQLCODE SQLERROR SQLEXCEPTION SQLSTATE SQLWARNING START STATE
   STATIC STATUS STORAGE STORE STORED STREAM STRING STRUCT STYLE SUB SUBMULTISET SUBPARTITION
   SUBSTRING SUBTYPE SUM SUPER SYMMETRIC SYNONYM SYSTEM TABLE TABLESAMPLE TEMP TEMPORARY TERMINATED
   TEXT THAN THEN THROUGHPUT TIME TIMESTAMP TIMEZONE TINYINT TO TOKEN TOTAL TOUCH TRAILING
   TRANSACTION TRANSFORM TRANSLATE TRANSLATION TREAT TRIGGER TRIM TRUE TRUNCATE TTL TUPLE TYPE UNDER
   UNDO UNION UNIQUE UNIT UNKNOWN UNLOGGED UNNEST UNPROCESSED UNSIGNED UNTIL UPDATE UPPER URL USAGE
   USE USER USERS USING UUID VACUUM VALUE VALUED VALUES VARCHAR VARIABLE VARIANCE VARINT VARYING VIEW
   VIEWS VIRTUAL VOID WAIT WHEN WHENEVER WHERE WHILE WINDOW WITH WITHIN WITHOUT WORK WRAPPED WRITE
   YEAR ZONE`
    .trim()
    .split(/\s+/),
)

/** Expression functions. Never attribute names, so never aliased. */
const FUNCTIONS = new Set([
  'ATTRIBUTE_EXISTS',
  'ATTRIBUTE_NOT_EXISTS',
  'ATTRIBUTE_TYPE',
  'BEGINS_WITH',
  'CONTAINS',
  'IF_NOT_EXISTS',
  'LIST_APPEND',
  'SIZE',
])

/**
 * The grammar itself: update actions and the logical operators.
 *
 * They are also reserved words, so skipping them is the one blind spot here —
 * an attribute genuinely called `set` or `in` would go unnoticed. Nothing in
 * this schema is, and the alternative is parsing the expression properly for a
 * case that has never come up.
 */
const GRAMMAR = new Set(['SET', 'REMOVE', 'ADD', 'DELETE', 'AND', 'OR', 'NOT', 'BETWEEN', 'IN'])

const EXPRESSION_PROPERTY =
  /(KeyConditionExpression|ConditionExpression|FilterExpression|UpdateExpression|ProjectionExpression)\s*:\s*(['"`])((?:\\.|(?!\2)[\s\S])*)\2/g

/**
 * The reserved words a single expression names without an alias.
 *
 * `#name` and `:value` are already aliases. A `${…}` interpolation is a
 * JavaScript value — an array index, or a whole expression assembled elsewhere —
 * and there is no attribute name to check inside it.
 */
export function unaliasedReservedWords(expression: string): string[] {
  const found: string[] = []
  const source = expression.replace(/\$\{[^}]*\}/g, ' ')

  for (const match of source.matchAll(/(?<![#:\w])[A-Za-z_][A-Za-z_0-9]*/g)) {
    const word = match[0].toUpperCase()
    if (FUNCTIONS.has(word) || GRAMMAR.has(word)) continue
    if (RESERVED.has(word)) found.push(match[0])
  }

  return found
}

function sourceFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path))
    else if (entry.endsWith('.ts')) files.push(path)
  }
  return files
}

describe('DynamoDB expressions', () => {
  it('alias every attribute name that is a reserved word', () => {
    const root = fileURLToPath(new URL('../src', import.meta.url))
    const offences: string[] = []

    for (const file of sourceFiles(root)) {
      const contents = readFileSync(file, 'utf8')

      for (const match of contents.matchAll(EXPRESSION_PROPERTY)) {
        const words = unaliasedReservedWords(match[3])
        if (words.length === 0) continue

        const line = contents.slice(0, match.index).split('\n').length
        const where = `${file.slice(root.length - 3)}:${line}`
        offences.push(`${where} ${match[1]} names ${words.join(', ')} — use ExpressionAttributeNames`)
      }
    }

    expect(offences.join('\n')).toBe('')
  })

  // Without this, the check above would keep passing after the pattern above
  // stopped matching anything, which is the way a test like this dies quietly.
  it('recognises the bug it exists to prevent', () => {
    expect(unaliasedReservedWords('attribute_exists(token)')).toEqual(['token'])
    expect(unaliasedReservedWords('#matches[0].#status = :status')).toEqual([])
    expect(unaliasedReservedWords('SET teamIds = list_append(teamIds, :one)')).toEqual([])
    expect(unaliasedReservedWords('SET details.name = :name')).toEqual(['name'])
  })
})
