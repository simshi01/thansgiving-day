import { readFileSync } from 'fs'
import { resolve } from 'path'
import { moderateText } from '../lib/moderation'

interface Case { text: string; why: string }
const file = resolve(__dirname, '../tests/moderation-cases.json')
const cases: { block: Case[]; allow: Case[] } = JSON.parse(readFileSync(file, 'utf8'))

let failures = 0
for (const c of cases.block) {
  const r = moderateText(c.text)
  if (r.isValid) {
    failures++
    console.log(`FAIL [block expected, got allow] ${JSON.stringify(c.text)} -- ${c.why}`)
  }
}
for (const c of cases.allow) {
  const r = moderateText(c.text)
  if (!r.isValid) {
    failures++
    console.log(`FAIL [allow expected, got block] ${JSON.stringify(c.text)} -- ${c.why}`)
  }
}
const total = cases.block.length + cases.allow.length
console.log(`\nblock: ${cases.block.length}, allow: ${cases.allow.length}, passed: ${total - failures}/${total}, failed: ${failures}`)
process.exit(failures ? 1 : 0)
