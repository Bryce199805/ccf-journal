// Uses mocked API data. Requires Playwright; see tests/README.md.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const origin = process.env.CCF_TEST_ORIGIN || 'http://127.0.0.1:5173'
const output = process.env.CCF_SCREENSHOTS
const entries = ['A', 'B', 'C'].map((level, index) => ({
  id: index + 1, type: 'journal', is_ccf: true, ccf_level: level,
  ccf_abbr: ['TPAMI', 'Pattern Recognition', 'Neurocomputing'][index],
  ccf_full: ['IEEE Transactions on Pattern Analysis and Machine Intelligence', 'Pattern Recognition', 'Neurocomputing'][index],
  ccf_domain: '人工智能', ccf_publisher: index === 0 ? 'IEEE Computer Society' : 'Elsevier',
  publisher: index === 0 ? 'IEEE Computer Society' : 'Elsevier', journalid: '1',
  impact_factor: 18.6 - index * 4, cite_score: 29.8 - index * 5,
  five_year_if: 20.5, realtime_if: 19.3, h_index: 411 - index * 50,
  jci_value: 3.6, article_count: 1234, letpub_score: 9.4,
  cas2025: JSON.stringify({ bigZone: `${index + 1}区`, bigCategory: '计算机科学', smallZone: '1区', smallCategory: '计算机：人工智能', isTop: index === 0 }),
  xinrui: JSON.stringify({ bigZone: '1区', bigCategory: '计算机科学', smallZone: '1区', smallCategory: '人工智能' }),
  wos_zone: 'Q1', sci_type: 'SCIE', tags: index === 0 ? ['重点关注', '视觉研究'] : [],
  note: index === 0 ? '关注视觉表征与多模态学习方向，投稿前检查最新征稿信息。' : '',
  is_favorite: index === 0, issn: '0000-0000', country: 'United States', research_area: 'Computer Vision and Machine Learning',
  letpub_url: 'https://example.com', official_url: 'https://example.com', submission_url: 'https://example.com',
}))

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1440, height: 1000 } })
    await context.route(`${origin}/api/**`, async route => {
      const path = new URL(route.request().url()).pathname
      const body = path === '/api/entries' ? { data: entries, total: 452, page: 1, total_pages: 23 }
        : path.startsWith('/api/entries/') ? { entry: entries[0] }
        : path === '/api/stats' ? { total_journals: 452, total_conferences: 381 }
        : path === '/api/tags' ? { tags: [{ name: '重点关注', color: 'blue' }, { name: '视觉研究', color: 'violet' }] }
        : { entry_ids: [1] }
      await route.fulfill({ json: body })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const screenshot = async name => { if (output) { fs.mkdirSync(output, { recursive: true }); await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); if (name.includes('-detail-')) await page.getByRole('dialog').screenshot({ path: `${output}/${name}.png`, animations: 'disabled' }); else await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' }) } }
    const choose = async name => {
      await page.getByRole('button', { name: '外观设置', exact: true }).click()
      await page.getByRole('button', { name, exact: false }).filter({ has: page.locator('.theme-preview') }).click()
      await page.keyboard.press('Escape')
    }
    await page.goto(origin)
    await page.getByRole('button', { name: '查看 TPAMI 详情', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), false)
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
    console.log('PASS default theme follows system changes')
    await choose('浅色')
    await page.reload()
    await page.getByRole('button', { name: '查看 TPAMI 详情', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), false)
    assert.equal(await page.evaluate(() => localStorage.getItem('ccf_theme')), 'light')
    console.log('PASS explicit preference persists and overrides dark system')
    const tab = await context.newPage()
    await tab.goto(origin)
    await tab.getByRole('button', { name: '外观设置', exact: true }).waitFor()
    await choose('深色')
    await tab.waitForFunction(() => document.documentElement.classList.contains('dark'))
    await tab.close()
    console.log('PASS theme selection syncs across tabs')
    for (const mode of ['浅色', '深色']) {
      await choose(mode)
      await page.getByRole('button', { name: '查看 TPAMI 详情', exact: true }).waitFor()
      await screenshot(`${mode}-desktop`)
      await page.getByRole('button', { name: '查看 TPAMI 详情', exact: true }).click()
      await page.getByText('期刊信息', { exact: true }).waitFor()
      await screenshot(`${mode}-detail-desktop`)
      const contrast = await page.evaluate(() => {
        const ctx = document.createElement('canvas').getContext('2d')
        const rgb = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3) }
        const luminance = values => values.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
        const ratio = (a, b) => { const x = luminance(rgb(a)), y = luminance(rgb(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
        const root = getComputedStyle(document.documentElement)
        const token = key => root.getPropertyValue(`--${key}`).trim()
        const pairs = [['body', token('foreground'), token('background')], ['muted', token('muted-foreground'), token('card')], ['button', token('primary-foreground'), token('primary')]]
        for (const element of document.querySelectorAll('.detail-metric, .badge-top')) {
          const style = getComputedStyle(element)
          pairs.push([element.getAttribute('data-tone') || 'TOP', style.color, style.backgroundColor])
        }
        for (const name of ['level-a', 'level-b', 'level-c', 'zone-1', 'zone-2', 'zone-3', 'zone-4', 'zone-jcr']) {
          const el = document.createElement('span'); el.className = name; document.body.append(el)
          const style = getComputedStyle(el)
          for (const stop of style.backgroundImage.match(/rgb\([^)]+\)/g) || []) pairs.push([name, style.color, stop])
          el.remove()
        }
        return pairs.map(([name, a, b]) => [name, ratio(a, b)])
      })
      for (const [name, value] of contrast) assert.ok(value >= 4.5, `${mode} ${name} contrast ${value.toFixed(2)}`)
      console.log(`PASS ${mode} text/metric/badge contrast, min ${Math.min(...contrast.map(x => x[1])).toFixed(2)}:1`)
      await page.keyboard.press('Escape')
      for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${mode} ${width}`)
        await screenshot(`${mode}-${width}`)
        await page.getByRole('button', { name: '外观设置', exact: true }).click()
        assert.ok(await page.locator('[data-slot="popover-content"]').evaluate(e => e.getBoundingClientRect().left >= 0 && e.getBoundingClientRect().right <= innerWidth))
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: '查看 TPAMI 详情', exact: true }).click()
        await page.getByText('期刊信息', { exact: true }).waitFor()
        assert.ok(await page.getByRole('dialog').evaluate(e => e.scrollWidth <= e.clientWidth + 1))
        if (width === 390) await screenshot(`${mode}-detail-mobile`)
        await page.keyboard.press('Escape')
      }
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.getByRole('button', { name: '表格视图', exact: true }).click()
      await page.locator('table').waitFor()
      await screenshot(`${mode}-table`)
      await page.getByRole('button', { name: '卡片视图', exact: true }).click()
      console.log(`PASS ${mode} responsive cards, detail, theme picker, table`)
    }
    await choose('跟随系统')
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'))
    assert.equal(await page.evaluate(() => document.documentElement.style.colorScheme), 'light')
    await page.getByRole('button', { name: '查看标识说明' }).click()
    await page.getByRole('heading', { name: '目录标识与颜色' }).waitFor()
    console.log('PASS system mode restored and semantic legend opens')
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
