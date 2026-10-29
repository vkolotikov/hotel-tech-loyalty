import { ESLint } from 'eslint'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

// Keep historical lint debt visible while rejecting new diagnostics, parse errors and hook-order errors.
const baselinePath = new URL('../eslint-baseline.json', import.meta.url)
const eslint = new ESLint({ cache: true, cacheLocation: 'node_modules/.cache/eslint-release' })
const results = await eslint.lintFiles(['src'])
const counts = {}, details = new Map(), rules = {}
let forbidden = false
for (const result of results) {
  const filename = path.relative(process.cwd(), result.filePath).replaceAll('\\', '/')
  const lines = (result.source ?? await fs.readFile(result.filePath, 'utf8')).split(/\r?\n/)
  for (const message of result.messages) {
    if (message.fatal || message.ruleId === 'react-hooks/rules-of-hooks' || /Definition for rule .* was not found/.test(message.message)) forbidden = true
    const line = (lines[(message.line || 1) - 1] || '').trim()
    const fingerprint = createHash('sha256').update(line).digest('hex').slice(0, 16)
    const key = `${filename}|${message.ruleId || 'directive'}|${message.messageId || message.message.split('\n')[0]}|${fingerprint}`
    counts[key] = (counts[key] || 0) + 1
    rules[message.ruleId || 'directive'] = (rules[message.ruleId || 'directive'] || 0) + 1
    details.set(key, `${filename}:${message.line}: ${message.ruleId || 'directive'}: ${message.message.split('\n')[0]}`)
  }
}
if (forbidden) {
  console.error('Parse errors, missing rules and hook-order violations cannot be baselined.')
  process.exitCode = 1
} else if (process.argv.includes('--write-baseline')) {
  await fs.writeFile(baselinePath, JSON.stringify({ version: 1, note: 'Recorded legacy diagnostics; correctness findings triaged and no new instances allowed. See launch remediation report.', rules, counts }, null, 2) + '\n')
  console.log(`Recorded ${Object.values(counts).reduce((a, b) => a + b, 0)} existing diagnostics. This is not a zero-warning lint result.`)
} else {
  const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'))
  const added = Object.entries(counts).filter(([key, count]) => count > (baseline.counts[key] || 0))
  if (added.length) {
    for (const [key, count] of added) console.error(`${details.get(key)} (${count - (baseline.counts[key] || 0)} new)`)
    process.exitCode = 1
  } else console.log(`Lint regression check passed; ${Object.values(counts).reduce((a, b) => a + b, 0)} legacy diagnostics remain.`)
}
