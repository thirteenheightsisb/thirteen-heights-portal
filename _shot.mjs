import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const p = await b.newPage({ viewport: { width: 1400, height: 1000 } })
p.on('pageerror', e => console.log('PAGEERROR', e.message))
for (const [route, name] of [['#/dashboard','dashboard'],['#/billing','billing'],['#/residents?add=1','resident-form']]) {
  await p.goto('http://localhost:5199/' + route); await p.waitForTimeout(1500)
  await p.screenshot({ path: `/tmp/claude-0/-home-claude/991ea2ee-3a57-54f1-bd0e-c5bcf4e71144/scratchpad/mock/${name}.png`, fullPage: true })
}
await b.close()
