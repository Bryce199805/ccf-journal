// Detail reading and navigation regression; mocked data only.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const origin = process.env.CCF_TEST_ORIGIN || 'http://127.0.0.1:5173'
async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    let empty = false
    const entry = {
      id: 1, type: 'journal', is_ccf: true, ccf_level: 'A', ccf_abbr: 'TEST', ccf_domain: '人工智能',
      ccf_full: 'International Journal of Computer Science and Distributed Systems',
      publisher: 'Publisher'.repeat(20), impact_factor: 0, cite_score: 5.2, h_index: 234, article_count: 12345,
      realtime_if: 6.5, five_year_if: 5.8, jci_value: 1.5, letpub_score: 8.3, sjr: 1.25, snip: 2.34,
      journalid: '1', cas2025: JSON.stringify({ bigZone: '1区', bigCategory: '计算机科学', smallZone: '2区', smallCategory: 'VeryLongSubject'.repeat(10), isTop: true }),
      cas2023: JSON.stringify({ bigZone: '3区', bigCategory: '历史计算机科学', smallZone: '3区', smallCategory: '历史人工智能' }),
      xinrui: null, country: 'United States', issn: '1234-5678', eissn: '9876-5432',
      research_area: '研究方向'.repeat(100), review_speed: 'ReviewSpeed'.repeat(20), acceptance_rate: '20%',
      jif: JSON.stringify([{ subject: 'Computer Science / Artificial Intelligence'.repeat(5), quartile: 'Q1', rank: '3/180' }]),
      citescore_rankings: JSON.stringify([{ subject: 'CiteScore 学科', zone: 'Q1', rank: '1234/5678', percentile: '98%' }]),
      jci_json: '{}', tags: [], note: '', letpub_url: 'https://example.com/letpub', official_url: 'https://example.com/official', submission_url: 'https://example.com/submit', ccf_url: 'https://example.com/ccf',
    }
    await page.route(`${origin}/api/**`, async route => {
      const path = new URL(route.request().url()).pathname
      let body = {}
      if (path === '/api/entries') body = { data: [entry], total: 1, page: 1, total_pages: 1 }
      else if (path.startsWith('/api/entries/')) body = { entry: empty ? { id: 1, type: 'journal', name: '待补充期刊', is_ccf: false, publisher: null, jif: 'null', jci_json: '{}', citescore_rankings: 'null', cas2025: 'null' } : entry }
      else if (path === '/api/tags') body = { tags: [] }
      else if (path === '/api/favorites') body = { entry_ids: [] }
      await route.fulfill({ json: body })
    })
    const open = async () => {
      await page.goto(origin)
      await page.getByRole('button', { name: '查看 TEST 详情', exact: true }).click()
      await page.getByText('期刊信息', { exact: true }).waitFor()
    }
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 740 })
      await open()
      const dialog = page.getByRole('dialog')
      const close = page.getByRole('button', { name: '关闭详情', exact: true })
      const footer = page.locator('.detail-actions')
      const closeBefore = await close.boundingBox(), footerBefore = await footer.boundingBox()
      assert.ok(closeBefore.y >= 0)
      assert.ok(footerBefore.y + footerBefore.height <= 740)
      assert.ok(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1))
      if (width >= 1280) assert.equal(new Set(await page.locator('.detail-metric-sm').evaluateAll(items => items.map(item => Math.round(item.getBoundingClientRect().top)))).size, 1, 'secondary metrics share one row')
      if (width >= 768) assert.ok(await page.locator('.detail-body table td').evaluateAll(cells => cells.every(cell => { const range = document.createRange(); range.selectNodeContents(cell); return range.getClientRects().length === 1 })), 'ranking values stay on one line')
      assert.ok(await page.locator('.detail-metric-sm dt').evaluateAll(items => items.every(item => item.getBoundingClientRect().height < 20)), 'secondary metric labels stay on one line')
      const scroll = page.locator('[data-detail-scroll]')
      await scroll.evaluate(e => { e.scrollTop = e.scrollHeight })
      assert.ok(await scroll.evaluate(e => e.scrollTop > 0))
      assert.equal((await close.boundingBox()).y, closeBefore.y)
      assert.equal((await footer.boundingBox()).y, footerBefore.y)
      await close.click()
      await dialog.waitFor({ state: 'hidden' })
      assert.equal(await page.getByRole('button', { name: '查看 TEST 详情', exact: true }).evaluate(e => e === document.activeElement), true)
      console.log(`PASS ${width}px: long fields wrap; close and links remain reachable while scrolling`)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await open()
    assert.equal(await page.locator('.detail-metric').count(), 4)
    assert.equal(await page.locator('.detail-metric dd').first().innerText(), '0.00')
    assert.equal(await page.locator('details').count(), 1)
    assert.equal(await page.locator('details').evaluate(e => e.open), false)
    await page.locator('summary').filter({ hasText: '期刊信息' }).click()
    await page.getByText('1234-5678', { exact: true }).waitFor()
    await page.getByRole('heading', { name: '研究方向', exact: true }).waitFor()
    for (const text of ['1.25', '2.34', '历史计算机科学', '3/180', 'CiteScore 学科']) await page.getByText(text, { exact: true }).waitFor()
    assert.ok(await page.getByRole('dialog').evaluate(e => e.scrollWidth <= e.clientWidth + 1))
    console.log('PASS zero metric, secondary metrics, historical partitions and rankings visible; journal info collapsed by default')
    await page.getByRole('button', { name: '关闭详情' }).click()
    empty = true
    await open()
    await page.getByText('暂无期刊指标，待数据补充后展示。', { exact: true }).waitFor()
    assert.equal(await page.locator('.detail-metric').count(), 0)
    assert.equal(await page.locator('.detail-actions').count(), 0)
    console.log('PASS missing data: single quiet empty state, no empty colored tiles or footer')
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
