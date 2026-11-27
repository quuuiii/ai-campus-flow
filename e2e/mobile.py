# 手機版端對端測試（Playwright，iPhone 13 模擬）。需先 npm run build && npx vite preview --port 4173
import asyncio, sys, re, tempfile, os
from playwright.async_api import async_playwright
URL = os.environ.get('URL', 'http://localhost:4173/')
R = []
def ok(name, cond, extra=''):
    R.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra and not cond else ''))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        dev = p.devices['iPhone 13']
        for vw in [None, {'width': 360, 'height': 740}]:
            kw = dict(dev); 
            if vw: kw['viewport'] = vw
            ctx = await b.new_context(**kw, locale='zh-TW', accept_downloads=True)
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text and 'ERR_' not in m.text else None)
            pg._dlg = lambda d: asyncio.ensure_future(d.accept()); pg.on('dialog', pg._dlg)
            await pg.goto(URL); await pg.wait_for_selector('.tabbar')
            w = (await pg.evaluate('innerWidth'))
            for t in ['home', 'plan', 'schedule', 'explore', 'settings']:
                await pg.click(f'[data-tab={t}]'); await pg.wait_for_timeout(120)
                ov = await pg.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth')
                ok(f'[{w}px] {t} 無橫向溢位', ov <= 0, ov)
            if vw is None:
                await run_flows(pg, ctx, errs)
            ok(f'[{w}px] 無 JS 錯誤', not errs, errs)
            await ctx.close()
        await b.close()
    bad = [n for n, c in R if not c]; print(f'\n{len(R)-len(bad)}/{len(R)} 通過'); sys.exit(1 if bad else 0)

async def run_flows(pg, ctx, errs):
    # ── 課表 ──
    await pg.click('[data-tab=schedule]')
    await pg.click('[data-cell="6:7"]'); await pg.wait_for_timeout(150)
    ok('點空格帶入星期/時間', (await pg.input_value('select[name=day]')) == '6' and (await pg.input_value('input[name=start]')) == '15:00')
    await pg.select_option('#perE', '8'); ok('結束節次連動時間', (await pg.input_value('input[name=end]')) == '16:50')
    await pg.fill('input[name=name]', '演算法'); await pg.click('#courseForm button[type=submit]'); await pg.wait_for_timeout(150)
    ok('新增課程顯示在格子', await pg.locator('.pc.has[aria-label*="演算法"]').count() == 2)
    await pg.click('.pc.has[aria-label*="演算法"] >> nth=0'); await pg.wait_for_timeout(150)
    ok('編輯帶入原資料', (await pg.input_value('input[name=name]')) == '演算法')
    await pg.fill('input[name=name]', '演算法B'); await pg.click('#courseForm button[type=submit]'); await pg.wait_for_timeout(150)
    ok('編輯後更新', await pg.locator('.pc.has[aria-label*="演算法B"]').count() == 2)
    await pg.click('[data-cell="6:7"]') if False else None
    await pg.fill('input[name=name]', '衝突課'); await pg.select_option('select[name=day]', '6'); await pg.fill('input[name=start]', '15:30'); await pg.fill('input[name=end]', '16:00')
    await pg.click('#courseForm button[type=submit]'); await pg.wait_for_timeout(150)
    ok('重疊課程被擋下並說明', '重疊' in (await pg.inner_text('#courseErr')))
    await pg.fill('input[name=start]', '16:00'); await pg.fill('input[name=end]', '15:00'); await pg.click('#courseForm button[type=submit]'); await pg.wait_for_timeout(150)
    ok('結束早於開始被擋下', '晚於' in (await pg.inner_text('#courseErr')))
    await pg.click('[data-view=list]'); await pg.click('[data-del]:near(:text("演算法B")) >> nth=0') if False else None
    await pg.locator('.li:has-text("演算法B") [data-del]').click(); await pg.wait_for_timeout(150)
    ok('刪除課程', await pg.locator('.li:has-text("演算法B")').count() == 0)
    # ── Planner ──
    await pg.click('[data-tab=plan]'); await pg.wait_for_selector('.tcard')
    n0 = await pg.locator('.tcard').count(); ok('Planner 產生任務卡', n0 >= 3, n0)
    href = await pg.locator('a:has-text("步行導航")').first.get_attribute('href')
    ok('步行導航連結格式', href and href.startswith('https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=') and 'destination=' in href, href)
    first = await pg.locator('.tcard h3').first.inner_text()
    await pg.locator('[data-alt]').first.click(); await pg.wait_for_timeout(150)
    second = await pg.locator('.tcard h3').first.inner_text(); ok('換地點會改變地點', first != second, f'{first}->{second}')
    await pg.click('summary:has-text("進階設定")'); await pg.locator('#buffer').fill('10'); await pg.locator('#buffer').dispatch_event('change'); await pg.wait_for_timeout(120)
    ok('緩衝設定保留', (await pg.input_value('#buffer')) == '10')
    await pg.click('#overload'); await pg.wait_for_timeout(200)
    ok('壓力測試顯示警示', await pg.locator('.status.warn, .status.bad').count() == 1)
    await pg.click('#realloc'); await pg.wait_for_timeout(200); ok('一鍵重新調配可執行', await pg.locator('.status').count() == 1)
    txt = await pg.inner_text('main'); ok('不含未標示的精確「N%」小數', not re.search(r'\d+\.\d+%', txt))
    # ── 解析確認與手動修改 ──
    await pg.fill('#nlText', '我想和組員討論專題一個半小時，我想打球'); await pg.click('#replan'); await pg.wait_for_timeout(200)
    ok('看不懂的片段有提示', '我想打球' in (await pg.inner_text('#panel')))
    ok('一個半小時解析為 90 分', (await pg.locator('[data-f=dur]').first.input_value()) == '90')
    await pg.locator('[data-f=dur]').first.fill('45'); await pg.locator('[data-f=dur]').first.dispatch_event('change'); await pg.wait_for_timeout(150)
    await pg.click('#addTask'); await pg.wait_for_timeout(150)
    ok('手動新增任務', await pg.locator('[data-deltask]').count() == 2)
    await pg.reload(); await pg.wait_for_selector('.tabbar'); await pg.wait_for_timeout(150)
    ok('重新整理後手動修改仍保留', await pg.locator('[data-deltask]').count() == 2 and (await pg.locator('[data-f=dur]').first.input_value()) == '45')
    await pg.locator('[data-deltask]').last.click(); await pg.wait_for_timeout(150)
    ok('刪除任務', await pg.locator('[data-deltask]').count() == 1)
    await pg.fill('#nlText', '我想吃午餐、去圖書館讀書一小時，還要在五點前完成一份作業。'); await pg.click('#replan'); await pg.wait_for_timeout(200)
    # ── 人潮回報 + CSV ──
    await pg.click('[data-tab=explore]'); await pg.click('#tab-crowd'); await pg.wait_for_timeout(120)
    for i in range(3):
        await pg.click('.rate label:nth-child(4)'); await pg.fill('input[name=queue]', str(5 + i)); await pg.fill('input[name=note]', f'測試{i}')
        await pg.click('#obsForm button[type=submit]'); await pg.wait_for_timeout(150)
    ok('新增 3 筆觀察', await pg.locator('[data-delobs]').count() == 3)
    await pg.fill('input[name=queue]', '999'); await pg.click('#obsForm button[type=submit]'); await pg.wait_for_timeout(120)
    ok('不合法排隊分鐘被擋', await pg.locator('#obsErr.on').count() == 1 and await pg.locator('[data-delobs]').count() == 3)
    ok('顯示模型狀態（示範模式）', '示範模式' in (await pg.inner_text('main')))
    m = await pg.inner_text('main')
    ok('儀表板：總筆數與門檻', '資料儀表板' in m and '差 17 筆' in m)
    ok('儀表板：星期×時段表格有資料', await pg.locator('table.heat td:has-text("3")').count() == 1)
    ok('未設定同步時明確標示', '尚未連接團隊資料庫' in m)
    async with pg.expect_download() as d: await pg.click('#expObs')
    path = await (await d.value).path(); raw = open(path, 'rb').read()
    ok('CSV 有單一 BOM 與中文欄位', raw[:3] == b'\xef\xbb\xbf' and raw[3:6] != b'\xef\xbb\xbf' and '地點' in raw.decode('utf-8-sig').splitlines()[0])
    tmp = tempfile.mktemp(suffix='.csv'); open(tmp, 'wb').write(raw)
    await pg.locator('[data-delobs]').first.click(); await pg.wait_for_timeout(120); ok('單筆刪除', await pg.locator('[data-delobs]').count() == 2)
    await pg.set_input_files('#impObs', tmp); await pg.wait_for_timeout(300)
    ok('匯入補回缺少的 1 筆且不重複', await pg.locator('[data-delobs]').count() == 3)
    await pg.set_input_files('#impObs', tmp); await pg.wait_for_timeout(300)
    ok('重複匯入不產生重複資料', await pg.locator('[data-delobs]').count() == 3)
    bad = tempfile.mktemp(suffix='.csv'); open(bad, 'w').write('a,b\n1,2\n'); await pg.set_input_files('#impObs', bad); await pg.wait_for_timeout(300)
    ok('錯誤格式 CSV 不破壞資料', await pg.locator('[data-delobs]').count() == 3)
    # ── 互動地圖 ──
    await pg.click('#tab-places'); await pg.wait_for_selector('[data-showmap]')
    await pg.locator('[data-showmap="志希館"]').click(); await pg.wait_for_timeout(150)
    src = await pg.locator('#mapFrame').get_attribute('src'); ok('點地點→地圖以名稱搜尋', 'output=embed' in src and '%E5%BF%97%E5%B8%8C' in src, src)
    ok('地圖失敗有備援', await pg.locator('#mapBox .fallback').count() == 1)
    # ── 餐廳清單 ──
    await pg.click('#tab-back'); ok('後門 21 間', await pg.locator('#foodList .li').count() == 21)
    await pg.click('#tab-night'); ok('宵夜街 14 間', await pg.locator('#foodList .li').count() == 14)
    # ── 設定：分開清除 ──
    await pg.click('[data-tab=settings]'); await pg.click('#clrObs'); await pg.wait_for_timeout(150)
    await pg.click('[data-tab=schedule]'); await pg.click('[data-view=week]'); ok('清除觀察不影響課表', await pg.locator('.pc.has').count() > 0)
    await pg.click('[data-tab=explore]'); await pg.click('#tab-crowd'); ok('清除觀察後紀錄為 0', await pg.locator('[data-delobs]').count() == 0)
    # 課表頁：清除全部課表（先取消、再確認）
    pg.remove_listener('dialog', pg._dlg) if hasattr(pg, '_dlg') else None
    await pg.click('[data-tab=schedule]'); n0 = await pg.locator('.pc.has').count()
    pg.once('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
    await pg.click('#clearAllCourses'); await pg.wait_for_timeout(200)
    ok('清除課表：按取消不會刪', await pg.locator('.pc.has').count() == n0 and n0 > 0)
    pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.click('#clearAllCourses'); await pg.wait_for_timeout(200)
    ok('清除課表：確認後全部清空、按鈕消失', await pg.locator('.pc.has').count() == 0 and await pg.locator('#clearAllCourses').count() == 0)
    await pg.click('[data-tab=explore]'); await pg.click('#tab-crowd')
asyncio.run(main())
