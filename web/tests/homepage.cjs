// Tests real row geometry, personal-content editing and compact header grouping.
// All API calls are mocked; see README.md for Playwright setup.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const origin = process.env.CCF_TEST_ORIGIN || 'http://127.0.0.1:5173'
const output = process.env.CCF_SCREENSHOTS
const base = {
  type: 'journal', is_ccf: true, ccf_level: 'A', ccf_domain: '人工智能', journalid: '1',
  cas2025: JSON.stringify({ bigZone: '1区', isTop: true }), xinrui: JSON.stringify({ bigZone: '1区' }),
  wos_zone: 'Q1', sci_type: 'SCIE', impact_factor: 12.5, cite_score: 22.3, h_index: 300, article_count: 1234,
  letpub_url: 'https://example.com', is_favorite: true, tags: [], note: '', publisher: 'IEEE',
}
const entries = [
  { ...base, id: 1, ccf_abbr: 'TPAMI', ccf_full: 'IEEE Transactions on Pattern Analysis and Machine Intelligence', tags: ['重点关注', '视觉研究'], note: '关注多模态学习，整理投稿计划。' },
  { ...base, id: 2, ccf_abbr: 'PR', ccf_full: 'Pattern Recognition', ccf_level: 'B', publisher: 'A publisher with a longer name that wraps onto multiple lines in compact cards', is_favorite: false },
  { ...base, id: 3, ccf_abbr: 'TNNLS', ccf_full: 'IEEE Transactions on Neural Networks and Learning Systems', tags: ['神经网络', '需要精读', '投稿备选', '长期跟进', '知识蒸馏', '模型压缩'], note: '很长的中文备注。'.repeat(18) },
  { ...base, id: 4, ccf_abbr: 'AI', ccf_full: 'Artificial Intelligence', ccf_relations: JSON.stringify([{ domain: '人工智能', level: 'A' }, { domain: '交叉/综合/新兴', level: 'B' }]) },
]
async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CCF_CHROMIUM_EXECUTABLE })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route(`${origin}/api/**`, async route => {
      const req = route.request(), url = new URL(req.url())
      let body = {}
      if (url.pathname === '/api/entries') body = { data: entries, total: 4, page: 1, total_pages: 1 }
      else if (url.pathname.startsWith('/api/entries/')) body = { entry: entries[Number(url.pathname.split('/').pop()) - 1] }
      else if (url.pathname === '/api/notes' && req.method() === 'PUT') {
        const data = req.postDataJSON(); entries.find(e => e.id === data.entry_id).note = data.content
      } else if (url.pathname === '/api/tags') body = { tags: [{ name: '重点关注', color: 'blue' }] }
      else if (url.pathname === '/api/stats') body = { total_journals: 452, total_conferences: 381 }
      else if (url.pathname === '/api/favorites') body = { entry_ids: [1, 3, 4] }
      await route.fulfill({ json: body })
    })
    const cards = page.locator('[data-entry-id]')
    const aligned = async () => {
      const boxes = await cards.evaluateAll(elements => elements.map(el => {
        const r = el.getBoundingClientRect(), metrics = el.querySelector('.metric-strip').getBoundingClientRect(), footer = el.querySelector('[data-card-footer]').getBoundingClientRect()
        return { top: r.top, bottom: r.bottom, metric: metrics.top, footer: footer.top }
      }))
      for (let i = 0; i < boxes.length; i += 2) {
        assert.ok(Math.abs(boxes[i].top - boxes[i + 1].top) < 1)
        assert.ok(Math.abs(boxes[i].metric - boxes[i + 1].metric) < 1, `metric alignment: ${JSON.stringify(boxes)}`)
        assert.ok(Math.abs(boxes[i].footer - boxes[i + 1].footer) < 1)
        assert.ok(Math.abs(boxes[i].bottom - boxes[i + 1].bottom) < 1)
      }
    }
    await page.goto(origin + '?favOnly=true')
    await cards.first().waitFor()
    assert.equal(await page.getByRole('button', { name: '查看标识说明' }).count(), 0)
    assert.equal(await page.locator('header .brand-mark').count(), 0)
    const first = cards.first()
    for (const label of ['中科院 1区', '新锐 1区', 'JCR Q1']) {
      const badge = first.locator('[data-card-heading]').getByText(label, { exact: true })
      await badge.waitFor()
      const titleBox = await first.locator('h2').boundingBox(), badgeBox = await badge.boundingBox()
      assert.ok(Math.abs(titleBox.y - badgeBox.y) < 4, `${label} should sit beside abbreviation`)
    }
    const grade = await first.locator('[data-card-classification] [data-ccf-grade]').boundingBox()
    const domain = await first.locator('[data-card-classification]').getByText('人工智能', { exact: true }).boundingBox()
    assert.ok(Math.abs(grade.y - domain.y) < 5)
    await aligned()
    console.log('PASS inline abbreviation/partitions, CCF/domain grouping, aligned metrics with uneven notes and publishers')
    await first.getByRole('button', { name: '备注', exact: true }).click()
    const editor = first.getByRole('textbox', { name: '备注内容' })
    await editor.fill('编辑中的备注\n第二行\n第三行\n第四行')
    await aligned()
    await first.getByRole('button', { name: '保存备注' }).click()
    await editor.waitFor({ state: 'hidden' })
    await aligned()
    assert.ok((await first.locator('[data-card-personal]').boundingBox()).y < (await first.locator('.metric-strip').boundingBox()).y)
    await first.getByRole('button', { name: '编辑备注内容' }).click()
    assert.equal(await editor.inputValue(), '编辑中的备注\n第二行\n第三行\n第四行')
    await first.getByRole('button', { name: '取消编辑备注' }).click()
    console.log('PASS editing and saving multiline notes preserves metric alignment; full note remains accessible')
    for (const mode of ['浅色', '深色']) {
      await page.getByRole('button', { name: '外观设置', exact: true }).click()
      await page.getByRole('button', { name: new RegExp(mode) }).filter({ has: page.locator('.theme-preview') }).click()
      await page.keyboard.press('Escape')
      for (const width of [320, 375, 390, 844, 1024, 1440]) {
        await page.setViewportSize({ width, height: width === 844 ? 390 : 900 })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${mode} ${width} overflow`)
        if (width >= 1024) await aligned()
        for (const card of await cards.all()) assert.ok(await card.evaluate(e => e.scrollWidth <= e.clientWidth + 1))
        if (output && [375, 1440].includes(width)) {
          fs.mkdirSync(output, { recursive: true })
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
          await page.screenshot({ path: `${output}/homepage-${mode}-${width}.png`, fullPage: true, animations: 'disabled' })
        }
      }
      console.log(`PASS ${mode}: 320–1440px and landscape overflow/alignment`)
    }
    // Long unbroken names and larger text must wrap without hiding the partitions.
    entries[1].ccf_abbr = 'LongJournalAbbreviation'.repeat(8)
    await page.setViewportSize({ width: 375, height: 900 })
    await page.reload(); await cards.first().waitFor()
    await page.addStyleTag({ content: 'html { font-size: 20px; }' })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await cards.first().getByRole('button', { name: '查看 TPAMI 详情', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('dialog').waitFor()
    await page.keyboard.press('Escape')
    assert.deepEqual(errors, [])
    console.log('PASS long names, enlarged text, keyboard details, reduced motion')
  } finally { await browser.close() }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
