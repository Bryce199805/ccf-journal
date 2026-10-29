// Run against Vite with Playwright available: node web/tests/experience.cjs
// All API calls are mocked; no account or production data is modified.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const origin = process.env.CCF_TEST_ORIGIN || 'http://127.0.0.1:5173'

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    let listFailure = false, detailFailure = false, mutationFailure = false, delay = 0
    let favorite = false, note = '原始备注', favoriteWrites = 0, noteWrites = 0, lastParams
    const entry = {
      id: 1, type: 'journal', is_ccf: true, ccf_level: 'A', ccf_abbr: 'TEST',
      ccf_full: 'International Journal of Computer Science and Distributed Systems',
      ccf_domain: '人工智能', publisher: 'Test Publisher', tags: ['研究'], note,
      is_favorite: false, journalid: '1', wos_status: 'source_missing', wos_reason: '暂无分区来源，请稍后查看',
      cas2025: JSON.stringify({ bigZone: '1区', bigCategory: '计算机科学', smallZone: '2区', smallCategory: '人工智能', isTop: true }),
    }
    await page.route(`${origin}/api/**`, async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname
      let body = {}, status = 200
      if (path === '/api/entries') {
        lastParams = url.searchParams
        const type = lastParams.get('type')
        const query = lastParams.get('q')
        const pageNumber = Number(lastParams.get('page') || 1)
        if (delay) await new Promise(resolve => setTimeout(resolve, delay))
        status = listFailure ? 503 : 200
        body = { data: query === 'missing' ? [] : [{ ...entry, type, ccf_abbr: type === 'conference' ? 'CONF' : 'TEST', note, is_favorite: favorite }], total: query === 'missing' ? 0 : 999, page: pageNumber, total_pages: 50 }
      } else if (path === '/api/entries/1') {
        status = detailFailure ? 503 : 200
        body = { entry: { ...entry, note, is_favorite: favorite } }
      } else if (path === '/api/stats') body = { total_journals: 452, total_conferences: 381 }
      else if (path === '/api/tags') body = { tags: [{ id: 1, name: '研究', color: 'blue' }] }
      else if (path === '/api/favorites' && request.method() === 'GET') body = { entry_ids: favorite ? [1] : [] }
      else if (path === '/api/favorites' && request.method() !== 'GET') {
        favoriteWrites++
        await new Promise(resolve => setTimeout(resolve, 300))
        status = mutationFailure ? 503 : 200
        if (!mutationFailure) favorite = request.method() === 'POST'
      } else if (path === '/api/notes' && request.method() !== 'GET') {
        noteWrites++
        await new Promise(resolve => setTimeout(resolve, 300))
        status = mutationFailure ? 503 : 200
        if (!mutationFailure) note = request.postDataJSON().content
      }
      await route.fulfill({ status, json: body })
    })
    const openList = async (query = '') => {
      await page.goto(origin + query)
      await page.getByRole('button', { name: '查看 TEST 详情', exact: true }).waitFor()
    }
    const check = async (name, test) => { await test(); console.log('PASS', name) }
    await check('hidden favorite tag is removed; view switch keeps page; URL restores filters', async () => {
      await openList('?favOnly=true&tag=研究&page=3')
      assert.equal(lastParams.get('tag'), '研究')
      await page.locator('header').getByRole('button', { name: '收藏', exact: true }).click()
      await page.waitForFunction(() => !location.search.includes('tag='))
      await page.waitForTimeout(150)
      assert.equal(lastParams.get('tag'), null)
      await openList('?page=3')
      await page.getByRole('button', { name: '表格视图' }).click()
      await page.locator('table').waitFor()
      assert.equal(new URL(page.url()).searchParams.get('page'), '3')
      await page.reload()
      await page.locator('table').waitFor()
      assert.equal(await page.getByRole('button', { name: '表格视图' }).getAttribute('aria-pressed'), 'true')
      await page.goBack()
      await page.locator('h2').filter({ hasText: /^TEST$/ }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('page'), '3')
    })
    await check('search clear, no-result recovery, and selected filter removal', async () => {
      await openList()
      await page.getByRole('textbox', { name: '搜索名称、简称、ISSN、出版社' }).fill('missing')
      await page.getByRole('heading', { name: '没有匹配结果' }).waitFor()
      await page.getByRole('button', { name: '清除搜索和筛选' }).click()
      await page.getByRole('button', { name: '查看 TEST 详情', exact: true }).waitFor()
      await page.getByRole('button', { name: /筛选条件/ }).click()
      await page.getByRole('button', { name: '人工智能', exact: true }).click()
      await page.getByRole('button', { name: '移除人工智能' }).click()
      assert.equal(new URL(page.url()).searchParams.has('domains'), false)
    })
    await check('slow type switch does not render journal data as conference data', async () => {
      delay = 700
      await page.getByRole('button', { name: '会议', exact: true }).click()
      await page.getByText('正在加载目录…').waitFor()
      assert.equal(await page.locator('h2').filter({ hasText: /^TEST$/ }).count(), 0)
      await page.getByRole('heading', { name: 'CONF', exact: true }).waitFor()
      delay = 0
    })
    await check('list and detail failures offer working retries', async () => {
      listFailure = true
      await page.goto(origin)
      await page.getByRole('alert').filter({ hasText: '加载失败' }).waitFor()
      assert.equal(await page.getByText('没有匹配结果', { exact: true }).count(), 0)
      listFailure = false
      await page.getByRole('button', { name: '重试', exact: true }).click()
      await page.getByRole('button', { name: '查看 TEST 详情', exact: true }).waitFor()
      detailFailure = true
      await page.getByRole('button', { name: '查看 TEST 详情', exact: true }).focus()
      await page.keyboard.press('Enter')
      await page.getByRole('dialog').getByRole('alert').waitFor()
      detailFailure = false
      await page.getByRole('dialog').getByRole('button', { name: '重试', exact: true }).click()
      await page.getByText('期刊信息', { exact: true }).waitFor()
      await page.getByText('JCR 数据说明', { exact: true }).click()
      await page.getByText(entry.wos_reason, { exact: true }).waitFor()
      await page.keyboard.press('Escape')
      assert.equal(await page.getByRole('button', { name: '查看 TEST 详情', exact: true }).evaluate(e => e === document.activeElement), true)
    })
    await check('favorite blocks duplicate writes and recovers after failure', async () => {
      mutationFailure = true
      const star = page.locator('[data-slot="card"]').getByRole('button', { name: '收藏', exact: true })
      await star.evaluate(element => { element.click(); element.click() })
      await page.getByRole('alert').filter({ hasText: '收藏操作失败' }).waitFor()
      assert.equal(favoriteWrites, 1)
      mutationFailure = false
      await star.click()
      await page.locator('[data-slot="card"]').getByRole('button', { name: '取消收藏', exact: true }).waitFor()
      assert.equal(favoriteWrites, 2)
    })
    await check('IME composition and newline do not save; failed note draft survives retry', async () => {
      await page.getByRole('button', { name: '备注', exact: true }).click()
      const editor = page.getByRole('textbox', { name: '备注内容' })
      await editor.fill('新的中文备注')
      await editor.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, isComposing: true })
      await page.keyboard.press('Enter')
      assert.equal(noteWrites, 0)
      mutationFailure = true
      await page.getByRole('button', { name: '保存备注', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: '保存失败' }).waitFor()
      assert.ok((await editor.inputValue()).includes('新的中文备注'))
      mutationFailure = false
      await page.getByRole('button', { name: '保存备注', exact: true }).click()
      await editor.waitFor({ state: 'hidden' })
      assert.equal(note, '新的中文备注')
    })
    await check('tag manager opens from picker without opening journal details', async () => {
      await page.getByRole('button', { name: '标签', exact: true }).click()
      await page.getByRole('button', { name: '新建 / 管理标签', exact: true }).click()
      await page.getByRole('dialog', { name: '管理标签' }).waitFor()
      await page.getByRole('textbox', { name: '新标签名称' }).fill('新标签')
      assert.equal(await page.getByRole('dialog').count(), 1)
      await page.keyboard.press('Escape')
    })
    await check('jump to page updates URL and results', async () => {
      await page.getByRole('spinbutton', { name: '跳至' }).fill('25')
      await page.getByRole('button', { name: '跳转', exact: true }).click()
      await page.getByText('第 25 / 50 页', { exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('page'), '25')
    })
    for (const width of [320, 390, 768, 1440]) {
      await check(`responsive overflow ${width}px`, async () => {
        await page.setViewportSize({ width, height: 844 })
        await openList('?domains=人工智能&levels=A')
        const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
        assert.ok(await fits())
        if (process.env.CCF_SCREENSHOTS) {
          require('node:fs').mkdirSync(process.env.CCF_SCREENSHOTS, { recursive: true })
          await page.screenshot({ path: `${process.env.CCF_SCREENSHOTS}/list-${width}.png`, fullPage: true })
        }
        await page.getByRole('button', { name: '查看 TEST 详情', exact: true }).click()
        await page.getByText('期刊信息', { exact: true }).waitFor()
        assert.ok(await page.getByRole('dialog').evaluate(e => e.scrollWidth <= e.clientWidth + 1))
        if (process.env.CCF_SCREENSHOTS) await page.screenshot({ path: `${process.env.CCF_SCREENSHOTS}/detail-${width}.png`, fullPage: true })
        await page.keyboard.press('Escape')
      })
    }
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
