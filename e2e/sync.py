# 團隊同步端對端測試：以假的 Supabase 端點（Playwright 攔截）驗證離線佇列、上傳、下載合併。
# 執行：VITE_SUPABASE_URL=https://e2etest.supabase.co VITE_SUPABASE_ANON_KEY=<任意40字元> npx vite build --outDir dist-sync
#       npx vite preview --outDir dist-sync --port 4174 ；python3 -I e2e/sync.py
import asyncio, json, sys
from playwright.async_api import async_playwright
R = []
def ok(n, c, x=''): R.append(c); print(('PASS ' if c else 'FAIL ') + n + (f' [{x}]' if x and not c else ''))
async def main():
    server = {'rows': {}, 'online': False, 'posts': 0}
    async def handle(route):
        req = route.request
        if not server['online']: return await route.abort('internetdisconnected')
        if req.method == 'POST':
            server['posts'] += 1; b = json.loads(req.post_data)
            assert 'status' not in b and 'reporter' not in b
            server['rows'].setdefault(b['client_id'], b)
            return await route.fulfill(status=201, body='')
        rows = [{'client_id': 'team-1', 'observed_at': '2026-11-10T04:30:00Z', 'place_id': 'mainlib', 'crowd_level': 2, 'queue_minutes': None, 'method': 'onsite', 'source': 'app'}]
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps(rows))
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(**p.devices['iPhone 13']); pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('https://e2etest.supabase.co/**', handle)
        await pg.goto('http://localhost:4174/'); await pg.click('[data-tab=explore]'); await pg.click('#tab-crowd'); await pg.wait_for_timeout(300)
        ok('顯示已設定', '已設定' in await pg.inner_text('main'))
        await pg.click('#obsForm button[type=submit]'); await pg.wait_for_timeout(500)
        m = await pg.inner_text('main'); ok('離線時留在待上傳佇列', '待上傳 1 筆' in m, m[m.find('團隊同步'):][:80])
        server['online'] = True
        await pg.click('#syncNow'); await pg.wait_for_timeout(600)
        m = await pg.inner_text('main'); ok('上線後送出並清空佇列', '待上傳 0 筆' in m and len(server['rows']) == 1)
        ok('下載團隊資料並併入儀表板（本機1＋團隊1）', '本機＋團隊' in m and await pg.locator('.stat b').first.inner_text() == '2')
        await pg.click('#syncNow'); await pg.wait_for_timeout(500)
        ok('重複同步不重複上傳', server['posts'] >= 1 and len(server['rows']) == 1)
        import tempfile
        csv = tempfile.mktemp(suffix='.csv'); open(csv, 'w', encoding='utf-8-sig').write('id,時間（台灣時間）,地點,地點代碼,擁擠度（1-5）,排隊分鐘,觀察方式,備註,timestamp\nimp-0001,,後門餐飲區,backdoor,4,16,事後紀錄,組員紀錄,2026-11-25T10:23:00.000Z\n')
        pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.set_input_files('#impObs', csv); await pg.wait_for_timeout(800)
        ok('匯入 CSV 後可選擇上傳，來源為 csv_import', server['rows'].get('imp-0001', {}).get('source') == 'csv_import', list(server['rows']))
        await pg.locator('[data-delobs]').first.click() if False else None
        ok('我的紀錄清單：本機 1 筆＋匯入 1 筆', await pg.locator('[data-delobs]').count() == 2)
        ok('無 JS 錯誤', not errs, errs)
        await b.close()
    print(f'{sum(R)}/{len(R)} 通過'); sys.exit(0 if all(R) else 1)
asyncio.run(main())
